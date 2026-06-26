import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class CfThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Detrás de Cloudflare, CF-Connecting-IP es la IP real del cliente,
    // seteada por CF y no falsificable si el tráfico entra por Cloudflare.
    // Fallback a x-forwarded-for y req.ip para pruebas locales sin CF.
    const cfIp = req.headers?.['cf-connecting-ip'];
    if (cfIp) return Array.isArray(cfIp) ? cfIp[0] : cfIp;

    const xff = req.headers?.['x-forwarded-for'];
    if (xff) {
      const first = (Array.isArray(xff) ? xff[0] : xff).split(',')[0].trim();
      if (first) return first;
    }
    return req.ip;
  }
}
