import { Controller, Post, Body, Get, Req, Res } from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Public } from './public.decorator';

// COOKIE_CROSS_SITE=true → SameSite=None; Secure (requerido para cross-domain HTTPS: Railway ↔ Vercel)
// Sin esta variable (dev local) → SameSite=Lax; sin Secure (funciona en localhost same-site)
// Setear en Railway staging Y prod. No depender de NODE_ENV para no quedar ciegos si no está.
function isCookieSecure() {
  return process.env.COOKIE_CROSS_SITE === 'true';
}

function setCookieToken(res: Response, token: string) {
  const secure = isCookieSecure();
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearCookieToken(res: Response) {
  const secure = isCookieSecure();
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    path: '/',
  });
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    setCookieToken(res, result.token);
    return result;
  }

  @Public()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    setCookieToken(res, result.token);
    return result;
  }

  // JwtAuthGuard ya verificó el token (header o cookie) y pobló req.user
  @Get('me')
  async me(@Req() req: Request & { user: { sub: string } }) {
    return this.authService.validateTokenByUserId(req.user.sub);
  }

  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    clearCookieToken(res);
    return { message: 'Sesión cerrada' };
  }

  @Public()
  @Post('forgot-password')
  async forgotPassword(@Body() body: { username: string }) {
    return this.authService.forgotPassword(body.username);
  }

  @Public()
  @Post('reset-password')
  async resetPassword(@Body() body: { token: string; password: string }) {
    return this.authService.resetPassword(body.token, body.password);
  }
}
