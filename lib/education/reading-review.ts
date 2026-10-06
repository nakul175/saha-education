import { z } from 'zod';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/index';
import { readingChecks, type SelectReadingCheck } from '@/db/schema';
import { readingCorrections, type SelectReadingCorrection } from '@/db/reading-correction-schema';
import { AccessError, assertPrincipal, livePrincipalScope } from './access';
import { readingCheckInputSchema, type ReadingCheck } from './reading-checks';
import type { Principal } from './types';

const identifier = z.string().trim().min(1).max(120);
const numericFields = readingCheckInputSchema.innerType().pick({
  language: true, passageReference: true, readingDate: true,
  durationSeconds: true, wordsAttempted: true, wordsCorrect: true,
});
export const readingCorrectionInputSchema = numericFields.extend({
  clientCorrectionId: z.string().uuid(),
  expectedRevision: z.number().int().min(0).max(999999),
  confirmReviewed: z.literal(true),
  reason: z.string().trim().min(1).max(1000).refine(value => !/[\u0000-\u001f\u007f<>]/u.test(value), 'Use a plain correction reason'),
}).strict().refine(value => value.wordsCorrect <= value.wordsAttempted, {
  message: 'Correct words cannot exceed attempted words', path: ['wordsCorrect'],
});
export type ReadingCorrectionInput = z.infer<typeof readingCorrectionInputSchema>;
export type ReadingMetrics = Pick<SelectReadingCheck, 'language' | 'passageReference' | 'readingDate' | 'durationMs' | 'wordsAttempted' | 'wordsCorrect'> & {
  durationSeconds: number; wcpm: number; accuracy: number;
};
export type ReadingCorrection = SelectReadingCorrection & { durationSeconds: number; wcpm: number; accuracy: number };
export type ReadingReviewObservation = {
  original: ReadingCheck; effective: ReadingMetrics; revision: number; corrections: ReadingCorrection[];
};
export type ComparableReadingPoint = Pick<ReadingMetrics, 'readingDate' | 'durationSeconds' | 'wordsAttempted' | 'wordsCorrect' | 'wcpm' | 'accuracy'> & {
  checkId: string; revision: number;
};
export type ComparableReadingSeries = {
  studentId: string; classId: string; language: string; passageReference: string; durationMs: number;
  points: ComparableReadingPoint[];
};
export type ReadingReview = { observations: ReadingReviewObservation[]; series: ComparableReadingSeries[] };

export class ReadingReviewConflict extends Error {
  readonly status = 409;
  constructor() { super('Reading correction conflict'); this.name = 'ReadingReviewConflict'; }
}
export function assertReadingReviewStaff(principal: Principal): void {
  assertPrincipal(principal);
  if (principal.role !== 'admin' && principal.role !== 'teacher') throw new AccessError('Reading review is available to staff only');
}
function liveStaff(principal: Principal) {
  assertReadingReviewStaff(principal);
  return livePrincipalScope(principal);
}
// Historical evidence belongs to the original class. Withdrawal does not erase
// it: current assigned staff retain access while the student remains in school.
// The current class assignment, student school and enabled staff account are
// checked inside both reads and the actual correction INSERT.
function observationScope(principal: Principal) {
  return and(eq(readingChecks.schoolId, principal.schoolId!), liveStaff(principal),
    sql`exists (select 1 from classes c where c.id = ${readingChecks.classId} and c.school_id = ${principal.schoolId}
      and (${principal.role} = 'admin' or c.teacher_id = ${principal.id}))`,
    sql`exists (select 1 from students s where s.id = ${readingChecks.studentId} and s.school_id = ${principal.schoolId})`);
}
function metrics(row: Pick<SelectReadingCheck, 'language' | 'passageReference' | 'readingDate' | 'durationMs' | 'wordsAttempted' | 'wordsCorrect'>): ReadingMetrics {
  return { language: row.language, passageReference: row.passageReference, readingDate: row.readingDate,
    durationMs: row.durationMs, wordsAttempted: row.wordsAttempted, wordsCorrect: row.wordsCorrect,
    durationSeconds: row.durationMs / 1000,
    wcpm: Math.round(row.wordsCorrect * 60000 / row.durationMs),
    accuracy: Math.round(row.wordsCorrect * 100 / row.wordsAttempted) };
}
function correctionView(row: SelectReadingCorrection): ReadingCorrection { return { ...row, ...metrics(row) }; }
async function requiredCheck(principal: Principal, id: string): Promise<SelectReadingCheck> {
  assertReadingReviewStaff(principal);
  const [row] = await getDb().select().from(readingChecks).where(and(eq(readingChecks.id, identifier.parse(id)), observationScope(principal))).limit(1);
  if (!row) throw new AccessError('Reading observation not found', 404);
  return row;
}
async function retry(principal: Principal, id: string, readingCheckId: string, payload: Omit<SelectReadingCorrection, 'id' | 'correctedAt'>): Promise<ReadingCorrection> {
  const [existing] = await getDb().select({ correction: readingCorrections }).from(readingCorrections)
    .innerJoin(readingChecks, eq(readingChecks.id, readingCorrections.readingCheckId))
    .where(and(eq(readingCorrections.id, id), eq(readingChecks.id, readingCheckId), observationScope(principal))).limit(1);
  if (!existing || !Object.entries(payload).every(([key, value]) => existing.correction[key as keyof SelectReadingCorrection] === value)) throw new ReadingReviewConflict();
  return correctionView(existing.correction);
}
export async function appendReadingCorrection(principal: Principal, readingCheckId: string, input: ReadingCorrectionInput): Promise<ReadingCorrection> {
  assertReadingReviewStaff(principal);
  const data = readingCorrectionInputSchema.parse(input);
  await requiredCheck(principal, readingCheckId);
  const payload = { readingCheckId, revision: data.expectedRevision + 1, correctedBy: principal.id, reason: data.reason,
    language: data.language, passageReference: data.passageReference, readingDate: data.readingDate,
    durationMs: Math.round(data.durationSeconds * 1000), wordsAttempted: data.wordsAttempted, wordsCorrect: data.wordsCorrect };
  const db = getDb();
  const [already] = await db.select({ id: readingCorrections.id }).from(readingCorrections).where(eq(readingCorrections.id, data.clientCorrectionId)).limit(1);
  if (already) return retry(principal, data.clientCorrectionId, readingCheckId, payload);
  const [created] = await db.insert(readingCorrections).select(sql`select ${data.clientCorrectionId}, ${readingCheckId},
    ${payload.revision}, ${principal.id}, ${new Date().toISOString()}, ${data.reason}, ${data.language}, ${data.passageReference},
    ${data.readingDate}, ${payload.durationMs}, ${data.wordsAttempted}, ${data.wordsCorrect}
    from reading_checks where ${readingChecks.id} = ${readingCheckId} and ${observationScope(principal)}
      and coalesce((select max(rc.revision) from reading_corrections rc where rc.reading_check_id = ${readingCheckId}), 0) = ${data.expectedRevision}
    limit 1`).onConflictDoNothing().returning();
  if (created) return correctionView(created);
  // A failed write can be a simultaneous retry, a stale revision or revoked
  // authority. Recheck access before returning any retry evidence.
  await requiredCheck(principal, readingCheckId);
  return retry(principal, data.clientCorrectionId, readingCheckId, payload);
}
export async function listReadingCorrections(principal: Principal, readingCheckId: string): Promise<ReadingCorrection[]> {
  await requiredCheck(principal, readingCheckId);
  const rows = await getDb().select({ correction: readingCorrections }).from(readingCorrections)
    .innerJoin(readingChecks, eq(readingChecks.id, readingCorrections.readingCheckId))
    .where(and(eq(readingChecks.id, readingCheckId), observationScope(principal))).orderBy(asc(readingCorrections.revision));
  return rows.map(row => correctionView(row.correction));
}
export async function getReadingReview(principal: Principal, filter: { studentId?: string; classId?: string } = {}): Promise<ReadingReview> {
  assertReadingReviewStaff(principal);
  const filteredScope = and(observationScope(principal),
    filter.studentId ? eq(readingChecks.studentId, identifier.parse(filter.studentId)) : undefined,
    filter.classId ? eq(readingChecks.classId, identifier.parse(filter.classId)) : undefined);
  const rows = await getDb().select().from(readingChecks).where(filteredScope)
    .orderBy(desc(readingChecks.readingDate), desc(readingChecks.createdAt), asc(readingChecks.id));
  if (!rows.length) return { observations: [], series: [] };
  const corrections = await getDb().select({ correction: readingCorrections }).from(readingCorrections)
    .innerJoin(readingChecks, eq(readingChecks.id, readingCorrections.readingCheckId))
    .where(filteredScope).orderBy(asc(readingCorrections.revision));
  const history = new Map<string, ReadingCorrection[]>();
  for (const row of corrections) {
    const list = history.get(row.correction.readingCheckId) ?? [];
    list.push(correctionView(row.correction)); history.set(row.correction.readingCheckId, list);
  }
  const observations: ReadingReviewObservation[] = rows.map(row => {
    const corrections = history.get(row.id) ?? [], latest = corrections.at(-1);
    return { original: { ...row, ...metrics(row) }, effective: metrics(latest ?? row), revision: latest?.revision ?? 0, corrections };
  });
  const grouped = new Map<string, ComparableReadingSeries>();
  for (const observation of observations) {
    const { original, effective, revision } = observation;
    // Exact keys only; never pool pupils, classes, languages, passages or durations.
    const key = JSON.stringify([original.studentId, original.classId, effective.language, effective.passageReference, effective.durationMs]);
    const series = grouped.get(key) ?? { studentId: original.studentId, classId: original.classId,
      language: effective.language, passageReference: effective.passageReference, durationMs: effective.durationMs, points: [] };
    series.points.push({ checkId: original.id, revision, readingDate: effective.readingDate, durationSeconds: effective.durationSeconds,
      wordsAttempted: effective.wordsAttempted, wordsCorrect: effective.wordsCorrect, wcpm: effective.wcpm, accuracy: effective.accuracy });
    grouped.set(key, series);
  }
  const series = Array.from(grouped.values());
  for (const group of series) group.points.sort((a, b) => a.readingDate.localeCompare(b.readingDate) || a.checkId.localeCompare(b.checkId));
  return { observations, series };
}
