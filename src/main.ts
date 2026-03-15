import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { whatsappService } from './notifications/whatsapp.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.enableCors({
    origin: ['http://localhost:3001', 'https://tudominio.com'],
    credentials: true,
  });

  console.log('🔄 Inicializando WhatsApp Bot...');
  await whatsappService.initialize();

  await app.listen(3000);
  console.log('🚀 Backend corriendo en http://localhost:3000');
  console.log('📱 Test WhatsApp: POST /test/whatsapp');
}

bootstrap();
