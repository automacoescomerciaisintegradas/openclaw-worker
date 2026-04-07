#!/bin/bash

# =============================================================================
# script de Deploy Automatizado - Cleudocode VPS
# =============================================================================

set -e

DEPLOY_URL="http://144.91.118.78:3000/api/box/deploy/464007350d9fc7117730"

echo "📤 Iniciando processo de Deploy..."

# 1. Commit das alterações
echo "📝 Comitando alterações locais..."
git add .
git commit -m "feat: migração híbrida Docker e otimização VPS" || echo "Nada para comitar"

# 2. Push para o repositório principal
echo "🚀 Fazendo Push para o GitHub..."
git push origin main

# 3. Disparar Gatilho na VPS
echo "🔔 Disparando Webhook de Deploy na VPS..."
curl -X GET "$DEPLOY_URL"

echo "✅ Deploy solicitado com sucesso! Monitore os logs na VPS."
