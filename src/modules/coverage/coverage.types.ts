export type CoverageLocationInput = {
  latitude?: number | null;
  longitude?: number | null;
  pincode?: string | null;
};

export type CoverageStockItem = {
  productId: string;
  quantity: number;
};

export type HubAssignmentReason =
  | 'ASSIGNED'
  | 'NO_SERVICEABLE_HUB'
  | 'LOCATION_MISSING'
  | 'LOCATION_INVALID'
  | 'INVENTORY_UNAVAILABLE'
  | 'HUB_NOT_CONFIGURED'
  | 'HUB_INACTIVE';

export type CoverageHubMatch = {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string;
  pincode: string;
  latitude: number;
  longitude: number;
  serviceRadiusKm: number;
  coveragePincodes: string[];
  distanceKm: number;
  inCoverage: boolean;
  /** Stock can cover the cart (independent of radius). */
  stockOk: boolean;
  /** Assignable: inCoverage AND (no items OR stockOk). */
  canFulfill: boolean;
  routable: boolean;
  ineligibilityReason: string | null;
  workingHours?: string | null;
  hubType?: string | null;
};

export type HubRoutingCandidateInput = {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string;
  pincode: string;
  latitude: unknown;
  longitude: unknown;
  serviceRadiusKm: unknown;
  coveragePincodes?: string[] | null;
  workingHours?: string | null;
  hubType?: string | null;
  isActive?: boolean;
  inventory?: Array<{ productId: string; availableQty: number }>;
};

export type HubRoutingSnapshot = {
  customerLatitude: number | null;
  customerLongitude: number | null;
  selectedHubId: string | null;
  selectedHubName: string | null;
  selectedHubCode: string | null;
  distanceKm: number | null;
  hubRadiusKm: number | null;
  inCoverage: boolean;
  canFulfill: boolean;
  nearestHubId: string | null;
  nearestHubName: string | null;
  nearestHubCode: string | null;
  nearestDistanceKm: number | null;
  nearestHubRadiusKm: number | null;
  reason: HubAssignmentReason;
  evaluatedAt: string;
};

export type HubRoutingDecision = {
  assignableHub: CoverageHubMatch | null;
  nearestEligibleHub: CoverageHubMatch | null;
  nearestHub: CoverageHubMatch | null;
  matches: CoverageHubMatch[];
  reason: HubAssignmentReason;
  customerLatitude: number | null;
  customerLongitude: number | null;
  snapshot: HubRoutingSnapshot;
};
