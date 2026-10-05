/** Calendar dates are stored days, not instants in the viewer's time zone. */
export function isExactCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = Date.parse(value + 'T00:00:00.000Z');
  return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 10) === value;
}
