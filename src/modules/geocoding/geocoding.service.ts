import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import { CacheService } from '../../common/cache/cache.service';
import type {
  PlaceSuggestionDto,
  ResolvedAddressDto,
} from './dto/geocoding.dto';

const GEOCODE_BASE = 'https://maps.googleapis.com/maps/api/geocode/json';
const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';

/**
 * ~11m. Rounding before both the cache lookup and the Google call turns a
 * map-drag into a handful of billable requests instead of one per frame.
 */
const COORD_PRECISION = 4;

/**
 * Redis is currently disabled project-wide (see redis-bullmq.feature.ts), which
 * makes CacheService a no-op. Geocoding is billed per request, so it carries its
 * own in-process cache rather than paying Google for every map-pin nudge. Reads
 * still prefer Redis when it comes back, so this stays correct either way.
 */
const MEMORY_CACHE_LIMIT = 5_000;

type AddressComponent = {
  long_name: string;
  short_name?: string;
  types: string[];
};

type GeocodeResult = {
  formatted_address?: string;
  place_id?: string;
  geometry?: { location?: { lat: number; lng: number } };
  address_components?: AddressComponent[];
};

type GoogleEnvelope = {
  status: string;
  error_message?: string;
};

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly memoryCache = new Map<
    string,
    { value: unknown; expiresAt: number }
  >();

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
  ) {}

  /** Memory first, then Redis, then the paid call. Writes populate both. */
  private async cached<T>(
    key: string,
    ttlSeconds: number,
    produce: () => Promise<T>,
  ): Promise<T> {
    const now = Date.now();

    const local = this.memoryCache.get(key);
    if (local && local.expiresAt > now) {
      return local.value as T;
    }
    if (local) this.memoryCache.delete(key);

    const remote = await this.cacheService.get<T>(key);
    if (remote) {
      this.rememberLocally(key, remote, ttlSeconds, now);
      return remote;
    }

    const value = await produce();
    this.rememberLocally(key, value, ttlSeconds, Date.now());
    await this.cacheService.set(key, value, ttlSeconds);
    return value;
  }

  private rememberLocally(
    key: string,
    value: unknown,
    ttlSeconds: number,
    now: number,
  ): void {
    if (this.memoryCache.size >= MEMORY_CACHE_LIMIT) {
      for (const [candidate, entry] of this.memoryCache) {
        if (entry.expiresAt <= now) this.memoryCache.delete(candidate);
      }
      // Still full means everything is live; drop the oldest insertion.
      if (this.memoryCache.size >= MEMORY_CACHE_LIMIT) {
        const [oldest] = this.memoryCache.keys();
        if (oldest !== undefined) this.memoryCache.delete(oldest);
      }
    }
    this.memoryCache.set(key, { value, expiresAt: now + ttlSeconds * 1000 });
  }

  private get apiKey(): string {
    return this.configService.get<string>('googleMaps.apiKey', '');
  }

  private get region(): string {
    return this.configService.get<string>('googleMaps.region', 'in');
  }

  isConfigured(): boolean {
    return this.apiKey.trim().length > 0;
  }

  private requireKey(): string {
    const key = this.apiKey.trim();
    if (!key) {
      throw new ServiceUnavailableException(
        'Geocoding is not configured. Set GOOGLE_MAPS_SERVER_API_KEY.',
      );
    }
    return key;
  }

  /**
   * Google answers quota and API-enablement problems with HTTP 200 and a status
   * string, so the status has to be inspected explicitly rather than trusting
   * the response code.
   */
  private async callGoogle<T extends GoogleEnvelope>(
    url: URL,
    api: string,
  ): Promise<T> {
    const timeoutMs = this.configService.get<number>(
      'googleMaps.timeoutMs',
      8000,
    );

    let json: T;
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      json = (await response.json()) as T;
    } catch (error) {
      this.logger.error(`${api} request failed: ${String(error)}`);
      throw new ServiceUnavailableException(
        'Address lookup is temporarily unavailable.',
      );
    }

    if (json.status === 'OK' || json.status === 'ZERO_RESULTS') {
      return json;
    }

    // error_message can contain the key, so it is logged rather than returned.
    this.logger.error(
      `${api} returned ${json.status}: ${json.error_message ?? 'no detail'}`,
    );

    if (json.status === 'REQUEST_DENIED') {
      throw new ServiceUnavailableException(
        `Address lookup is not enabled for this deployment. Enable ${api} in Google Cloud Console.`,
      );
    }
    if (json.status === 'OVER_QUERY_LIMIT') {
      throw new ServiceUnavailableException(
        'Address lookup quota is exhausted. Try again shortly.',
      );
    }
    throw new ServiceUnavailableException('Address lookup failed.');
  }

  private toResolvedAddress(
    result: GeocodeResult,
    fallbackLat: number,
    fallbackLng: number,
  ): ResolvedAddressDto {
    const components = result.address_components ?? [];
    const pick = (...types: string[]) =>
      components.find((c) => types.some((t) => c.types.includes(t)))
        ?.long_name ?? '';

    return {
      fullAddress: result.formatted_address ?? '',
      city: pick(
        'locality',
        'administrative_area_level_3',
        'administrative_area_level_2',
        'sublocality',
      ),
      state: pick('administrative_area_level_1'),
      country: pick('country') || 'India',
      pincode: pick('postal_code'),
      latitude: result.geometry?.location?.lat ?? fallbackLat,
      longitude: result.geometry?.location?.lng ?? fallbackLng,
      placeId: result.place_id,
    };
  }

  async reverseGeocode(
    latitude: number,
    longitude: number,
  ): Promise<ResolvedAddressDto> {
    const lat = latitude.toFixed(COORD_PRECISION);
    const lng = longitude.toFixed(COORD_PRECISION);

    return this.cached(
      CACHE_KEYS.GEOCODE_REVERSE(lat, lng),
      CACHE_TTL.GEOCODE_REVERSE,
      async () => {
        const url = new URL(GEOCODE_BASE);
        url.searchParams.set('latlng', `${lat},${lng}`);
        url.searchParams.set('region', this.region);
        url.searchParams.set('key', this.requireKey());

        const json = await this.callGoogle<
          GoogleEnvelope & { results?: GeocodeResult[] }
        >(url, 'Geocoding API');

        const result = json.results?.[0];
        if (!result) {
          throw new NotFoundException(
            'No address found for those coordinates.',
          );
        }

        return this.toResolvedAddress(result, latitude, longitude);
      },
    );
  }

  async forwardGeocode(address: string): Promise<ResolvedAddressDto> {
    const query = address.trim();

    return this.cached(
      CACHE_KEYS.GEOCODE_FORWARD(query.toLowerCase()),
      CACHE_TTL.GEOCODE_FORWARD,
      async () => {
        const url = new URL(GEOCODE_BASE);
        url.searchParams.set('address', query);
        url.searchParams.set('region', this.region);
        url.searchParams.set('components', `country:${this.region}`);
        url.searchParams.set('key', this.requireKey());

        const json = await this.callGoogle<
          GoogleEnvelope & { results?: GeocodeResult[] }
        >(url, 'Geocoding API');

        const result = json.results?.[0];
        if (!result?.geometry?.location) {
          throw new NotFoundException(`No match found for "${query}".`);
        }

        return this.toResolvedAddress(result, 0, 0);
      },
    );
  }

  async autocomplete(
    input: string,
    sessionToken?: string,
  ): Promise<PlaceSuggestionDto[]> {
    const query = input.trim();

    // Session tokens intentionally stay out of the cache key: two users typing
    // the same prefix should share one cached result.
    return this.cached(
      CACHE_KEYS.GEOCODE_AUTOCOMPLETE(query.toLowerCase()),
      CACHE_TTL.GEOCODE_AUTOCOMPLETE,
      async () => {
        const url = new URL(`${PLACES_BASE}/autocomplete/json`);
        url.searchParams.set('input', query);
        url.searchParams.set('components', `country:${this.region}`);
        url.searchParams.set('key', this.requireKey());
        if (sessionToken) {
          url.searchParams.set('sessiontoken', sessionToken);
        }

        const json = await this.callGoogle<
          GoogleEnvelope & {
            predictions?: Array<{
              place_id: string;
              description: string;
              structured_formatting?: {
                main_text?: string;
                secondary_text?: string;
              };
            }>;
          }
        >(url, 'Places API');

        return (json.predictions ?? []).map((p) => ({
          placeId: p.place_id,
          description: p.description,
          mainText: p.structured_formatting?.main_text ?? p.description,
          secondaryText: p.structured_formatting?.secondary_text ?? '',
        }));
      },
    );
  }

  async placeDetails(
    placeId: string,
    sessionToken?: string,
  ): Promise<ResolvedAddressDto> {
    return this.cached(
      CACHE_KEYS.GEOCODE_PLACE(placeId),
      CACHE_TTL.GEOCODE_PLACE,
      async () => {
        const url = new URL(`${PLACES_BASE}/details/json`);
        url.searchParams.set('place_id', placeId);
        url.searchParams.set(
          'fields',
          'formatted_address,geometry,address_component,place_id',
        );
        url.searchParams.set('key', this.requireKey());
        if (sessionToken) {
          url.searchParams.set('sessiontoken', sessionToken);
        }

        const json = await this.callGoogle<
          GoogleEnvelope & { result?: GeocodeResult }
        >(url, 'Places API');

        const location = json.result?.geometry?.location;
        if (!location) {
          throw new NotFoundException('No details found for that place.');
        }

        return this.toResolvedAddress(json.result!, location.lat, location.lng);
      },
    );
  }
}
