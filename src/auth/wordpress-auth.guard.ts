import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { WordPressAuthService } from './wordpress-auth.service';

@Injectable()
export class WordPressAuthGuard implements CanActivate {
  constructor(private wpAuthService: WordPressAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const cookieHeader = request.headers.cookie;

    console.log('🔍 WordPress Auth Guard');
    console.log('📋 Cookie header completo:', cookieHeader);

    if (!cookieHeader) {
      console.log('❌ No hay cookies');
      throw new UnauthorizedException('No se encontraron cookies de sesión');
    }

    try {
      console.log('🔐 Verificando con WordPress...');
      const wpUser = await this.wpAuthService.verifySession(cookieHeader);
      console.log('✅ Usuario verificado:', wpUser);
      request.wpUser = wpUser;
      return true;
    } catch (error) {
      console.log('❌ Error de verificación:', error.message);
      throw new UnauthorizedException('Sesión de WordPress inválida o expirada');
    }
  }
}