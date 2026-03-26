#!/bin/bash
set -e

# Este script realiza o deploy do openclaw-worker utilizando o Wrangler standalone.
# Referência: https://github.com/cloudflare/workers-sdk/releases/latest/download/wrangler-linux-amd64

echo "=> Verificando/Instalando Wrangler standalone..."
# Se o wrangler já estiver no path, pula a instalação (opcional)
if ! command -v wrangler &> /dev/null; then
    echo "=> Instalando Wrangler..."
    curl -sL https://github.com/cloudflare/workers-sdk/releases/latest/download/wrangler-linux-amd64 -o /tmp/wrangler 
    chmod +x /tmp/wrangler 
    sudo mv /tmp/wrangler /usr/local/bin/wrangler
fi

echo "=> Instalando dependências do projeto..."
npm install

echo "=> Iniciando Build e Deploy..."
# O comando 'npm run deploy' executa 'vite build' e 'wrangler deploy'
npm run deploy

echo "=> Deploy concluído com sucesso!"
