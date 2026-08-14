import { DeliveryVehicleType } from '../delivery-pricing.constants';
import { calculateOrderLoadPure } from './delivery-load.logic';
import type { ProductLogisticsSnapshot } from './delivery-load.types';

describe('calculateOrderLoadPure', () => {
  const cement: ProductLogisticsSnapshot = {
    productId: 'p-cement',
    name: 'Cement',
    unit: 'Bag',
    categoryId: 'cat-cement',
    categorySlug: 'cement',
    weightPerUnitKg: 50,
    volumePerUnitCft: null,
    loadType: 'WEIGHT',
    logisticsType: 'CEMENT',
    isTransportable: true,
    allowDecimalQuantity: false,
    preferredVehicleType: null,
    allowedVehicleTypes: null,
  };

  const sand: ProductLogisticsSnapshot = {
    productId: 'p-sand',
    name: 'Sand',
    unit: 'CFT',
    categoryId: 'cat-sand',
    categorySlug: 'sand',
    weightPerUnitKg: null,
    volumePerUnitCft: 1,
    loadType: 'VOLUME',
    logisticsType: 'SAND',
    isTransportable: true,
    allowDecimalQuantity: true,
    preferredVehicleType: null,
    allowedVehicleTypes: null,
  };

  const bricks: ProductLogisticsSnapshot = {
    productId: 'p-bricks',
    name: 'Bricks',
    unit: 'Pieces',
    categoryId: 'cat-bricks',
    categorySlug: 'bricks',
    weightPerUnitKg: 2.5,
    volumePerUnitCft: null,
    loadType: 'WEIGHT',
    logisticsType: 'BRICKS',
    isTransportable: true,
    allowDecimalQuantity: false,
    preferredVehicleType: null,
    allowedVehicleTypes: [
      DeliveryVehicleType.PICK_UP_VAN,
      DeliveryVehicleType.FULL_TRUCK,
    ],
  };

  it('rejects zero quantity', () => {
    expect(() =>
      calculateOrderLoadPure([cement], [
        { productId: 'p-cement', quantity: 0 },
      ]),
    ).toThrow(/greater than zero/i);
  });

  it('rejects negative quantity', () => {
    expect(() =>
      calculateOrderLoadPure([cement], [
        { productId: 'p-cement', quantity: -5 },
      ]),
    ).toThrow(/greater than zero/i);
  });

  it('rejects decimal quantity when not allowed', () => {
    expect(() =>
      calculateOrderLoadPure([cement], [
        { productId: 'p-cement', quantity: 2.5 },
      ]),
    ).toThrow(/decimal/i);
  });

  it('allows decimal CFT for sand', () => {
    const load = calculateOrderLoadPure([sand], [
      { productId: 'p-sand', quantity: 10.5 },
    ]);
    expect(load.ok).toBe(true);
    expect(load.totalVolumeCft).toBe(10.5);
  });

  it('calculates cement weight from bags', () => {
    const load = calculateOrderLoadPure([cement], [
      { productId: 'p-cement', quantity: 50 },
    ]);
    expect(load.totalWeightKg).toBe(2500);
    expect(load.totalVolumeCft).toBe(0);
  });

  it('normalizes mixed units into weight + volume (not raw sum)', () => {
    const load = calculateOrderLoadPure([cement, sand, bricks], [
      { productId: 'p-cement', quantity: 20 },
      { productId: 'p-bricks', quantity: 1000 },
      { productId: 'p-sand', quantity: 20 },
    ]);
    expect(load.ok).toBe(true);
    expect(load.totalWeightKg).toBe(20 * 50 + 1000 * 2.5 + 20 * 45);
    expect(load.totalVolumeCft).toBe(20);
    expect(load.totalQuantity).toBe(1040);
    expect(load.allowedVehicleTypes).toEqual([
      DeliveryVehicleType.PICK_UP_VAN,
      DeliveryVehicleType.FULL_TRUCK,
    ]);
  });

  it('flags products missing logistics data', () => {
    const noLogistics: ProductLogisticsSnapshot = {
      ...cement,
      productId: 'p-x',
      name: 'Unknown SKU',
      categorySlug: 'misc',
      logisticsType: null,
      weightPerUnitKg: null,
      volumePerUnitCft: null,
    };
    const load = calculateOrderLoadPure([noLogistics], [
      { productId: 'p-x', quantity: 5 },
    ]);
    expect(load.missingLogisticsProductIds).toContain('p-x');
    expect(load.hasWeightDimension).toBe(false);
    expect(load.hasVolumeDimension).toBe(false);
  });
});
