import {
  formatDistanceSlab,
  resolveDeliveryVehicleForQuantity,
} from './delivery-pricing.constants';

describe('delivery-pricing.constants', () => {
  it('resolves vehicle by quantity bands', () => {
    expect(resolveDeliveryVehicleForQuantity(1)).toBe('BIKE');
    expect(resolveDeliveryVehicleForQuantity(10)).toBe('BIKE');
    expect(resolveDeliveryVehicleForQuantity(11)).toBe('E_LOADER');
    expect(resolveDeliveryVehicleForQuantity(40)).toBe('THREE_WHEELER_LOADER');
    expect(resolveDeliveryVehicleForQuantity(100)).toBe('PICK_UP_VAN');
    expect(resolveDeliveryVehicleForQuantity(200)).toBe('FULL_TRUCK');
  });

  it('formats distance slabs', () => {
    expect(formatDistanceSlab(0, 3)).toBe('0–3 km');
  });
});

/** Tightest-fit slab selection (mirrors DeliveryPricingService.resolveListPrice). */
function pickTightestSlab(
  distanceKm: number,
  slabs: Array<{ from: number; to: number; price: number }>,
) {
  const sorted = [...slabs].sort((a, b) => a.to - b.to);
  return sorted.find((s) => distanceKm >= s.from && distanceKm <= s.to) ?? null;
}

describe('distance slab selection (Excel semantics)', () => {
  const eLoader = [
    { from: 0, to: 3, price: 250 },
    { from: 0, to: 4, price: 350 },
    { from: 0, to: 5, price: 450 },
  ];

  it('Bike 2 km → ₹100 band', () => {
    const bike = [{ from: 0, to: 3, price: 100 }];
    expect(pickTightestSlab(2, bike)?.price).toBe(100);
  });

  it('E-Loader 2 km → ₹250', () => {
    expect(pickTightestSlab(2, eLoader)?.price).toBe(250);
  });

  it('E-Loader 4 km → ₹350', () => {
    expect(pickTightestSlab(4, eLoader)?.price).toBe(350);
  });

  it('E-Loader 5 km → ₹450', () => {
    expect(pickTightestSlab(5, eLoader)?.price).toBe(450);
  });

  it('E-Loader 5.1 km → unavailable', () => {
    expect(pickTightestSlab(5.1, eLoader)).toBeNull();
  });

  it('Full Truck 5 km → ₹1700', () => {
    const truck = [
      { from: 0, to: 3, price: 1500 },
      { from: 0, to: 4, price: 1600 },
      { from: 0, to: 5, price: 1700 },
    ];
    expect(pickTightestSlab(5, truck)?.price).toBe(1700);
  });
});
