const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const WP_IDS = {
  'Claudio Pinilla': 21,
  'JP Morales': 15,
  'Ismael Soto': 41,
  'Lester Montre': 36,
  'Hernan Rojas': 54,
  'Claudio Pineda': 46,
  'Gerardo Galdame': 27,
  'Piero Cantillana': 28,
  'Hector Mondaca': 24,
  'Diego Quijada': 16,
  'Diego Suárez': 17,
  'Cristian Ordoñez': 29,
  'Cristian Gonzalez': 22,
  'Oscar Perez': 33,
  'Randolfo Tapia': 30,
  'Luis Miranda': 39,
  'Rodrigo Becerra': 25,
  'Gonzalo Carvacho': 31,
  'Rodrigo Saez': 32,
  'Luis Correa': 20,
  'Oscar Pérez Jr': 51,
  'Vicente Soto': 38,
  'Gerardo Perez': 18,
  'Mateo Carvacho': 35,
  'Daniel Soto Jr': 43,
  'Gustavo Díaz': 23,
  'Leandro Lobos': 12,
  'Diego Fuenzalida': 9,
  'JP Urtubia': 47,
  'Carlos Guzman': 19,
  'Diego Tapia': 37,
  'Daniel Soto': 26,
};

async function main() {
  console.log('🔄 Actualizando WordPress IDs...\n');
  
  let updated = 0;
  let notFound = 0;
  
  for (const [name, wpId] of Object.entries(WP_IDS)) {
    const player = await prisma.player.findFirst({
      where: { name: name }
    });
    
    if (player) {
      await prisma.player.update({
        where: { id: player.id },
        data: { wordpress_id: wpId }
      });
      console.log(`✅ ${name.padEnd(20)} → WP ID: ${wpId} (pos ${player.position})`);
      updated++;
    } else {
      console.log(`⚠️  ${name.padEnd(20)} → NO ENCONTRADO en DB`);
      notFound++;
    }
  }
  
  console.log(`\n📊 Resumen:`);
  console.log(`   ✅ Actualizados: ${updated}`);
  console.log(`   ⚠️  No encontrados: ${notFound}`);
  console.log('\n🎉 ¡Actualización completa!');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
