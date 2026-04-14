import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Headers, UnauthorizedException } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { JwtService } from '@nestjs/jwt';

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

  @Get('blocks')
  getBlocks(@Query('date') date: string) {
    return this.reservationsService.getBlocks(date);
  }

  @Post('blocks')
  setBlocks(@Body() body: { court_id: string; date: string; slots: string[]; reason?: string }) {
    return this.reservationsService.setBlocks(body.court_id, body.date, body.slots, body.reason);
  }

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

  @Post('season')
  setSeason(@Body() body: { season: string }) {
    return this.reservationsService.setSeason(body.season);
  }

  // Rutas estáticas ANTES de rutas con parámetros (:id)
  @Get('stats')
  getStats(@Query('month') month?: string) {
    return this.reservationsService.getStats(month);
  }

  @Get('my')
  getMyReservations(@Headers('authorization') auth: string) {
    const userId = this.getUserId(auth);
    return this.reservationsService.getMyReservations(userId);
  }

  @Get('player/:playerId')
  getPlayerReservations(@Param('playerId') playerId: string) {
    return this.reservationsService.getPlayerReservations(playerId);
  }

  @Get()
  getAllReservations(@Query('date') date?: string) {
    return this.reservationsService.getAllReservations(date);
  }

  @Post()
  create(
    @Headers('authorization') auth: string,
    @Body() body: {
      court_id: string;
      date: string;
      time_slot: string;
      has_guest?: boolean;
      guest_name?: string;
      partner_name?: string;
      school_name?: string;
    }
  ) {
    const userId = this.getUserId(auth);
    return this.reservationsService.create(userId, body);
  }

  @Patch(':id/modify')
  modify(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: { court_id: string; date: string; time_slot: string; has_guest?: boolean; guest_name?: string; partner_name?: string }
  ) {
    const userId = this.getUserId(auth);
    return this.reservationsService.modify(userId, id, body);
  }

  @Delete(':id')
  cancel(@Headers('authorization') auth: string, @Param('id') id: string) {
    const userId = this.getUserId(auth);
    return this.reservationsService.cancel(userId, id);
  }

  @Delete(':id/admin')
  adminCancel(@Param('id') id: string, @Body() body?: { reason?: string }) {
    return this.reservationsService.adminCancel(id, body?.reason);
  }
}