import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MasterController } from './master.controller';
import { MasterService } from './master.service';
import { PrismaModule } from '../prisma/prisma.module';
import { jwtModuleOptions } from '../auth/jwt.config';

@Module({
  imports: [PrismaModule, JwtModule.registerAsync(jwtModuleOptions)],
  controllers: [MasterController],
  providers: [MasterService],
  exports: [MasterService],
})
export class MasterModule {}
