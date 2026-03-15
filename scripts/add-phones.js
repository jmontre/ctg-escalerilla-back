"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    await prisma.player.update({
        where: { position: 1 },
        data: { phone: '56912345678' }
    });
    await prisma.player.update({
        where: { position: 2 },
        data: { phone: '56987654321' }
    });
    console.log('✅ Teléfonos agregados');
}
main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=add-phones.js.map