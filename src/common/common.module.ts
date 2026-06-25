// src/common/common.module.ts
import { Module, Global } from '@nestjs/common';
import { AppLogger } from './app.logger';

@Global()
@Module({
  providers: [AppLogger],
  exports: [AppLogger],
})
export class CommonModule {}
