import type { AppEnv } from '../types';

/**
 * Kimi (Moonshot K2.5) AI Service Client
 */
export async function askKimi(
  prompt: string, 
  history: { role: string; content: string }[] = [], 
  env: import('../types').openclawEnv
): Promise<string> {
  const apiKey = env.MOONSHOT_API_KEY;
  if (!apiKey) {
    throw new Error('MOONSHOT_API_KEY is not configured in secrets.');
  }

  const messages = [
    { 
      role: 'system', 
      content: 'Você é o Assistente do OpenClaw Worker, especialista em Afiliação Shopee e automação. Seu objetivo é ajudar o usuário a encontrar produtos lucrativos, criar descrições persuasivas (com emojis e hashtags) para ofertas no Telegram e WhatsApp, e tirar dúvidas sobre a plataforma. Seja proativo, profissional e focado em conversão de vendas.' 
    },
    ...history,
    { role: 'user', content: prompt }
  ];

  const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'kimi-k2.5',
      messages,
      temperature: 0.7,
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('[Kimi] API Error:', err);
    throw new Error('Falha na comunicação com o Kimi K2.5');
  }

  const data: any = await response.json();
  return data.choices[0].message.content || 'Não entendi seu pedido, tente novamente.';
}
