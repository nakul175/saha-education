// Plain-language date helpers for pages. Stored values stay canonical UTC text; people see local time.
export function formatWhen(value: string | null | undefined): string {
  if (!value) return 'not recorded';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'time not recognised';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
export function formatDay(value: string | null | undefined): string {
  if (!value) return 'not set';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value + 'T00:00:00.000Z' : value);
  if (!Number.isFinite(date.getTime())) return 'date not recognised';
  return date.toLocaleDateString(undefined, { dateStyle: 'medium', timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'UTC' : undefined });
}
export function excerpt(value: string, max = 140): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1).trimEnd() + '…' : flat;
}
