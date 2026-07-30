/**
 * Customer-facing delivery copy — never expose hub / warehouse logistics.
 */
export type DeliveryMessageOptions = {
  preorder?: boolean;
  deliveringBy?: string | null;
  serviceable?: boolean;
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

  if (etaMinutes > 0 && etaMinutes <= 30) {
    return `Delivery in ${etaMinutes} mins`;
  }

  if (etaMinutes > 30 && etaMinutes <= 90) {
    return 'Delivery in about 1 hour';
  }

  if (etaMinutes > 90) {
    if (options.deliveringBy) {
      return `Delivery by ${options.deliveringBy}`;
    }
    return 'Delivery Today';
  }

  return 'Fast Delivery Available';
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
  return 'Fast delivery available to your location';
}

const PICKING_MINUTES = 5;
const PACKING_MINUTES = 5;
const LOADING_MINUTES = 5;
const AVG_VEHICLE_SPEED_KMH = 25;
const TRAFFIC_MULTIPLIER = 1.25;
const TRAFFIC_BUFFER_MINUTES = 3;

export function computeDeliveryEtaMinutes(distanceKm: number): number {
  const travelMinutes = Math.max(
    1,
    Math.ceil((distanceKm / AVG_VEHICLE_SPEED_KMH) * 60 * TRAFFIC_MULTIPLIER),
  );
  return (
    PICKING_MINUTES +
    PACKING_MINUTES +
    LOADING_MINUTES +
    travelMinutes +
    TRAFFIC_BUFFER_MINUTES
  );
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
