import { z } from 'zod';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { readingImportDrafts, readingImportItems, readingImportReceipts } from '@/db/reading-import-schema';
import { readingCheckInputSchema } from './reading-checks';
import { AccessError, assertPrincipal, livePrincipalScope } from './access';
import { digest } from './identity';
import type { Principal } from './types';

const identifier = z.string().min(1).max(120);
const plain = (max: number) => z.string().min(1).max(max).refine(value => value === value.trim() && !/[\u0000-\u001f\u007f<>]/u.test(value), 'Use an exact plain reference without surrounding whitespace');
const row = readingCheckInputSchema.innerType().omit({ clientCheckId: true, classId: true }).extend({ externalReference: plain(200) }).strict()
  .refine(value => value.wordsCorrect <= value.wordsAttempted, { message: 'Correct words cannot exceed attempted words', path: ['wordsCorrect'] });
export const readingImportEnvelopeSchema = z.object({ format: z.literal('saha.reading-results.v1'), classId: identifier,
  sourceLabel: plain(120), sourceReference: plain(200), rows: z.array(row).min(1).max(25),
}).strict().superRefine((value, context) => {
  const refs = new Set<string>();
  value.rows.forEach((row, index) => { if (refs.has(row.externalReference)) context.addIssue({ code: 'custom', path: ['rows', index, 'externalReference'], message: 'Each source result needs a distinct stable reference' }); refs.add(row.externalReference); });
});
export const stageReadingImportSchema = z.object({ clientImportId: z.string().uuid(), envelope: readingImportEnvelopeSchema }).strict();
export const readingImportDecisionSchema = z.object({ clientDecisionId: z.string().uuid(), expectedRevision: z.literal(0), action: z.enum(['confirm', 'reject']),
  confirmReviewed: z.literal(true), reason: plain(1000),
}).strict();
export type ReadingImportEnvelope = z.infer<typeof readingImportEnvelopeSchema>;
export type ReadingImportDraft = Omit<typeof readingImportDrafts.$inferSelect, 'rowsJson' | 'requestHash' | 'decisionHash'>;
export type ReadingImportItem = typeof readingImportItems.$inferSelect & { durationSeconds: number; wcpm: number; accuracy: number; eligible: boolean; receipt: typeof readingImportReceipts.$inferSelect | null };
export type ReadingImport = { draft: ReadingImportDraft; items: ReadingImportItem[] };
export class ReadingImportConflict extends Error { constructor() { super('Reading import conflict'); this.name = 'ReadingImportConflict'; } }
export function assertImportStaff(principal: Principal) {
  assertPrincipal(principal);
  if (principal.role !== 'teacher' && principal.role !== 'admin') throw new AccessError('Staff import access required');
}
function live(principal: Principal) {
  assertImportStaff(principal);
  return livePrincipalScope(principal);
}
function scope(principal: Principal) {
  return and(eq(readingImportDrafts.schoolId, principal.schoolId!), live(principal),
    principal.role === 'teacher' ? eq(readingImportDrafts.createdBy, principal.id) : undefined,
    sql`exists (select 1 from classes c where c.id=${readingImportDrafts.classId} and c.school_id=${principal.schoolId} and (${principal.role}='admin' or c.teacher_id=${principal.id}))`,
    sql`not exists (select 1 from reading_import_items i left join students s on s.id=i.student_id where i.import_id=${readingImportDrafts.id} and (s.id is null or s.school_id<>${principal.schoolId}))`);
}
function allActive() {
  return sql`not exists (select 1 from reading_import_items i where i.import_id=${readingImportDrafts.id} and not exists
    (select 1 from enrolments e where e.class_id=${readingImportDrafts.classId} and e.student_id=i.student_id and e.status='active'))`;
}
function safe(row: typeof readingImportDrafts.$inferSelect): ReadingImportDraft {
  const { rowsJson, requestHash, decisionHash, ...draft } = row; void rowsJson; void requestHash; void decisionHash; return draft;
}
async function requiredDraft(principal: Principal, id: string) {
  const [draft] = await getDb().select().from(readingImportDrafts).where(and(eq(readingImportDrafts.id, identifier.parse(id)), scope(principal))).limit(1);
  if (!draft) throw new AccessError('Import not found', 404); return draft;
}
export async function getReadingImport(principal: Principal, id: string): Promise<ReadingImport> {
  assertImportStaff(principal);
  await requiredDraft(principal, id);
  const rows = await getDb().select({ draft: readingImportDrafts, item: readingImportItems, receipt: readingImportReceipts, eligible: sql<number>`exists (select 1 from enrolments e
    where e.class_id=${readingImportDrafts.classId} and e.student_id=${readingImportItems.studentId} and e.status='active')` }).from(readingImportItems)
    .innerJoin(readingImportDrafts, eq(readingImportDrafts.id, readingImportItems.importId))
    .leftJoin(readingImportReceipts, eq(readingImportReceipts.itemId, readingImportItems.id))
    .where(and(eq(readingImportDrafts.id, id), scope(principal))).orderBy(asc(readingImportItems.externalReference));
  if (!rows.length) throw new AccessError('Import not found', 404);
  return { draft: safe(rows[0].draft), items: rows.map(({ item, receipt, eligible }) => ({ ...item, receipt, eligible: Boolean(eligible), durationSeconds: item.durationMs / 1000,
    wcpm: Math.round(item.wordsCorrect * 60000 / item.durationMs), accuracy: Math.round(item.wordsCorrect * 100 / item.wordsAttempted) })) };
}
export async function listReadingImports(principal: Principal): Promise<ReadingImportDraft[]> {
  assertImportStaff(principal);
  return (await getDb().select().from(readingImportDrafts).where(scope(principal)).orderBy(desc(readingImportDrafts.createdAt), asc(readingImportDrafts.id)).limit(100)).map(safe);
}
export async function stageReadingImport(principal: Principal, value: z.infer<typeof stageReadingImportSchema>): Promise<ReadingImport> {
  assertImportStaff(principal); const input = stageReadingImportSchema.parse(value), envelope = input.envelope;
  const hash = await digest(JSON.stringify(envelope)), db = getDb();
  const [already] = await db.select().from(readingImportDrafts).where(eq(readingImportDrafts.id, input.clientImportId)).limit(1);
  if (already) {
    if (already.createdBy !== principal.id || already.schoolId !== principal.schoolId || already.requestHash !== hash) throw new ReadingImportConflict();
    return getReadingImport(principal, input.clientImportId);
  }
  const rowsJson = JSON.stringify(envelope.rows.map(row => ({ ...row, id: crypto.randomUUID(), readingCheckId: crypto.randomUUID(), durationMs: Math.round(row.durationSeconds * 1000) })));
  const [created] = await db.insert(readingImportDrafts).select(sql`select ${input.clientImportId},${principal.schoolId},${envelope.classId},${principal.id},
    ${envelope.sourceLabel},${envelope.sourceReference},${hash},${rowsJson},'staged',0,${new Date().toISOString()},null,null,null,null,null
    from classes c where c.id=${envelope.classId} and c.school_id=${principal.schoolId} and (${principal.role}='admin' or c.teacher_id=${principal.id}) and ${live(principal)}
    and not exists (select 1 from json_each(${rowsJson}) r where not exists (select 1 from students s join enrolments e on e.student_id=s.id
      where s.id=json_extract(r.value,'$.studentId') and s.school_id=${principal.schoolId} and e.class_id=c.id and e.status='active')) limit 1`).onConflictDoNothing().returning();
  if (!created) {
    const existing = await requiredDraft(principal, input.clientImportId);
    if (existing.createdBy !== principal.id || existing.requestHash !== hash) throw new ReadingImportConflict();
  }
  return getReadingImport(principal, input.clientImportId);
}
function uniqueFailure(error: unknown): boolean { return error instanceof Error && (/UNIQUE constraint failed|PRIMARY KEY constraint failed/i.test(error.message) || uniqueFailure(error.cause)); }
export async function decideReadingImport(principal: Principal, id: string, value: z.infer<typeof readingImportDecisionSchema>): Promise<ReadingImport> {
  assertImportStaff(principal); const input = readingImportDecisionSchema.parse(value);
  const hash = await digest(JSON.stringify(input)), existing = await requiredDraft(principal, id);
  if (existing.status !== 'staged') {
    if (existing.decisionId !== input.clientDecisionId || existing.decisionHash !== hash || existing.reviewedBy !== principal.id) throw new ReadingImportConflict();
    return getReadingImport(principal, id);
  }
  try {
    const [changed] = await getDb().update(readingImportDrafts).set({ status: input.action === 'confirm' ? 'confirmed' : 'rejected', revision: 1,
      decisionId: input.clientDecisionId, decisionHash: hash, reviewedBy: principal.id, reviewedAt: new Date().toISOString(), reason: input.reason })
      .where(and(eq(readingImportDrafts.id, id), eq(readingImportDrafts.status, 'staged'), eq(readingImportDrafts.revision, input.expectedRevision), scope(principal), input.action === 'confirm' ? allActive() : undefined)).returning();
    if (!changed) {
      const current = await requiredDraft(principal, id);
      if (current.decisionId !== input.clientDecisionId || current.decisionHash !== hash || current.reviewedBy !== principal.id) throw new ReadingImportConflict();
    }
  } catch (error) { if (uniqueFailure(error)) throw new ReadingImportConflict(); throw error; }
  return getReadingImport(principal, id);
}
