import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // CAMBIAR ESTA CONTRASEÑA por la que quieras
  const NEW_ADMIN_PASSWORD = 'Mon3.26.10##';

  console.log('🔐 Cambiando contraseña de admin...\n');

  const passwordHash = await bcrypt.hash(NEW_ADMIN_PASSWORD, 10);

  await prisma.user.update({
    where: { username: 'admin' },
    data: { password_hash: passwordHash },
  });

  console.log('✅ Contraseña de admin actualizada correctamente!');
  console.log(`📋 Nueva contraseña: ${NEW_ADMIN_PASSWORD}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
