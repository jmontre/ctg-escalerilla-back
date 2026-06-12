import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Headers, UnauthorizedException } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { JwtService } from '@nestjs/jwt';
import { Admin } from '../auth/admin.decorator';
import { CreateReservationDto } from './dto/create-reservation.dto';

@Controller('reservations')
export class ReservationsController {
  constructor(
    private reservationsService: ReservationsService,
    private jwtService: JwtService,
  ) {}

  private getUserId(auth: string): string {
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException('Token no proporcionado');
    try {
      const payload = this.jwtService.verify(auth.split(' ')[1]);
      return payload.sub;
    } catch {
      throw new UnauthorizedException('Token inválido');
    }
  }

  @Admin()
  @Get('blocks')
  getBlocks(@Query('date') date: string) {
    return this.reservationsService.getBlocks(date);
  }

  @Admin()
  @Post('blocks')
  setBlocks(@Body() body: { court_id: string; date: string; slots: string[]; reason?: string }) {
    return this.reservationsService.setBlocks(body.court_id, body.date, body.slots, body.reason);
  }

  @Admin()
  @Delete('blocks/:id')
  deleteBlock(@Param('id') id: string) {
    return this.reservationsService.deleteBlock(id);
  }

  @Get('courts')
  getCourts() { return this.reservationsService.getCourts(); }

  @Get('availability')
  getAvailability(@Query('date') date: string) {
    if (!date) throw new UnauthorizedException('Debes indicar una fecha.');
    return this.reservationsService.getAvailability(date);
  }

  @Get('season')
  getSeason() { return this.reservationsService.getSeason().then(season => ({ season })); }

  @Admin()
  @Post('season')
  setSeason(@Body() body: { season: string }) {
    return this.reservationsService.setSeason(body.season);
  }

  // Rutas estáticas ANTES de rutas con parámetros (:id)
  @Admin()
  @Get('stats')
  getStats(@Query('month') month?: string) {
    return this.reservationsService.getStats(month);
  }

  @Get('light-config')
  getLightConfig(@Query('date') date: string) {
    return this.reservationsService.getLightConfig(date);
  }

  @Admin()
  @Post('light-config')
  setLightConfig(@Body() body: { date: string; time_slots: string[]; amount_per_slot: number }) {
    return this.reservationsService.setLightConfig(body.date, body.time_slots, body.amount_per_slot);
  }

  @Admin()
  @Get('light-summary')
  getLightSummary(@Query('month') month: string) {
    return this.reservationsService.getLightSummary(month);
  }

  @Get('my')
  getMyReservations(@Headers('authorization') auth: string) {
    const userId = this.getUserId(auth);
    return this.reservationsService.getMyReservations(userId);
  }

  @Admin()
  @Get('player/:playerId')
  getPlayerReservations(@Param('playerId') playerId: string) {
    return this.reservationsService.getPlayerReservations(playerId);
  }

  @Admin()
  @Get()
  getAllReservations(@Query('date') date?: string, @Query('month') month?: string) {
    return this.reservationsService.getAllReservations(date, month);
  }

  @Post()
  create(
    @Headers('authorization') auth: string,
    @Body() body: CreateReservationDto
  ) {
    const userId = this.getUserId(auth);
    return this.reservationsService.create(userId, body);
  }

  @Patch(':id/modify')
  modify(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: CreateReservationDto
  ) {
    const userId = this.getUserId(auth);
    return this.reservationsService.modify(userId, id, body);
  }

  @Delete(':id')
  cancel(@Headers('authorization') auth: string, @Param('id') id: string) {
    const userId = this.getUserId(auth);
    return this.reservationsService.cancel(userId, id);
  }

  @Admin()
  @Delete(':id/admin')
  adminCancel(@Param('id') id: string, @Body() body?: { reason?: string }) {
    return this.reservationsService.adminCancel(id, body?.reason);
  }
}