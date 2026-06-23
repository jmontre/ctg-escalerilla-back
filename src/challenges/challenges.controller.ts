import { Controller, Get, Post, Body, Param, BadRequestException } from '@nestjs/common';
import { ChallengesService } from './challenges.service';
import { Public } from '../auth/public.decorator';

class CreateChallengeDto {
  challenger_id: string;
  challenged_id: string;
}

@Controller('challenges')
export class ChallengesController {
  constructor(private readonly challengesService: ChallengesService) { }

  /**
   * POST /challenges
   * Crear un nuevo desafío
   */
  @Post()
  create(@Body() dto: CreateChallengeDto) {
    if (!dto.challenger_id || !dto.challenged_id) {
      throw new BadRequestException('challenger_id y challenged_id son requeridos');
    }

    return this.challengesService.create(dto.challenger_id, dto.challenged_id);
  }

  /**
   * GET /challenges
   * Listar todos los desafíos
   */
  @Public()
  @Get()
  findAll() {
    return this.challengesService.findAll();
  }

  /**
   * GET /challenges/:id
   * Obtener un desafío específico
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.challengesService.findOne(id);
  }

  /**
   * POST /challenges/:id/accept
   * Aceptar un desafío
   */
  @Post(':id/accept')
  accept(
    @Param('id') id: string,
    @Body() body: { player_id: string }
  ) {
    if (!body.player_id) {
      throw new BadRequestException('player_id es requerido');
    }
    return this.challengesService.accept(id, body.player_id);
  }

  /**
   * POST /challenges/:id/reject
   * Rechazar un desafío (intercambio automático)
   */
  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Body() body: { player_id: string }
  ) {
    if (!body.player_id) {
      throw new BadRequestException('player_id es requerido');
    }
    return this.challengesService.reject(id, body.player_id);
  }

  /**
   * POST /challenges/:id/result
   * Ingresar resultado del partido
   */
  @Post(':id/result')
  submitResult(
    @Param('id') id: string,
    @Body() body: {
      player_id: string;
      winner_id: string;
      score: string;
    }
  ) {
    if (!body.player_id || !body.winner_id || !body.score) {
      throw new BadRequestException('player_id, winner_id y score son requeridos');
    }

    return this.challengesService.submitResult(
      id,
      body.player_id,
      {
        winnerId: body.winner_id,
        score: body.score
      }
    );
  }

  /**
   * POST /challenges/:id/schedule
   * Fijar o actualizar la fecha acordada del partido
   */
  @Post(':id/schedule')
  scheduleMatch(
    @Param('id') id: string,
    @Body() body: { player_id: string; scheduled_date: string; court_id?: string }
  ) {
    if (!body.player_id || !body.scheduled_date) {
      throw new BadRequestException('player_id y scheduled_date son requeridos');
    }
    return this.challengesService.scheduleMatch(
      id,
      body.player_id,
      new Date(body.scheduled_date),
      body.court_id,  // ← agrega esto
    );
  }
}