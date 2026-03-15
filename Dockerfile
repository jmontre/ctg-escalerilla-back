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

# Exponer puerto
EXPOSE 3000

# Start
CMD ["npm", "run", "start:prod"]
