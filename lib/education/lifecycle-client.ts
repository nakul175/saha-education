// Client-safe helpers for the assessment lifecycle and report pages. No server imports; the server stays the authority.
import { conflictCodes, conflictMessages, type ConflictCode } from './lifecycle-messages';

export class LifecycleRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: ConflictCode | null,
    readonly unconfirmed: boolean,
  ) {
    super('Request failed');
  }
}

const isConflictCode = (value: unknown): value is ConflictCode =>
  typeof value === 'string' && (conflictCodes as readonly string[]).includes(value);

/** Fetch JSON with no caching. A network failure or an unreadable body is "unconfirmed": the change may or may not have been saved. */
export async function lifecycleRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: T }> {
  let response: Response, text: string;
  try {
    response = await fetch(path, { ...init, cache: 'no-store' });
    text = await response.text();
  } catch {
    throw new LifecycleRequestError(0, null, true);
  }
  if (response.status === 401) {
    window.location.assign(new URL('/login', window.location.origin).href);
    throw new LifecycleRequestError(401, null, false);
  }
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    const code =
      parsed &&
      typeof parsed === 'object' &&
      'code' in parsed &&
      isConflictCode((parsed as { code: unknown }).code)
        ? (parsed as { code: ConflictCode }).code
        : null;
    throw new LifecycleRequestError(response.status, code, response.status >= 500);
  }
  if (parsed === null) throw new LifecycleRequestError(response.status, null, true);
  return { status: response.status, body: parsed as T };
}

export const jsonInit = (method: string, payload: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

/** Plain-language explanation of a failed request for a person (never raw JSON or an internal id). */
export function failureMessage(error: unknown, action: string): string {
  if (!(error instanceof LifecycleRequestError))
    return 'Something unexpected happened while ' + action + '. Reload the page and try again.';
  if (error.code) return conflictMessages[error.code];
  if (error.unconfirmed)
    return (
      'The result of ' +
      action +
      ' could not be confirmed. Nothing is repeated automatically. Reload to see what was saved, or use the retry button to send exactly the same request again.'
    );
  if (error.status === 403)
    return 'Your current account is not allowed to do this. Reload after access is restored.';
  if (error.status === 404)
    return 'That record is no longer available to your account. Return to the list and choose again.';
  if (error.status === 409)
    return (
      'The records changed while ' + action + '. Reload and review the current details before trying again.'
    );
  if (error.status === 400) return 'Some of the details were not accepted. Check each field and try again.';
  return 'Could not complete ' + action + '. Reload the page and try again.';
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A stored calendar day shown without any time-zone shift. */
export function formatDay(day: string): string {
  if (!DAY.test(day)) return day;
  const parsed = new Date(day + 'T00:00:00Z');
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return day;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}
export function formatStamp(iso: string | null | undefined): string {
  if (!iso) return 'Not recorded';
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? 'Date unavailable'
    : parsed.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

export const kindLabels: Record<string, string> = {
  exam: 'Exam',
  quiz: 'Quiz',
  assignment: 'Assignment',
  project: 'Project',
};
export const kindLabel = (kind: string) => kindLabels[kind] ?? kind;
export const stateLabels = {
  draft: 'Not published',
  published: 'Published',
  unpublished: 'Unpublished',
} as const;

export const newRequestId = () => crypto.randomUUID();

/** Reuse one request id for the same body so a retry after a lost acknowledgement is an exact replay; a changed body gets a new id. */
export function requestIdFor(slot: { current: { body: string; id: string } | null }, body: string): string {
  if (slot.current?.body === body) return slot.current.id;
  slot.current = { body, id: newRequestId() };
  return slot.current.id;
}

export const maximumPattern = /^\d{1,7}$/;
