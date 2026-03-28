import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MasterController } from './master.controller';
import { MasterService } from './master.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [MasterController],
  providers: [MasterService],
  exports: [MasterService],
})
export class MasterModule {}