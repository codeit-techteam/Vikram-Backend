import { DeliveryVehicleType } from '../delivery-pricing.constants';
import {
  inferLogisticsTypeFromCategory,
  resolveProductVehicleRestrictions,
  resolveVolumePerUnitCft,
  resolveWeightPerUnitKg,
} from './delivery-material-profile.logic';

describe('inferLogisticsTypeFromCategory', () => {
  it('classifies stone-chips / 20mm aggregate as AGGREGATE', () => {
    expect(
      inferLogisticsTypeFromCategory(
        'stone-chips',
        '20mm Stone Aggregate',
        'MT',
      ),
    ).toBe('AGGREGATE');
    expect(
      inferLogisticsTypeFromCategory('blue-metal', '40mm Crushed Stone', 'MT'),
    ).toBe('AGGREGATE');
  });

  it('classifies RMC even from name', () => {
    expect(inferLogisticsTypeFromCategory('rmc', 'RMC M25', 'CUM')).toBe('RMC');
  });

  it('splits packaged categories instead of lumping them as LIGHT_MATERIAL', () => {
    expect(
      inferLogisticsTypeFromCategory('waterproofing', 'Dr Fixit 101 LW+', 'Litre'),
    ).toBe('WATERPROOFING');
    expect(
      inferLogisticsTypeFromCategory('adhesives', 'Tile Adhesive', 'Bag'),
    ).toBe('ADHESIVE');
    expect(inferLogisticsTypeFromCategory('putty', 'Wall Putty', 'Bag')).toBe(
      'WALL_PUTTY',
    );
  });
});

describe('resolveWeightPerUnitKg', () => {
  it('converts 1 MT to 1000 kg even when stored weight is a CFT density leftover', () => {
    const resolved = resolveWeightPerUnitKg({
      weightPerUnitKg: 40,
      volumePerUnitCft: null,
      unit: 'MT',
      logisticsType: 'AGGREGATE',
      name: '20mm Stone Aggregate',
    });
    expect(resolved.kg).toBe(1000);
    expect(resolved.source).toBe('unit');
  });
});

describe('resolveProductVehicleRestrictions', () => {
  it('forbids Bike for aggregate when product config is unset', () => {
    const result = resolveProductVehicleRestrictions({
      logisticsType: 'AGGREGATE',
      allowedVehicleTypes: null,
      preferredVehicleType: null,
    });
    expect(result.allowedVehicleTypes).not.toContain(DeliveryVehicleType.BIKE);
    expect(result.allowedVehicleTypes).toContain(DeliveryVehicleType.PICK_UP_VAN);
  });

  it('forces RMC mixer', () => {
    const result = resolveProductVehicleRestrictions({
      logisticsType: 'RMC',
      allowedVehicleTypes: [DeliveryVehicleType.BIKE],
      preferredVehicleType: DeliveryVehicleType.BIKE,
    });
    expect(result.allowedVehicleTypes).toEqual([
      DeliveryVehicleType.RMC_TRANSIT_MIXER,
    ]);
  });
});

describe('resolveVolumePerUnitCft', () => {
  it('does not treat a 1 CFT seed as the volume of 1 MT aggregate', () => {
    const volume = resolveVolumePerUnitCft({
      volumePerUnitCft: 1,
      unit: 'MT',
      logisticsType: 'AGGREGATE',
    });
    expect(volume).toBeGreaterThan(20);
  });
});
