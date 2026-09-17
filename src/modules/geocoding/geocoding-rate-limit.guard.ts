import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;
/** Bounds memory if a burst of unique IPs arrives. */
const MAX_TRACKED_CLIENTS = 10_000;

type Bucket = { count: number; resetAt: number };

/**
 * Geocoding endpoints are public (location is chosen before sign-in) and every
 * cache miss costs money, so an unauthenticated caller must not be able to loop
 * on them. Deliberately in-process: it needs no Redis round-trip and the app
 * runs behind a small number of instances.
 */
@Injectable()
export class GeocodingRateLimitGuard implements CanActivate {
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
        'Too many address lookups. Please slow down.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    bucket.count += 1;
    return true;
  }

  /** Authenticated callers get their own bucket; everyone else is keyed by IP. */
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
