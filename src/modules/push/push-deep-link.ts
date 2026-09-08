import {
  NotificationType,
  PushDeepLinkTarget,
} from '../../../generated/prisma/client';

export interface PushDeepLink {
  target: PushDeepLinkTarget;
  value?: string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requiresEntityId(target: PushDeepLinkTarget): boolean {
  return (
    target === PushDeepLinkTarget.PRODUCT ||
    target === PushDeepLinkTarget.CATEGORY ||
    target === PushDeepLinkTarget.OFFER ||
    target === PushDeepLinkTarget.ORDER
  );
}

export function buildActionRoute(link: PushDeepLink): string {
  const value = link.value?.trim() || '';
  switch (link.target) {
    case PushDeepLinkTarget.HOME:
      return '/(tabs)';
    case PushDeepLinkTarget.PRODUCT:
      return value ? `/products/detail/${value}` : '/(tabs)/catalog';
    case PushDeepLinkTarget.CATEGORY:
      return value ? `/products/${value}` : '/(tabs)/catalog';
    case PushDeepLinkTarget.OFFER:
      return value ? `/offers/${value}` : '/offers';
    case PushDeepLinkTarget.ORDER:
      return value ? `/orders/view/${value}` : '/(tabs)/orders';
    case PushDeepLinkTarget.CART:
      return '/(tabs)/cart';
    case PushDeepLinkTarget.NOTIFICATIONS:
      return '/notifications';
    case PushDeepLinkTarget.CUSTOM:
      return value || '/(tabs)';
    default:
      return '/(tabs)';
  }
}

export function resolveNotificationType(
  target: PushDeepLinkTarget,
): NotificationType {
  if (target === PushDeepLinkTarget.OFFER) return NotificationType.OFFER;
  if (target === PushDeepLinkTarget.ORDER) return NotificationType.ORDER;
  if (target === PushDeepLinkTarget.PRODUCT || target === PushDeepLinkTarget.CATEGORY) {
    return NotificationType.BANNER;
  }
  return NotificationType.ADMIN_ANNOUNCEMENT;
}

export function actionLabelFor(target: PushDeepLinkTarget): string {
  switch (target) {
    case PushDeepLinkTarget.ORDER:
      return 'Track Order';
    case PushDeepLinkTarget.OFFER:
      return 'View Offer';
    case PushDeepLinkTarget.PRODUCT:
      return 'View Product';
    case PushDeepLinkTarget.CART:
      return 'Open Cart';
    default:
      return 'Open';
  }
}

export function isUuid(value: string | undefined | null): boolean {
  return !!value && UUID_RE.test(value);
}

export function stringifyDataPayload(
  data: Record<string, string | number | boolean | null | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    out[key] = String(value);
  }
  return out;
}
