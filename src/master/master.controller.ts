import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { MasterService } from './master.service';
import { JwtService } from '@nestjs/jwt';
import { Admin } from '../auth/admin.decorator';
import { Public } from '../auth/public.decorator';

@Controller('master')
export class MasterController {
  constructor(
    private masterService: MasterService,
    private jwtService: JwtService,
  ) {}

  private getUserId(auth: string): string {
    if (!auth?.startsWith('Bearer '))
      throw new UnauthorizedException('Token no proporcionado');
    try {
      const payload = this.jwtService.verify(auth.split(' ')[1]);
      return payload.sub;
    } catch {
      throw new UnauthorizedException('Token inválido');
    }
  }

  @Public()
  @Get()
  findAll() {
    return this.masterService.findAll();
  }

  @Public()
  @Get(':category')
  findByCategory(@Param('category') category: string) {
    return this.masterService.findByCategory(category.toUpperCase());
  }

  @Admin()
  @Post('generate')
  generate(
    @Body()
    body: {
      category: string;
      name: string;
      round_robin_start?: string;
      round_robin_end?: string;
      final_date?: string;
    },
  ) {
    return this.masterService.generateMaster({
      ...body,
      category: body.category.toUpperCase(),
    });
  }

  /**
   * PATCH /master/matches/:id/schedule
   * Fijar fecha (jugador autenticado)
   */
  @Patch('matches/:id/schedule')
  scheduleMatch(
    @Param('id') id: string,
    @Headers('authorization') auth: string,
    @Body() body: { scheduled_date: string; court_id?: string },
  ) {
    const userId = this.getUserId(auth);
    return this.masterService.scheduleMatch(
      id,
      userId,
      new Date(body.scheduled_date),
      body.court_id,
    );
  }

  /**
   * POST /master/matches/:id/player-result
   * Ingresar resultado (jugador autenticado) — doble confirmación
   */
  @Post('matches/:id/player-result')
  submitPlayerResult(
    @Param('id') id: string,
    @Headers('authorization') auth: string,
    @Body() body: { winner_id: string; score: string },
  ) {
    const userId = this.getUserId(auth);
    return this.masterService.submitPlayerResult(id, userId, {
      winnerId: body.winner_id,
      score: body.score,
    });
  }

  /**
   * POST /master/matches/:id/result
   * Ingresar resultado directo (admin)
   */
  @Admin()
  @Post('matches/:id/result')
  submitResult(
    @Param('id') id: string,
    @Body() body: { winner_id: string; score: string },
  ) {
    return this.masterService.submitResult(id, body.winner_id, body.score);
  }

  @Admin()
  @Post(':seasonId/check-final')
  checkFinal(@Param('seasonId') seasonId: string) {
    return this.masterService.checkAndGenerateFinal(seasonId);
  }

  @Admin()
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.masterService.deleteSeason(id);
  }
}
