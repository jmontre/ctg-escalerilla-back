import { Module } from '@nestjs/common';
import { ChallengesCronService } from './challenges-cron.service';
import { CronController } from './cron.controller';
import { ChallengesModule } from '../challenges/challenges.module';

@Module({
  imports: [ChallengesModule],
  controllers: [CronController],
  providers: [ChallengesCronService],
})
export class CronModule {}
