import { z } from 'zod';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/db';
import { reportCards, students } from '@/db/schema';
import { reportCardCorrections, reportCardLines } from '@/db/assessment-lifecycle-schema';
import { AccessError, assertAdmin, assertStudentAccess, studentScope, livePrincipalScope } from './access';
import { LifecycleConflict, errorChainIncludes } from './lifecycle-conflict';
import { getReportCard } from './report-cards';
import { reportCardSchema } from './validation';
import type { SelectReportCard } from '@/db/schema';
import type { Principal } from './types';

const identifier = z.string().min(1).max(120);
const reasonText = z.string().trim().refine(value => [...value].length >= 10 && [...value].length <= 500).refine(value => !/[\x00-\x1f\x7f]/.test(value));
const noControl = (value: string) => !/[\x00-\x1f\x7f]/.test(value);

// The legacy draft schema stays unchanged. Compiling adds optional published-result lines and a correction link;
// grades and summaries are still typed by the school, never calculated from scores.
export const reportCompileSchema = reportCardSchema.extend({
  assessmentIds: z.array(identifier).max(50).optional(),
  correction: z.object({ reportId: identifier, reason: reasonText }).strict().optional(),
});
export type ReportCompileInput = z.infer<typeof reportCompileSchema>;
const compileFields = z.object({
  studentId: identifier,
  term: z.string().trim().min(1).max(200).refine(noControl),
  summary: z.string().max(4000).optional(),
  overallGrade: z.string().trim().min(1).max(200).refine(noControl),
});

export type EligibleResult = { assessmentId: string; title: string; kind: string; date: string; maxScore: number; score: number; grade: string | null;
  classId: string; className: string; publishedAt: string; inReports: number };

export async function listEligibleResults(principal: Principal, studentId: string): Promise<EligibleResult[]> {
  assertAdmin(principal); identifier.parse(studentId);
  const school = principal.schoolId as string;
  const payload = sql<string>`(select coalesce(json_group_array(json(shown.item)),'[]') from (
    select json_object('assessmentId',a.id,'title',a.title,'kind',a.kind,'date',a.date,'maxScore',a.max_score,'score',r.score,'grade',r.grade,
      'classId',a.class_id,'className',c.name,'publishedAt',latest.created_at,
      'inReports',(select count(*) from report_card_lines line where line.assessment_id=a.id and line.student_id=r.student_id)) item
    from assessment_results r join assessments a on a.id=r.assessment_id join classes c on c.id=a.class_id
    join assessment_publications latest on latest.id=(select q.id from assessment_publications q where q.assessment_id=a.id order by q.rowid desc limit 1) and latest.action='publish'
    where r.student_id=${studentId} and c.school_id=${school}
      and exists (select 1 from enrolments pair where pair.student_id=r.student_id and pair.class_id=a.class_id)
      and typeof(r.score)='integer' and typeof(a.max_score)='integer' and r.score between 0 and a.max_score
      and (select count(*) from assessment_results twin where twin.assessment_id=a.id and twin.student_id=r.student_id)=1
    order by a.date, a.title, a.id limit 100) shown)`;
  const [row] = await getDb().select({ payload }).from(students).where(and(eq(students.id, studentId), studentScope(principal))).limit(1);
  if (!row) throw new AccessError('Student not found', 404);
  return JSON.parse(row.payload) as EligibleResult[];
}

async function assertCorrectable(principal: Principal, studentId: string, reportId: string): Promise<void> {
  const [row] = await getDb().select({ id: reportCards.id }).from(reportCards).where(and(eq(reportCards.id, reportId), eq(reportCards.studentId, studentId),
    sql`${reportCards.publishedAt} is not null`, sql`exists (select 1 from students where ${students.id}=${reportCards.studentId} and ${studentScope(principal)})`,
    sql`not exists (select 1 from report_card_corrections fix join report_cards replacement on replacement.id=fix.replacement_report_id
      where fix.original_report_id=${reportCards.id} and replacement.published_at is not null)`)).limit(1);
  if (!row) throw new LifecycleConflict('correction_invalid');
}

/** Create a private draft report from the learner's published assessment results (and optionally as a correction of a published report), atomically. */
export async function compileReportCard(principal: Principal, input: ReportCompileInput): Promise<SelectReportCard> {
  assertAdmin(principal);
  const parsed = reportCompileSchema.parse(input);
  const data = compileFields.parse(parsed);
  const ids = parsed.assessmentIds ?? [];
  if (new Set(ids).size !== ids.length) throw new LifecycleConflict('duplicate_assessment');
  await assertStudentAccess(principal, data.studentId);
  if (ids.length) {
    const eligible = new Set((await listEligibleResults(principal, data.studentId)).map(row => row.assessmentId));
    if (ids.some(id => !eligible.has(id))) throw new LifecycleConflict('result_unavailable');
  }
  if (parsed.correction) await assertCorrectable(principal, data.studentId, parsed.correction.reportId);
  const db = getDb(), now = new Date().toISOString(), reportId = crypto.randomUUID();
  const queries: unknown[] = [db.insert(reportCards).select(sql`select ${reportId}, ${data.studentId}, ${data.term}, ${data.summary ?? null}, ${data.overallGrade}, null, ${now}, ${now}
    where exists (select 1 from students where ${students.id} = ${data.studentId} and ${studentScope(principal)})`).returning()];
  if (ids.length) {
    const payload = JSON.stringify(ids.map(assessmentId => ({ lineId: crypto.randomUUID(), assessmentId })));
    queries.push(db.insert(reportCardLines).select(sql`select json_extract(p.value,'$.lineId'), ${reportId}, ${data.studentId}, json_extract(p.value,'$.assessmentId'), saved.id, latest.id,
      a.title, a.kind, a.date, a.max_score, saved.score, saved.grade, saved.updated_at, ${now}
      from json_each(${payload}) p left join assessments a on a.id=json_extract(p.value,'$.assessmentId')
      left join assessment_results saved on saved.assessment_id=a.id and saved.student_id=${data.studentId}
      left join assessment_publications latest on latest.id=(select q.id from assessment_publications q where q.assessment_id=a.id order by q.rowid desc limit 1)
      where exists (select 1 from report_cards created where created.id=${reportId})`).returning({ id: reportCardLines.id }));
  }
  if (parsed.correction) {
    queries.push(db.insert(reportCardCorrections).select(sql`select ${crypto.randomUUID()}, ${principal.schoolId as string}, ${data.studentId}, ${parsed.correction.reportId}, ${reportId},
      ${parsed.correction.reason}, ${principal.id}, ${now} where exists (select 1 from report_cards created where created.id=${reportId})`).returning({ id: reportCardCorrections.id }));
  }
  let results: unknown[];
  try { results = await db.batch(queries as unknown as Parameters<typeof db.batch>[0]) as unknown as unknown[]; }
  catch (error) {
    const hit = errorChainIncludes(error, 'saha_report_line_conflict', 'saha_report_correction_conflict', 'NOT NULL constraint failed: report_card_lines', 'UNIQUE constraint failed: report_card_lines');
    if (!hit) throw error;
    throw new LifecycleConflict(hit === 'saha_report_line_conflict' ? 'result_changed' : hit === 'saha_report_correction_conflict' ? 'correction_invalid'
      : hit.startsWith('NOT NULL') ? 'result_unavailable' : 'duplicate_assessment');
  }
  const created = results[0] as SelectReportCard[];
  if (created.length !== 1) throw new AccessError('Report authority changed; reload before saving', 409);
  if (ids.length && (results[1] as unknown[]).length !== ids.length) throw new LifecycleConflict('result_changed');
  return created[0];
}

export type ReportDetailLine = { assessmentId: string; title: string; kind: string; date: string; maxScore: number; score: number; grade: string | null; current: boolean | null };
export type ReportLink = { id: string; term: string; publishedAt: string | null; reason: string };
export type ReportDetail = { report: SelectReportCard; studentName: string; lines: ReportDetailLine[]; corrects: ReportLink | null; supersededBy: ReportLink | null; resultsChanged: boolean | null };

function currentLine(line: string): SQL {
  const col = (name: string) => sql.raw(line + '.' + name);
  return sql`(exists (select 1 from assessment_results saved join assessments assessment on assessment.id=saved.assessment_id
      where saved.id=${col('result_id')} and typeof(saved.score)='integer' and saved.score=${col('score')} and saved.grade is ${col('grade')}
        and saved.updated_at=${col('result_updated_at')} and assessment.title=${col('assessment_title')} and assessment.kind=${col('assessment_kind')}
        and assessment.date=${col('assessment_date')} and assessment.max_score=${col('max_score')})
    and (select latest.action from assessment_publications latest where latest.assessment_id=${col('assessment_id')} order by latest.rowid desc limit 1)='publish')`;
}

/** The scoped report plus its compiled lines and correction links. Family and learner reads see only published reports for a linked learner. */
export async function getReportDetail(principal: Principal, id: string): Promise<ReportDetail | null> {
  identifier.parse(id);
  const report = await getReportCard(principal, id);
  if (!report) return null;
  const staff = principal.role === 'admin' || principal.role === 'teacher';
  const link = (kind: 'original' | 'replacement') => sql`json((select json_object('id',other.id,'term',other.term,'publishedAt',other.published_at,'reason',fix.reason)
    from report_card_corrections fix join report_cards other on other.id=fix.${sql.raw(kind === 'original' ? 'original_report_id' : 'replacement_report_id')}
    where fix.${sql.raw(kind === 'original' ? 'replacement_report_id' : 'original_report_id')}=report.id
    ${kind === 'replacement' ? sql`and (other.published_at is not null or ${staff ? 1 : 0}=1) order by fix.rowid desc` : sql``} limit 1))`;
  const payload = sql<string>`(select json_object('studentName',(select pupil.first_name || ' ' || pupil.last_name from students pupil where pupil.id=report.student_id),
    'lines',json((select coalesce(json_group_array(json(shown.item)),'[]') from (select json_object('assessmentId',line.assessment_id,'title',line.assessment_title,'kind',line.assessment_kind,
      'date',line.assessment_date,'maxScore',line.max_score,'score',line.score,'grade',line.grade,
      'current',json(case when ${staff ? 1 : 0}=1 then (case when ${currentLine('line')} then 'true' else 'false' end) else 'null' end)) item
      from report_card_lines line where line.report_id=report.id order by line.assessment_date, line.assessment_title, line.id) shown)),
    'corrects',${link('original')},'supersededBy',${link('replacement')})
    from report_cards report where report.id=${id})`;
  const [row] = await getDb().select({ payload }).from(students).where(and(eq(students.id, report.studentId), studentScope(principal), livePrincipalScope(principal))).limit(1);
  if (!row?.payload) return null;
  const parsed = JSON.parse(row.payload) as { studentName: string; lines: ReportDetailLine[]; corrects: ReportLink | null; supersededBy: ReportLink | null };
  return { report, studentName: parsed.studentName, lines: parsed.lines, corrects: parsed.corrects, supersededBy: parsed.supersededBy,
    resultsChanged: staff ? parsed.lines.some(line => line.current === false) : null };
}
