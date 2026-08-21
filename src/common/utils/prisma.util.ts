import { EntityStatus } from '../../../generated/prisma/client';

export const ACTIVE_WHERE = {
  deletedAt: null,
  status: EntityStatus.ACTIVE,
} as const;

export const PRODUCT_ACTIVE_WHERE = {
  deletedAt: null,
  entityStatus: EntityStatus.ACTIVE,
  isVisible: true,
} as const;

export const VISIBLE_WHERE = {
  deletedAt: null,
  isVisible: true,
  status: EntityStatus.ACTIVE,
} as const;

export function hashQueryParams(params: Record<string, unknown>): string {
  const sorted = Object.keys(params)
    .sort()
    .filter(
      (k) => params[k] !== undefined && params[k] !== null && params[k] !== '',
    )
    .map((k) => `${k}=${String(params[k])}`)
    .join('&');
  return sorted || 'default';
}
