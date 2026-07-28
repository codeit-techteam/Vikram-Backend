import type { OrderStatus } from '../../../generated/prisma/client';
import { ORDER_STATUS_BUCKETS, ORDER_STATUS_LABELS } from '../../modules/orders/order-lifecycle.constants';

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
  pending: ORDER_STATUS_BUCKETS.pending,
  accepted: ['ACCEPTED_BY_HUB', 'PROCESSING'],
  picking: ['PICKING'],
  loading: ['PICKING', 'PACKED', 'READY_FOR_DISPATCH'],
  packed: ['PACKED', 'READY_FOR_DISPATCH'],
  ready: ['PACKED', 'READY_FOR_DISPATCH', 'DRIVER_ASSIGNED'],
  out_for_delivery: ['OUT_FOR_DELIVERY', 'DISPATCHED', 'DRIVER_ASSIGNED'],
  delivered: ['DELIVERED'],
  cancelled: ['CANCELLED'],
};

/** Same labels as customer + admin (single source of truth). */
export const HUB_TIMELINE_LABELS: Record<OrderStatus, string> = ORDER_STATUS_LABELS;

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
