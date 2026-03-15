const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

prisma.challenge.deleteMany()
  .then(() => console.log('✅ Limpiado'))
  .finally(() => prisma.$disconnect());
