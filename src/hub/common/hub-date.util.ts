/** Hub date helpers — business timezone Asia/Kolkata (IST). */

const IST = 'Asia/Kolkata';

export function getTodayRange(): { start: Date; end: Date } {
  return resolvePeriodRange('today');
}

export function formatIstDateTime(date = new Date()): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/** Start of calendar day in IST as a UTC Date. */
export function startOfDayIst(base = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(base);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  // IST = UTC+5:30 → midnight IST = previous day 18:30 UTC
  return new Date(`${y}-${m}-${d}T00:00:00+05:30`);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  return d;
}

export type ReportPeriod =
  | 'today'
  | 'last_7_days'
  | 'last_30_days'
  | 'last_90_days'
  | 'this_month'
  | 'last_month'
  | 'custom';

export function resolvePeriodRange(
  period?: string | null,
  fromDate?: string | null,
  toDate?: string | null,
): { start: Date; end: Date; period: ReportPeriod } {
  const todayStart = startOfDayIst();
  const tomorrowStart = addDays(todayStart, 1);

  if (period === 'custom' || (!period && (fromDate || toDate))) {
    const start = fromDate ? startOfDayIst(new Date(fromDate)) : todayStart;
    let end = toDate ? startOfDayIst(new Date(toDate)) : todayStart;
    end = addDays(end, 1); // exclusive end
    if (end <= start) end = addDays(start, 1);
    return { start, end, period: 'custom' };
  }

  switch (period) {
    case 'today':
      return { start: todayStart, end: tomorrowStart, period: 'today' };
    case 'last_7_days':
      return {
        start: addDays(todayStart, -6),
        end: tomorrowStart,
        period: 'last_7_days',
      };
    case 'last_90_days':
      return {
        start: addDays(todayStart, -89),
        end: tomorrowStart,
        period: 'last_90_days',
      };
    case 'this_month': {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: IST,
        year: 'numeric',
        month: '2-digit',
      }).formatToParts(new Date());
      const y = parts.find((p) => p.type === 'year')!.value;
      const m = parts.find((p) => p.type === 'month')!.value;
      const start = new Date(`${y}-${m}-01T00:00:00+05:30`);
      return { start, end: tomorrowStart, period: 'this_month' };
    }
    case 'last_month': {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: IST,
        year: 'numeric',
        month: '2-digit',
      }).formatToParts(new Date());
      const y = Number(parts.find((p) => p.type === 'year')!.value);
      const m = Number(parts.find((p) => p.type === 'month')!.value);
      const prevM = m === 1 ? 12 : m - 1;
      const prevY = m === 1 ? y - 1 : y;
      const start = new Date(
        `${prevY}-${String(prevM).padStart(2, '0')}-01T00:00:00+05:30`,
      );
      const end = new Date(
        `${y}-${String(m).padStart(2, '0')}-01T00:00:00+05:30`,
      );
      return { start, end, period: 'last_month' };
    }
    case 'last_30_days':
    default:
      return {
        start: addDays(todayStart, -29),
        end: tomorrowStart,
        period: 'last_30_days',
      };
  }
}

export function generateDispatchNo(): string {
  const suffix = Date.now().toString().slice(-8);
  return `DSP-${suffix}`;
}
