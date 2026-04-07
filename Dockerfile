# =============================================================================
# Dockerfile Híbrido - Cleudocode Hub (RAIZ)
# Arquitetura: Ubuntu 24.04 + Node.js 22 + Python 3.12
# =============================================================================

FROM ubuntu:24.04

# Prevenir prompts interativos durante a instalação
ENV DEBIAN_FRONTEND=noninteractive

# Instalar dependências do sistema
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    build-essential \
    python3.12 \
    python3.12-venv \
    python3-pip \
    ffmpeg \
    libvips-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

# Instalar Node.js 22 (LTS atual)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g npm@latest

# Criar estrutura de diretórios
WORKDIR /app
RUN mkdir -p /app/gateway /app/hub /app/scripts /app/ucm

# Copiar arquivos de dependências primeiro (otimização de cache)
COPY package.json package-lock.json /app/gateway/
RUN cd /app/gateway && npm install --production

# Copiar todo o código para o container
COPY . /app/gateway/

# Configurar ambiente Python (venv)
RUN python3.12 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

# Instalar dependências Python se houver requirements na raiz
RUN if [ -f "/app/gateway/requirements.txt" ]; then /app/venv/bin/pip install -r /app/gateway/requirements.txt; fi

# Copiar scripts de inicialização
COPY ./cleudocode/scripts/start.sh /app/scripts/start.sh
RUN chmod +x /app/scripts/start.sh

# Expor portas
# 8080: Gateway API / Dashboard (Recomendado para Easypanel)
EXPOSE 8080 19000

# Volume para persistência (UCM)
VOLUME ["/app/ucm"]

# Definir Entrypoint
ENTRYPOINT ["/app/scripts/start.sh"]
