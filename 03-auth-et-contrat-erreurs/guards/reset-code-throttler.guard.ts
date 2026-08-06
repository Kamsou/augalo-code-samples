import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class ResetCodeThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Track by IP + email to prevent brute force on specific accounts
    const email = req.body?.email || 'unknown';
    const ip = req.ip || req.connection.remoteAddress;
    return `${ip}-${email}`;
  }
}
