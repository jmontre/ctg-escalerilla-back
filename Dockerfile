# ===== BUILD STAGE =====
FROM node:18-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./
COPY prisma ./prisma/

# Instalar todas las dependencias (incluidas devDependencies)
RUN npm ci

# Copiar código fuente
COPY . .

# Generar Prisma Client
RUN npx prisma generate

# Build de producción
RUN npm run build

# ===== PRODUCTION STAGE =====
FROM node:18-alpine AS production

WORKDIR /app

# Copiar package files
COPY package*.json ./
COPY prisma ./prisma/

# Instalar SOLO dependencias de producción
RUN npm ci --only=production

# Generar Prisma Client en producción
RUN npx prisma generate

# Copiar el build desde la etapa anterior
COPY --from=builder /app/dist ./dist

# Exponer puerto
EXPOSE 3000

# Start con migraciones
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
