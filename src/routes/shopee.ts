import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { ShopeeService } from '../services/shopee';
import { askKimi } from '../services/ai';

const shopeeRoutes = new Hono<AppEnv>();

/**
 * POST /api/admin/shopee/test-offer
 * Generate and send a test offer to the configured Telegram Chat ID
 */
shopeeRoutes.post('/test-offer', async (c) => {
  try {
    const config = await ShopeeService.getConfig(c.env) as any;
    if (!config || !config.chatId) {
      return c.json({ success: false, error: 'Telegram Chat ID não configurado' }, 400);
    }

    const botToken = c.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return c.json({ success: false, error: 'Token do Bot ausente' }, 500);

    // 1. Generate Fake/Sample Offer via Kimi
    const sampleLink = 'https://shope.ee/test-projetor-hd';
    const prompt = `Gere uma oferta de afiliado Shopee altamente persuasiva para um Mini Projetor HD. O link é: ${sampleLink}. Adicione emojis e gatilhos de urgência.`;
    const offer = await askKimi(prompt, [], c.env);

    // 2. Send to Telegram
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: config.chatId, text: offer })
    });

    if (!res.ok) throw new Error('Telegram API error');

    return c.json({ success: true, message: 'Oferta enviada!' });
  } catch (error: any) {
    console.error('[Shopee API] Test offer error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /api/admin/shopee/trending
 * Fetch currently trending products from Shopee
 */
shopeeRoutes.get('/trending', async (c) => {
  try {
    const products = await ShopeeService.getTrendingProducts();
    return c.json({ success: true, products });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch trending products' }, 500);
  }
});

/**
 * GET /api/admin/shopee/search
 * Search products by keyword
 */
shopeeRoutes.get('/search', async (c) => {
  const query = c.req.query('q');
  if (!query) return c.json({ success: false, error: 'Query is required' }, 400);

  try {
    const products = await ShopeeService.searchProducts(query);
    return c.json({ success: true, products });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to search products' }, 500);
  }
});

/**
 * GET /api/admin/shopee/config
 * Load shopee affiliate configuration from R2
 */
shopeeRoutes.get('/config', async (c) => {
  try {
    const config = await ShopeeService.getConfig(c.env);
    if (!config) return c.json({ success: false, error: 'Configuração do Shopee não encontrada' }, 404);
    return c.json({ success: true, config });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to load config' }, 500);
  }
});

/**
 * POST /api/admin/shopee/save-config
 * Save shopee affiliate configuration to R2
 */
shopeeRoutes.post('/save-config', async (c) => {
  try {
    const config = await c.req.json();
    await ShopeeService.saveConfig(c.env, config);
    return c.json({ success: true, message: 'Configuração salva no R2 com sucesso' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to save config' }, 500);
  }
});

export { shopeeRoutes };
