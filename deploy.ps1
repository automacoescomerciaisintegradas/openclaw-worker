# Script de Deploy para Windows (PowerShell)
# Este script realiza o deploy do openclaw-worker.

$ErrorActionPreference = "Stop"

Write-Host "=> Verificando instalacao do Wrangler..." -ForegroundColor Cyan
if (!(Get-Command "wrangler" -ErrorAction SilentlyContinue)) {
    Write-Host "=> Wrangler nao encontrado. Instalando via npm..." -ForegroundColor Yellow
    npm install -g wrangler
} else {
    Write-Host "=> Wrangler ja esta instalado." -ForegroundColor Green
}

Write-Host "=> Instalando dependencias do projeto..." -ForegroundColor Cyan
npm install

Write-Host "=> Iniciando Build e Deploy..." -ForegroundColor Cyan
# O comando 'npm run deploy' executa 'vite build' e 'wrangler deploy'
npm run deploy

Write-Host "`n=> Deploy concluido com sucesso!" -ForegroundColor Green
