import type { DriverAvailability } from '../../../generated/prisma/client';

export type OperationalDriverStatus =
  | 'AVAILABLE'
  | 'ASSIGNED'
  | 'ON_TRIP'
  | 'ON_LEAVE'
  | 'INACTIVE'
  | 'SUSPENDED'
  | 'BLOCKED';

export function isLicenseExpired(licenseExpiry?: Date | string | null): boolean {
  if (!licenseExpiry) return false;
  const expiry = new Date(licenseExpiry);
  if (Number.isNaN(expiry.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  return expiry < today;
}

/**
 * Single source of truth for driver operational status.
 * Manual overrides (inactive / leave / suspended) win; otherwise derive from
 * license + active order/dispatch state.
 */
export function deriveDriverOperationalStatus(input: {
  isActive: boolean;
  onLeave?: boolean | null;
  availability?: DriverAvailability | string | null;
  licenseExpiry?: Date | string | null;
  hasActiveTrip?: boolean;
  hasAssignedOrder?: boolean;
}): OperationalDriverStatus {
  if (!input.isActive || input.availability === 'INACTIVE') {
    return 'INACTIVE';
  }
  if (input.availability === 'SUSPENDED') {
    return 'SUSPENDED';
  }
  if (input.onLeave || input.availability === 'ON_LEAVE' || input.availability === 'OFF_DUTY') {
    return 'ON_LEAVE';
  }
  if (isLicenseExpired(input.licenseExpiry) || input.availability === 'BLOCKED') {
    return 'BLOCKED';
  }
  if (input.hasActiveTrip || input.availability === 'ON_DELIVERY') {
    return 'ON_TRIP';
  }
  if (input.hasAssignedOrder || input.availability === 'ASSIGNED') {
    return 'ASSIGNED';
  }
  return 'AVAILABLE';
}

export function isDriverAssignable(status: OperationalDriverStatus): boolean {
  return status === 'AVAILABLE' || status === 'ASSIGNED';
}

export function mapOperationalToStoredAvailability(
  status: OperationalDriverStatus,
): DriverAvailability {
  switch (status) {
    case 'ON_TRIP':
      return 'ON_DELIVERY';
    case 'ASSIGNED':
      return 'ASSIGNED';
    case 'ON_LEAVE':
      return 'ON_LEAVE';
    case 'INACTIVE':
      return 'INACTIVE';
    case 'SUSPENDED':
      return 'SUSPENDED';
    case 'BLOCKED':
      return 'BLOCKED';
    default:
      return 'AVAILABLE';
  }
}
