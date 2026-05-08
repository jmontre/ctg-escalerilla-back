import { ConsoleLogger } from '@nestjs/common';

export class ChileLogger extends ConsoleLogger {
  protected getTimestamp(): string {
    return new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });
  }
}
