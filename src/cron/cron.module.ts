import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ChallengesCronService } from './challenges-cron.service';
import { CronController } from './cron.controller';
import { ChallengesModule } from '../challenges/challenges.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ChallengesModule
  ],
  controllers: [CronController],
  providers: [ChallengesCronService]
})
export class CronModule {}