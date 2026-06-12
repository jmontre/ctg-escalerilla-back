import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const auth: string | undefined = request.headers?.authorization;
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token no proporcionado');
    }
    try {
      request.user = this.jwtService.verify(auth.slice(7));
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }
}
