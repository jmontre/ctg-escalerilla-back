FROM node:20-slim

ARG CACHEBUST=1

RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxss1 \
    xdg-utils \
    openssl \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

RUN ls -la
RUN cat tsconfig.json
RUN cat tsconfig.build.json 2>/dev/null || echo "NO HAY tsconfig.build.json"

RUN npx prisma generate
RUN npx nest build 2>&1 || true
RUN npx tsc -p tsconfig.build.json 2>&1 && echo "TSC OK" || echo "TSC FALLÓ"
RUN find . -name "*.js" -path "*/dist/*" 2>/dev/null | head -20 || echo "ningún .js en dist"
RUN find dist/ 2>/dev/null || echo "dist no existe"

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]