import { Controller, Get, Post, Patch, Delete, Body, Param, Headers, UnauthorizedException } from '@nestjs/common';
import { MasterService } from './master.service';
import { JwtService } from '@nestjs/jwt';

@Controller('master')
export class MasterController {
  constructor(
    private masterService: MasterService,
    private jwtService: JwtService,
  ) {}

  private getPlayerId(auth: string): string {
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException('Token no proporcionado');
    try {
      const token = auth.split(' ')[1];
      const payload = this.jwtService.verify(token);
      return payload.sub;
    } catch {
      throw new UnauthorizedException('Token inválido');
    }
  }

  @Get()
  findAll() {
    return this.masterService.findAll();
  }

  @Get(':category')
  findByCategory(@Param('category') category: string) {
    return this.masterService.findByCategory(category.toUpperCase());
  }

  @Post('generate')
  generate(@Body() body: {
    category: string;
    name: string;
    round_robin_start?: string;
    round_robin_end?: string;
    final_date?: string;
  }) {
    return this.masterService.generateMaster({
      ...body,
      category: body.category.toUpperCase()
    });
  }

  /**
   * PATCH /master/matches/:id/schedule
   * Fijar fecha de un partido (jugador autenticado)
   */
  @Patch('matches/:id/schedule')
  scheduleMatch(
    @Param('id') id: string,
    @Headers('authorization') auth: string,
    @Body() body: { scheduled_date: string }
  ) {
    const playerId = this.getPlayerId(auth);
    return this.masterService.scheduleMatch(id, playerId, new Date(body.scheduled_date));
  }

  /**
   * POST /master/matches/:id/result
   * Registrar resultado (admin)
   */
  @Post('matches/:id/result')
  submitResult(
    @Param('id') id: string,
    @Body() body: { winner_id: string; score: string }
  ) {
    return this.masterService.submitResult(id, body.winner_id, body.score);
  }

  @Post(':seasonId/check-final')
  checkFinal(@Param('seasonId') seasonId: string) {
    return this.masterService.checkAndGenerateFinal(seasonId);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.masterService.deleteSeason(id);
  }
}