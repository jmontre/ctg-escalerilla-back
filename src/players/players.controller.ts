import { Controller, Get, Put, Post, Delete, Param, Body, Headers, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PlayersService } from './players.service';
import { JwtService } from '@nestjs/jwt';

@Controller('players')
export class PlayersController {
  constructor(
    private playersService: PlayersService,
    private jwtService: JwtService,
  ) { }

  @Get()
  findAll() {
    return this.playersService.findAll();
  }

  @Get('user/:userId')
  findByUserId(@Param('userId') userId: string) {
    return this.playersService.findByUserId(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.playersService.findOne(id);
  }

  @Get(':id/available-challenges')
  getAvailableChallenges(@Param('id') id: string) {
    return this.playersService.getAvailableChallenges(id);
  }

  /**
   * PUT /players/me
   * Actualizar perfil del jugador autenticado
   */
  @Put('me')
  async updateMe(
    @Headers('authorization') auth: string,
    @Body() body: {
      name?: string;
      phone?: string;
      current_password?: string;
      new_password?: string;
    }
  ) {
    const userId = this.getUserIdFromToken(auth);
    return this.playersService.updateMe(userId, body);
  }

  /**
   * POST /players/me/avatar
   * Subir foto de perfil (base64)
   */
  @Post('me/avatar')
  async uploadAvatar(
    @Headers('authorization') auth: string,
    @Body() body: { image: string }
  ) {
    if (!body.image) throw new BadRequestException('imagen requerida');
    const userId = this.getUserIdFromToken(auth);
    return this.playersService.uploadAvatar(userId, body.image);
  }

  private getUserIdFromToken(auth: string): string {
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token no proporcionado');
    }
    try {
      const token = auth.split(' ')[1];
      const payload = this.jwtService.verify(token);
      return payload.sub;
    } catch {
      throw new UnauthorizedException('Token inválido');
    }
  }

  @Delete('me/avatar')
  async deleteAvatar(@Headers('authorization') auth: string) {
    const userId = this.getUserIdFromToken(auth);
    return this.playersService.deleteAvatar(userId);
  }
}