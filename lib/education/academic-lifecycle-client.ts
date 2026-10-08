// Browser helpers for the reviewed course/class/enrolment pages. No server imports; the server decides every outcome.
import { conflictMessage } from './academic-lifecycle-types';
import type { ChangeInput, ChangeResult } from './academic-lifecycle-types';

export class ReadFailure extends Error {
  constructor(readonly status: number) {
    super('Request unavailable');
  }
}

/** GET JSON with no-store; a non-2xx status is a ReadFailure carrying only the status. */
export async function readJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { cache: 'no-store', signal });
  const text = await response.text();
  if (!response.ok) throw new ReadFailure(response.status);
  return JSON.parse(text) as T;
}

/** Plain-language text for a failed read. Never shows record ids or server text. */
export function readFailureMessage(failure: unknown, subject: string): string {
  if (failure instanceof ReadFailure) {
    if (failure.status === 401) return 'Sign in again, then reload this page.';
    if (failure.status === 403 || failure.status === 404)
      return `${subject} is unavailable to your current account. Reload after access is restored.`;
  }
  return `${subject} could not be loaded. Reload to try again.`;
}

export const todayUtc = () => new Date().toISOString().slice(0, 10);
export const newRequestId = () => crypto.randomUUID();

export type SubmitOutcome =
  | { state: 'saved'; result: ChangeResult }
  | { state: 'refused'; status: number; code: string | null; message: string }
  | { state: 'unconfirmed' };

/** Sends one reviewed request. A thrown fetch or a server failure is "unconfirmed": the outcome is unknown, so the caller keeps the same request id. */
export async function sendChangeRequest(request: {
  clientRequestId: string;
  reason?: string;
  changes: ChangeInput[];
}): Promise<SubmitOutcome> {
  let response: Response;
  try {
    response = await fetch('/api/academic-changes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    return { state: 'unconfirmed' };
  }
  let data: unknown = null;
  try {
    data = JSON.parse(await response.text());
  } catch {
    data = null;
  }
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  if (
    (response.status === 200 || response.status === 201) &&
    record.receipt &&
    typeof record.receipt === 'object'
  )
    return { state: 'saved', result: record as unknown as ChangeResult };
  // A success status without a readable receipt (or any 5xx/redirect/timeout) is an unknown outcome, never "nothing was saved".
  if (response.status >= 500 || response.status < 400 || [408, 425, 429].includes(response.status))
    return { state: 'unconfirmed' };
  const code = typeof record.code === 'string' ? record.code : null;
  if (response.status === 401)
    return {
      state: 'refused',
      status: 401,
      code,
      message: 'Sign in again, then reload this page. Nothing was saved.',
    };
  if (response.status === 403)
    return {
      state: 'refused',
      status: 403,
      code,
      message: 'Your account is not allowed to make this change. Nothing was saved.',
    };
  if (response.status === 400 && !code)
    return {
      state: 'refused',
      status: 400,
      code,
      message: 'One of the entered values is not allowed. Check the form and try again. Nothing was saved.',
    };
  return {
    state: 'refused',
    status: response.status,
    code,
    message: conflictMessage(code) + ' Nothing was saved.',
  };
}

/** After an unconfirmed send: did the original request commit? 200 means yes; 404 means it is safe to send the same request again. */
export async function checkReceipt(clientRequestId: string): Promise<'saved' | 'not-recorded' | 'unknown'> {
  try {
    const response = await fetch('/api/academic-changes/' + encodeURIComponent(clientRequestId), {
      cache: 'no-store',
    });
    await response.text();
    if (response.status === 200) return 'saved';
    if (response.status === 404) return 'not-recorded';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export function formatDay(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Not set';
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** One plain sentence for a class date range; never "Not set to Not set". */
export function formatDayRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start && !end) return 'No class dates have been set.';
  if (start && !end) return `From ${formatDay(start)}, with no end date.`;
  if (!start && end) return `Until ${formatDay(end)}, with no start date.`;
  return `${formatDay(start)} to ${formatDay(end)}.`;
}

export function formatMoment(value: string | null | undefined): string {
  if (!value) return 'Unknown time';
  const time = Date.parse(value);
  return Number.isNaN(time)
    ? 'Unknown time'
    : new Date(time).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) +
        ' UTC';
}

export const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  withdrawn: 'Withdrawn',
  completed: 'Completed',
  retired: 'Retired',
  open: 'Open',
  closed: 'Closed',
};
export const END_LABELS: Record<string, string> = {
  withdrawn: 'Withdrawn',
  completed: 'Completed',
  transferred: 'Transferred',
};
