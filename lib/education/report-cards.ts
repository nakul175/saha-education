import type { Principal } from './types';
import { getDb } from '@/db/index';
import type { SelectReportCard, InsertReportCard } from '@/db/schema';
import { reportCards, students } from '@/db/schema';
import { reportPublicationReceipts } from '@/db/report-publication-schema';
import { reportCardSchema } from './validation';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { LifecycleConflict } from './lifecycle-conflict';
import { AccessError, assertAdmin, assertStudentAccess, studentReferenceScope, studentScope } from './access';

function scope(principal: Principal) {
  return and(
    studentReferenceScope(principal, reportCards.studentId),
    principal.role === 'guardian' || principal.role === 'student'
      ? isNotNull(reportCards.publishedAt)
      : undefined,
  );
}
export async function listReportCards(principal: Principal, studentId?: string): Promise<SelectReportCard[]> {
  return await getDb()
    .select()
    .from(reportCards)
    .where(and(scope(principal), studentId ? eq(reportCards.studentId, studentId) : undefined));
}
export async function getReportCard(principal: Principal, id: string): Promise<SelectReportCard | null> {
  const [record] = await getDb()
    .select()
    .from(reportCards)
    .where(and(eq(reportCards.id, id), scope(principal)))
    .limit(1);
  return record ?? null;
}
export async function createReportCard(
  principal: Principal,
  input: Omit<InsertReportCard, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<SelectReportCard> {
  assertAdmin(principal);
  const data = reportCardSchema.parse(input);
  await assertStudentAccess(principal, data.studentId);
  const now = new Date().toISOString();
  const [record] = await getDb()
    .insert(reportCards)
    .select(
      sql`select ${crypto.randomUUID()}, ${data.studentId},
    ${data.term}, ${data.summary ?? null}, ${data.overallGrade}, null, ${now}, ${now}
    where exists (select 1 from students where ${students.id} = ${data.studentId} and ${studentScope(principal)})`,
    )
    .returning();
  if (!record) throw new AccessError('Report authority changed; reload before saving', 409);
  return record;
}
export async function publishReportCard(principal: Principal, id: string): Promise<SelectReportCard | null> {
  assertAdmin(principal);
  const existing = await getReportCard(principal, id);
  if (!existing) throw new AccessError('Report card not found', 404);
  if (existing.publishedAt) return existing;
  const db = getDb();
  const now = new Date().toISOString();
  let committed = false;
  try {
    const receipts = await db
      .insert(reportPublicationReceipts)
      .select(
        sql`select ${crypto.randomUUID()}, report.id,
      report.student_id, ${principal.schoolId}, ${principal.id}, ${now} from report_cards report
      where report.id = ${id} and report.student_id = ${existing.studentId} and report.published_at is null
      and exists (select 1 from students where ${students.id} = report.student_id and ${studentScope(principal)})`,
      )
      .onConflictDoNothing({ target: reportPublicationReceipts.reportId })
      .returning();
    committed = receipts.length === 1;
  } catch (error) {
    let cause: unknown = error;
    for (let depth = 0; depth < 5 && cause instanceof Error; depth++) {
      if (cause.message.includes('saha_report_stale_lines')) throw new LifecycleConflict('results_changed');
      if (cause.message.includes('saha_report_publication_conflict'))
        throw new AccessError('Report authority changed; reload before publishing', 409);
      cause = cause.cause;
    }
    throw error;
  }
  // The receipt trigger publishes and selects recipients in one SQL statement.
  // A concurrent loser only reads the winner; it never assembles more notices.
  const published = await getReportCard(principal, id);
  if (!committed && !published?.publishedAt)
    throw new AccessError('Report authority changed; reload before publishing', 409);
  return published;
}
