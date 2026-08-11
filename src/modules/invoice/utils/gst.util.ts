import { toMoney } from '../../../common/shopping/pricing.util';
import type {
  GstTaxBreakdown,
  InvoiceFinancialSnapshot,
  InvoiceLineItem,
} from '../types/invoice.types';

export function normalizeState(state: string | undefined | null): string {
  return (state ?? '').trim().toLowerCase();
}

export function isInterStateSupply(
  sellerState: string,
  buyerState: string | undefined | null,
): boolean {
  const buyer = normalizeState(buyerState);
  const seller = normalizeState(sellerState);
  if (!buyer || !seller) return false;
  return buyer !== seller;
}

export function calculateLineGstAmount(item: InvoiceLineItem): number {
  return toMoney((item.subtotal * item.gst) / 100);
}

export function applyTaxBreakdownToItems(
  items: InvoiceLineItem[],
  isInterState: boolean,
): InvoiceLineItem[] {
  return items.map((item) => {
    const gstAmount = calculateLineGstAmount(item);
    if (isInterState) {
      return { ...item, gstAmount, igst: gstAmount, cgst: 0, sgst: 0 };
    }
    const half = toMoney(gstAmount / 2);
    return { ...item, gstAmount, cgst: half, sgst: half, igst: 0 };
  });
}

export function calculateTaxBreakdown(
  gstAmount: number,
  isInterState: boolean,
): GstTaxBreakdown {
  const total = toMoney(gstAmount);
  if (isInterState) {
    return { cgst: 0, sgst: 0, igst: total, isInterState: true };
  }
  const half = toMoney(total / 2);
  return { cgst: half, sgst: half, igst: 0, isInterState: false };
}

export function buildFinancialSnapshot(order: {
  loyaltyPointsUsed: number;
  membershipDiscount: unknown;
  discountAmount: unknown;
  bulkOrder: boolean;
  loyaltyPointValue?: number;
}): InvoiceFinancialSnapshot {
  const membershipDiscount = toMoney(Number(order.membershipDiscount ?? 0));
  const discountAmount = toMoney(Number(order.discountAmount ?? 0));
  const bulkDiscount = order.bulkOrder
    ? toMoney(Math.max(0, discountAmount - membershipDiscount))
    : 0;
  const loyaltyPointsUsed = order.loyaltyPointsUsed ?? 0;
  const pointValue = order.loyaltyPointValue ?? 0.01;

  return {
    loyaltyPointsUsed,
    loyaltyRedeemedAmount: toMoney(loyaltyPointsUsed * pointValue),
    membershipDiscount,
    bulkDiscount,
    bulkOrder: order.bulkOrder,
  };
}

export function parseFinancialSnapshot(
  raw: unknown,
  fallback?: Partial<InvoiceFinancialSnapshot>,
): InvoiceFinancialSnapshot {
  const data = (raw ?? {}) as Partial<InvoiceFinancialSnapshot>;
  return {
    loyaltyPointsUsed: data.loyaltyPointsUsed ?? fallback?.loyaltyPointsUsed ?? 0,
    loyaltyRedeemedAmount:
      data.loyaltyRedeemedAmount ?? fallback?.loyaltyRedeemedAmount ?? 0,
    membershipDiscount:
      data.membershipDiscount ?? fallback?.membershipDiscount ?? 0,
    bulkDiscount: data.bulkDiscount ?? fallback?.bulkDiscount ?? 0,
    bulkOrder: data.bulkOrder ?? fallback?.bulkOrder ?? false,
  };
}

export function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatAddress(address: {
  line1?: string;
  line2?: string | null;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
}): string {
  return [
    address.line1,
    address.line2,
    [address.city, address.state, address.pincode].filter(Boolean).join(', '),
    address.country,
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatPaymentMethod(method: string): string {
  if (method === 'CASH') return 'Cash on Delivery';
  if (method === 'MANUAL') return 'Manual / Bank Transfer';
  return method.replace(/_/g, ' ');
}

export function formatPaymentStatus(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}
