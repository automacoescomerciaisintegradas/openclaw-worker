/**
 * openclaw + Cloudflare Sandbox
 *
 * This Worker runs openclaw personal AI assistant in a Cloudflare Sandbox container.
 * It proxies all requests to the openclaw Gateway's web UI and WebSocket endpoint.
 *
 * Features:
 * - Web UI (Control Dashboard + WebChat) at /
 * - WebSocket support for real-time communication
 * - Admin UI at /_admin/ for device management
 * - Configuration via environment secrets
 *
 * Required secrets (set via `wrangler secret put`):
 * - ANTHROPIC_API_KEY: Your Anthropic API key
 *
 * Optional secrets:
 * - openclaw_GATEWAY_TOKEN: Token to protect gateway access
 * - TELEGRAM_BOT_TOKEN: Telegram bot token
 * - DISCORD_BOT_TOKEN: Discord bot token
 * - SLACK_BOT_TOKEN + SLACK_APP_TOKEN: Slack tokens
 */

import { Hono } from 'hono';
import { getSandbox, Sandbox, type SandboxOptions } from '@cloudflare/sandbox';

import type { AppEnv, openclawEnv } from './types';
import { OPENCLAW_PORT } from './config';
import { createAccessMiddleware } from './auth';
import { ensureopenclawGateway, findExistingopenclawProcess, syncToR2 } from './gateway';
import whatsappHtml from './assets/whatsapp/index.html';
import telegramHtml from './assets/telegram/index.html';
import shopeeHtml from './assets/shopee/index.html';
import loadingPageHtml from './assets/loading.html';
import configErrorHtml from './assets/config-error.html';
import { publicRoutes, api, adminUi, debug, cdp, telegramRoutes, shopeeRoutes } from './routes';

/**
 * Transform error messages from the gateway to be more user-friendly.
 */
function transformErrorMessage(message: string, host: string): string {
  if (message.includes('gateway token missing') || message.includes('gateway token mismatch')) {
    return `Invalid or missing token. Visit https://${host}?token={REPLACE_WITH_YOUR_TOKEN}`;
  }
  
  if (message.includes('pairing required')) {
    return `Pairing required. Visit https://${host}/_admin/`;
  }
  
  return message;
}



/**
 * Validate required environment variables.
 * Returns an array of missing variable descriptions, or empty array if all are set.
 */
function validateRequiredEnv(env: openclawEnv): string[] {
  const missing: string[] = [];

  // Accept both openclaw_GATEWAY_TOKEN and GATEWAY_TOKEN for backwards compatibility
  if (!env.openclaw_GATEWAY_TOKEN && !(env as any).GATEWAY_TOKEN) {
    missing.push('openclaw_GATEWAY_TOKEN');
  }

  // Cloudflare Access is optional in Lite Mode
  /*
  if (!env.CF_ACCESS_TEAM_DOMAIN) {
    missing.push('CF_ACCESS_TEAM_DOMAIN');
  }

  if (!env.CF_ACCESS_AUD) {
    missing.push('CF_ACCESS_AUD');
  }
  */

  // Check for AI Gateway or direct Anthropic configuration
  if (env.AI_GATEWAY_API_KEY) {
    // AI Gateway requires both API key and base URL
    if (!env.AI_GATEWAY_BASE_URL) {
      missing.push('AI_GATEWAY_BASE_URL (required when using AI_GATEWAY_API_KEY)');
    }
  } else if (!env.ANTHROPIC_API_KEY && !env.MOONSHOT_API_KEY) {
    // Lite mode allows Moonshot as alternative to Anthropic
    missing.push('ANTHROPIC_API_KEY, MOONSHOT_API_KEY or AI_GATEWAY_API_KEY');
  }

  return missing;
}

/**
 * Build sandbox options based on environment configuration.
 * 
 * SANDBOX_SLEEP_AFTER controls how long the container stays alive after inactivity:
 * - 'never' (default): Container stays alive indefinitely (recommended due to long cold starts)
 * - Duration string: e.g., '10m', '1h', '30s' - container sleeps after this period of inactivity
 * 
 * To reduce costs at the expense of cold start latency, set SANDBOX_SLEEP_AFTER to a duration:
 *   npx wrangler secret put SANDBOX_SLEEP_AFTER
 *   # Enter: 10m (or 1h, 30m, etc.)
 */
function buildSandboxOptions(env: openclawEnv): SandboxOptions {
  const sleepAfter = env.SANDBOX_SLEEP_AFTER?.toLowerCase() || 'never';
  
  // 'never' means keep the container alive indefinitely
  if (sleepAfter === 'never') {
    return { keepAlive: true };
  }
  
  // Otherwise, use the specified duration
  return { sleepAfter };
}

// Main app
const app = new Hono<AppEnv>();

// =============================================================================
// LITE MODE / DASHBOARDS (High Priority)
// =============================================================================

// Shopee Affiliate Dashboard (Lite Mode)
app.get('/shopee', (c) => {
  console.log('[DEBUG] Accessing /shopee Dashboard');
  console.log('[DEBUG] Shopee HTML length:', shopeeHtml?.length || 0);
  
  if (!shopeeHtml) {
    console.error('[ERROR] shopeeHtml content is MISSING');
    return c.text('Erro interno: Dashboard content missing', 500);
  }

  c.header('X-Debug-Shopee', 'Matched');
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate');
  return c.html(shopeeHtml);
});

// Shopee API
app.route('/api/shopee', shopeeRoutes);

// WhatsApp Pairing UI (Lite Mode compatible)
app.get('/whatsapp', (c) => c.html(whatsappHtml));

// Telegram Pairing UI (Lite Mode compatible)
app.get('/telegram', (c) => c.html(telegramHtml));

// Telegram Webhook (Native Worker Mode)
app.route('/telegram-webhook', telegramRoutes);


// =============================================================================
// MIDDLEWARE: Applied to ALL routes
// =============================================================================

// Middleware: Log every request
app.use('*', async (c, next) => {
  const url = new URL(c.req.url);
  console.log(`[REQ] ${c.req.method} ${url.pathname}${url.search}`);
  console.log(`[REQ] Has Sandbox: ${!!c.env.Sandbox}`);
  console.log(`[REQ] DEV_MODE: ${c.env.DEV_MODE}`);
  await next();
});

// Middleware: Initialize sandbox (OPTIONAL in Lite Mode)
app.use('*', async (c, next) => {
  if (c.env.Sandbox) {
    const options = buildSandboxOptions(c.env);
    const sandbox = getSandbox(c.env.Sandbox, 'openclaw', options);
    c.set('sandbox', sandbox);
  } else {
    console.log('[LITE] Running without Sandbox container');
  }
  await next();
});

// =============================================================================
// PUBLIC ROUTES: No Cloudflare Access authentication required
// =============================================================================

// Mount public routes first (before auth middleware)
// Includes: /sandbox-health, /logo.png, /logo-small.png, /api/status, /_admin/assets/*
app.route('/', publicRoutes);

// Mount CDP routes (uses shared secret auth via query param, not CF Access)
app.route('/cdp', cdp);

// =============================================================================
// PROTECTED ROUTES: Cloudflare Access authentication required
// =============================================================================

// Middleware: Validate required environment variables (skip in dev mode and for debug routes)
app.use('*', async (c, next) => {
  const url = new URL(c.req.url);
  
  // Skip validation for debug routes (they have their own enable check)
  if (url.pathname.startsWith('/debug')) {
    return next();
  }
  
  // Skip validation in dev mode
  if (c.env.DEV_MODE === 'true') {
    return next();
  }
  
  const missingVars = validateRequiredEnv(c.env);
  if (missingVars.length > 0) {
    console.error('[CONFIG] Missing required environment variables:', missingVars.join(', '));
    
    const acceptsHtml = c.req.header('Accept')?.includes('text/html');
    if (acceptsHtml) {
      // Return a user-friendly HTML error page
      const html = configErrorHtml.replace('{{MISSING_VARS}}', missingVars.join(', '));
      return c.html(html, 503);
    }
    
    // Return JSON error for API requests
    return c.json({
      error: 'Configuration error',
      message: 'Required environment variables are not configured',
      missing: missingVars,
      hint: 'Set these using: wrangler secret put <VARIABLE_NAME>',
    }, 503);
  }
  
  return next();
});

// Middleware: Cloudflare Access authentication for protected routes
app.use('*', async (c, next) => {
  const url = new URL(c.req.url);
  
  // Skip authentication for automation dashboards and webhooks
  const isPublicPath = 
    url.pathname === '/shopee' || 
    url.pathname.startsWith('/api/shopee') ||
    url.pathname === '/whatsapp' || 
    url.pathname === '/telegram' || 
    url.pathname.startsWith('/telegram-webhook');

  if (isPublicPath) {
    console.log('[ACCESS] Skipping authentication for public dashboard:', url.pathname);
    c.header('X-Shopee-Status', 'Public-Open');
    return next();
  }

  // Determine response type based on Accept header
  const acceptsHtml = c.req.header('Accept')?.includes('text/html');
  const middleware = createAccessMiddleware({ 
    type: acceptsHtml ? 'html' : 'json',
    redirectOnMissing: acceptsHtml 
  });
  
  return middleware(c, next);
});

// Mount API routes (protected by Cloudflare Access)
app.route('/api', api);

// Mount Admin UI routes (protected by Cloudflare Access)
app.route('/_admin', adminUi);

// Mount debug routes (protected by Cloudflare Access, only when DEBUG_ROUTES is enabled)
app.use('/debug/*', async (c, next) => {
  if (c.env.DEBUG_ROUTES !== 'true') {
    return c.json({ error: 'Debug routes are disabled' }, 404);
  }
  return next();
});
app.route('/debug', debug);

// =============================================================================
// CATCH-ALL: Proxy to openclaw gateway
// =============================================================================

app.all('*', async (c) => {
  const sandbox = c.get('sandbox');
  const request = c.req.raw;
  const url = new URL(request.url);
  const isWebSocketRequest = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';

  console.log(`[PROXY] Handling request (${sandbox ? 'Sandbox' : 'Lite'}):`, url.pathname);

  // If no sandbox exists (Lite Mode), fallback to ASSETS for everything
  if (!sandbox) {
    console.log('[LITE] Serving from ASSETS or 404');
    const acceptsHtml = request.headers.get('Accept')?.includes('text/html');
    
    // For V1 API calls (WhatsApp/Sandbox) in Lite Mode, return a clear JSON error
    // instead of letting it fallback to index.html (which causes JSON parse errors)
    if (url.pathname.startsWith('/v1/')) {
      return c.json({
        error: 'Sandbox not available',
        message: 'WhatsApp features require a Sandbox container. You are running in Lite Mode.',
        mode: 'LITE'
      }, 503);
    }
    
    // For root path or HTML requests, serve index.html from ASSETS
    if (url.pathname === '/' || acceptsHtml) {
      console.log('[LITE] Serving index.html from ASSETS');
      return c.env.ASSETS.fetch(new Request(new URL('/', url.origin).toString(), request));
    }
    
    // Fallback to ASSETS for other files (JS, CSS, etc.)
    return c.env.ASSETS.fetch(request);
  }

  // Ensure openclaw is running (this will wait for startup)
  try {
    await ensureopenclawGateway(sandbox, c.env);
  } catch (error) {
    console.error('[PROXY] Failed to start openclaw:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    let hint = 'Check worker logs with: wrangler tail';
    if (!c.env.ANTHROPIC_API_KEY && !c.env.MOONSHOT_API_KEY) {
      hint = 'ANTHROPIC_API_KEY or MOONSHOT_API_KEY is not set. Run: wrangler secret put <KEY_NAME>';
    } else if (errorMessage.includes('heap out of memory') || errorMessage.includes('OOM')) {
      hint = 'Gateway ran out of memory. Try again or check for memory leaks.';
    }

    return c.json({
      error: 'openclaw gateway failed to start',
      details: errorMessage,
      hint,
    }, 503);
  }

  // Proxy to openclaw with WebSocket message interception
  if (isWebSocketRequest) {
    console.log('[WS] Proxying WebSocket connection to openclaw');
    console.log('[WS] URL:', request.url);
    console.log('[WS] Search params:', url.search);
    
    // Get WebSocket connection to the container
    const containerResponse = await sandbox.wsConnect(request, OPENCLAW_PORT);
    console.log('[WS] wsConnect response status:', containerResponse.status);
    
    // Get the container-side WebSocket
    const containerWs = containerResponse.webSocket;
    if (!containerWs) {
      console.error('[WS] No WebSocket in container response - falling back to direct proxy');
      return containerResponse;
    }
    
    console.log('[WS] Got container WebSocket, setting up interception');
    
    // Create a WebSocket pair for the client
    const [clientWs, serverWs] = Object.values(new WebSocketPair());
    
    // Accept both WebSockets
    serverWs.accept();
    containerWs.accept();
    
    console.log('[WS] Both WebSockets accepted');
    console.log('[WS] containerWs.readyState:', containerWs.readyState);
    console.log('[WS] serverWs.readyState:', serverWs.readyState);
    
    // Relay messages from client to container
    serverWs.addEventListener('message', (event) => {
      console.log('[WS] Client -> Container:', typeof event.data, typeof event.data === 'string' ? event.data.slice(0, 200) : '(binary)');
      if (containerWs.readyState === WebSocket.OPEN) {
        containerWs.send(event.data);
      } else {
        console.log('[WS] Container not open, readyState:', containerWs.readyState);
      }
    });
    
    // Relay messages from container to client, with error transformation
    containerWs.addEventListener('message', (event) => {
      console.log('[WS] Container -> Client (raw):', typeof event.data, typeof event.data === 'string' ? event.data.slice(0, 500) : '(binary)');
      let data = event.data;
      
      // Try to intercept and transform error messages
      if (typeof data === 'string') {
        try {
          const parsed = JSON.parse(data);
          console.log('[WS] Parsed JSON, has error.message:', !!parsed.error?.message);
          if (parsed.error?.message) {
            console.log('[WS] Original error.message:', parsed.error.message);
            parsed.error.message = transformErrorMessage(parsed.error.message, url.host);
            console.log('[WS] Transformed error.message:', parsed.error.message);
            data = JSON.stringify(parsed);
          }
        } catch (e) {
          console.log('[WS] Not JSON or parse error:', e);
        }
      }
      
      if (serverWs.readyState === WebSocket.OPEN) {
        serverWs.send(data);
      } else {
        console.log('[WS] Server not open, readyState:', serverWs.readyState);
      }
    });
    
    // Handle close events
    serverWs.addEventListener('close', (event) => {
      console.log('[WS] Client closed:', event.code, event.reason);
      containerWs.close(event.code, event.reason);
    });
    
    containerWs.addEventListener('close', (event) => {
      console.log('[WS] Container closed:', event.code, event.reason);
      // Transform the close reason (truncate to 123 bytes max for WebSocket spec)
      let reason = transformErrorMessage(event.reason, url.host);
      if (reason.length > 123) {
        reason = reason.slice(0, 120) + '...';
      }
      console.log('[WS] Transformed close reason:', reason);
      serverWs.close(event.code, reason);
    });
    
    // Handle errors
    serverWs.addEventListener('error', (event) => {
      console.error('[WS] Client error:', event);
      containerWs.close(1011, 'Client error');
    });
    
    containerWs.addEventListener('error', (event) => {
      console.error('[WS] Container error:', event);
      serverWs.close(1011, 'Container error');
    });
    
    console.log('[WS] Returning intercepted WebSocket response');
    return new Response(null, {
      status: 101,
      webSocket: clientWs,
    });
  }

  console.log('[HTTP] Proxying:', url.pathname + url.search);
  const httpResponse = await sandbox.containerFetch(request, OPENCLAW_PORT);
  console.log('[HTTP] Response status:', httpResponse.status);
  
  // Add debug header to verify worker handled the request
  const newHeaders = new Headers(httpResponse.headers);
  newHeaders.set('X-Worker-Debug', 'proxy-to-openclaw');
  newHeaders.set('X-Debug-Path', url.pathname);
  
  return new Response(httpResponse.body, {
    status: httpResponse.status,
    statusText: httpResponse.statusText,
    headers: newHeaders,
  });
});

/**
 * Scheduled handler for cron triggers.
 * Syncs openclaw config/state from container to R2 for persistence.
 */
async function scheduled(
  _event: ScheduledEvent,
  env: openclawEnv,
  _ctx: ExecutionContext
): Promise<void> {
  // Guard for Lite Mode (no Sandbox container)
  if (!env.Sandbox || typeof env.Sandbox.idFromName !== 'function') {
    console.log('[cron] Skipping backup sync: Sandbox namespace not available or methods missing.');
    return;
  }

  const options = buildSandboxOptions(env);
  const sandbox = getSandbox(env.Sandbox, 'openclaw', options);

  console.log('[cron] Starting backup sync to R2...');
  const result = await syncToR2(sandbox, env);
  
  if (result.success) {
    console.log('[cron] Backup sync completed successfully at', result.lastSync);
  } else {
    console.error('[cron] Backup sync failed:', result.error, result.details || '');
  }
}

export default {
  fetch: app.fetch,
  scheduled,
};
