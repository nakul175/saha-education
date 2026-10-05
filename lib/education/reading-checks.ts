import { z } from 'zod';
import { and, asc, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db/index';
import { readingChecks, type SelectReadingCheck } from '@/db/schema';
import type { Principal } from './types';
import { AccessError, assertPrincipal, assertClassWrite, assertStudentInClass, studentReferenceScope, classReferenceScope } from './access';

const SOURCE_APP = 'oral-reading-fluency';
const PROVENANCE = 'manual-reviewed-external';
function validReadingDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value <= new Date().toISOString().slice(0, 10);
}
const identifier = z.string().trim().min(1).max(120);
// No author, source, school, calculated score, transcript or recording is accepted.
export const readingCheckInputSchema = z.object({
  clientCheckId: z.string().uuid().optional(),
  classId: identifier,
  studentId: identifier,
  language: z.string().trim().min(2).max(35).regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/),
  passageReference: z.string().trim().min(1).max(200).refine(value => !/[\u0000-\u001f\u007f<>]/u.test(value), 'Use a plain passage reference'),
  readingDate: z.string().refine(validReadingDate, 'Use a valid reading date no later than today (UTC)'),
  durationSeconds: z.number().finite().min(1).max(3600),
  wordsAttempted: z.number().int().min(1).max(500),
  wordsCorrect: z.number().int().min(0).max(500),
}).strict().refine(value => value.wordsCorrect <= value.wordsAttempted, { message: 'Correct words cannot exceed attempted words', path: ['wordsCorrect'] });
export type ReadingCheckInput = z.infer<typeof readingCheckInputSchema>;
export type ReadingCheck = SelectReadingCheck & { durationSeconds: number; wcpm: number; accuracy: number };

export class ReadingCheckConflict extends Error {
  constructor() { super('Reading check conflict'); this.name = 'ReadingCheckConflict'; }
}
function staff(principal: Principal): void {
  assertPrincipal(principal);
  if (principal.role !== 'admin' && principal.role !== 'teacher') throw new AccessError('Reviewed readings are available to staff only');
}
function scope(principal: Principal) {
  assertPrincipal(principal);
  return and(eq(readingChecks.schoolId, principal.schoolId),
    studentReferenceScope(principal, readingChecks.studentId), classReferenceScope(principal, readingChecks.classId));
}
function view(row: SelectReadingCheck): ReadingCheck {
  return { ...row, durationSeconds: row.durationMs / 1000,
    wcpm: Math.round(row.wordsCorrect * 60000 / row.durationMs),
    accuracy: Math.round(row.wordsCorrect * 100 / row.wordsAttempted) };
}
export async function listReadingChecks(principal: Principal, filter: { studentId?: string; classId?: string } = {}): Promise<ReadingCheck[]> {
  staff(principal);
  const rows = await getDb().select().from(readingChecks).where(and(scope(principal),
    filter.studentId ? eq(readingChecks.studentId, identifier.parse(filter.studentId)) : undefined,
    filter.classId ? eq(readingChecks.classId, identifier.parse(filter.classId)) : undefined))
    .orderBy(desc(readingChecks.readingDate), desc(readingChecks.createdAt), asc(readingChecks.id));
  return rows.map(view);
}
export async function createReadingCheck(principal: Principal, input: ReadingCheckInput): Promise<ReadingCheck> {
  staff(principal);
  const data = readingCheckInputSchema.parse(input);
  await assertClassWrite(principal, data.classId);
  await assertStudentInClass(principal, data.studentId, data.classId);
  const payload = { schoolId: principal.schoolId!, classId: data.classId, studentId: data.studentId,
    recordedBy: principal.id, sourceAppId: SOURCE_APP, provenance: PROVENANCE,
    language: data.language, passageReference: data.passageReference, readingDate: data.readingDate,
    durationMs: Math.round(data.durationSeconds * 1000), wordsAttempted: data.wordsAttempted, wordsCorrect: data.wordsCorrect };
  const db = getDb();
  const id = data.clientCheckId ?? crypto.randomUUID();
  // A caller-generated UUID is a retry key, not permission to overwrite a record.
  const [created] = await db.insert(readingChecks).values({ ...payload, id, createdAt: new Date().toISOString() }).onConflictDoNothing().returning();
  if (created) return view(created);
  const [existing] = await db.select().from(readingChecks).where(and(eq(readingChecks.id, id), eq(readingChecks.recordedBy, principal.id), scope(principal))).limit(1);
  if (!existing || !Object.entries(payload).every(([key, value]) => existing[key as keyof SelectReadingCheck] === value)) throw new ReadingCheckConflict();
  return view(existing);
}
