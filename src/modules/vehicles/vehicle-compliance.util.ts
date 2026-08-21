import type { Vehicle, VehicleStatus } from '../../../generated/prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;
export const COMPLIANCE_SOON_DAYS = 30;

export type ComplianceFlag = 'valid' | 'expiring_soon' | 'expired' | 'missing';

export interface DocumentCompliance {
  insurance: ComplianceFlag;
  fitness: ComplianceFlag;
  puc: ComplianceFlag;
  permit: ComplianceFlag;
  roadTax: ComplianceFlag;
}

export interface ComplianceResult {
  isCompliant: boolean;
  blockReasons: string[];
  flags: DocumentCompliance;
}

function flagForExpiry(
  expiry: Date | string | null | undefined,
): ComplianceFlag {
  if (!expiry) return 'missing';
  const date = expiry instanceof Date ? expiry : new Date(expiry);
  if (Number.isNaN(date.getTime())) return 'missing';
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  if (date.getTime() < startOfToday.getTime()) return 'expired';
  const soon = startOfToday.getTime() + COMPLIANCE_SOON_DAYS * DAY_MS;
  if (date.getTime() <= soon) return 'expiring_soon';
  return 'valid';
}

export function evaluateVehicleCompliance(
  vehicle: Pick<
    Vehicle,
    | 'insuranceExpiry'
    | 'fitnessExpiry'
    | 'pucExpiry'
    | 'permitExpiry'
    | 'permitNumber'
    | 'roadTaxExpiry'
  >,
): ComplianceResult {
  const flags: DocumentCompliance = {
    insurance: flagForExpiry(vehicle.insuranceExpiry),
    fitness: flagForExpiry(vehicle.fitnessExpiry),
    puc: flagForExpiry(vehicle.pucExpiry),
    permit:
      vehicle.permitNumber || vehicle.permitExpiry
        ? flagForExpiry(vehicle.permitExpiry)
        : 'missing',
    roadTax: flagForExpiry(vehicle.roadTaxExpiry),
  };

  const blockReasons: string[] = [];
  if (flags.insurance === 'expired') {
    blockReasons.push(
      'Vehicle cannot be dispatched because insurance has expired.',
    );
  }
  if (flags.fitness === 'expired') {
    blockReasons.push(
      'Vehicle cannot be dispatched because fitness certificate has expired.',
    );
  }
  // Require insurance + fitness only when at least one compliance field is populated
  // (avoids blocking legacy Vehicle Master rows that pre-date compliance columns).
  const hasAnyComplianceData = Boolean(
    vehicle.insuranceExpiry ||
    vehicle.fitnessExpiry ||
    vehicle.pucExpiry ||
    vehicle.permitExpiry ||
    vehicle.permitNumber,
  );
  if (hasAnyComplianceData) {
    if (flags.insurance === 'missing') {
      blockReasons.push(
        'Vehicle cannot be dispatched because insurance expiry is missing.',
      );
    }
    if (flags.fitness === 'missing') {
      blockReasons.push(
        'Vehicle cannot be dispatched because fitness certificate expiry is missing.',
      );
    }
  }
  // PUC / permit: only block when present and expired (conditional)
  if (flags.puc === 'expired') {
    blockReasons.push('Vehicle cannot be dispatched because PUC has expired.');
  }
  if (vehicle.permitNumber && flags.permit === 'expired') {
    blockReasons.push(
      'Vehicle cannot be dispatched because permit has expired.',
    );
  }

  return {
    isCompliant: blockReasons.length === 0,
    blockReasons,
    flags,
  };
}

export const BUSY_VEHICLE_STATUSES: VehicleStatus[] = [
  'ASSIGNED',
  'LOADING',
  'OUT_FOR_DELIVERY',
  'REACHED',
  'RETURNING',
];

export const RUNNING_VEHICLE_STATUSES: VehicleStatus[] = [
  'ASSIGNED',
  'LOADING',
  'OUT_FOR_DELIVERY',
  'REACHED',
  'RETURNING',
];

export function deriveAvailabilityStatus(
  status: VehicleStatus,
): 'AVAILABLE' | 'BUSY' | 'UNAVAILABLE' {
  if (status === 'AVAILABLE') return 'AVAILABLE';
  if (BUSY_VEHICLE_STATUSES.includes(status)) return 'BUSY';
  return 'UNAVAILABLE';
}

/** Normalize Indian registration: uppercase, collapse spaces/hyphens consistently. */
export function normalizeVehicleRegistration(input: string): string {
  const cleaned = input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  // Prefer XX-00-XX-0000 / XX-00-X-0000 style when pattern matches
  const m = cleaned.match(/^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{1,4})$/);
  if (m) {
    return `${m[1]}-${m[2]}-${m[3]}-${m[4]}`;
  }
  return cleaned;
}

export function isPlausibleIndianRegistration(registration: string): boolean {
  const normalized = normalizeVehicleRegistration(registration);
  // Allow flexible Indian formats; do not over-reject
  return (
    /^[A-Z]{2}-?\d{1,2}-?[A-Z]{0,3}-?\d{1,4}$/.test(
      normalized.replace(/-/g, '').length >= 6
        ? normalized
        : registration.trim().toUpperCase(),
    ) || /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$/.test(normalized.replace(/-/g, ''))
  );
}
