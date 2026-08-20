import {
  haversineKm,
  isValidCoordinates,
  isValidServiceRadiusKm,
  isWithinServiceRadius,
  parseCoordinate,
  roundKm,
} from '../../common/geo/geo.util';
import type {
  CoverageHubMatch,
  CoverageStockItem,
  HubAssignmentReason,
  HubRoutingCandidateInput,
  HubRoutingDecision,
  HubRoutingSnapshot,
} from './coverage.types';

export const HUB_ASSIGNMENT_REASON_LABELS: Record<HubAssignmentReason, string> = {
  ASSIGNED: 'Assigned',
  NO_SERVICEABLE_HUB: 'Delivery location is outside the service area',
  LOCATION_MISSING: 'Delivery location required',
  LOCATION_INVALID: 'Delivery location required',
  INVENTORY_UNAVAILABLE: 'Items unavailable at hubs serving this location',
  HUB_NOT_CONFIGURED: 'No hub is configured for routing',
  HUB_INACTIVE: 'No active hub available',
};

function compareMatches(a: CoverageHubMatch, b: CoverageHubMatch): number {
  if (a.inCoverage !== b.inCoverage) return a.inCoverage ? -1 : 1;
  if (a.canFulfill !== b.canFulfill) return a.canFulfill ? -1 : 1;
  if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
  const codeCmp = a.code.localeCompare(b.code);
  if (codeCmp !== 0) return codeCmp;
  return a.id.localeCompare(b.id);
}

function stockCoversItems(
  inventory: Array<{ productId: string; availableQty: number }> | undefined,
  items: CoverageStockItem[],
): boolean {
  if (items.length === 0) return true;
  const rows = inventory ?? [];
  return items.every((item) => {
    const inv = rows.find((row) => row.productId === item.productId);
    return (inv?.availableQty ?? 0) >= item.quantity;
  });
}

export function evaluateHubRouting(
  location: { latitude?: number | null; longitude?: number | null },
  hubs: HubRoutingCandidateInput[],
  items: CoverageStockItem[] = [],
): HubRoutingDecision {
  const rawLat = parseCoordinate(location.latitude);
  const rawLng = parseCoordinate(location.longitude);
  const hasAnyCoord = rawLat != null || rawLng != null;
  const locationValid = isValidCoordinates(rawLat, rawLng);
  const customerLatitude = locationValid ? rawLat : null;
  const customerLongitude = locationValid ? rawLng : null;

  const evaluated: CoverageHubMatch[] = [];

  for (const hub of hubs) {
    const hubLat = parseCoordinate(hub.latitude);
    const hubLng = parseCoordinate(hub.longitude);
    const radiusKm = parseCoordinate(hub.serviceRadiusKm);
    const routable =
      isValidCoordinates(hubLat, hubLng) && isValidServiceRadiusKm(radiusKm);

    let ineligibilityReason: string | null = null;
    if (!isValidCoordinates(hubLat, hubLng)) {
      ineligibilityReason = 'HUB_LOCATION_INCOMPLETE';
    } else if (!isValidServiceRadiusKm(radiusKm)) {
      ineligibilityReason = 'HUB_RADIUS_INVALID';
    }

    let distanceKm = Number.POSITIVE_INFINITY;
    if (
      locationValid &&
      routable &&
      customerLatitude != null &&
      customerLongitude != null &&
      hubLat != null &&
      hubLng != null
    ) {
      distanceKm = roundKm(
        haversineKm(customerLatitude, customerLongitude, hubLat, hubLng),
      );
    }

    const inCoverage =
      locationValid &&
      routable &&
      isWithinServiceRadius(distanceKm, radiusKm as number);
    const stockOk = stockCoversItems(hub.inventory, items);
    const canFulfill = inCoverage && stockOk;

    evaluated.push({
      id: hub.id,
      code: hub.code,
      name: hub.name,
      city: hub.city,
      state: hub.state,
      pincode: hub.pincode,
      latitude: hubLat ?? Number.NaN,
      longitude: hubLng ?? Number.NaN,
      serviceRadiusKm: radiusKm ?? 0,
      coveragePincodes: hub.coveragePincodes ?? [],
      distanceKm,
      inCoverage,
      stockOk,
      canFulfill,
      routable,
      ineligibilityReason,
      workingHours: hub.workingHours ?? null,
      hubType: hub.hubType ?? null,
    });
  }

  const routableMatches = evaluated
    .filter((hub) => hub.routable)
    .sort(compareMatches);

  const nearestHub = [...routableMatches].sort((a, b) => {
    if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
    return a.code.localeCompare(b.code) || a.id.localeCompare(b.id);
  })[0] ?? null;

  const nearestEligibleHub = routableMatches.find((hub) => hub.inCoverage) ?? null;
  const assignableHub =
    routableMatches.find((hub) => hub.inCoverage && hub.canFulfill) ?? null;

  let reason: HubAssignmentReason;
  if (assignableHub) {
    reason = 'ASSIGNED';
  } else if (!hasAnyCoord) {
    reason = 'LOCATION_MISSING';
  } else if (!locationValid) {
    reason = 'LOCATION_INVALID';
  } else if (evaluated.length === 0) {
    reason = 'HUB_NOT_CONFIGURED';
  } else if (routableMatches.length === 0) {
    reason = 'HUB_NOT_CONFIGURED';
  } else if (!nearestEligibleHub) {
    reason = 'NO_SERVICEABLE_HUB';
  } else {
    reason = 'INVENTORY_UNAVAILABLE';
  }

  const snapshot: HubRoutingSnapshot = {
    customerLatitude,
    customerLongitude,
    selectedHubId: assignableHub?.id ?? null,
    selectedHubName: assignableHub?.name ?? null,
    selectedHubCode: assignableHub?.code ?? null,
    distanceKm: assignableHub
      ? assignableHub.distanceKm
      : nearestEligibleHub
        ? nearestEligibleHub.distanceKm
        : nearestHub && Number.isFinite(nearestHub.distanceKm)
          ? nearestHub.distanceKm
          : null,
    hubRadiusKm:
      assignableHub?.serviceRadiusKm ??
      nearestEligibleHub?.serviceRadiusKm ??
      nearestHub?.serviceRadiusKm ??
      null,
    inCoverage: Boolean(nearestEligibleHub),
    canFulfill: Boolean(assignableHub),
    nearestHubId: nearestHub?.id ?? null,
    nearestHubName: nearestHub?.name ?? null,
    nearestHubCode: nearestHub?.code ?? null,
    nearestDistanceKm:
      nearestHub && Number.isFinite(nearestHub.distanceKm)
        ? nearestHub.distanceKm
        : null,
    nearestHubRadiusKm: nearestHub?.serviceRadiusKm ?? null,
    reason,
    evaluatedAt: new Date().toISOString(),
  };

  return {
    assignableHub,
    nearestEligibleHub,
    nearestHub,
    matches: routableMatches,
    reason,
    customerLatitude,
    customerLongitude,
    snapshot,
  };
}

/** Nearest hub inside its own service radius (prefers stock-capable). Never returns an out-of-radius hub. */
export function selectNearestEligibleHub(
  decision: HubRoutingDecision,
): CoverageHubMatch | null {
  return decision.assignableHub ?? decision.nearestEligibleHub;
}

export function mapAdminRoutingView(input: {
  hubId?: string | null;
  hubAssignmentReason?: string | null;
  hubRoutingSnapshot?: unknown;
}): {
  assignmentStatus: 'ASSIGNED' | 'UNASSIGNED';
  assignmentReason: string | null;
  assignmentReasonLabel: string | null;
  snapshot: HubRoutingSnapshot | null;
} {
  const snapshot =
    input.hubRoutingSnapshot && typeof input.hubRoutingSnapshot === 'object'
      ? (input.hubRoutingSnapshot as HubRoutingSnapshot)
      : null;
  const reason = (input.hubAssignmentReason ?? snapshot?.reason ?? null) as
    | HubAssignmentReason
    | null;
  return {
    assignmentStatus: input.hubId ? 'ASSIGNED' : 'UNASSIGNED',
    assignmentReason: reason,
    assignmentReasonLabel: reason
      ? (HUB_ASSIGNMENT_REASON_LABELS[reason] ?? reason)
      : input.hubId
        ? HUB_ASSIGNMENT_REASON_LABELS.ASSIGNED
        : null,
    snapshot,
  };
}
