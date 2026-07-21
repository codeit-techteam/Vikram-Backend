import { OrderStatus } from '../../../generated/prisma/client';

/** Statuses where customer may cancel the order. */
export const CANCELLABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.HUB_ASSIGNED,
  OrderStatus.AWAITING_HUB_ALLOCATION,
];

/** Statuses that block cancellation. */
export const NON_CANCELLABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PROCESSING,
  OrderStatus.PACKED,
  OrderStatus.READY_FOR_DISPATCH,
  OrderStatus.DISPATCHED,
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Order Placed',
  CONFIRMED: 'Confirmed',
  HUB_ASSIGNED: 'Hub Assigned',
  AWAITING_HUB_ALLOCATION: 'Awaiting Hub Allocation',
  PROCESSING: 'Processing',
  PACKED: 'Packed',
  READY_FOR_DISPATCH: 'Ready for Dispatch',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export function decimalToNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return Number(value);
}
