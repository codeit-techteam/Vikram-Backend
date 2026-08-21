/** Geographic helpers — single source of truth for distance and coordinate validity. */

const EARTH_RADIUS_KM = 6371;
/** 1 metre — absorbs floating-point noise on the radius boundary. */
const RADIUS_EPSILON_KM = 0.001;

export function isValidLatitude(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= -90 &&
    value <= 90
  );
}

export function isValidLongitude(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= -180 &&
    value <= 180
  );
}

/**
 * Null, NaN, non-numeric, out-of-range, and Null Island (0,0) are invalid.
 * A lone 0 latitude/longitude is allowed only when the other axis is non-zero.
 */
export function isValidCoordinates(
  latitude: unknown,
  longitude: unknown,
): latitude is number {
  const lat = typeof latitude === 'string' ? Number(latitude) : latitude;
  const lng = typeof longitude === 'string' ? Number(longitude) : longitude;
  if (!isValidLatitude(lat) || !isValidLongitude(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

/** Radius of 0 must never mean "unlimited". Missing/NaN/negative are not routable. */
export function isValidServiceRadiusKm(value: unknown): value is number {
  const radius = typeof value === 'string' ? Number(value) : value;
  return typeof radius === 'number' && Number.isFinite(radius) && radius > 0;
}

export function parseCoordinate(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  if (
    typeof value === 'object' &&
    value &&
    'toNumber' in value &&
    typeof (value as { toNumber?: () => number }).toNumber === 'function'
  ) {
    const n = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Haversine distance in km between two lat/lng points. */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function roundKm(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Inclusive radius check: distance == radius is eligible. */
export function isWithinServiceRadius(
  distanceKm: number,
  radiusKm: number,
): boolean {
  if (!Number.isFinite(distanceKm) || !isValidServiceRadiusKm(radiusKm)) {
    return false;
  }
  return distanceKm <= radiusKm + RADIUS_EPSILON_KM;
}
