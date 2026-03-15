import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Crear usuario admin
  const adminPasswordHash = await bcrypt.hash('admin123', 10);
  
  const adminUser = await prisma.user.create({
    data: {
      username: 'admin',
      email: 'admin@ctg.cl',
      password_hash: adminPasswordHash,
      is_admin: true,
    }
  });

  // 2. Crear jugador admin (posición 0 - fuera de la escalerilla)
  await prisma.player.create({
    data: {
      user_id: adminUser.id,
      name: 'Administrador CTG',
      email: 'admin@ctg.cl',
      position: 0,
    }
  });

  console.log('✅ Admin creado:');
  console.log('   Username: admin');
  console.log('   Password: admin123');
  console.log('   Email: admin@ctg.cl');
  console.log('\n⚠️  CAMBIA ESTA CONTRASEÑA EN PRODUCCIÓN\n');

  console.log('✅ Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
