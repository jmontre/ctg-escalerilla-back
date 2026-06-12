import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const adminPasswordHash = await bcrypt.hash('admin123', 10);

  const adminUser = await prisma.user.upsert({
    where:  { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@ctg.cl',
      password_hash: adminPasswordHash,
      is_admin: true,
    }
  });

  await prisma.player.upsert({
    where:  { user_id: adminUser.id },
    update: {},
    create: {
      user_id: adminUser.id,
      name: 'Administrador CTG',
      email: 'admin@ctg.cl',
      position: 0,
    }
  });

  console.log('✅ Admin creado/verificado:');
  console.log('   Username: admin');
  console.log('   Password: admin123 (solo si es nuevo)');
  console.log('\n⚠️  CAMBIA ESTA CONTRASEÑA EN PRODUCCIÓN\n');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
