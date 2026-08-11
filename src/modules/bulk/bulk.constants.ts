import {
  BulkDeliveryRequirement,
  BulkEnquiryStatus,
  BulkPreferredContact,
} from '../../../generated/prisma/client';
import {
  BRICK_GRADE_LABELS,
  BRICK_GRADE_VALUES,
  BRICK_PRODUCT_TYPE_LABELS,
  BRICK_PRODUCT_TYPE_VALUES,
  CATEGORY_SLUGS,
  normalizeBrickGrade,
  normalizeBrickProductType,
  type BrickGrade,
  type BrickProductType,
} from '../catalog/catalog.constants';

export const BULK_DELIVERY_REQUIREMENT_LABELS: Record<
  BulkDeliveryRequirement,
  string
> = {
  IMMEDIATE: 'Immediate',
  TODAY: 'Today',
  TOMORROW: 'Tomorrow',
  WITHIN_3_DAYS: 'Within 3 days',
  WITHIN_1_WEEK: 'Within 1 week',
  FLEXIBLE: 'Flexible',
};

export const BULK_PREFERRED_CONTACT_LABELS: Record<
  BulkPreferredContact,
  string
> = {
  CALL: 'Call',
  WHATSAPP: 'WhatsApp',
  BOTH: 'Call or WhatsApp',
};

/** Customer-facing status labels (internal status → display). */
export const BULK_CUSTOMER_FACING_STATUS: Record<BulkEnquiryStatus, string> = {
  NEW: 'Enquiry Submitted',
  ASSIGNED: 'Executive Assigned',
  CONTACTED: 'Requirement Reviewed',
  IN_PROGRESS: 'Requirement Reviewed',
  QUOTE_PREPARED: 'Quote Prepared',
  QUOTE_SENT: 'Quote Sent',
  QUOTED: 'Quote Sent',
  NEGOTIATION: 'Negotiation',
  CONVERTED: 'Order Confirmed',
  ORDER_CREATED: 'Order Confirmed',
  COMPLETED: 'Order Confirmed',
  REJECTED: 'Closed',
  CANCELLED: 'Closed',
  EXPIRED: 'Closed',
};

export const BULK_TERMINAL_STATUSES: BulkEnquiryStatus[] = [
  BulkEnquiryStatus.CONVERTED,
  BulkEnquiryStatus.ORDER_CREATED,
  BulkEnquiryStatus.COMPLETED,
  BulkEnquiryStatus.REJECTED,
  BulkEnquiryStatus.CANCELLED,
  BulkEnquiryStatus.EXPIRED,
];

export const BULK_QUOTED_PIPELINE_STATUSES: BulkEnquiryStatus[] = [
  BulkEnquiryStatus.QUOTE_PREPARED,
  BulkEnquiryStatus.QUOTE_SENT,
  BulkEnquiryStatus.QUOTED,
  BulkEnquiryStatus.NEGOTIATION,
];

export const BULK_IN_PROGRESS_STATUSES: BulkEnquiryStatus[] = [
  BulkEnquiryStatus.CONTACTED,
  BulkEnquiryStatus.IN_PROGRESS,
  BulkEnquiryStatus.QUOTE_PREPARED,
  BulkEnquiryStatus.QUOTE_SENT,
  BulkEnquiryStatus.QUOTED,
  BulkEnquiryStatus.NEGOTIATION,
];

export const BULK_COMPLETED_STATUSES: BulkEnquiryStatus[] = [
  BulkEnquiryStatus.COMPLETED,
  BulkEnquiryStatus.CONVERTED,
  BulkEnquiryStatus.ORDER_CREATED,
];

export const BULK_CANCELLED_STATUSES: BulkEnquiryStatus[] = [
  BulkEnquiryStatus.CANCELLED,
  BulkEnquiryStatus.REJECTED,
  BulkEnquiryStatus.EXPIRED,
];

export const BULK_COMMON_UNITS = [
  'Bags',
  'MT',
  'Tonnes',
  'Cubic Metres',
  'Pieces',
  'Numbers',
  'Loads',
  'Units',
] as const;

export const MIXED_LOAD_SLUG = 'mixed';

export function customerFacingBulkStatus(
  status: BulkEnquiryStatus | string,
): string {
  return (
    BULK_CUSTOMER_FACING_STATUS[status as BulkEnquiryStatus] ??
    String(status)
  );
}

export function formatBulkEnquiryNumber(year: number, sequence: number): string {
  return `BULK-${year}-${String(sequence).padStart(6, '0')}`;
}

export function formatBulkQuotationNumber(
  year: number,
  sequence: number,
): string {
  return `BQ-${year}-${String(sequence).padStart(6, '0')}`;
}

export function decimalToNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (
    typeof value === 'object' &&
    value !== null &&
    'toNumber' in value &&
    typeof (value as { toNumber: () => number }).toNumber === 'function'
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value);
}

export function optionalDecimalToNumber(
  value: unknown,
): number | null {
  if (value == null) return null;
  const n = decimalToNumber(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeUnit(unit?: string | null): string {
  const trimmed = unit?.trim();
  if (!trimmed) return 'Bags';
  return trimmed;
}

export function isBricksCategorySlug(slug?: string | null): boolean {
  if (!slug) return false;
  return slug.toLowerCase() === CATEGORY_SLUGS.BRICKS;
}

export function validateBrickProductType(
  value?: string | null,
): BrickProductType {
  const normalized = normalizeBrickProductType(value);
  if (!normalized) {
    throw new Error(
      `Invalid brick productType. Allowed: ${BRICK_PRODUCT_TYPE_VALUES.join(', ')}`,
    );
  }
  return normalized;
}

export function validateBrickGrade(value?: string | null): BrickGrade | null {
  if (value == null || value === '') return null;
  const normalized = normalizeBrickGrade(value);
  if (!normalized) {
    throw new Error(
      `Invalid brick grade. Allowed: ${BRICK_GRADE_VALUES.join(', ')}`,
    );
  }
  return normalized;
}

export function brickFormOptions() {
  return {
    productTypes: BRICK_PRODUCT_TYPE_VALUES.map((value) => ({
      value,
      label: BRICK_PRODUCT_TYPE_LABELS[value],
    })),
    grades: BRICK_GRADE_VALUES.map((value) => ({
      value,
      label: BRICK_GRADE_LABELS[value],
    })),
  };
}

export function deliveryRequirementOptions() {
  return (Object.keys(BULK_DELIVERY_REQUIREMENT_LABELS) as BulkDeliveryRequirement[]).map(
    (value) => ({
      value,
      label: BULK_DELIVERY_REQUIREMENT_LABELS[value],
    }),
  );
}

export function preferredContactOptions() {
  return (Object.keys(BULK_PREFERRED_CONTACT_LABELS) as BulkPreferredContact[]).map(
    (value) => ({
      value,
      label: BULK_PREFERRED_CONTACT_LABELS[value],
    }),
  );
}
