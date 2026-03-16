"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const whatsapp_service_1 = require("./notifications/whatsapp.service");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const port = process.env.PORT || 3000;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    app.enableCors({
        origin: [frontendUrl],
        credentials: true,
    });
    console.log('🔄 Inicializando WhatsApp Bot...');
    await whatsapp_service_1.whatsappService.initialize();
    await app.listen(port);
    console.log(`🚀 Backend corriendo en puerto ${port}`);
    console.log('📱 Test WhatsApp: POST /test/whatsapp');
}
bootstrap();
//# sourceMappingURL=main.js.map