import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class ResetCodeThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const claimed: unknown = req.body?.email;
    const email =
      typeof claimed === 'string' && claimed.trim().length > 0
        ? claimed.trim().toLowerCase()
        : 'unknown';
    const ip = req.ip || req.socket?.remoteAddress;
    return `${ip}-${email}`;
  }
}
