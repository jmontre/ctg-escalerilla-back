import { Controller, Post, Delete, Body, Param } from '@nestjs/common';
import { AdminChallengesService } from './admin-challenges.service';

@Controller('admin/challenges')
export class AdminChallengesController {
  constructor(private adminService: AdminChallengesService) {}

  @Post(':id/resolve')
  async resolveChallenge(
    @Param('id') id: string,
    @Body() data: { winnerId: string; score: string }
  ) {
    return this.adminService.resolveChallenge(id, data.winnerId, data.score);
  }

  @Delete(':id')
  async cancelChallenge(@Param('id') id: string) {
    return this.adminService.cancelChallenge(id);
  }

  @Post(':id/extend')
  async extendDeadline(
    @Param('id') id: string,
    @Body() data: { hours: number; type: 'accept' | 'play' }
  ) {
    return this.adminService.extendDeadline(id, data.hours, data.type);
  }
}
