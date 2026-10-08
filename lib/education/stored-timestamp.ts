import { isExactCalendarDate } from './calendar-date';

/** Match the canonical UTC timestamps stored by the application without repairing legacy evidence. */
export function isExactStoredTimestamp(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !isExactCalendarDate(value.slice(0, 10))
  )
    return false;
  const instant = Date.parse(value);
  return Number.isFinite(instant) && new Date(instant).toISOString() === value;
}
