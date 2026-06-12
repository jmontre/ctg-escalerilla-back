import { ConfigService } from '@nestjs/config';
import { JwtModuleAsyncOptions } from '@nestjs/jwt';

/**
 * Configuración compartida de JWT. Falla al arrancar si JWT_SECRET no está
 * definido (antes existía un fallback hardcodeado inseguro).
 */
export const jwtModuleOptions: JwtModuleAsyncOptions = {
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error(
        'JWT_SECRET no está definido. Configúralo en .env.dev / .env.production / variables de Railway.',
      );
    }
    return { secret, signOptions: { expiresIn: '7d' } };
  },
};
