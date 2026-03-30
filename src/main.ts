import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { whatsappService } from './notifications/whatsapp.service';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Aumentar límite para subida de imágenes en base64
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  const port = process.env.PORT || 3000;

  app.enableCors({
    origin: [
      'http://localhost:3001',
      'https://reservas.clubdetenisgraneros.cl',
      process.env.FRONTEND_URL,
    ].filter(Boolean) as string[],
    credentials: true,
  });

  console.log('🔄 Inicializando WhatsApp Bot...');
  await whatsappService.initialize();

  await app.listen(port);
  console.log(`🚀 Backend corriendo en puerto ${port}`);
  console.log('📱 Test WhatsApp: POST /test/whatsapp');
}

bootstrap();