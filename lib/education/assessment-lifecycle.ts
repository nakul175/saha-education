import { z } from 'zod';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/db';
import { assessmentResults, assessments, users } from '@/db/schema';
import { assessmentMetadataEdits, assessmentPublications } from '@/db/assessment-lifecycle-schema';
import { AccessError, livePrincipalScope } from './access';
import { academicClassWrite, assertAcademicStaff } from './academic-integrity';
import { digest } from './identity';
import { isExactCalendarDate } from './calendar-date';
import { LifecycleConflict, errorChainIncludes } from './lifecycle-conflict';
import type { Principal } from './types';

const identifier = z.string().min(1).max(120);
const reasonText = z.string().trim().refine(value => [...value].length >= 10 && [...value].length <= 500).refine(value => !/[\x00-\x1f\x7f]/.test(value));
const kinds = ['exam', 'quiz', 'assignment', 'project'] as const;
export const MAX_ASSESSMENT_SCORE = 1_000_000;

// A new assessment through the UI must carry a real calendar day, a bounded title and a whole-number maximum.
// The long-standing legacy API schema is unchanged for existing callers; this stricter shape guards new creation and edits.
export const assessmentDetailsSchema = z.object({
  title: z.string().trim().min(1).max(200).refine(value => !/[\x00-\x1f\x7f]/.test(value)),
  kind: z.enum(kinds),
  maxScore: z.number().int().min(0).max(MAX_ASSESSMENT_SCORE),
  date: z.string().refine(isExactCalendarDate),
});
export const newAssessmentSchema = assessmentDetailsSchema.extend({ classId: identifier });
export const assessmentRevisionSchema = z.object({
  clientRequestId: z.string().uuid(),
  expected: z.object({ title: z.string().max(100000), kind: z.string().max(100000), maxScore: z.number().int(), date: z.string().max(100000), updatedAt: z.string().max(100000) }).strict(),
  details: assessmentDetailsSchema.strict(),
  reason: reasonText.optional(),
}).strict();
export const assessmentPublicationSchema = z.object({
  clientRequestId: z.string().uuid(),
  action: z.enum(['publish', 'unpublish']),
  reason: reasonText.optional(),
  partialConfirmed: z.boolean().optional(),
}).strict();
export type AssessmentRevisionInput = z.infer<typeof assessmentRevisionSchema>;
export type AssessmentPublicationInput = z.infer<typeof assessmentPublicationSchema>;
export type PublicationState = 'draft' | 'published' | 'unpublished';

export type AssessmentOverviewRow = {
  id: string; classId: string; className: string; title: string; kind: string; maxScore: number | null; invalidMaximum: boolean;
  date: string; invalidDate: boolean; createdAt: string; updatedAt: string; expectedPupils: number; recordedResults: number; invalidResults: number;
  ambiguous: boolean; reviewCount: number; lastReviewedAt: string | null; state: PublicationState; stateAt: string | null;
};
export type AssessmentOverview = { items: AssessmentOverviewRow[]; total: number; limit: 200; truncated: boolean };
export type PublicationEvent = { id: string; action: 'publish' | 'unpublish'; actorName: string; reason: string | null; partialConfirmed: boolean;
  expectedPupils: number; recordedResults: number; createdAt: string };
export type MetadataSnapshot = { id: string; classId: string; title: string; kind: string; maxScore: number; date: string; createdAt: string; updatedAt: string };
export type MetadataEdit = { id: string; actorName: string; reason: string | null; before: MetadataSnapshot; after: MetadataSnapshot; createdAt: string };
export type AssessmentLifecycle = {
  assessment: AssessmentOverviewRow;
  readiness: { blockers: string[]; needsPartialConfirmation: boolean; canPublish: boolean; canUnpublish: boolean; canEdit: boolean; unpublishBlockedByReports: number };
  events: PublicationEvent[]; eventTotal: number; edits: MetadataEdit[]; editTotal: number; asOf: string;
};

const clock = sql`strftime('%Y-%m-%dT%H:%M:%fZ','now')`;
const alias = (name: string) => sql.raw(name);
const activePupils = (school: string, classId: SQL) => sql`select count(distinct pupil.id) from students pupil join enrolments active on active.student_id=pupil.id
  where pupil.school_id=${school} and active.class_id=${classId} and active.status='active'`;
const recordedPupils = (school: string, classId: SQL, assessmentId: SQL) => sql`select count(distinct pupil.id) from students pupil join enrolments active on active.student_id=pupil.id
  join assessment_results saved on saved.student_id=pupil.id and saved.assessment_id=${assessmentId}
  where pupil.school_id=${school} and active.class_id=${classId} and active.status='active'`;
const latestAction = (assessmentId: SQL) => sql`(select latest.action from assessment_publications latest where latest.assessment_id=${assessmentId} order by latest.rowid desc limit 1)`;

/** Two nested objects keep every json_object call within the hosted 32-argument function limit; flattened after parsing. */
function itemPayload(school: string, a: string): SQL {
  const col = (name: string) => alias(a + '.' + name);
  return sql`json_object('core',json_object('id',${col('id')},'classId',${col('class_id')},'className',(select name from classes where id=${col('class_id')}),
      'title',${col('title')},'kind',${col('kind')},
      'maxScore',case when typeof(${col('max_score')})='integer' and ${col('max_score')} between 0 and 9007199254740991 then ${col('max_score')} else null end,
      'invalidMaximum',json(case when typeof(${col('max_score')})='integer' and ${col('max_score')} between 0 and 9007199254740991 then 'false' else 'true' end),
      'date',${col('date')},
      'invalidDate',json(case when coalesce(length(${col('date')})=10 and ${col('date')} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
        and date(${col('date')},'+0 days')=${col('date')},0) then 'false' else 'true' end),
      'createdAt',${col('created_at')},'updatedAt',${col('updated_at')}),
    'coverage',json_object('expectedPupils',(${activePupils(school, col('class_id'))}),
      'recordedResults',(${recordedPupils(school, col('class_id'), col('id'))}),
      'invalidResults',(select count(*) from assessment_results bad where bad.assessment_id=${col('id')}
        and (typeof(bad.score)<>'integer' or bad.score<0 or (typeof(${col('max_score')})='integer' and bad.score>${col('max_score')}))),
      'ambiguous',json(case when exists(select 1 from assessment_results pair where pair.assessment_id=${col('id')}
          and (select count(*) from assessment_results twin where twin.assessment_id=pair.assessment_id and twin.student_id=pair.student_id)>1)
        or exists(select 1 from students pupil join enrolments active on active.student_id=pupil.id where pupil.school_id=${school}
          and active.class_id=${col('class_id')} and active.status='active'
          and (select count(*) from enrolments twin where twin.student_id=pupil.id and twin.class_id=${col('class_id')})>1) then 'true' else 'false' end),
      'reviewCount',(select count(*) from assessment_reviews review where review.assessment_id=${col('id')}),
      'lastReviewedAt',(select max(review.created_at) from assessment_reviews review where review.assessment_id=${col('id')}),
      'state',case ${latestAction(col('id'))} when 'publish' then 'published' when 'unpublish' then 'unpublished' else 'draft' end,
      'stateAt',(select latest.created_at from assessment_publications latest where latest.assessment_id=${col('id')} order by latest.rowid desc limit 1)))`;
}
type RawItem = { core: Omit<AssessmentOverviewRow, 'expectedPupils' | 'recordedResults' | 'invalidResults' | 'ambiguous' | 'reviewCount' | 'lastReviewedAt' | 'state' | 'stateAt'>;
  coverage: Pick<AssessmentOverviewRow, 'expectedPupils' | 'recordedResults' | 'invalidResults' | 'ambiguous' | 'reviewCount' | 'lastReviewedAt' | 'state' | 'stateAt'> };
const flatten = (raw: RawItem): AssessmentOverviewRow => ({ ...raw.core, ...raw.coverage });

export async function listAssessmentOverview(principal: Principal, filter: { classId?: string } = {}): Promise<AssessmentOverview> {
  assertAcademicStaff(principal);
  if (filter.classId !== undefined) identifier.parse(filter.classId);
  const school = principal.schoolId as string;
  const classFilter = filter.classId === undefined ? sql`1` : sql`a.class_id=${filter.classId}`;
  const payload = sql<string>`(with visible as (select a.* from assessments a where ${academicClassWrite(principal, alias('a.class_id'))} and ${classFilter})
    select json_object('items',json((select coalesce(json_group_array(json(shown.item)),'[]') from
    (select ${itemPayload(school, 'v')} item from visible v order by v.date desc, v.title, v.id limit 200) shown)),
    'total',(select count(*) from visible),'limit',200,'truncated',json(case when (select count(*) from visible)>200 then 'true' else 'false' end)))`;
  const [row] = await getDb().select({ payload }).from(users).where(and(eq(users.id, principal.id), livePrincipalScope(principal))).limit(1);
  if (!row) throw new AccessError('Account unavailable', 403);
  const raw = JSON.parse(row.payload) as { items: RawItem[]; total: number; limit: 200; truncated: boolean };
  return { items: raw.items.map(flatten), total: raw.total, limit: 200, truncated: raw.truncated };
}

export async function getAssessmentLifecycle(principal: Principal, assessmentId: string): Promise<AssessmentLifecycle> {
  assertAcademicStaff(principal); identifier.parse(assessmentId);
  const school = principal.schoolId as string;
  const eventPayload = sql`json_object('id',event.id,'action',event.action,'actorName',(select name from users where id=event.actor_id),'reason',event.reason,
    'partialConfirmed',json(case when event.partial_confirmed=1 then 'true' else 'false' end),'expectedPupils',event.expected_pupils,
    'recordedResults',event.recorded_results,'createdAt',event.created_at)`;
  const editPayload = sql`json_object('id',edit.id,'actorName',(select name from users where id=edit.actor_id),'reason',edit.reason,
    'before',json(edit.before_snapshot),'after',json(edit.after_snapshot),'createdAt',edit.created_at)`;
  const payload = sql<string>`(select json_object('assessment',json(${itemPayload(school, 'a')}),'asOf',${clock},
    'unpublishBlockedByReports',(select count(*) from report_card_lines line join report_cards report on report.id=line.report_id
      where line.assessment_id=a.id and report.published_at is not null
      and not exists(select 1 from report_card_corrections fix join report_cards replacement on replacement.id=fix.replacement_report_id
        where fix.original_report_id=report.id and replacement.published_at is not null)),
    'events',json((select coalesce(json_group_array(json(${eventPayload})),'[]') from (select * from assessment_publications where assessment_id=a.id order by rowid desc limit 50) event)),
    'eventTotal',(select count(*) from assessment_publications where assessment_id=a.id),
    'edits',json((select coalesce(json_group_array(json(${editPayload})),'[]') from (select * from assessment_metadata_edits where assessment_id=a.id order by rowid desc limit 50) edit)),
    'editTotal',(select count(*) from assessment_metadata_edits where assessment_id=a.id))
    from assessments a where a.id=${assessmentId} and ${academicClassWrite(principal, alias('a.class_id'))})`;
  const [row] = await getDb().select({ payload }).from(users).where(and(eq(users.id, principal.id), livePrincipalScope(principal))).limit(1);
  if (!row?.payload) throw new AccessError('Assessment not found', 404);
  const raw = JSON.parse(row.payload) as { assessment: RawItem; asOf: string; unpublishBlockedByReports: number;
    events: PublicationEvent[]; eventTotal: number; edits: MetadataEdit[]; editTotal: number };
  const a = flatten(raw.assessment);
  const blockers: string[] = [];
  if (a.invalidMaximum) blockers.push('The stored maximum is not a whole number of at least 0. Edit the assessment to correct it.');
  if (a.invalidDate) blockers.push('The stored date is not a real calendar day. Edit the assessment to correct it.');
  if (a.invalidResults > 0) blockers.push(a.invalidResults + ' saved result' + (a.invalidResults === 1 ? ' is' : 's are') + ' not a whole number within the maximum. Correct them in the result editor.');
  if (a.ambiguous) blockers.push('Duplicate saved results or enrolment records exist. Ask an administrator to review the records.');
  if (a.recordedResults < 1) blockers.push('No results are recorded for the current roster yet.');
  const partial = a.recordedResults < a.expectedPupils;
  return {
    assessment: a, asOf: raw.asOf, events: raw.events, eventTotal: raw.eventTotal, edits: raw.edits, editTotal: raw.editTotal,
    readiness: { blockers, needsPartialConfirmation: partial && a.recordedResults >= 1, canPublish: a.state !== 'published' && blockers.length === 0,
      canUnpublish: a.state === 'published' && raw.unpublishBlockedByReports === 0, canEdit: a.state !== 'published', unpublishBlockedByReports: raw.unpublishBlockedByReports },
  };
}

export async function isAssessmentPublished(assessmentId: string): Promise<boolean> {
  const [row] = await getDb().select({ action: sql<string | null>`${latestAction(sql`${assessments.id}`)}` }).from(assessments).where(eq(assessments.id, assessmentId)).limit(1);
  return row?.action === 'publish';
}

async function readEvent(principal: Principal, assessmentId: string, id: string) {
  const [row] = await getDb().select({ requestHash: assessmentPublications.requestHash, actorId: assessmentPublications.actorId, action: assessmentPublications.action,
    reason: assessmentPublications.reason, partialConfirmed: assessmentPublications.partialConfirmed, expectedPupils: assessmentPublications.expectedPupils,
    recordedResults: assessmentPublications.recordedResults, createdAt: assessmentPublications.createdAt, eventId: assessmentPublications.id })
    .from(assessmentPublications).where(and(eq(assessmentPublications.id, id), eq(assessmentPublications.assessmentId, assessmentId),
      eq(assessmentPublications.schoolId, principal.schoolId as string), academicClassWrite(principal, sql`${assessmentPublications.classId}`))).limit(1);
  return row ?? null;
}
export type PublicationOutcome = { event: { id: string; action: 'publish' | 'unpublish'; reason: string | null; partialConfirmed: boolean; expectedPupils: number; recordedResults: number; createdAt: string }; replayed: boolean };
function outcome(row: NonNullable<Awaited<ReturnType<typeof readEvent>>>, replayed: boolean): PublicationOutcome {
  return { event: { id: row.eventId, action: row.action as 'publish' | 'unpublish', reason: row.reason, partialConfirmed: row.partialConfirmed === 1,
    expectedPupils: row.expectedPupils, recordedResults: row.recordedResults, createdAt: row.createdAt }, replayed };
}

/** Publish or unpublish the saved results of one assessment. The unique client request id makes a lost acknowledgement an exact replay. */
export async function changeAssessmentPublication(principal: Principal, assessmentId: string, input: AssessmentPublicationInput): Promise<PublicationOutcome> {
  assertAcademicStaff(principal); identifier.parse(assessmentId);
  const data = assessmentPublicationSchema.parse(input);
  if (data.action === 'unpublish' && !data.reason) throw new LifecycleConflict('reason_required');
  const hash = await digest(JSON.stringify({ actor: principal.id, school: principal.schoolId, assessmentId, action: data.action, reason: data.reason ?? null, partial: data.partialConfirmed === true }));
  const prior = await readEvent(principal, assessmentId, data.clientRequestId);
  if (prior) { if (prior.actorId !== principal.id || prior.requestHash !== hash) throw new LifecycleConflict('request_reused'); return outcome(prior, true); }
  const [target] = await getDb().select({ id: assessments.id }).from(assessments).where(and(eq(assessments.id, assessmentId), academicClassWrite(principal, sql`${assessments.classId}`))).limit(1);
  if (!target) throw new AccessError('Assessment not found', 404);
  const school = principal.schoolId as string, now = new Date().toISOString();
  const classColumn = sql`a.class_id`;
  const expected = activePupils(school, classColumn), recorded = recordedPupils(school, classColumn, sql`a.id`);
  let committed = false;
  try {
    const rows = await getDb().insert(assessmentPublications).select(sql`select ${data.clientRequestId},${school},a.id,a.class_id,${data.action},${principal.id},${data.reason ?? null},
      case when ${data.partialConfirmed === true ? 1 : 0}=1 and (${recorded})<(${expected}) then 1 else 0 end,(${expected}),(${recorded}),${hash},${now}
      from assessments a where a.id=${assessmentId} and ${academicClassWrite(principal, classColumn)}`).onConflictDoNothing({ target: assessmentPublications.id }).returning({ id: assessmentPublications.id });
    committed = rows.length === 1;
  } catch (error) {
    const hit = errorChainIncludes(error, 'saha_assessment_publication_in_use', 'saha_assessment_publication_unready', 'saha_assessment_publication_conflict');
    if (!hit) throw error;
    const raced = await readEvent(principal, assessmentId, data.clientRequestId);
    if (raced && raced.actorId === principal.id && raced.requestHash === hash) return outcome(raced, true);
    throw new LifecycleConflict(hit === 'saha_assessment_publication_in_use' ? 'in_published_report' : hit === 'saha_assessment_publication_unready' ? 'not_ready' : 'changed');
  }
  const saved = await readEvent(principal, assessmentId, data.clientRequestId);
  if (!saved) { if (committed) throw new AccessError('Publication evidence is no longer available', 404); throw new LifecycleConflict('changed'); }
  if (saved.actorId !== principal.id || saved.requestHash !== hash) throw new LifecycleConflict('request_reused');
  return outcome(saved, !committed);
}

const snapshotJson = (row: MetadataSnapshot) => JSON.stringify({ id: row.id, classId: row.classId, title: row.title, kind: row.kind, maxScore: row.maxScore, date: row.date, createdAt: row.createdAt, updatedAt: row.updatedAt });
export type RevisionOutcome = { assessment: MetadataSnapshot; edit: { id: string; reason: string | null; createdAt: string }; replayed: boolean };

/** Compare-and-set edit of title, type, maximum and date, with immutable before/after history. Published results lock the metadata. */
export async function reviseAssessment(principal: Principal, assessmentId: string, input: AssessmentRevisionInput): Promise<RevisionOutcome> {
  assertAcademicStaff(principal); identifier.parse(assessmentId);
  const data = assessmentRevisionSchema.parse(input);
  const hash = await digest(JSON.stringify({ actor: principal.id, school: principal.schoolId, assessmentId, expected: data.expected, details: data.details, reason: data.reason ?? null }));
  const db = getDb();
  const readEdit = async () => {
    const [row] = await db.select({ actorId: assessmentMetadataEdits.actorId, requestHash: assessmentMetadataEdits.requestHash, reason: assessmentMetadataEdits.reason,
      after: assessmentMetadataEdits.afterSnapshot, createdAt: assessmentMetadataEdits.createdAt, id: assessmentMetadataEdits.id }).from(assessmentMetadataEdits)
      .where(and(eq(assessmentMetadataEdits.id, data.clientRequestId), eq(assessmentMetadataEdits.assessmentId, assessmentId),
        eq(assessmentMetadataEdits.schoolId, principal.schoolId as string), academicClassWrite(principal, sql`${assessmentMetadataEdits.classId}`))).limit(1);
    return row ?? null;
  };
  const replay = (row: NonNullable<Awaited<ReturnType<typeof readEdit>>>): RevisionOutcome => {
    if (row.actorId !== principal.id || row.requestHash !== hash) throw new LifecycleConflict('request_reused');
    return { assessment: JSON.parse(row.after) as MetadataSnapshot, edit: { id: row.id, reason: row.reason, createdAt: row.createdAt }, replayed: true };
  };
  const prior = await readEdit();
  if (prior) return replay(prior);
  const [existing] = await db.select().from(assessments).where(and(eq(assessments.id, assessmentId), academicClassWrite(principal, sql`${assessments.classId}`))).limit(1);
  if (!existing) throw new AccessError('Assessment not found', 404);
  if (await isAssessmentPublished(assessmentId)) throw new LifecycleConflict('published');
  const [anySaved] = await db.select({ n: sql<number>`count(*)` }).from(assessmentResults).where(eq(assessmentResults.assessmentId, assessmentId));
  if ((anySaved?.n ?? 0) > 0 && !data.reason) throw new LifecycleConflict('reason_required');
  const before: MetadataSnapshot = { id: existing.id, classId: existing.classId, title: existing.title, kind: existing.kind, maxScore: existing.maxScore, date: existing.date, createdAt: existing.createdAt, updatedAt: existing.updatedAt };
  const e = data.expected;
  if (e.title !== existing.title || e.kind !== existing.kind || e.maxScore !== existing.maxScore || e.date !== existing.date || e.updatedAt !== existing.updatedAt) throw new LifecycleConflict('stale');
  const next = data.details, now = new Date().toISOString();
  let results;
  try {
    results = await db.batch([
      db.update(assessments).set({ title: next.title, kind: next.kind, maxScore: next.maxScore, date: next.date, updatedAt: now }).where(and(
        eq(assessments.id, assessmentId), eq(assessments.classId, existing.classId), sql`${assessments.title} is ${e.title}`, sql`${assessments.kind} is ${e.kind}`,
        sql`${assessments.maxScore} is ${e.maxScore}`, sql`${assessments.date} is ${e.date}`, sql`${assessments.updatedAt} is ${e.updatedAt}`,
        academicClassWrite(principal, sql`${assessments.classId}`), sql`${latestAction(sql`${assessments.id}`)} is not 'publish'`,
        sql`not exists (select 1 from assessment_results saved where saved.assessment_id=${assessments.id} and (typeof(saved.score)<>'integer' or saved.score<0 or saved.score>${next.maxScore}))`,
      )).returning({ id: assessments.id }),
      db.insert(assessmentMetadataEdits).select(sql`select ${data.clientRequestId},${principal.schoolId as string},a.id,a.class_id,${principal.id},${data.reason ?? null},${snapshotJson(before)},
        json_object('id',a.id,'classId',a.class_id,'title',a.title,'kind',a.kind,'maxScore',a.max_score,'date',a.date,'createdAt',a.created_at,'updatedAt',a.updated_at),${hash},${now}
        from assessments a where a.id=${assessmentId} and a.updated_at=${now} and a.title=${next.title} and a.kind=${next.kind} and a.max_score=${next.maxScore} and a.date=${next.date}`).returning({ id: assessmentMetadataEdits.id }),
    ]);
  } catch (error) {
    const hit = errorChainIncludes(error, 'saha_assessment_published_lock', 'saha_assessment_edit_conflict');
    const raced = await readEdit();
    if (raced) return replay(raced);
    throw new LifecycleConflict(hit === 'saha_assessment_published_lock' ? 'published' : hit === 'saha_assessment_edit_conflict' ? 'reason_required' : 'changed');
  }
  if (results[0].length !== 1 || results[1].length !== 1) {
    const raced = await readEdit();
    if (raced) return replay(raced);
    const [current] = await db.select().from(assessments).where(and(eq(assessments.id, assessmentId), academicClassWrite(principal, sql`${assessments.classId}`))).limit(1);
    if (!current) throw new AccessError('Assessment not found', 404);
    if (await isAssessmentPublished(assessmentId)) throw new LifecycleConflict('published');
    if (current.updatedAt !== e.updatedAt) throw new LifecycleConflict('stale');
    throw new LifecycleConflict('below_saved_scores');
  }
  const saved = await readEdit();
  if (!saved) throw new AccessError('Edit evidence is no longer available', 404);
  return { assessment: JSON.parse(saved.after) as MetadataSnapshot, edit: { id: saved.id, reason: saved.reason, createdAt: saved.createdAt }, replayed: false };
}
