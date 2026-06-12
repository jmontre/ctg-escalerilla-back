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
import { CommonModule } from './common/common.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'production'
        ? '.env.production'
        : '.env.dev',
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    PlayersModule,
    ChallengesModule,
    CronModule,
    MasterModule,
    ReservationsModule,
    CommonModule,
  ],
  controllers: [TestController],
})
export class AppModule { }