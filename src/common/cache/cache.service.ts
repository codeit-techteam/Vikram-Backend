import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../database/redis.service';
import { CACHE_KEYS, CACHE_PATTERNS } from './cache.constants';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(private readonly redisService: RedisService) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redisService.getClient().get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.warn(`Cache GET failed for key "${key}": ${String(error)}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redisService
        .getClient()
        .set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(`Cache SET failed for key "${key}": ${String(error)}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redisService.getClient().del(key);
    } catch (error) {
      this.logger.warn(`Cache DEL failed for key "${key}": ${String(error)}`);
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const client = this.redisService.getClient();
      let cursor = '0';

      do {
        const [nextCursor, keys] = await client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = nextCursor;

        if (keys.length > 0) {
          await client.del(...keys);
        }
      } while (cursor !== '0');
    } catch (error) {
      this.logger.warn(
        `Cache invalidate failed for pattern "${pattern}": ${String(error)}`,
      );
    }
  }

  /** Call from Admin CMS write paths after Banner/Offer/Category/Product/Video changes. */
  async invalidateHome(): Promise<void> {
    await this.del(CACHE_KEYS.HOME);
    await this.invalidateCms();
  }

  async invalidateCms(): Promise<void> {
    await this.invalidatePattern(CACHE_PATTERNS.CMS);
    // Standalone GET /testimonials uses testimonials:published (not cms:*)
    await this.invalidatePattern(CACHE_PATTERNS.TESTIMONIALS);
  }

  async invalidateCategories(): Promise<void> {
    await this.del(CACHE_KEYS.CATEGORIES);
    await this.del(CACHE_KEYS.CATEGORIES_FEATURED);
    await this.del(CACHE_KEYS.CATEGORIES_TOP);
    await this.invalidatePattern(CACHE_PATTERNS.CATEGORIES);
    await this.invalidateHome();
  }

  async invalidateProducts(): Promise<void> {
    await this.invalidatePattern(CACHE_PATTERNS.PRODUCTS);
    await this.invalidateHome();
    await this.invalidateSearch();
  }

  async invalidateOffers(): Promise<void> {
    await this.del(CACHE_KEYS.OFFERS);
    await this.del(CACHE_KEYS.OFFERS_FEATURED);
    await this.invalidatePattern(CACHE_PATTERNS.OFFERS);
    await this.invalidateHome();
    await this.invalidateSearch();
  }

  async invalidateBanners(): Promise<void> {
    await this.invalidatePattern(CACHE_PATTERNS.BANNERS);
    await this.invalidateHome();
  }

  async invalidateVideos(): Promise<void> {
    await this.invalidatePattern(CACHE_PATTERNS.VIDEOS);
    await this.invalidateHome();
  }

  async invalidateNotifications(customerId?: string): Promise<void> {
    await this.invalidatePattern(CACHE_PATTERNS.NOTIFICATIONS);
    if (customerId) {
      await this.del(CACHE_KEYS.NOTIFICATION_UNREAD(customerId));
    }
  }

  async invalidateUnreadCount(customerId: string): Promise<void> {
    await this.del(CACHE_KEYS.NOTIFICATION_UNREAD(customerId));
  }

  async invalidateSearch(): Promise<void> {
    await this.invalidatePattern(CACHE_PATTERNS.SEARCH);
  }

  async invalidateCart(customerId: string): Promise<void> {
    await this.del(CACHE_KEYS.CART(customerId));
  }

  async invalidateWishlist(customerId: string): Promise<void> {
    await this.del(CACHE_KEYS.WISHLIST(customerId));
  }

  /** Call after order placement — cart is cleared and notifications change. */
  async invalidateAfterOrder(customerId: string): Promise<void> {
    await this.invalidateCart(customerId);
    await this.invalidateNotifications(customerId);
    await this.invalidateOrders(customerId);
  }

  async invalidateOrders(customerId: string): Promise<void> {
    await this.invalidatePattern(CACHE_PATTERNS.ORDERS(customerId));
  }

  async invalidateProfile(customerId: string): Promise<void> {
    await this.del(CACHE_KEYS.PROFILE(customerId));
    await this.invalidateSites(customerId);
  }

  async invalidateSites(customerId: string): Promise<void> {
    await this.invalidatePattern(CACHE_PATTERNS.SITES(customerId));
  }

  async invalidateReviews(productId?: string): Promise<void> {
    if (productId) {
      await this.del(CACHE_KEYS.PRODUCT_REVIEWS(productId));
    }
    await this.invalidatePattern(CACHE_PATTERNS.REVIEWS);
  }

  async invalidateSupport(customerId: string): Promise<void> {
    await this.invalidatePattern(CACHE_PATTERNS.SUPPORT(customerId));
  }
}
