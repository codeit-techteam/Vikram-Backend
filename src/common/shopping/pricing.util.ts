/** Shared cart / checkout pricing helpers (MVP — no coupons, wallet, EMI). */

/** @deprecated Flat fallback only — prefer DeliveryPricingService for real charges. */
export const DELIVERY_CHARGE = 0;
export const FREE_DELIVERY_THRESHOLD = 5000;

export interface LinePricingInput {
  unitPrice: number;
  quantity: number;
  gstPercent: number;
}

export interface LinePricing {
  price: number;
  gst: number;
  lineSubtotal: number;
  lineGstAmount: number;
  lineTotal: number;
}

export interface CartTotals {
  subtotal: number;
  gstAmount: number;
  deliveryCharge: number;
  grandTotal: number;
  itemCount: number;
}

export function toMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function decimalToNumber(value: { toNumber?: () => number } | number | string): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (value && typeof value.toNumber === 'function') return value.toNumber();
  return Number(value);
}

/** Line subtotal is price × qty (ex-GST). GST amount is computed on subtotal. */
export function calculateLinePricing(input: LinePricingInput): LinePricing {
  const price = toMoney(input.unitPrice);
  const gst = toMoney(input.gstPercent);
  const lineSubtotal = toMoney(price * input.quantity);
  const lineGstAmount = toMoney((lineSubtotal * gst) / 100);
  const lineTotal = toMoney(lineSubtotal + lineGstAmount);

  return { price, gst, lineSubtotal, lineGstAmount, lineTotal };
}

export function calculateCartTotals(
  lines: Array<{ lineSubtotal: number; lineGstAmount: number }>,
): CartTotals {
  const subtotal = toMoney(lines.reduce((sum, l) => sum + l.lineSubtotal, 0));
  const gstAmount = toMoney(lines.reduce((sum, l) => sum + l.lineGstAmount, 0));
  // Delivery charge is resolved server-side via DeliveryPricingService at checkout.
  // Cart totals leave delivery at 0 to avoid stale/hardcoded frontend prices.
  const deliveryCharge = 0;
  const grandTotal = toMoney(subtotal + gstAmount + deliveryCharge);

  return {
    subtotal,
    gstAmount,
    deliveryCharge,
    grandTotal,
    itemCount: lines.length,
  };
}

/** @deprecated Import from `src/common/geo/geo.util` — kept as a re-export. */
export { haversineKm } from '../geo/geo.util';

export function formatOrderNumber(year: number, sequence: number): string {
  return `BJW-${year}-${String(sequence).padStart(6, '0')}`;
}
