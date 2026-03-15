import { Module } from '@nestjs/common';
import { PlayersController } from './players.controller';
import { PlayersService } from './players.service';
import { AdminPlayersController } from './admin-players.controller';
import { AdminPlayersService } from './admin-players.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ChallengeRulesService } from '../challenges/challenge-rules.service';

@Module({
  imports: [PrismaModule],
  controllers: [PlayersController, AdminPlayersController],
  providers: [PlayersService, AdminPlayersService, ChallengeRulesService],
  exports: [PlayersService],
})
export class PlayersModule {}
