import { Controller, Post } from '@nestjs/common';
import { ChallengesCronService } from './challenges-cron.service';
import { Admin } from '../auth/admin.decorator';

@Admin()
@Controller('cron')
export class CronController {
  constructor(private cronService: ChallengesCronService) {}

  /**
   * POST /cron/run
   * Ejecutar manualmente el cron job (solo para testing)
   */
  @Post('run')
  async runCronManually() {
    await this.cronService.runManually();
    return {
      message: 'Cron job ejecutado manualmente',
      timestamp: new Date(),
    };
  }
}
