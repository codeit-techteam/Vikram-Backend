/**
 * Customer-facing delivery copy — never expose hub / warehouse logistics.
 */
export type DeliveryMessageOptions = {
  preorder?: boolean;
  deliveringBy?: string | null;
  serviceable?: boolean;
  etaMinMinutes?: number;
  etaMaxMinutes?: number;
};

export function buildDeliveryMessage(
  etaMinutes: number,
  options: DeliveryMessageOptions = {},
): string {
  if (options.preorder) {
    return 'Available Tomorrow';
  }

  if (!options.serviceable && etaMinutes <= 0) {
    return 'Delivery unavailable at this location';
  }

  if (
    options.etaMinMinutes != null &&
    options.etaMaxMinutes != null &&
    options.etaMinMinutes > 0
  ) {
    const min = options.etaMinMinutes;
    const max = options.etaMaxMinutes;
    if (max < 60) {
      return min === max
        ? `Estimated delivery ~${min} mins`
        : `Estimated delivery ${min}–${max} mins`;
    }
    const minH = Math.round((min / 60) * 10) / 10;
    const maxH = Math.round((max / 60) * 10) / 10;
    return minH === maxH
      ? `Estimated delivery ~${minH} hrs`
      : `Estimated delivery ${minH}–${maxH} hrs`;
  }

  if (etaMinutes > 0) {
    return `Estimated delivery ~${etaMinutes} mins`;
  }
  if (!options.serviceable) {
    return 'Delivery unavailable at this location';
  }
  return 'Select delivery location to calculate ETA';
}

export function buildDeliverySubtitle(
  serviceable: boolean,
  options: { freeDelivery?: boolean } = {},
): string {
  if (!serviceable) {
    return 'We are expanding to your area soon';
  }
  if (options.freeDelivery) {
    return 'Free delivery available to your location';
  }
  return 'Delivery available to your location';
}

/**
 * @deprecated Distance-only ETA is not product-aware.
 * Use DeliveryEtaEngineService / DeliveryService.calculateEta instead.
 */
export function computeDeliveryEtaMinutes(distanceKm: number): number {
  const travelMinutes = Math.max(
    1,
    Math.ceil((distanceKm / 25) * 60 * 1.25),
  );
  return 25 + travelMinutes;
}

/** Customer-safe order status labels (no hub / warehouse terminology). */
export const CUSTOMER_ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Order Confirmed',
  CONFIRMED: 'Order Confirmed',
  HUB_ASSIGNED: 'Preparing Order',
  AWAITING_HUB_ALLOCATION: 'Preparing Order',
  ACCEPTED_BY_HUB: 'Preparing Order',
  PROCESSING: 'Preparing Order',
  PICKING: 'Preparing Order',
  PACKED: 'Packed',
  READY_FOR_DISPATCH: 'Packed',
  DRIVER_ASSIGNED: 'Out for Delivery',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DISPATCHED: 'Out for Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export function getCustomerOrderStatusLabel(status: string): string {
  const key = String(status).toUpperCase();
  return CUSTOMER_ORDER_STATUS_LABELS[key] ?? 'Order Confirmed';
}

/** Strip internal hub references from timeline copy shown to customers. */
export function sanitizeCustomerTimelineMessage(
  status: string,
  message?: string | null,
): string {
  const label = getCustomerOrderStatusLabel(status);
  const raw = (message ?? '').trim();
  if (!raw) return label;

  const lower = raw.toLowerCase();
  if (
    lower.includes('hub') ||
    lower.includes('warehouse') ||
    lower.includes('allocation') ||
    lower.includes('transfer')
  ) {
    return label;
  }

  return raw;
}
