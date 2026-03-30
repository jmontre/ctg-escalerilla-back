import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { AdminPlayersService } from './admin-players.service';

@Controller('admin/players')
export class AdminPlayersController {
  constructor(private adminService: AdminPlayersService) {}

  @Post()
  async createPlayer(@Body() data: {
    username: string;
    email: string;
    password: string;
    name: string;
    phone?: string;
    position?: number;
    member_type?: string;
    parent_id?: string;
    has_debt?: boolean;
    admin_role?: string | null;
  }) {
    return this.adminService.createPlayer(data);
  }

  @Put(':id')
  async updatePlayer(
    @Param('id') id: string,
    @Body() data: {
      name?: string;
      email?: string;
      phone?: string;
      position?: number | null;
      wins?: number;
      losses?: number;
      total_matches?: number;
      immune_until?: string | null;
      vulnerable_until?: string | null;
      member_type?: string;
      parent_id?: string | null;
      has_debt?: boolean;
      admin_role?: string | null;
    }
  ) {
    return this.adminService.updatePlayer(id, data);
  }

  @Delete(':id')
  async deletePlayer(@Param('id') id: string) {
    return this.adminService.deletePlayer(id);
  }

  @Post(':id/move')
  async movePlayer(@Param('id') id: string, @Body() data: { newPosition: number }) {
    return this.adminService.movePlayer(id, data.newPosition);
  }

  @Post(':id/reset-immunity')
  async resetImmunity(@Param('id') id: string) {
    return this.adminService.resetImmunity(id);
  }

  @Post(':id/reset-vulnerability')
  async resetVulnerability(@Param('id') id: string) {
    return this.adminService.resetVulnerability(id);
  }

  /** GET /admin/players/:id/weekly-usage — cupos alta demanda usados esta semana */
  @Get(':id/weekly-usage')
  async getWeeklyUsage(@Param('id') id: string) {
    return this.adminService.getWeeklyHighDemandUsage(id);
  }
}