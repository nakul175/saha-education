// School-local attendance calendar: which timezone defines "today" for a school and
// whether a future date may be recorded. Dates themselves stay literal YYYY-MM-DD text.
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { users } from '@/db/schema';
import { schoolAttendanceSettings } from '@/db/attendance-workflow-schema';
import { AccessError, assertAdmin, assertPrincipal, livePrincipalScope } from './access';
import type { Principal } from './types';

/** No configured row means the pre-existing behaviour: UTC calendar days, future dates allowed. */
export const DEFAULT_ATTENDANCE_TIMEZONE = 'UTC';

export type AttendanceCalendar = {
  timezone: string;
  configured: boolean;
  futureDatesAllowed: boolean;
  /** The school-local calendar date at `asOf`. */
  schoolDate: string;
  asOf: string;
  updatedAt: string | null;
};

/**
 * The name to store, or null if the runtime does not know the zone. Only letter case is normalised:
 * the runtime may map an alias (Asia/Kolkata) to a different legacy name, and the administrator's
 * own choice must survive unchanged.
 */
export function canonicalTimeZone(value: string): string | null {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_+/-]{1,64}$/.test(value)) return null;
  try {
    const resolved = new Intl.DateTimeFormat('en-CA', { timeZone: value }).resolvedOptions().timeZone;
    return resolved.toLowerCase() === value.toLowerCase() ? resolved : value;
  } catch {
    return null;
  }
}

/** The calendar date on a school's wall calendar at an instant. Never uses the server or browser zone. */
export function schoolLocalDate(instant: Date, timeZone: string): string {
  const zone = canonicalTimeZone(timeZone);
  if (!zone || !Number.isFinite(instant.getTime()))
    throw new RangeError('A valid instant and IANA timezone are required');
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`;
}

export const attendanceCalendarInputSchema = z
  .object({
    timezone: z
      .string()
      .trim()
      .refine(
        (value) => canonicalTimeZone(value) !== null,
        'A recognised IANA timezone such as Africa/Kigali is required',
      ),
    futureDatesAllowed: z.boolean(),
  })
  .strict();
export type AttendanceCalendarInput = z.infer<typeof attendanceCalendarInputSchema>;

/** Null when the actor is no longer a live member of the school; callers decide how to deny. */
export async function readAttendanceCalendar(
  principal: Principal,
  now: Date = new Date(),
): Promise<AttendanceCalendar | null> {
  assertPrincipal(principal);
  const [row] = await getDb()
    .select({
      timezone: schoolAttendanceSettings.timezone,
      future: schoolAttendanceSettings.futureDatesAllowed,
      updatedAt: schoolAttendanceSettings.updatedAt,
      actor: users.id,
    })
    .from(users)
    .leftJoin(schoolAttendanceSettings, eq(schoolAttendanceSettings.schoolId, users.schoolId))
    .where(sql`${users.id} = ${principal.id} and ${livePrincipalScope(principal)}`)
    .limit(1);
  if (!row) return null;
  // A stored name the runtime cannot resolve must not make the whole workflow unusable or silently shift days.
  const stored = row.timezone === null ? null : canonicalTimeZone(row.timezone);
  const timezone = stored ?? DEFAULT_ATTENDANCE_TIMEZONE;
  return {
    timezone,
    configured: stored !== null,
    futureDatesAllowed: row.timezone === null ? true : row.future === 1,
    schoolDate: schoolLocalDate(now, timezone),
    asOf: now.toISOString(),
    updatedAt: row.timezone === null ? null : row.updatedAt,
  };
}

/** Readable by every current member of the school: it is not learner data. */
export async function getAttendanceCalendar(
  principal: Principal,
  now: Date = new Date(),
): Promise<AttendanceCalendar> {
  const calendar = await readAttendanceCalendar(principal, now);
  if (!calendar) throw new AccessError('School access required', 403);
  return calendar;
}

/** Administrator-only, actual-SQL guarded upsert. The current setting is returned after the write. */
export async function saveAttendanceCalendar(
  principal: Principal,
  input: AttendanceCalendarInput,
): Promise<AttendanceCalendar> {
  assertAdmin(principal);
  const data = attendanceCalendarInputSchema.parse(input);
  const timezone = canonicalTimeZone(data.timezone)!;
  const now = new Date();
  const rows = await getDb()
    .insert(schoolAttendanceSettings)
    .select(
      sql`select ${principal.schoolId}, ${timezone}, ${data.futureDatesAllowed ? 1 : 0},
    ${principal.id}, ${now.toISOString()} where ${livePrincipalScope(principal)}`,
    )
    .onConflictDoUpdate({
      target: schoolAttendanceSettings.schoolId,
      set: {
        timezone: sql`excluded.timezone`,
        futureDatesAllowed: sql`excluded.future_dates_allowed`,
        updatedBy: sql`excluded.updated_by`,
        updatedAt: sql`excluded.updated_at`,
      },
    })
    .returning();
  if (rows.length !== 1) throw new AccessError('School access required', 403);
  return getAttendanceCalendar(principal, now);
}

/** Server rule for a new reviewed save: a school that disallows future dates rejects them by school-local date. */
export function assertAttendanceDateAllowed(calendar: AttendanceCalendar, date: string): void {
  if (!calendar.futureDatesAllowed && date > calendar.schoolDate) {
    throw new AccessError('Attendance cannot be recorded for a date after the school calendar date', 400);
  }
}
