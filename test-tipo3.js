const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Test TIPO 3: Auto-validación de resultado\n');

  const players = await prisma.player.findMany({
    take: 4,
    orderBy: { position: 'asc' }
  });

  const now = new Date();

  // Crear desafío aceptado donde solo el challenger confirmó hace 25 horas
  const challenge = await prisma.challenge.create({
    data: {
      challenger_id: players[2].id,
      challenged_id: players[1].id,
      status: 'accepted',
      accepted_at: new Date(now.getTime() - 26 * 60 * 60 * 1000),
      accept_deadline: new Date(now.getTime() - 25 * 60 * 60 * 1000),
      play_deadline: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
      // Solo el challenger confirmó
      challenger_result: {
        winnerId: players[2].id,
        score: '6-4, 6-2'
      },
      challenged_result: null
    }
  });

  console.log(`✅ Desafío creado:`);
  console.log(`   ${players[2].name} (pos ${players[2].position}) vs ${players[1].name} (pos ${players[1].position})`);
  console.log(`   ${players[2].name} confirmó que ganó hace 26 horas`);
  console.log(`   ${players[1].name} NO confirmó`);
  console.log(`\n📋 Ejecuta: POST http://localhost:3000/cron/run`);
}

main()
  .catch((e) => console.error('❌ Error:', e))
  .finally(() => prisma.$disconnect());
