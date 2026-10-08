import { z } from 'zod';
import { AccessError, assertAdmin } from './access';
import { authenticated, body } from './http';
import { isExactCalendarDate } from './calendar-date';
import { isExactStoredTimestamp } from './stored-timestamp';
import type { Principal } from './types';

/** A definite, safe-to-explain 409. `reason` is a fixed code, never record content. */
export type ConflictReason =
  | 'stale'
  | 'admission-number'
  | 'already-linked'
  | 'not-linked'
  | 'already-inactive'
  | 'already-active'
  | 'no-change'
  | 'term-overlap'
  | 'term-duplicate'
  | 'term-unavailable'
  | 'request-reused'
  | 'authority';
export class RecordConflict extends AccessError {
  constructor(readonly reason: ConflictReason) {
    super('Record conflict', 409);
    this.name = 'RecordConflict';
  }
}

const control = /[\u0000-\u001f\u007f]/;
export const plainText = (label: string, max: number, min = 1) =>
  z
    .string()
    .trim()
    .refine((value) => Array.from(value).length >= min, label + ' is required')
    .refine((value) => Array.from(value).length <= max, label + ' is too long')
    .refine((value) => !control.test(value), label + ' contains unsupported characters');
export const optionalText = (label: string, max: number) =>
  z
    .union([z.null(), z.string().trim()])
    .transform((value) => (value === null || value === '' ? null : value))
    .refine(
      (value) => value === null || (Array.from(value).length <= max && !control.test(value)),
      label + ' is invalid',
    );
export const reasonSchema = z
  .string()
  .trim()
  .refine((value) => {
    const length = Array.from(value).length;
    return length >= 10 && length <= 500 && !control.test(value);
  }, 'Explain the change in 10 to 500 characters');
export const requestIdSchema = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const versionSchema = z.number().int().min(0).max(999999);
export const timestampSchema = z.string().refine(isExactStoredTimestamp, 'Reload the record before saving');
export const calendarDate = z.string().refine(isExactCalendarDate, 'Use a real calendar date');
export const identifier = z
  .string()
  .min(1)
  .max(120)
  .refine((value) => value === value.trim() && !control.test(value));

/** Newer than the previous stored value even inside the same millisecond. */
export function nextStamp(previous?: string | null): string {
  const now = new Date().toISOString();
  if (previous && isExactStoredTimestamp(previous) && now <= previous)
    return new Date(Date.parse(previous) + 1).toISOString();
  return now;
}
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function constraintFailure(error: unknown, pattern: RegExp): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if (pattern.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}

export async function digestOf(value: unknown): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Route wrapper: authenticate, then (for every mutation here) require an administrator before any body is parsed,
 * and report safe conflict reasons and field names. */
export function recordRoute(
  request: Request,
  mutation: boolean,
  action: (principal: Principal) => Promise<Response>,
): Promise<Response> {
  return authenticated(request, mutation, async (principal) => {
    try {
      if (mutation) assertAdmin(principal);
      return await action(principal);
    } catch (error) {
      if (error instanceof RecordConflict)
        return Response.json({ error: 'Conflict', reason: error.reason }, { status: 409 });
      if (error instanceof z.ZodError) {
        const fields = [
          ...new Set(error.issues.map((issue) => String(issue.path[0] ?? '')).filter(Boolean)),
        ].slice(0, 12);
        return Response.json({ error: 'Invalid request', fields }, { status: 400 });
      }
      throw error;
    }
  });
}

/** Raw JSON (size/encoding bounded by the shared parser) for services that parse with their own strict schema. */
export function jsonInput(request: Request): Promise<never> {
  return body(request, z.unknown()) as Promise<never>;
}
/** Search parameters with empty values dropped; unknown names are rejected by the strict service schema. */
export function searchInput(request: Request): never {
  const result: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) if (value !== '') result[key] = value;
  return result as never;
}
