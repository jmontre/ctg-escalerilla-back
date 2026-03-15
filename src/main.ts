import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { whatsappService } from './notifications/whatsapp.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const port = process.env.PORT || 3000;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';

  app.enableCors({
    origin: [frontendUrl],
    credentials: true,
  });

  console.log('🔄 Inicializando WhatsApp Bot...');
  await whatsappService.initialize();

  await app.listen(port);
  console.log(`🚀 Backend corriendo en puerto ${port}`);
  console.log('📱 Test WhatsApp: POST /test/whatsapp');
}

bootstrap();