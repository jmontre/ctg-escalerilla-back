import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { whatsappService } from './notifications/whatsapp.service';
import { ChileLogger } from './common/chile-logger';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: new ChileLogger() });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Aumentar límite para subida de imágenes en base64
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  const port = process.env.PORT || 3000;

  app.enableCors({
    origin: (origin, callback) => {
      const allowed = [
        'http://localhost:3001',
        'http://localhost:3000',
        'https://reservas.clubdetenisgraneros.cl',
        'https://escalerilla.clubdetenisgraneros.cl',
        process.env.FRONTEND_URL,
      ].filter(Boolean);
      // Permitir requests sin origin (mobile apps, Postman, etc.)
      // y todos los preview deployments de Vercel
      if (!origin || allowed.includes(origin) || origin.endsWith('.vercel.app')) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origen no permitido: ${origin}`));
      }
    },
    credentials: true,
  });

  console.log('🔄 Inicializando WhatsApp Bot...');
  await whatsappService.initialize();

  await app.listen(port);
  console.log(`🚀 Backend corriendo en puerto ${port}`);
  console.log('📱 Test WhatsApp: POST /test/whatsapp');
}

bootstrap();