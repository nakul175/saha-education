import { z } from 'zod';
import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/index';
import { schools, users } from '@/db/schema';
import { schoolSetupSettings, schoolSetupTerms } from '@/db/school-records-schema';
import { AccessError, assertAdmin, assertPrincipal, livePrincipalScope } from './access';
import { RecordConflict, calendarDate, constraintFailure, nextStamp, optionalText, plainText, requestIdSchema, timestampSchema, versionSchema, identifier } from './record-support';
import type { Principal } from './types';

export type SchoolTermView = { id: string; academicYear: string; name: string; startsOn: string; endsOn: string; version: number; updatedAt: string };
export type SchoolSetupView = {
  school: { id: string; name: string; address: string | null; updatedAt: string };
  settings: { academicYear: string | null; contactEmail: string | null; contactPhone: string | null; currentTermId: string | null; version: number; updatedAt: string | null };
  terms: SchoolTermView[];
};

const academicYear = z.union([z.null(), z.string().trim()]).transform(value => value === null || value === '' ? null : value)
  .refine(value => value === null || /^[A-Za-z0-9][A-Za-z0-9 /–-]{0,19}$/.test(value), 'Use a short label such as 2026-27');
const email = optionalText('Contact email', 254).refine(value => value === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'Enter a valid email address');
const phone = optionalText('Contact phone', 30).refine(value => value === null || (/^[0-9+() .-]{3,30}$/.test(value) && /\d{3}/.test(value)), 'Enter a valid phone number');
export const schoolSetupSchema = z.object({
  name: plainText('School name', 120), address: optionalText('Address', 300),
  academicYear, contactEmail: email, contactPhone: phone, currentTermId: z.union([z.null(), identifier]),
  expectedVersion: versionSchema, expectedUpdatedAt: timestampSchema,
}).strict();
export type SchoolSetupInput = z.infer<typeof schoolSetupSchema>;
const termFields = {
  academicYear: plainText('Academic year', 20).refine(value => /^[A-Za-z0-9][A-Za-z0-9 /–-]*$/.test(value), 'Use a short label such as 2026-27'),
  name: plainText('Term name', 60), startsOn: calendarDate, endsOn: calendarDate,
};
export const termCreateSchema = z.object({ clientRequestId: requestIdSchema, ...termFields }).strict().refine(value => value.endsOn >= value.startsOn, { message: 'The term must end on or after its start', path: ['endsOn'] });
export const termUpdateSchema = z.object({ ...termFields, expectedVersion: versionSchema }).strict().refine(value => value.endsOn >= value.startsOn, { message: 'The term must end on or after its start', path: ['endsOn'] });

async function liveActor(principal: Principal): Promise<void> {
  const [actor] = await getDb().select({ id: users.id }).from(users).where(and(eq(users.id, principal.id), livePrincipalScope(principal))).limit(1);
  if (!actor) throw new AccessError('School access required');
}
const termView = (row: typeof schoolSetupTerms.$inferSelect): SchoolTermView => ({ id: row.id, academicYear: row.academicYear, name: row.name, startsOn: row.startsOn, endsOn: row.endsOn, version: row.version, updatedAt: row.updatedAt });

export async function getSchoolSetup(principal: Principal, id: string): Promise<SchoolSetupView> {
  assertPrincipal(principal);
  const db = getDb();
  const [school] = await db.select().from(schools).where(and(eq(schools.id, id), eq(schools.id, principal.schoolId!), livePrincipalScope(principal))).limit(1);
  if (!school) throw new AccessError('School not found', 404);
  const [settings] = await db.select().from(schoolSetupSettings).where(eq(schoolSetupSettings.schoolId, id)).limit(1);
  const terms = await db.select().from(schoolSetupTerms).where(eq(schoolSetupTerms.schoolId, id)).orderBy(asc(schoolSetupTerms.startsOn), asc(schoolSetupTerms.id)).limit(200);
  // Authority is rechecked after assembly so a revoked account never receives a late snapshot.
  await liveActor(principal);
  return {
    school: { id: school.id, name: school.name, address: school.address, updatedAt: school.updatedAt },
    settings: { academicYear: settings?.academicYear ?? null, contactEmail: settings?.contactEmail ?? null, contactPhone: settings?.contactPhone ?? null,
      currentTermId: settings?.currentTermId ?? null, version: settings?.version ?? 0, updatedAt: settings?.updatedAt ?? null },
    terms: terms.map(termView),
  };
}

/** One atomic, version-checked save of the school basics and settings. A stale or revoked
 * administrator changes nothing, and the second write only runs if the first was applied. */
export async function updateSchoolSetup(principal: Principal, id: string, value: SchoolSetupInput): Promise<SchoolSetupView> {
  assertAdmin(principal);
  const input = schoolSetupSchema.parse(value);
  const db = getDb(), schoolId = principal.schoolId!;
  if (id !== schoolId) throw new AccessError('School not found', 404);
  const [existing] = await db.select().from(schools).where(and(eq(schools.id, id), livePrincipalScope(principal))).limit(1);
  if (!existing) throw new AccessError('School not found', 404);
  if (input.currentTermId !== null) {
    const [term] = await db.select({ id: schoolSetupTerms.id }).from(schoolSetupTerms).where(and(eq(schoolSetupTerms.id, input.currentTermId), eq(schoolSetupTerms.schoolId, schoolId))).limit(1);
    if (!term) throw new RecordConflict('term-unavailable');
  }
  const stamp = nextStamp(existing.updatedAt);
  const termKnown = input.currentTermId === null ? sql`1 = 1` : sql`exists (select 1 from school_setup_terms where id = ${input.currentTermId} and school_id = ${schoolId})`;
  try {
    await db.batch([
      db.update(schools).set({ name: input.name, address: input.address, updatedAt: stamp }).where(and(eq(schools.id, id), eq(schools.id, schoolId), eq(schools.updatedAt, input.expectedUpdatedAt), livePrincipalScope(principal),
        sql`coalesce((select version from school_setup_settings where school_id = ${id}), 0) = ${input.expectedVersion}`, termKnown)),
      db.insert(schoolSetupSettings).select(sql`select ${id}, ${input.academicYear}, ${input.contactEmail}, ${input.contactPhone}, ${input.currentTermId}, 1, ${principal.id}, ${stamp}
        where exists (select 1 from schools where id = ${id} and updated_at = ${stamp})`)
        .onConflictDoUpdate({ target: schoolSetupSettings.schoolId, set: { academicYear: input.academicYear, contactEmail: input.contactEmail, contactPhone: input.contactPhone,
          currentTermId: input.currentTermId, version: sql`${schoolSetupSettings.version} + 1`, updatedBy: principal.id, updatedAt: stamp } }),
    ]);
  } catch (error) { if (constraintFailure(error, /constraint/i)) throw new RecordConflict('stale'); throw error; }
  const [after] = await db.select({ updatedAt: schools.updatedAt }).from(schools).where(eq(schools.id, id)).limit(1);
  if (!after || after.updatedAt !== stamp) { await liveActor(principal); throw new RecordConflict('stale'); }
  return getSchoolSetup(principal, id);
}

function overlapping(schoolId: string, startsOn: string, endsOn: string, exceptId?: string) {
  return sql`exists (select 1 from school_setup_terms other where other.school_id = ${schoolId} and other.starts_on <= ${endsOn} and other.ends_on >= ${startsOn}
    ${exceptId ? sql`and other.id <> ${exceptId}` : sql``})`;
}
const uniqueName = /UNIQUE constraint failed: school_setup_terms\.school_id, school_setup_terms\.academic_year, school_setup_terms\.name/;

export async function createSchoolTerm(principal: Principal, schoolId: string, value: z.input<typeof termCreateSchema>): Promise<{ term: SchoolTermView; replayed: boolean }> {
  assertAdmin(principal);
  const input = termCreateSchema.parse(value);
  if (schoolId !== principal.schoolId) throw new AccessError('School not found', 404);
  const db = getDb(), stamp = nextStamp();
  let created: (typeof schoolSetupTerms.$inferSelect)[] = [];
  try {
    created = await db.insert(schoolSetupTerms).select(sql`select ${input.clientRequestId}, ${schoolId}, ${input.academicYear}, ${input.name}, ${input.startsOn}, ${input.endsOn}, 1, ${principal.id}, ${stamp}, ${stamp}
      where ${livePrincipalScope(principal)} and not ${overlapping(schoolId, input.startsOn, input.endsOn)}
      and not exists (select 1 from school_setup_terms where id = ${input.clientRequestId})`).returning();
  } catch (error) {
    if (constraintFailure(error, uniqueName)) throw new RecordConflict('term-duplicate');
    throw error;
  }
  if (created[0]) return { term: termView(created[0]), replayed: false };
  await liveActor(principal);
  const [existing] = await db.select().from(schoolSetupTerms).where(eq(schoolSetupTerms.id, input.clientRequestId)).limit(1);
  if (existing) {
    // The request UUID is the term identity: an exact retry returns the original, anything else cannot reuse it.
    if (existing.schoolId === schoolId && existing.createdBy === principal.id && existing.academicYear === input.academicYear && existing.name === input.name
      && existing.startsOn === input.startsOn && existing.endsOn === input.endsOn) return { term: termView(existing), replayed: true };
    throw new RecordConflict('request-reused');
  }
  throw new RecordConflict('term-overlap');
}

export async function updateSchoolTerm(principal: Principal, schoolId: string, termId: string, value: z.input<typeof termUpdateSchema>): Promise<SchoolTermView> {
  assertAdmin(principal);
  const input = termUpdateSchema.parse(value);
  if (schoolId !== principal.schoolId) throw new AccessError('School not found', 404);
  const db = getDb(), [current] = await db.select().from(schoolSetupTerms).where(and(eq(schoolSetupTerms.id, termId), eq(schoolSetupTerms.schoolId, schoolId))).limit(1);
  await liveActor(principal);
  if (!current) throw new AccessError('Term not found', 404);
  let updated: (typeof schoolSetupTerms.$inferSelect)[] = [];
  try {
    updated = await db.update(schoolSetupTerms).set({ academicYear: input.academicYear, name: input.name, startsOn: input.startsOn, endsOn: input.endsOn,
      version: sql`${schoolSetupTerms.version} + 1`, updatedAt: nextStamp(current.updatedAt) })
      .where(and(eq(schoolSetupTerms.id, termId), eq(schoolSetupTerms.schoolId, schoolId), eq(schoolSetupTerms.version, input.expectedVersion), livePrincipalScope(principal),
        sql`not ${overlapping(schoolId, input.startsOn, input.endsOn, termId)}`)).returning();
  } catch (error) {
    if (constraintFailure(error, uniqueName)) throw new RecordConflict('term-duplicate');
    throw error;
  }
  if (updated[0]) return termView(updated[0]);
  await liveActor(principal);
  const [now] = await db.select().from(schoolSetupTerms).where(eq(schoolSetupTerms.id, termId)).limit(1);
  throw new RecordConflict(now && now.version !== input.expectedVersion ? 'stale' : 'term-overlap');
}
