import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

const WINDOW_MS = 60_000;
/** Status polling makes ~6 calls per payment; this leaves room for retries. */
const MAX_REQUESTS_PER_WINDOW = 40;
const MAX_TRACKED_CLIENTS = 10_000;

type Bucket = { count: number; resetAt: number };

/**
 * Every customer payment call can reach Razorpay's API, so one client must not
 * be able to hammer it. In-process like the geocoding guard: no Redis needed.
 */
@Injectable()
export class PaymentsRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const client = this.clientKey(request);
    const now = Date.now();

    this.evictExpired(now);

    const bucket = this.buckets.get(client);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(client, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }

    if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
      throw new HttpException(
        {
          success: false,
          code: 'PAYMENT_RATE_LIMITED',
          message: 'Too many payment requests. Please wait a moment.',
          retryable: true,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    bucket.count += 1;
    return true;
  }

  private clientKey(request: Request): string {
    const user = (request as Request & { user?: { sub?: string; id?: string } })
      .user;
    const userId = user?.sub ?? user?.id;
    if (userId) return `user:${userId}`;
    return `ip:${request.ip ?? 'unknown'}`;
  }

  private evictExpired(now: number): void {
    if (this.buckets.size < MAX_TRACKED_CLIENTS) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}
