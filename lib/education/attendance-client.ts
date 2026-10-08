// Browser-side helpers for the attendance report pages. No authority lives here:
// every response is already scoped by the server, and a denial only hides content.

export class AttendanceReadFailure extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Reads a same-origin JSON endpoint. 401 sends the person to sign in; other failures become plain-language errors. */
export async function readAttendanceJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { cache: 'no-store', signal });
  if (!response.ok) await response.arrayBuffer();
  if (response.status === 401) {
    window.location.assign(new URL('/login', window.location.origin).href);
    throw new AttendanceReadFailure('Please sign in again.', 401);
  }
  if (response.status === 400)
    throw new AttendanceReadFailure(
      'Check the dates: each must be a real date, and the start cannot be after the end.',
      400,
    );
  if (response.status === 403)
    throw new AttendanceReadFailure('Your account does not have permission to view this attendance.', 403);
  if (response.status === 404)
    throw new AttendanceReadFailure(
      'This record is not available to your account. It may have moved or your access may have changed.',
      404,
    );
  if (!response.ok)
    throw new AttendanceReadFailure(
      'Attendance could not be loaded. Try again in a moment.',
      response.status,
    );
  return response.json() as Promise<T>;
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = Date.parse(value + 'T00:00:00.000Z');
  return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 10) === value;
}

export function shiftCalendarDate(value: string, days: number): string {
  const moved = new Date(value + 'T00:00:00.000Z');
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

export function rangeQuery(from: string, to: string): string {
  const parts: string[] = [];
  if (from) parts.push('from=' + encodeURIComponent(from));
  if (to) parts.push('to=' + encodeURIComponent(to));
  return parts.length ? '?' + parts.join('&') : '';
}

export const statusLabel = (status: string) =>
  status === 'other' ? 'Other saved status' : status[0].toUpperCase() + status.slice(1);
