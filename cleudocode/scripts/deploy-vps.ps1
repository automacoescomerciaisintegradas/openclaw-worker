# script de Deploy Automatizado - Cleudocode VPS (Windows/PowerShell)
$ErrorActionPreference = "Stop"

$DEPLOY_URL = "http://144.91.118.78:3000/api/box/deploy/464007350d9fc7117730"

Write-Host "📤 Iniciando processo de Deploy para VPS..." -ForegroundColor Cyan

# 1. Commit das alterações
Write-Host "📝 Comitando alterações locais..." -ForegroundColor Yellow
git add .
try {
    git commit -m "feat: migração híbrida Docker e otimização VPS"
} catch {
    Write-Host "Nada para comitar ou erro no commit." -ForegroundColor Gray
}

# 2. Push para o repositório principal
Write-Host "🚀 Fazendo Push para o GitHub..." -ForegroundColor Yellow
git push origin main

# 3. Disparar Gatilho na VPS
Write-Host "🔔 Disparando Webhook de Deploy na VPS..." -ForegroundColor Yellow
Invoke-RestMethod -Uri $DEPLOY_URL -Method Get

Write-Host "`n✅ Deploy solicitado com sucesso! Monitore os logs na VPS." -ForegroundColor Green
