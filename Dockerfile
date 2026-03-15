FROM node:18-alpine

WORKDIR /app

# Copiar package files
COPY package*.json ./
COPY prisma ./prisma/

# Instalar dependencias
RUN npm ci

# Copiar código fuente
COPY . .

# Generar Prisma Client
RUN npx prisma generate

# Build
RUN npm run build

# VERIFICAR que el build existe
RUN ls -la dist/ && echo "✅ Dist folder exists"

# Exponer puerto
EXPOSE 3000

# Start
CMD ["sh", "-c", "ls -la && ls -la dist/ && npm run start:prod"]
