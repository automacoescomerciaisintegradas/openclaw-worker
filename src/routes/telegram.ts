import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { askKimi } from '../services/ai';

const telegramRoutes = new Hono<AppEnv>();

/**
 * Telegram Webhook Handler (Native Worker Mode)
 * Path: /telegram-webhook/:token
 */
telegramRoutes.post('/:token', async (c) => {
  const token = c.req.param('token');
  const expectedToken = c.env.TELEGRAM_BOT_TOKEN;

  // Security: Token must match
  if (token !== expectedToken) {
    return c.text('Unauthorized', 401);
  }

  const update: any = await c.req.json();
  const message = update.message;

  if (!message || !message.text) {
    return c.json({ ok: true });
  }

  const chatId = message.chat.id;
  const userText = message.text;

  // 1. Process Commands
  if (userText === '/start' || userText === '/status' || userText === '/myid') {
    return handleCommands(c, chatId, userText);
  }

  // 2. Process with AI (Kimi K2.5)
  try {
    const botToken = c.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN missing');

    // Show typing status
    await sendTelegramAction(botToken, chatId, 'typing');

    // 2.1 Check if it's a Shopee Link
    let prompt = userText;
    if (userText.includes('shopee.com.br') || userText.includes('shope.ee')) {
      prompt = `Gere uma oferta de afiliado Shopee altamente persuasiva para este link: ${userText}. Use emojis, destaque as vantagens e inclua o link no final.`;
      console.log('[Telegram] Shopee Link detected, triggering Affiliate Persona');
    }

    const response = await askKimi(prompt, [], c.env);
    await sendTelegramMessage(botToken, chatId, response);
  } catch (error) {
    console.error('[Telegram] Error processing AI:', error);
    const botToken = c.env.TELEGRAM_BOT_TOKEN;
    if (botToken) {
      await sendTelegramMessage(
        botToken, 
        chatId, 
        'Desculpe, tive um problema ao processar seu pedido com o Kimi K2.5.'
      );
    }
  }

  return c.json({ ok: true });
});

/**
 * Handle basic commands
 */
async function handleCommands(c: any, chatId: number, command: string) {
  const botToken = c.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return c.json({ ok: false, error: 'Token missing' });

  let response = '';
  switch (command) {
    case '/start':
      response = 'Olá! Eu sou o Bot nativo do OpenClaw! 🤖✨\n\nEstou pronto para conversar com você usando o Kimi K2.5 e agora também posso te ajudar com sua **Afiliação Shopee**! 🛍️\n\nUse /status para ver meu estado ou acesse o painel /shopee no seu navegador para configurar ofertas automáticas!';
      break;
    case '/status':
      response = `✅ Bot Ativo\n🤖 IA: Kimi K2.5\n⚙️ Modo: Lite (Worker Native)`;
      break;
    case '/myid':
      response = `Seu ID do Chat é: ${chatId}`;
      break;
  }
  await sendTelegramMessage(botToken, chatId, response);
  return c.json({ ok: true });
}

/**
 * Send message to Telegram API
 */
async function sendTelegramMessage(token: string, chatId: number, text: string) {
  return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

/**
 * Send typing action
 */
async function sendTelegramAction(token: string, chatId: number, action: string) {
  return fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action })
  });
}

export { telegramRoutes };
