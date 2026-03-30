import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PlayersModule } from './players/players.module';
import { ChallengesModule } from './challenges/challenges.module';
import { CronModule } from './cron/cron.module';
import { MasterModule } from './master/master.module';
import { ReservationsModule } from './reservations/reservations.module';
import { TestController } from './test/test.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    PlayersModule,
    ChallengesModule,
    CronModule,
    MasterModule,
    ReservationsModule,
  ],
  controllers: [TestController],
})
export class AppModule {}