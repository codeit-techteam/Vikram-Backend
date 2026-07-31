import type { OrderStatus } from '../../generated/prisma/client';

/** Push / in-app copy for customer order status changes. */
export function getOrderStatusPushCopy(
  status: OrderStatus | string,
  trackingStatus?: string | null,
): { title: string; body: string; label: string } {
  if (trackingStatus === 'REACHED_CUSTOMER') {
    return {
      title: 'Driver arrived',
      body: 'Driver has reached your location.',
      label: 'DRIVER REACHED',
    };
  }

  const key = String(status).toUpperCase();
  switch (key) {
    case 'PENDING':
    case 'CONFIRMED':
      return {
        title: 'Order confirmed',
        body: 'Your order has been confirmed.',
        label: 'ORDER CONFIRMED',
      };
    case 'HUB_ASSIGNED':
    case 'AWAITING_HUB_ALLOCATION':
    case 'ACCEPTED_BY_HUB':
    case 'PROCESSING':
    case 'PICKING':
      return {
        title: 'Preparing your order',
        body: 'Your order is now being prepared.',
        label: 'PREPARING',
      };
    case 'PACKED':
    case 'READY_FOR_DISPATCH':
      return {
        title: 'Order packed',
        body: 'Your order has been packed.',
        label: 'PACKED',
      };
    case 'DRIVER_ASSIGNED':
    case 'OUT_FOR_DELIVERY':
    case 'DISPATCHED':
      return {
        title: 'Out for delivery',
        body: 'Your rider is on the way.',
        label: 'OUT FOR DELIVERY',
      };
    case 'DELIVERED':
      return {
        title: 'Order delivered',
        body: 'Order Delivered Successfully.',
        label: 'DELIVERED',
      };
    case 'CANCELLED':
      return {
        title: 'Order cancelled',
        body: 'Your order has been cancelled.',
        label: 'CANCELLED',
      };
    default:
      return {
        title: 'Order update',
        body: 'Your order status has been updated.',
        label: 'ORDER UPDATE',
      };
  }
}
