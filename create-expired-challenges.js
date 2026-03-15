const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Creando desafíos expirados para testing...\n');

  // Obtener algunos jugadores
  const players = await prisma.player.findMany({
    take: 6,
    orderBy: { position: 'asc' }
  });

  if (players.length < 6) {
    console.log('❌ No hay suficientes jugadores');
    return;
  }

  const now = new Date();

  // TIPO 1: Desafío NO ACEPTADO (expiró hace 2 horas)
  const expired1 = await prisma.challenge.create({
    data: {
      challenger_id: players[3].id,  // Pos 4
      challenged_id: players[1].id,  // Pos 2
      status: 'pending',
      accept_deadline: new Date(now.getTime() - 2 * 60 * 60 * 1000), // -2 horas
      play_deadline: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000) // +5 días
    }
  });
  console.log(`✅ TIPO 1 - No aceptado (expiró hace 2 hrs):`);
  console.log(`   ${players[3].name} (pos ${players[3].position}) → ${players[1].name} (pos ${players[1].position})`);
  console.log(`   Al procesarse: ${players[3].name} subirá, ${players[1].name} bajará\n`);

  // TIPO 2: Desafío ACEPTADO pero NO JUGADO (expiró hace 1 hora)
  const expired2 = await prisma.challenge.create({
    data: {
      challenger_id: players[4].id,  // Pos 5
      challenged_id: players[2].id,  // Pos 3
      status: 'accepted',
      accepted_at: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000), // -6 días
      accept_deadline: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // -5 días
      play_deadline: new Date(now.getTime() - 1 * 60 * 60 * 1000) // -1 hora
    }
  });
  console.log(`✅ TIPO 2 - Aceptado pero no jugado (expiró hace 1 hr):`);
  console.log(`   ${players[4].name} (pos ${players[4].position}) vs ${players[2].name} (pos ${players[2].position})`);
  console.log(`   Al procesarse: Ambos bajan 1 posición\n`);

  // TIPO 3: Un jugador confirmó, el otro no (hace 25 horas)
  const expired3 = await prisma.challenge.create({
    data: {
      challenger_id: players[5].id,  // Pos 6
      challenged_id: players[3].id,  // Pos 4
      status: 'accepted',
      accepted_at: new Date(now.getTime() - 26 * 60 * 60 * 1000), // -26 horas
      accept_deadline: new Date(now.getTime() - 25 * 60 * 60 * 1000),
      play_deadline: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
      challenger_result: {
        winnerId: players[5].id,
        score: '6-4, 6-3'
      },
      challenged_result: null  // No confirmó
    }
  });
  console.log(`✅ TIPO 3 - Solo uno confirmó (hace 26 hrs):`);
  console.log(`   ${players[5].name} confirmó que ganó`);
  console.log(`   ${players[3].name} no confirmó`);
  console.log(`   Al procesarse: Se auto-valida victoria de ${players[5].name}\n`);

  console.log('🎉 ¡Desafíos expirados creados!');
  console.log('\n📋 Ahora ejecuta: POST http://localhost:3000/cron/run');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
