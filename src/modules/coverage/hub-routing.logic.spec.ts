import {
  haversineKm,
  isValidCoordinates,
  isValidServiceRadiusKm,
  isWithinServiceRadius,
} from '../../common/geo/geo.util';
import { evaluateHubRouting } from './hub-routing.logic';
import type { HubRoutingCandidateInput } from './coverage.types';

const KALYANI = { lat: 22.975, lng: 88.434 };
const KOLKATA = { lat: 22.5726, lng: 88.3639 };
const HOWRAH = { lat: 22.5958, lng: 88.2636 };

function hub(
  partial: Partial<HubRoutingCandidateInput> &
    Pick<HubRoutingCandidateInput, 'id' | 'code' | 'name'> & {
      latitude: number;
      longitude: number;
      serviceRadiusKm: number;
    },
): HubRoutingCandidateInput {
  return {
    city: 'Kalyani',
    state: 'West Bengal',
    pincode: '741235',
    coveragePincodes: [],
    isActive: true,
    ...partial,
  };
}

function destination(lat: number, lng: number) {
  return { latitude: lat, longitude: lng };
}

describe('geo.util', () => {
  it('rejects null, NaN, 0,0, and out-of-range coordinates', () => {
    expect(isValidCoordinates(null, null)).toBe(false);
    expect(isValidCoordinates(NaN, 88)).toBe(false);
    expect(isValidCoordinates(0, 0)).toBe(false);
    expect(isValidCoordinates(91, 88)).toBe(false);
    expect(isValidCoordinates(22.9, 181)).toBe(false);
    expect(isValidCoordinates('not-a-number', '88')).toBe(false);
    expect(isValidCoordinates('22.9', '88.4')).toBe(true);
  });

  it('accepts valid Indian coordinates', () => {
    expect(isValidCoordinates(KALYANI.lat, KALYANI.lng)).toBe(true);
    expect(isValidCoordinates(KOLKATA.lat, KOLKATA.lng)).toBe(true);
  });

  it('treats radius <= 0 as not routable', () => {
    expect(isValidServiceRadiusKm(0)).toBe(false);
    expect(isValidServiceRadiusKm(-1)).toBe(false);
    expect(isValidServiceRadiusKm(null)).toBe(false);
    expect(isValidServiceRadiusKm(30)).toBe(true);
  });

  it('treats exact radius boundary as eligible', () => {
    expect(isWithinServiceRadius(30, 30)).toBe(true);
    expect(isWithinServiceRadius(30.01, 30)).toBe(false);
  });
});

describe('evaluateHubRouting', () => {
  const kalyani = hub({
    id: 'hub-kalyani',
    code: 'HUB-KAL-001',
    name: 'Kalyani Hub',
    latitude: KALYANI.lat,
    longitude: KALYANI.lng,
    serviceRadiusKm: 30,
    inventory: [{ productId: 'cement', availableQty: 100 }],
  });

  it('TEST 1: assigns Kalyani when customer is inside radius', () => {
    const decision = evaluateHubRouting(destination(KALYANI.lat, KALYANI.lng), [
      kalyani,
    ]);
    expect(decision.assignableHub?.id).toBe('hub-kalyani');
    expect(decision.reason).toBe('ASSIGNED');
    expect(decision.nearestEligibleHub?.inCoverage).toBe(true);
  });

  it('TEST 2: does not assign Kalyani for a Kolkata customer outside radius', () => {
    const decision = evaluateHubRouting(destination(KOLKATA.lat, KOLKATA.lng), [
      kalyani,
    ]);
    expect(decision.assignableHub).toBeNull();
    expect(decision.nearestEligibleHub).toBeNull();
    expect(decision.reason).toBe('NO_SERVICEABLE_HUB');
    expect(decision.nearestHub?.id).toBe('hub-kalyani');
    expect(decision.snapshot.nearestDistanceKm).toBeGreaterThan(30);
  });

  it('TEST 3: only one hub still does not auto-assign outside radius', () => {
    const decision = evaluateHubRouting(destination(KOLKATA.lat, KOLKATA.lng), [
      kalyani,
    ]);
    expect(decision.matches).toHaveLength(1);
    expect(decision.assignableHub).toBeNull();
    expect(decision.reason).toBe('NO_SERVICEABLE_HUB');
  });

  it('TEST 4: customer exactly on radius boundary is eligible', () => {
    const north = {
      lat: KALYANI.lat + 0.1,
      lng: KALYANI.lng,
    };
    const distance = haversineKm(KALYANI.lat, KALYANI.lng, north.lat, north.lng);
    const onBoundary = hub({
      ...kalyani,
      serviceRadiusKm: distance,
    });
    const decision = evaluateHubRouting(destination(north.lat, north.lng), [
      onBoundary,
    ]);
    expect(decision.nearestEligibleHub?.id).toBe('hub-kalyani');
    expect(decision.assignableHub?.id).toBe('hub-kalyani');
  });

  it('TEST 5: customer slightly outside radius is not eligible', () => {
    const north = {
      lat: KALYANI.lat + 0.1,
      lng: KALYANI.lng,
    };
    const distance = haversineKm(KALYANI.lat, KALYANI.lng, north.lat, north.lng);
    const justInside = hub({
      ...kalyani,
      serviceRadiusKm: distance - 0.05,
    });
    const decision = evaluateHubRouting(destination(north.lat, north.lng), [
      justInside,
    ]);
    expect(decision.nearestEligibleHub).toBeNull();
    expect(decision.assignableHub).toBeNull();
    expect(decision.reason).toBe('NO_SERVICEABLE_HUB');
  });

  it('TEST 6: inactive hubs are not in the candidate set', () => {
    const decision = evaluateHubRouting(destination(KALYANI.lat, KALYANI.lng), []);
    expect(decision.assignableHub).toBeNull();
    expect(decision.reason).toBe('HUB_NOT_CONFIGURED');
  });

  it('TEST 7: hub with missing coordinates is not eligible', () => {
    const broken = hub({
      ...kalyani,
      latitude: null,
      longitude: null,
    });
    const decision = evaluateHubRouting(destination(KALYANI.lat, KALYANI.lng), [
      broken,
    ]);
    expect(decision.assignableHub).toBeNull();
    expect(decision.matches).toHaveLength(0);
    expect(decision.reason).toBe('HUB_NOT_CONFIGURED');
  });

  it('TEST 8: missing customer coordinates does not assign a hub', () => {
    const decision = evaluateHubRouting({ latitude: null, longitude: null }, [
      kalyani,
    ]);
    expect(decision.assignableHub).toBeNull();
    expect(decision.reason).toBe('LOCATION_MISSING');
  });

  it('rejects 0,0 customer coordinates', () => {
    const decision = evaluateHubRouting(destination(0, 0), [kalyani]);
    expect(decision.assignableHub).toBeNull();
    expect(decision.reason).toBe('LOCATION_INVALID');
  });

  it('TEST 12: among multiple eligible hubs, nearest is selected', () => {
    const howrah = hub({
      id: 'hub-howrah',
      code: 'HUB-HWH-001',
      name: 'Howrah Hub',
      city: 'Howrah',
      latitude: HOWRAH.lat,
      longitude: HOWRAH.lng,
      serviceRadiusKm: 80,
      inventory: [{ productId: 'cement', availableQty: 100 }],
    });
    const wideKalyani = hub({
      ...kalyani,
      serviceRadiusKm: 80,
    });
    const decision = evaluateHubRouting(destination(KALYANI.lat, KALYANI.lng), [
      howrah,
      wideKalyani,
    ]);
    expect(decision.assignableHub?.id).toBe('hub-kalyani');
  });

  it('TEST 13: nearest hub outside radius loses to a farther hub inside radius', () => {
    const hubA = hub({
      id: 'hub-a',
      code: 'HUB-A',
      name: 'Hub A',
      latitude: KALYANI.lat,
      longitude: KALYANI.lng,
      serviceRadiusKm: 5,
      inventory: [{ productId: 'cement', availableQty: 100 }],
    });
    const hubB = hub({
      id: 'hub-b',
      code: 'HUB-B',
      name: 'Hub B',
      city: 'Howrah',
      latitude: HOWRAH.lat,
      longitude: HOWRAH.lng,
      serviceRadiusKm: 80,
      inventory: [{ productId: 'cement', availableQty: 100 }],
    });
    const justOutsideA = {
      lat: KALYANI.lat + 0.08,
      lng: KALYANI.lng,
    };
    const decision = evaluateHubRouting(
      destination(justOutsideA.lat, justOutsideA.lng),
      [hubA, hubB],
    );
    expect(decision.nearestHub?.id).toBe('hub-a');
    expect(decision.assignableHub?.id).toBe('hub-b');
    expect(decision.nearestEligibleHub?.id).toBe('hub-b');
  });

  it('TEST 14: in-radius hub without stock is not assignable', () => {
    const empty = hub({
      ...kalyani,
      inventory: [{ productId: 'cement', availableQty: 0 }],
    });
    const decision = evaluateHubRouting(
      destination(KALYANI.lat, KALYANI.lng),
      [empty],
      [{ productId: 'cement', quantity: 10 }],
    );
    expect(decision.nearestEligibleHub?.id).toBe('hub-kalyani');
    expect(decision.assignableHub).toBeNull();
    expect(decision.reason).toBe('INVENTORY_UNAVAILABLE');
  });

  it('does not treat a missing radius as unlimited', () => {
    const unlimitedTrap = hub({
      ...kalyani,
      serviceRadiusKm: 0,
    });
    const decision = evaluateHubRouting(destination(KOLKATA.lat, KOLKATA.lng), [
      unlimitedTrap,
    ]);
    expect(decision.assignableHub).toBeNull();
    expect(decision.matches).toHaveLength(0);
  });

  it('falls back to a farther eligible hub when nearest eligible cannot fulfill stock', () => {
    const nearEmpty = hub({
      ...kalyani,
      inventory: [{ productId: 'cement', availableQty: 0 }],
    });
    const farStocked = hub({
      id: 'hub-howrah',
      code: 'HUB-HWH-001',
      name: 'Howrah Hub',
      city: 'Howrah',
      latitude: HOWRAH.lat,
      longitude: HOWRAH.lng,
      serviceRadiusKm: 80,
      inventory: [{ productId: 'cement', availableQty: 50 }],
    });
    const decision = evaluateHubRouting(
      destination(KALYANI.lat, KALYANI.lng),
      [nearEmpty, farStocked],
      [{ productId: 'cement', quantity: 10 }],
    );
    expect(decision.assignableHub?.id).toBe('hub-howrah');
    expect(decision.reason).toBe('ASSIGNED');
  });
});
