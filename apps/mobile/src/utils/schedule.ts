export type PeriodMode = 'MONTH' | 'YEAR';
export type RecurrenceLike = 'ONE_TIME' | 'WEEKLY' | 'TWICE_A_MONTH' | 'MONTHLY' | 'CUSTOM' | string | null | undefined;

export function getPeriodRange(periodMode: PeriodMode, now = new Date()) {
  const start = periodMode === 'YEAR' ? new Date(now.getFullYear(), 0, 1) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = periodMode === 'YEAR' ? new Date(now.getFullYear() + 1, 0, 1) : new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

export function parseCustomPeriod(text?: string | null): { interval: number; unit: 'DAY' | 'WEEK' | 'MONTH' } | null {
  const tag = text?.split('[period:')[1]?.split(']')[0];
  if (!tag) return null;
  const [rawInterval, rawUnit] = tag.split(':');
  const interval = Number(rawInterval);
  if (!Number.isInteger(interval) || interval <= 0) return null;
  if (rawUnit !== 'DAY' && rawUnit !== 'WEEK' && rawUnit !== 'MONTH') return null;
  return { interval, unit: rawUnit };
}

function addPeriod(date: Date, recurrence: RecurrenceLike, marker?: string | null) {
  const next = new Date(date);

  if (recurrence === 'WEEKLY') {
    next.setDate(next.getDate() + 7);
    return next;
  }

  if (recurrence === 'TWICE_A_MONTH') {
    next.setDate(next.getDate() + 14);
    return next;
  }

  const custom = parseCustomPeriod(marker);
  if (recurrence === 'CUSTOM' || custom) {
    if (!custom) {
      next.setMonth(next.getMonth() + 1);
      return next;
    }
    if (custom.unit === 'DAY') next.setDate(next.getDate() + custom.interval);
    if (custom.unit === 'WEEK') next.setDate(next.getDate() + custom.interval * 7);
    if (custom.unit === 'MONTH') next.setMonth(next.getMonth() + custom.interval);
    return next;
  }

  next.setMonth(next.getMonth() + 1);
  return next;
}

export function countOccurrences(params: {
  startDate: string | Date;
  recurrence?: RecurrenceLike;
  rangeStart: Date;
  rangeEnd: Date;
  marker?: string | null;
}) {
  const { recurrence, rangeStart, rangeEnd, marker } = params;
  const startDate = params.startDate instanceof Date ? params.startDate : new Date(params.startDate);
  if (Number.isNaN(startDate.getTime())) return 0;

  const hasCustomMarker = Boolean(parseCustomPeriod(marker));
  const effectiveRecurrence = hasCustomMarker && (!recurrence || recurrence === 'ONE_TIME') ? 'CUSTOM' : recurrence ?? 'MONTHLY';

  if (effectiveRecurrence === 'ONE_TIME') {
    return startDate >= rangeStart && startDate < rangeEnd ? 1 : 0;
  }

  let current = new Date(startDate);
  let guard = 0;

  while (current < rangeStart && guard < 1000) {
    current = addPeriod(current, effectiveRecurrence, marker);
    guard += 1;
  }

  let count = 0;
  while (current < rangeEnd && guard < 1200) {
    if (current >= rangeStart) count += 1;
    current = addPeriod(current, effectiveRecurrence, marker);
    guard += 1;
  }

  return count;
}

export function scheduledAmount(params: {
  amount: string | number;
  startDate: string | Date;
  recurrence?: RecurrenceLike;
  marker?: string | null;
  rangeStart: Date;
  rangeEnd: Date;
}) {
  const amount = Number(params.amount);
  if (!Number.isFinite(amount)) return 0;
  const count = countOccurrences(params);
  return amount * count;
}
