import { Controller, Post, Body, Get, Req, Res } from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Public } from './public.decorator';

const isProd = process.env.NODE_ENV === 'production';

function setCookieToken(res: Response, token: string) {
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: isProd,
    // cross-origin (railway.app ↔ clubdetenisgraneros.cl): prod necesita 'none'
    // dev (localhost ↔ localhost): 'lax' es suficiente y no requiere Secure
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearCookieToken(res: Response) {
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
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
