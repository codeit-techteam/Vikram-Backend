export {
  CANCELLABLE_STATUSES,
  NON_CANCELLABLE_STATUSES,
  ORDER_STATUS_LABELS,
} from './order-lifecycle.constants';

export function decimalToNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return Number(value);
}
