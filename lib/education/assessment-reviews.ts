import { z } from 'zod';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/db';
import { assessments } from '@/db/schema';
import { assessmentReviews } from '@/db/assessment-reviews-schema';
import { AccessError } from './access';
import { academicClassWrite, assertAcademicStaff } from './academic-integrity';
import { digest } from './identity';
import type { Principal } from './types';

const identifier = z.string().min(1).max(120);
const rawNumber = z.union([z.number().finite(), z.string().max(100000), z.null()]);
const storageType = z.enum(['integer', 'real', 'text', 'blob', 'null']);
const metadataSchema = z
  .object({
    id: identifier,
    classId: identifier,
    title: z.string().max(100000),
    kind: z.string().max(100000),
    maxScore: rawNumber,
    date: z.string().max(100000),
    createdAt: z.string().max(100000),
    updatedAt: z.string().max(100000),
    maxScoreType: storageType,
  })
  .strict();
const recordSchema = z
  .object({
    id: identifier,
    assessmentId: identifier,
    studentId: identifier,
    score: rawNumber,
    scoreType: storageType,
    grade: z.string().max(100000).nullable(),
    feedback: z.string().max(100000).nullable(),
    createdAt: z.string().max(100000),
    updatedAt: z.string().max(100000),
  })
  .strict();
export const assessmentResultReviewSchema = z
  .object({
    clientRequestId: z.string().uuid(),
    reviewConfirmed: z.literal(true),
    reason: z
      .string()
      .trim()
      .refine((value) => [...value].length >= 10 && [...value].length <= 500)
      .refine((value) => !/[\x00-\x1f\x7f]/.test(value)),
    expectedAssessment: metadataSchema,
    entries: z
      .array(
        z
          .object({
            studentId: identifier,
            score: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
            grade: z.string().max(100000).nullable(),
            feedback: z.string().max(100000).nullable(),
            expectedRecord: recordSchema.nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.entries.map((entry) => entry.studentId)).size !== value.entries.length)
      context.addIssue({ code: 'custom', message: 'Duplicate pupil' });
    for (const entry of value.entries) {
      const before = entry.expectedRecord;
      if (
        before?.scoreType === 'integer' &&
        before.score === entry.score &&
        before.grade === entry.grade &&
        before.feedback === entry.feedback
      ) {
        context.addIssue({ code: 'custom', message: 'Only changed results can be reviewed' });
      }
      if (
        (entry.grade !== null && [...entry.grade].length > 2000 && entry.grade !== before?.grade) ||
        (entry.feedback !== null && [...entry.feedback].length > 2000 && entry.feedback !== before?.feedback)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'New or replacement grade and feedback text is limited to 2000 characters',
        });
      }
    }
  });
export type AssessmentMetadataSnapshot = z.infer<typeof metadataSchema>;
export type AssessmentResultSnapshot = z.infer<typeof recordSchema>;
export type AssessmentResultReviewInput = z.infer<typeof assessmentResultReviewSchema>;
export type AssessmentResultEditorRow = {
  student: { id: string; firstName: string; lastName: string; admissionNumber: string };
  record: AssessmentResultSnapshot | null;
  records: AssessmentResultSnapshot[];
  resultRows: number;
  recordsTruncated: boolean;
  enrolmentRows: number;
  needsReview: boolean;
  invalidResult: boolean;
};
export type AssessmentResultEditorSnapshot = {
  assessment: AssessmentMetadataSnapshot;
  class: { id: string; name: string };
  asOf: string;
  invalidMaximum: boolean;
  invalidDate: boolean;
  canReview: boolean;
  roster: { items: AssessmentResultEditorRow[]; total: number; limit: 100; truncated: boolean };
};
export type AssessmentResultReview = {
  id: string;
  assessmentId: string;
  classId: string;
  assessment: AssessmentMetadataSnapshot;
  reviewedBy: string;
  reason: string;
  createdAt: string;
  changes: {
    studentId: string;
    beforeRecord: AssessmentResultSnapshot | null;
    afterRecord: AssessmentResultSnapshot;
  }[];
};
export type AssessmentResultReviewResult = { review: AssessmentResultReview; replayed: boolean };
export type AssessmentResultReviewHistory = {
  items: AssessmentResultReview[];
  total: number;
  limit: 100;
  truncated: boolean;
};
export class AssessmentResultReviewConflict extends AccessError {
  constructor() {
    super(
      'Assessment review conflict; reload and compare saved results and metadata before a new review',
      409,
    );
  }
}

const clock = sql`strftime('%Y-%m-%dT%H:%M:%fZ','now')`;
function metadataPayload(alias: string): SQL {
  const field = (name: string) => sql.raw(alias + '.' + name);
  return sql`json_object('id',${field('id')},'classId',${field('class_id')},'title',${field('title')},'kind',${field('kind')},
    'maxScore',case when typeof(${field('max_score')})='blob' then null
      when typeof(${field('max_score')})='integer' and (${field('max_score')} < -9007199254740991 or ${field('max_score')} > 9007199254740991) then cast(${field('max_score')} as text)
      when typeof(${field('max_score')})='real' and (${field('max_score')} < -1.7976931348623157e308 or ${field('max_score')} > 1.7976931348623157e308) then cast(${field('max_score')} as text)
      else ${field('max_score')} end,'maxScoreType',typeof(${field('max_score')}),
    'date',${field('date')},'createdAt',${field('created_at')},'updatedAt',${field('updated_at')})`;
}
function recordPayload(alias: string): SQL {
  const field = (name: string) => sql.raw(alias + '.' + name);
  return sql`json_object('id',${field('id')},'assessmentId',${field('assessment_id')},'studentId',${field('student_id')},
    'score',case when typeof(${field('score')})='blob' then null
      when typeof(${field('score')})='integer' and (${field('score')} < -9007199254740991 or ${field('score')} > 9007199254740991) then cast(${field('score')} as text)
      when typeof(${field('score')})='real' and (${field('score')} < -1.7976931348623157e308 or ${field('score')} > 1.7976931348623157e308) then cast(${field('score')} as text)
      else ${field('score')} end,'scoreType',typeof(${field('score')}),
    'grade',${field('grade')},'feedback',${field('feedback')},'createdAt',${field('created_at')},'updatedAt',${field('updated_at')})`;
}
export async function getAssessmentResultEditor(
  principal: Principal,
  assessmentId: string,
): Promise<AssessmentResultEditorSnapshot> {
  assertAcademicStaff(principal);
  identifier.parse(assessmentId);
  const payload = sql<string>`(with pupils as (
    select distinct pupil.id,pupil.first_name,pupil.last_name,pupil.admission_number,
      (select count(*) from enrolments pair where pair.class_id=assessments.class_id and pair.student_id=pupil.id) pair_rows,
      (select count(*) from assessment_results saved where saved.assessment_id=${assessmentId} and saved.student_id=pupil.id) result_rows,
      exists(select 1 from assessment_results saved where saved.assessment_id=${assessmentId} and saved.student_id=pupil.id and (typeof(saved.score)='blob'
        or (typeof(saved.score)='integer' and (saved.score < -9007199254740991 or saved.score > 9007199254740991))
        or (typeof(saved.score)='real' and (saved.score < -1.7976931348623157e308 or saved.score > 1.7976931348623157e308)))) opaque_result,
      exists(select 1 from assessment_results saved where saved.assessment_id=${assessmentId} and saved.student_id=pupil.id
        and (typeof(saved.score)<>'integer' or saved.score<0 or saved.score>assessments.max_score)) invalid_result
    from students pupil join enrolments active on active.student_id=pupil.id
    where pupil.school_id=${principal.schoolId} and active.class_id=assessments.class_id and active.status='active'
  ) select json_object('assessment',json(${metadataPayload('assessments')}),
    'class',json_object('id',assessments.class_id,'name',(select name from classes where id=assessments.class_id)),'asOf',${clock},
    'invalidMaximum',json(case when typeof(assessments.max_score)<>'integer' or assessments.max_score<0 or assessments.max_score>9007199254740991 then 'true' else 'false' end),
    'invalidDate',json(case when coalesce(length(assessments.date)=10 and assessments.date glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      and date(assessments.date,'+0 days')=assessments.date,0) then 'false' else 'true' end),
    'roster',json_object('items',json((select coalesce(json_group_array(json_object(
      'student',json_object('id',p.id,'firstName',p.first_name,'lastName',p.last_name,'admissionNumber',p.admission_number),
      'record',case when p.result_rows=1 then json((select ${recordPayload('saved')} from assessment_results saved where saved.assessment_id=${assessmentId} and saved.student_id=p.id)) else json('null') end,
      'records',json((select coalesce(json_group_array(json(${recordPayload('saved')})),'[]') from (select * from assessment_results where assessment_id=${assessmentId} and student_id=p.id order by id limit 10) saved)),
      'resultRows',p.result_rows,'recordsTruncated',json(case when p.result_rows>10 then 'true' else 'false' end),
      'enrolmentRows',p.pair_rows,'needsReview',json(case when p.pair_rows>1 or p.result_rows>1 or p.opaque_result then 'true' else 'false' end),
      'invalidResult',json(case when p.invalid_result then 'true' else 'false' end))),'[]') from (select * from pupils order by first_name,last_name,id limit 100) p)),
      'total',(select count(*) from pupils),'limit',100,'truncated',json(case when (select count(*) from pupils)>100 then 'true' else 'false' end)),
    'canReview',json(case when (select count(*) from pupils) between 1 and 100 and typeof(assessments.max_score)='integer' and assessments.max_score between 0 and 9007199254740991
      and not exists(select 1 from pupils where pair_rows>1 or result_rows>1 or opaque_result) then 'true' else 'false' end)))`;
  const [row] = await getDb()
    .select({ payload })
    .from(assessments)
    .where(and(eq(assessments.id, assessmentId), academicClassWrite(principal, sql`${assessments.classId}`)))
    .limit(1);
  if (!row) throw new AccessError('Assessment not found', 404);
  return JSON.parse(row.payload) as AssessmentResultEditorSnapshot;
}

function receiptScope(principal: Principal, alias: string): SQL {
  const field = (name: string) => sql.raw(alias + '.' + name);
  return sql`${field('school_id')}=${principal.schoolId} and ${academicClassWrite(principal, field('class_id'))}
    and exists(select 1 from assessments current where current.id=${field('assessment_id')} and current.class_id=${field('class_id')})
    and exists(select 1 from assessment_review_entries seen where seen.review_id=${field('id')})
    and not exists(select 1 from assessment_review_entries seen left join students pupil on pupil.id=seen.student_id
      where seen.review_id=${field('id')} and (pupil.id is null or pupil.school_id<>${principal.schoolId}))`;
}
function reviewPayload(alias: string): SQL {
  const field = (name: string) => sql.raw(alias + '.' + name);
  return sql`json_object('id',${field('id')},'assessmentId',${field('assessment_id')},'classId',${field('class_id')},'assessment',json(${field('assessment_snapshot')}),
    'reviewedBy',${field('reviewed_by')},'reason',${field('reason')},'createdAt',${field('created_at')},
    'changes',json((select coalesce(json_group_array(json_object('studentId',event.student_id,
      'beforeRecord',case when event.before_record is null then json('null') else json(event.before_record) end,'afterRecord',json(event.after_record))),'[]')
      from (select * from assessment_review_entries where review_id=${field('id')} order by student_id) event)))`;
}
async function retry(
  principal: Principal,
  assessmentId: string,
  data: AssessmentResultReviewInput,
  hash: string,
): Promise<AssessmentResultReviewResult | null> {
  const [row] = await getDb()
    .select({
      requestHash: assessmentReviews.requestHash,
      reviewedBy: assessmentReviews.reviewedBy,
      payload: sql<string>`${reviewPayload('assessment_reviews')}`,
    })
    .from(assessmentReviews)
    .where(
      and(
        eq(assessmentReviews.id, data.clientRequestId),
        eq(assessmentReviews.assessmentId, assessmentId),
        receiptScope(principal, 'assessment_reviews'),
      ),
    )
    .limit(1);
  if (!row) return null;
  if (row.reviewedBy !== principal.id || row.requestHash !== hash) throw new AssessmentResultReviewConflict();
  return { review: JSON.parse(row.payload) as AssessmentResultReview, replayed: true };
}
function recognizedConflict(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    if (current.message.includes('saha_assessment_review_conflict')) return true;
    current = current.cause;
  }
  return false;
}
export async function reviewAssessmentResults(
  principal: Principal,
  assessmentId: string,
  input: AssessmentResultReviewInput,
): Promise<AssessmentResultReviewResult> {
  assertAcademicStaff(principal);
  identifier.parse(assessmentId);
  const data = assessmentResultReviewSchema.parse(input);
  const entries = [...data.entries].sort((a, b) =>
    a.studentId < b.studentId ? -1 : a.studentId > b.studentId ? 1 : 0,
  );
  const hash = await digest(
    JSON.stringify({
      actorId: principal.id,
      schoolId: principal.schoolId,
      assessmentId,
      expectedAssessment: data.expectedAssessment,
      reason: data.reason,
      entries,
    }),
  );
  const snapshot = await getAssessmentResultEditor(principal, assessmentId);
  const prior = await retry(principal, assessmentId, data, hash);
  if (prior) return prior;
  if (
    !snapshot.canReview ||
    Object.keys(snapshot.assessment).some(
      (key) =>
        snapshot.assessment[key as keyof AssessmentMetadataSnapshot] !==
        data.expectedAssessment[key as keyof AssessmentMetadataSnapshot],
    )
  ) {
    throw new AssessmentResultReviewConflict();
  }
  if (
    typeof snapshot.assessment.maxScore !== 'number' ||
    entries.some((entry) => entry.score > (snapshot.assessment.maxScore as number))
  )
    throw new AccessError('Score exceeds the maximum', 400);
  const now = new Date().toISOString();
  const payload = JSON.stringify(
    entries.map((entry) => ({ ...entry, resultId: entry.expectedRecord?.id ?? crypto.randomUUID() })),
  );
  let committed = false;
  try {
    const rows = await getDb()
      .insert(assessmentReviews)
      .select(
        sql`select ${data.clientRequestId},${principal.schoolId},${assessmentId},${snapshot.assessment.classId},
      ${JSON.stringify(data.expectedAssessment)},${principal.id},${data.reason},${hash},${payload},${now} where ${academicClassWrite(principal, snapshot.assessment.classId)}`,
      )
      .onConflictDoNothing({ target: assessmentReviews.id })
      .returning();
    committed = rows.length === 1;
  } catch (error) {
    if (!recognizedConflict(error)) throw error;
  }
  const outcome = await retry(principal, assessmentId, data, hash);
  if (outcome) return { ...outcome, replayed: !committed };
  if (committed) throw new AccessError('Review evidence is no longer available', 404);
  throw new AssessmentResultReviewConflict();
}
export async function listAssessmentResultReviews(
  principal: Principal,
  assessmentId: string,
  filter: { studentId?: string } = {},
): Promise<AssessmentResultReviewHistory> {
  assertAcademicStaff(principal);
  identifier.parse(assessmentId);
  if (filter.studentId !== undefined) identifier.parse(filter.studentId);
  const pupil =
    filter.studentId === undefined
      ? sql`1`
      : sql`exists(select 1 from assessment_review_entries selected where selected.review_id=receipt.id and selected.student_id=${filter.studentId})`;
  const payload = sql<string>`(with visible as (select receipt.* from assessment_reviews receipt where receipt.assessment_id=${assessmentId}
    and ${receiptScope(principal, 'receipt')} and ${pupil}) select json_object('items',json((select coalesce(json_group_array(json(${reviewPayload('displayed')})),'[]')
    from (select * from visible order by created_at desc,id desc limit 100) displayed)),'total',(select count(*) from visible),'limit',100,
    'truncated',json(case when (select count(*) from visible)>100 then 'true' else 'false' end)))`;
  const [row] = await getDb()
    .select({ payload })
    .from(assessments)
    .where(and(eq(assessments.id, assessmentId), academicClassWrite(principal, sql`${assessments.classId}`)))
    .limit(1);
  if (!row) throw new AccessError('Assessment not found', 404);
  return JSON.parse(row.payload) as AssessmentResultReviewHistory;
}
