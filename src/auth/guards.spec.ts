import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AdminGuard } from './admin.guard';

function mockContext(
  headers: Record<string, string> = {},
  user?: unknown,
): ExecutionContext {
  const request: any = { headers, user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
    __request: request,
  } as unknown as ExecutionContext;
}

function reflectorReturning(value: boolean): Reflector {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(value),
  } as unknown as Reflector;
}

describe('JwtAuthGuard', () => {
  const jwtService = new JwtService({ secret: 'test-secret' });

  it('deja pasar rutas @Public() sin token', () => {
    const guard = new JwtAuthGuard(jwtService, reflectorReturning(true));
    expect(guard.canActivate(mockContext())).toBe(true);
  });

  it('rechaza sin header Authorization', () => {
    const guard = new JwtAuthGuard(jwtService, reflectorReturning(false));
    expect(() => guard.canActivate(mockContext())).toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza token inválido', () => {
    const guard = new JwtAuthGuard(jwtService, reflectorReturning(false));
    expect(() =>
      guard.canActivate(mockContext({ authorization: 'Bearer basura' })),
    ).toThrow(UnauthorizedException);
  });

  it('acepta token válido y adjunta el payload a request.user', () => {
    const guard = new JwtAuthGuard(jwtService, reflectorReturning(false));
    const token = jwtService.sign({
      sub: 'u1',
      is_admin: false,
      admin_role: null,
    });
    const ctx = mockContext({ authorization: `Bearer ${token}` });
    expect(guard.canActivate(ctx)).toBe(true);
    expect((ctx as any).__request.user.sub).toBe('u1');
  });
});

describe('AdminGuard', () => {
  it('deja pasar rutas sin @Admin()', () => {
    const guard = new AdminGuard(reflectorReturning(false));
    expect(
      guard.canActivate(mockContext({}, { sub: 'u1', is_admin: false })),
    ).toBe(true);
  });

  it('rechaza no-admin en ruta @Admin()', () => {
    const guard = new AdminGuard(reflectorReturning(true));
    expect(() =>
      guard.canActivate(mockContext({}, { sub: 'u1', is_admin: false })),
    ).toThrow(ForbiddenException);
  });

  it('rechaza si no hay user (ruta @Admin() y @Public() a la vez)', () => {
    const guard = new AdminGuard(reflectorReturning(true));
    expect(() => guard.canActivate(mockContext())).toThrow(ForbiddenException);
  });

  it('acepta admin en ruta @Admin()', () => {
    const guard = new AdminGuard(reflectorReturning(true));
    expect(
      guard.canActivate(mockContext({}, { sub: 'u1', is_admin: true })),
    ).toBe(true);
  });
});
