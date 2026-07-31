import type { OrderStatus } from '../../../generated/prisma/client';

/**
 * Canonical order lifecycle (single source of truth).
 *
 * OrderPlaced → Confirmed → HubAssigned → AcceptedByHub → Picking →
 * Packed → DriverAssigned → OutForDelivery → Delivered | Cancelled
 */
export const ORDER_LIFECYCLE: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'HUB_ASSIGNED',
  'ACCEPTED_BY_HUB',
  'PICKING',
  'PACKED',
  'DRIVER_ASSIGNED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

/** Human-readable labels — identical across Customer, Hub, Admin. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Order Placed',
  CONFIRMED: 'Confirmed',
  HUB_ASSIGNED: 'Hub Assigned',
  AWAITING_HUB_ALLOCATION: 'Awaiting Hub Allocation',
  ACCEPTED_BY_HUB: 'Accepted by Hub',
  PICKING: 'Picking',
  PROCESSING: 'Accepted by Hub',
  PACKED: 'Packed',
  READY_FOR_DISPATCH: 'Packed',
  DRIVER_ASSIGNED: 'Driver Assigned',
  OUT_FOR_DELIVERY: 'Out For Delivery',
  DISPATCHED: 'Out For Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

/** Normalize legacy statuses to the canonical lifecycle values. */
export function normalizeOrderStatus(status: OrderStatus | string): OrderStatus {
  const value = String(status).toUpperCase();
  switch (value) {
    case 'PROCESSING':
      return 'ACCEPTED_BY_HUB';
    case 'READY_FOR_DISPATCH':
      return 'PACKED';
    case 'DISPATCHED':
      return 'OUT_FOR_DELIVERY';
    case 'AWAITING_HUB_ALLOCATION':
      return 'HUB_ASSIGNED';
    default:
      return value as OrderStatus;
  }
}

export function getOrderStatusLabel(status: OrderStatus | string): string {
  const key = String(status).toUpperCase() as OrderStatus;
  return ORDER_STATUS_LABELS[key] ?? String(status);
}

/** Admin / dashboard status buckets */
export const ORDER_STATUS_BUCKETS = {
  pending: [
    'PENDING',
    'CONFIRMED',
    'HUB_ASSIGNED',
    'AWAITING_HUB_ALLOCATION',
  ] as OrderStatus[],
  accepted: [
    'ACCEPTED_BY_HUB',
    'PROCESSING',
    'PICKING',
    'PACKED',
    'READY_FOR_DISPATCH',
    'DRIVER_ASSIGNED',
    'OUT_FOR_DELIVERY',
    'DISPATCHED',
  ] as OrderStatus[],
  completed: ['DELIVERED', 'CANCELLED'] as OrderStatus[],
  delivered: ['DELIVERED'] as OrderStatus[],
  cancelled: ['CANCELLED'] as OrderStatus[],
  dispatch: [
    'DRIVER_ASSIGNED',
    'OUT_FOR_DELIVERY',
    'DISPATCHED',
  ] as OrderStatus[],
};

export const CANCELLABLE_STATUSES: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'HUB_ASSIGNED',
  'AWAITING_HUB_ALLOCATION',
];

export const NON_CANCELLABLE_STATUSES: OrderStatus[] = [
  'ACCEPTED_BY_HUB',
  'PICKING',
  'PROCESSING',
  'PACKED',
  'READY_FOR_DISPATCH',
  'DRIVER_ASSIGNED',
  'OUT_FOR_DELIVERY',
  'DISPATCHED',
  'DELIVERED',
  'CANCELLED',
];

/** Allowed next statuses from a given status (canonical + legacy sources). */
export const ORDER_STATUS_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  PENDING: ['CONFIRMED', 'HUB_ASSIGNED', 'CANCELLED'],
  CONFIRMED: ['HUB_ASSIGNED', 'ACCEPTED_BY_HUB', 'CANCELLED'],
  HUB_ASSIGNED: ['ACCEPTED_BY_HUB', 'CANCELLED'],
  AWAITING_HUB_ALLOCATION: ['HUB_ASSIGNED', 'ACCEPTED_BY_HUB', 'CANCELLED'],
  ACCEPTED_BY_HUB: ['PICKING', 'PACKED', 'CANCELLED'],
  PROCESSING: ['PICKING', 'PACKED', 'CANCELLED'],
  PICKING: ['PACKED', 'CANCELLED'],
  PACKED: ['DRIVER_ASSIGNED', 'OUT_FOR_DELIVERY', 'CANCELLED'],
  READY_FOR_DISPATCH: ['DRIVER_ASSIGNED', 'OUT_FOR_DELIVERY', 'CANCELLED'],
  DRIVER_ASSIGNED: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

/** API alias → canonical OrderStatus (supports camelCase from product docs). */
export const STATUS_ALIASES: Record<string, OrderStatus> = {
  OrderPlaced: 'PENDING',
  order_placed: 'PENDING',
  PENDING: 'PENDING',
  Confirmed: 'CONFIRMED',
  CONFIRMED: 'CONFIRMED',
  HubAssigned: 'HUB_ASSIGNED',
  HUB_ASSIGNED: 'HUB_ASSIGNED',
  AcceptedByHub: 'ACCEPTED_BY_HUB',
  ACCEPTED_BY_HUB: 'ACCEPTED_BY_HUB',
  PROCESSING: 'ACCEPTED_BY_HUB',
  accepted: 'ACCEPTED_BY_HUB',
  Picking: 'PICKING',
  PICKING: 'PICKING',
  picking: 'PICKING',
  Packed: 'PACKED',
  PACKED: 'PACKED',
  packed: 'PACKED',
  READY_FOR_DISPATCH: 'PACKED',
  DriverAssigned: 'DRIVER_ASSIGNED',
  DRIVER_ASSIGNED: 'DRIVER_ASSIGNED',
  OutForDelivery: 'OUT_FOR_DELIVERY',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DISPATCHED: 'OUT_FOR_DELIVERY',
  dispatch: 'OUT_FOR_DELIVERY',
  out_for_delivery: 'OUT_FOR_DELIVERY',
  Delivered: 'DELIVERED',
  DELIVERED: 'DELIVERED',
  delivered: 'DELIVERED',
  Cancelled: 'CANCELLED',
  CANCELLED: 'CANCELLED',
  cancelled: 'CANCELLED',
  cancel: 'CANCELLED',
};

export function resolveStatusInput(input: string): OrderStatus | null {
  if (!input) return null;
  if (STATUS_ALIASES[input]) return STATUS_ALIASES[input];
  const upper = input.toUpperCase();
  if (STATUS_ALIASES[upper]) return STATUS_ALIASES[upper];
  const values = Object.keys(ORDER_STATUS_LABELS);
  if (values.includes(upper)) {
    return normalizeOrderStatus(upper);
  }
  return null;
}

export const ORDER_UPDATED_EVENT = 'ORDER_UPDATED';

/** Primary Socket.IO event for customer apps. */
export const ORDER_STATUS_UPDATED_EVENT = 'order.updated';

/** Legacy alias — still emitted for older clients. */
export const ORDER_STATUS_UPDATED_EVENT_LEGACY = 'OrderStatusUpdated';

export type OrderDriverPayload = {
  id?: string;
  name: string;
  phone?: string | null;
};

export type OrderVehiclePayload = {
  id?: string;
  registration: string;
  type?: string | null;
};

export type OrderTimelinePayloadEntry = {
  id: string;
  status: string;
  statusLabel: string;
  message: string;
  createdAt: string;
};

export type OrderUpdatedPayload = {
  orderId: string;
  orderNumber?: string;
  status: OrderStatus;
  statusLabel: string;
  oldStatus?: OrderStatus | string | null;
  updatedAt: string;
  version?: number;
  hubId?: string | null;
  customerId?: string;
  driverId?: string | null;
  eta?: string | null;
  expectedDeliveryAt?: string | null;
  trackingStatus?: string | null;
  driver?: OrderDriverPayload | null;
  vehicle?: OrderVehiclePayload | null;
  driverReachedAt?: string | null;
  deliveryOtpGenerated?: boolean;
  deliveryOtpVerified?: boolean;
  timeline?: OrderTimelinePayloadEntry[];
};
