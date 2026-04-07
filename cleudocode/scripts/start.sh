#!/bin/bash

# =============================================================================
# script de inicialização do Cleudocode Hub (Híbrido)
# Gerencia a execução do Core Python e do Gateway Node.js
# =============================================================================

set -e

echo "🚀 Iniciando Cleudocode Hub (Ambiente Híbrido)..."

# 1. Ativar ambiente virtual Python
source /app/venv/bin/activate

# 2. Instalar dependências se necessário (opcional no boot)
# cd /app/hub && pip install -r requirements.txt --quiet
# cd /app/gateway && npm install --quiet

# 3. Iniciar o Core Python (Daemon) em background
echo "📦 Iniciando Core Python (Daemon)..."
# Nota: Ajustar o comando de acordo com o entrypoint real do Python
# Ex: python3 /app/hub/daemon.py &
# Por enquanto usaremos um placeholder se o daemon.py não existir
[ -f /app/hub/daemon.py ] && python3 /app/hub/daemon.py & || echo "⚠️ Daemon Python não encontrado em /app/hub/daemon.py"

# 4. Iniciar o Gateway Node.js
echo "🌐 Iniciando Gateway Node.js (Dashboard)..."
cd /app/gateway

# Se estivermos em produção, rodar via build
if [ "$NODE_ENV" = "production" ]; then
    npm run build
    npm run start
else
    npm run dev
fi

# Manter o container vivo e monitorando os processos
wait -n

exit $?
