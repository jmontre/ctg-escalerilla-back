import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PlayersController } from './players.controller';
import { PlayersService } from './players.service';
import { AdminPlayersController } from './admin-players.controller';
import { AdminPlayersService } from './admin-players.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ChallengeRulesService } from '../challenges/challenge-rules.service';
import { jwtModuleOptions } from '../auth/jwt.config';

@Module({
  imports: [PrismaModule, JwtModule.registerAsync(jwtModuleOptions)],
  controllers: [PlayersController, AdminPlayersController],
  providers: [PlayersService, AdminPlayersService, ChallengeRulesService],
  exports: [PlayersService],
})
export class PlayersModule {}
