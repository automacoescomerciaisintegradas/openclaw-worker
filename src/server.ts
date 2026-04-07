import { serve } from '@hono/node-server';
import { app } from './index';
import 'dotenv/config';

const port = process.env.PORT ? parseInt(process.env.PORT) : 8080;

console.log(`🚀 Cleudocode Gateway iniciando na porta ${port}...`);

serve({
  fetch: app.fetch,
  port: port
}, (info) => {
  console.log(`✅ Servidor rodando em http://localhost:${info.port}`);
});
