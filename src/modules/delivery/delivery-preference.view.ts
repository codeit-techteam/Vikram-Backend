import type { DeliveryPreferenceType } from './delivery-preference.constants';
import { DELIVERY_PREFERENCE_LABELS } from './delivery-preference.constants';
import { formatDateLabel, formatSlotLabel } from './delivery-slot.logic';

export type DeliveryPreferenceSnapshot = {
  type: DeliveryPreferenceType;
  label: string;
  scheduledDate: string | null;
  scheduledDateLabel: string | null;
  scheduledSlotId: string | null;
  scheduledSlotLabel: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  customerRemark: string | null;
  selectedAt: string;
  timezone: string;
  etaMinMinutes: number | null;
  etaMaxMinutes: number | null;
  etaLabel: string | null;
  vehicleType: string | null;
  vehicleDisplayName: string | null;
  hubId: string | null;
  hubName: string | null;
};

export function dateKeyFromDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function mapDeliveryPreferenceView(order: {
  deliveryPreferenceType?: DeliveryPreferenceType | string | null;
  scheduledDate?: Date | string | null;
  scheduledSlotId?: string | null;
  scheduledStartAt?: Date | string | null;
  scheduledEndAt?: Date | string | null;
  deliveryCustomerRemark?: string | null;
  notes?: string | null;
  deliveryPreferenceSelectedAt?: Date | string | null;
  deliveryTimezone?: string | null;
  deliveryPreferenceSnapshot?: unknown;
  expectedDeliveryAt?: Date | string | null;
  deliveryEtaMinMinutes?: number | null;
  deliveryEtaMaxMinutes?: number | null;
  deliveryVehicleType?: string | null;
  hub?: { id?: string; name?: string } | null;
  hubId?: string | null;
  createdAt?: Date | string;
}): {
  type: DeliveryPreferenceType;
  label: string;
  scheduledDate: string | null;
  scheduledDateLabel: string | null;
  scheduledSlotId: string | null;
  scheduledSlotLabel: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  customerRemark: string | null;
  selectedAt: string | null;
  timezone: string;
  etaMinMinutes: number | null;
  etaMaxMinutes: number | null;
  snapshot: DeliveryPreferenceSnapshot | null;
} {
  const snapshot =
    order.deliveryPreferenceSnapshot &&
    typeof order.deliveryPreferenceSnapshot === 'object'
      ? (order.deliveryPreferenceSnapshot as DeliveryPreferenceSnapshot)
      : null;
  const type = (order.deliveryPreferenceType ??
    snapshot?.type ??
    'ASAP') as DeliveryPreferenceType;
  const dateKey = dateKeyFromDate(order.scheduledDate) ?? snapshot?.scheduledDate ?? null;
  const startIso = order.scheduledStartAt
    ? new Date(order.scheduledStartAt).toISOString()
    : snapshot?.scheduledStartAt ?? null;
  const endIso = order.scheduledEndAt
    ? new Date(order.scheduledEndAt).toISOString()
    : snapshot?.scheduledEndAt ?? null;
  let slotLabel = snapshot?.scheduledSlotLabel ?? null;
  if (!slotLabel && startIso && endIso) {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const startMinutes = start.getUTCHours() * 60 + start.getUTCMinutes();
    const endMinutes = end.getUTCHours() * 60 + end.getUTCMinutes();
    // Start/end are stored as UTC of IST wall times; labels come from snapshot first.
    slotLabel = formatSlotLabel(
      (startMinutes + 330) % (24 * 60),
      (endMinutes + 330) % (24 * 60),
    );
  }
  return {
    type,
    label: DELIVERY_PREFERENCE_LABELS[type] ?? type,
    scheduledDate: dateKey,
    scheduledDateLabel: dateKey ? formatDateLabel(dateKey) : snapshot?.scheduledDateLabel ?? null,
    scheduledSlotId: order.scheduledSlotId ?? snapshot?.scheduledSlotId ?? null,
    scheduledSlotLabel: slotLabel,
    scheduledStartAt: startIso,
    scheduledEndAt: endIso,
    customerRemark:
      order.deliveryCustomerRemark ?? snapshot?.customerRemark ?? order.notes ?? null,
    selectedAt: order.deliveryPreferenceSelectedAt
      ? new Date(order.deliveryPreferenceSelectedAt).toISOString()
      : snapshot?.selectedAt ?? null,
    timezone: order.deliveryTimezone ?? snapshot?.timezone ?? 'Asia/Kolkata',
    etaMinMinutes: order.deliveryEtaMinMinutes ?? snapshot?.etaMinMinutes ?? null,
    etaMaxMinutes: order.deliveryEtaMaxMinutes ?? snapshot?.etaMaxMinutes ?? null,
    snapshot,
  };
}
