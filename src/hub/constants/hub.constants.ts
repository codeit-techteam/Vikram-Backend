import type { OrderStatus } from '../../../generated/prisma/client';

export const HUB_ACCESS_ROLES = [
  'HUB_MANAGER',
  'HUB_OPERATOR',
  'WAREHOUSE_MANAGER',
  'INVENTORY_STAFF',
  'DISPATCH_MANAGER',
  'LOADING_SUPERVISOR',
  'DELIVERY_SUPERVISOR',
  'WAREHOUSE_STAFF',
  'LOADING_STAFF',
  'DISPATCH_STAFF',
  'DRIVER',
] as const;

export type HubAccessRole = (typeof HUB_ACCESS_ROLES)[number];

export const HUB_ORDER_FILTER_MAP: Record<string, OrderStatus[]> = {
  pending: ['PENDING', 'CONFIRMED', 'HUB_ASSIGNED', 'AWAITING_HUB_ALLOCATION'],
  accepted: ['PROCESSING'],
  loading: ['PACKED'],
  ready: ['READY_FOR_DISPATCH'],
  out_for_delivery: ['DISPATCHED'],
  delivered: ['DELIVERED'],
};

export const HUB_TIMELINE_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Order Placed',
  CONFIRMED: 'Order Confirmed',
  HUB_ASSIGNED: 'Hub Assigned',
  AWAITING_HUB_ALLOCATION: 'Awaiting Hub Allocation',
  PROCESSING: 'Order Accepted',
  PACKED: 'Loading Completed',
  READY_FOR_DISPATCH: 'Ready for Dispatch',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export const HUB_ROLE_PERMISSIONS: Record<string, string[]> = {
  HUB_MANAGER: ['*'],
  HUB_OPERATOR: [
    'dashboard',
    'profile',
    'orders',
    'timeline',
    'search',
    'notifications',
    'reports',
  ],
  WAREHOUSE_MANAGER: [
    'dashboard',
    'profile',
    'inventory',
    'products',
    'loading',
    'unloading',
    'search',
    'notifications',
    'reports',
  ],
  INVENTORY_STAFF: ['inventory', 'products', 'search', 'notifications'],
  DISPATCH_MANAGER: [
    'dashboard',
    'dispatch',
    'drivers',
    'vehicles',
    'assignments',
    'orders',
    'search',
    'notifications',
    'reports',
  ],
  LOADING_SUPERVISOR: ['loading', 'unloading', 'orders', 'assignments'],
  DELIVERY_SUPERVISOR: ['dispatch', 'orders', 'pod', 'assignments'],
  WAREHOUSE_STAFF: ['inventory', 'loading'],
  LOADING_STAFF: ['loading', 'unloading'],
  DISPATCH_STAFF: ['dispatch', 'drivers', 'vehicles', 'assignments'],
  DRIVER: ['orders.read', 'dispatch.read'],
};
