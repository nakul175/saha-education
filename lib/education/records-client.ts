// Browser helpers shared by the school setup and record pages. Presentation only: the server re-checks every
// session, role, school and version, so nothing here grants or widens access.
import type { Principal } from './types';

export type ApiResult<T> = { ok: boolean; status: number; data: T | null; reason?: string; fields?: string[]; unreachable?: boolean };

/** One JSON request. A thrown fetch is reported as `unreachable`, which for a mutation means the outcome is unknown. */
export async function api<T>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method, cache: 'no-store', signal,
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return { ok: false, status: 0, data: null, unreachable: true };
  }
  let text = '';
  try { text = await response.text(); } catch { return { ok: false, status: 0, data: null, unreachable: true }; }
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
  if (response.ok) return { ok: parsed !== null, status: response.status, data: parsed as T };
  const failure = (parsed ?? {}) as { reason?: unknown; fields?: unknown };
  return {
    ok: false, status: response.status, data: null,
    reason: typeof failure.reason === 'string' ? failure.reason : undefined,
    fields: Array.isArray(failure.fields) ? failure.fields.filter((item): item is string => typeof item === 'string') : undefined,
  };
}

export async function loadPrincipal(signal?: AbortSignal): Promise<{ principal: Principal | null; signedOut: boolean; failed: boolean }> {
  const result = await api<Principal>('GET', '/api/session', undefined, signal);
  if (result.status === 401) return { principal: null, signedOut: true, failed: false };
  const value = result.data;
  if (!result.ok || !value || typeof value.id !== 'string' || !['admin', 'teacher', 'guardian', 'student'].includes(value.role)) return { principal: null, signedOut: false, failed: true };
  return { principal: value, signedOut: false, failed: false };
}

export const requestId = () => crypto.randomUUID();

const conflictText: Record<string, string> = {
  stale: 'Someone else changed this record after you opened it, so nothing was saved. Your edits are still on screen.',
  'admission-number': 'That admission number is already used by another student record.',
  'already-linked': 'This guardian is already linked to the student.',
  'not-linked': 'This guardian is not linked to the student any more.',
  'already-inactive': 'This student is already inactive.',
  'already-active': 'This student is already active.',
  'no-change': 'Nothing was changed, so nothing was saved.',
  'term-overlap': 'These dates overlap another term in the same school.',
  'term-duplicate': 'A term with this name already exists for that academic year.',
  'term-unavailable': 'The chosen current term is not available for this school.',
  'request-reused': 'This request was already used for a different change. Reload and try again.',
  authority: 'Your access changed while saving, so nothing was saved. Reload to check your access.',
};

export function failureText(result: ApiResult<unknown>, labels: Record<string, string> = {}): string {
  if (result.unreachable) return 'The connection was lost, so we could not confirm whether this was saved. Reload and check before trying again.';
  if (result.status === 401) return 'Your sign-in has ended. Sign in again to continue.';
  if (result.status === 403) return 'Your account is not allowed to do this.';
  if (result.status === 404) return 'That record is not available to your account.';
  if (result.status === 409) return conflictText[result.reason ?? ''] ?? 'This changed while you were working, so nothing was saved. Reload and try again.';
  if (result.status === 400) {
    const names = (result.fields ?? []).map(name => labels[name] ?? name).filter(Boolean);
    return names.length ? 'Please check: ' + names.join(', ') + '.' : 'Please check the details you entered.';
  }
  if (result.status === 429) return 'Too many requests. Wait a moment and try again.';
  return 'Something went wrong on our side. Nothing was confirmed as saved; reload and check before trying again.';
}

export const isStale = (result: ApiResult<unknown>) => result.status === 409 && result.reason === 'stale';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** `2026-10-06` or an ISO timestamp as `6 Oct 2026`; anything unexpected is shown as is, never repaired. */
export function shortDate(value: string | null | undefined): string {
  if (!value) return 'Not set';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const month = months[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month} ${match[1]}` : value;
}
export function dateTime(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value);
  return match ? `${shortDate(match[1])}, ${match[2]} UTC` : value;
}
