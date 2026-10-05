import { z } from 'zod';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/db';
import { classes } from '@/db/schema';
import { attendanceReviews } from '@/db/attendance-reviews-schema';
import { AccessError } from './access';
import { academicClassWrite, assertAcademicStaff } from './academic-integrity';
import { digest } from './identity';
import type { Principal } from './types';

const identifier = z.string().min(1).max(120);
export const attendanceEditorDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = Date.parse(value + 'T00:00:00.000Z');
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}, 'A real YYYY-MM-DD calendar date is required');
const recordSchema = z.object({
  id: identifier, status: z.string().min(1).max(100), note: z.string().max(100000).nullable(),
  recordedBy: identifier, createdAt: z.string().min(1).max(100), updatedAt: z.string().min(1).max(100),
}).strict();
export const attendanceReviewSchema = z.object({
  date: attendanceEditorDateSchema, clientRequestId: z.string().uuid(), reviewConfirmed: z.literal(true),
  reason: z.string().trim().refine(value => [...value].length >= 10 && [...value].length <= 500)
    .refine(value => !/[\x00-\x1f\x7f]/.test(value)),
  entries: z.array(z.object({ studentId: identifier, status: z.enum(['present', 'absent', 'late', 'excused']),
    note: z.string().max(100000).nullable(), expectedRecord: recordSchema.nullable() }).strict()).min(1).max(100),
}).strict().superRefine((value, context) => {
  if (new Set(value.entries.map(entry => entry.studentId)).size !== value.entries.length) context.addIssue({ code: 'custom', message: 'Duplicate pupil' });
  if (value.entries.some(entry => entry.expectedRecord && entry.status === entry.expectedRecord.status && entry.note === entry.expectedRecord.note)) context.addIssue({ code: 'custom', message: 'Only changed marks can be reviewed' });
  if (value.entries.some(entry => entry.note !== null && [...entry.note].length > 2000 && entry.note !== entry.expectedRecord?.note)) context.addIssue({ code: 'custom', message: 'New or replacement notes are limited to 2000 characters' });
});
export type AttendanceRecordSnapshot = z.infer<typeof recordSchema>;
export type AttendanceReviewInput = z.infer<typeof attendanceReviewSchema>;
export type AttendanceEditorRow = { student: { id: string; firstName: string; lastName: string; admissionNumber: string };
  record: AttendanceRecordSnapshot | null; enrolmentRows: number; needsReview: boolean };
export type AttendanceEditorSnapshot = { class: { id: string; name: string }; date: string; asOf: string;
  roster: { items: AttendanceEditorRow[]; total: number; limit: 100; truncated: boolean }; canReview: boolean };
export type AttendanceReview = { id: string; classId: string; date: string; reviewedBy: string; reason: string; createdAt: string;
  changes: { studentId: string; beforeRecord: AttendanceRecordSnapshot | null; afterRecord: AttendanceRecordSnapshot }[] };
export type AttendanceReviewResult = { review: AttendanceReview; replayed: boolean };
export type AttendanceReviewHistory = { items: AttendanceReview[]; total: number; limit: 100; truncated: boolean };
export class AttendanceReviewConflict extends AccessError {
  constructor() { super('Attendance review conflict; reload and compare saved marks before a new review', 409); }
}

const clock = sql`strftime('%Y-%m-%dT%H:%M:%fZ','now')`;
export async function getAttendanceEditor(principal: Principal, classId: string, date: string): Promise<AttendanceEditorSnapshot> {
  assertAcademicStaff(principal); identifier.parse(classId); attendanceEditorDateSchema.parse(date);
  const payload = sql<string>`(with pupils as (
    select distinct pupil.id,pupil.first_name,pupil.last_name,pupil.admission_number,
      (select count(*) from enrolments pair where pair.class_id=${classId} and pair.student_id=pupil.id) pair_rows
    from students pupil join enrolments active on active.student_id=pupil.id
    where pupil.school_id=${principal.schoolId} and active.class_id=${classId} and active.status='active'
  ), roster as (
    select p.*,saved.id record_id,saved.status,saved.note,saved.recorded_by,saved.created_at,saved.updated_at
    from pupils p left join attendance saved on saved.student_id=p.id and saved.class_id=${classId} and saved.date=${date}
  ) select json_object('class',json_object('id',${classes.id},'name',${classes.name}),'date',${date},'asOf',${clock},
    'roster',json_object('items',json((select coalesce(json_group_array(json_object(
      'student',json_object('id',r.id,'firstName',r.first_name,'lastName',r.last_name,'admissionNumber',r.admission_number),
      'record',case when r.record_id is null then json('null') else json_object('id',r.record_id,'status',r.status,'note',r.note,
        'recordedBy',r.recorded_by,'createdAt',r.created_at,'updatedAt',r.updated_at) end,
      'enrolmentRows',r.pair_rows,'needsReview',json(case when r.pair_rows>1 then 'true' else 'false' end))), '[]')
      from (select * from roster order by first_name,last_name,id limit 100) r)),
      'total',(select count(*) from roster),'limit',100,'truncated',json(case when (select count(*) from roster)>100 then 'true' else 'false' end)),
    'canReview',json(case when (select count(*) from roster) between 1 and 100 and not exists(select 1 from roster where pair_rows>1) then 'true' else 'false' end)))`;
  const [row] = await getDb().select({ payload }).from(classes).where(and(eq(classes.id, classId), academicClassWrite(principal, classId))).limit(1);
  if (!row) throw new AccessError('Class not found', 404);
  return JSON.parse(row.payload) as AttendanceEditorSnapshot;
}

// Entire immutable review evidence must still belong to current-school pupils.
// Withdrawal does not erase staff history; transfer does end this evidence read.
function receiptScope(principal: Principal, alias: string): SQL {
  return sql`${sql.raw(alias + '.school_id')}=${principal.schoolId}
    and ${academicClassWrite(principal, sql.raw(alias + '.class_id'))}
    and exists(select 1 from attendance_review_entries seen where seen.review_id=${sql.raw(alias + '.id')})
    and not exists(select 1 from attendance_review_entries seen left join students pupil on pupil.id=seen.student_id
      where seen.review_id=${sql.raw(alias + '.id')} and (pupil.id is null or pupil.school_id<>${principal.schoolId}))`;
}
function reviewPayload(alias: string): SQL {
  const field = (name: string) => sql.raw(alias + '.' + name);
  return sql`json_object('id',${field('id')},'classId',${field('class_id')},'date',${field('attendance_date')},
    'reviewedBy',${field('reviewed_by')},'reason',${field('reason')},'createdAt',${field('created_at')},
    'changes',json((select coalesce(json_group_array(json_object('studentId',event.student_id,
      'beforeRecord',case when event.before_record is null then json('null') else json(event.before_record) end,
      'afterRecord',json(event.after_record))), '[]') from
      (select * from attendance_review_entries where review_id=${field('id')} order by student_id) event)))`;
}
async function retry(principal: Principal, classId: string, data: AttendanceReviewInput, hash: string): Promise<AttendanceReviewResult | null> {
  const [row] = await getDb().select({ requestHash: attendanceReviews.requestHash, reviewedBy: attendanceReviews.reviewedBy,
    payload: sql<string>`${reviewPayload('attendance_reviews')}` }).from(attendanceReviews).where(and(
    eq(attendanceReviews.id, data.clientRequestId), eq(attendanceReviews.classId, classId), receiptScope(principal, 'attendance_reviews'))).limit(1);
  if (!row) return null;
  if (row.reviewedBy !== principal.id || row.requestHash !== hash) throw new AttendanceReviewConflict();
  return { review: JSON.parse(row.payload) as AttendanceReview, replayed: true };
}
function recognizedConflict(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    if (current.message.includes('saha_attendance_review_conflict')) return true;
    current = current.cause;
  }
  return false;
}
export async function reviewAttendance(principal: Principal, classId: string, input: AttendanceReviewInput): Promise<AttendanceReviewResult> {
  assertAcademicStaff(principal); identifier.parse(classId);
  const data = attendanceReviewSchema.parse(input);
  const entries = [...data.entries].sort((a, b) => a.studentId < b.studentId ? -1 : a.studentId > b.studentId ? 1 : 0);
  const hash = await digest(JSON.stringify({ actorId: principal.id, schoolId: principal.schoolId, classId, date: data.date, reason: data.reason, entries }));
  const snapshot = await getAttendanceEditor(principal, classId, data.date);
  const prior = await retry(principal, classId, data, hash);
  if (prior) return prior;
  if (!snapshot.canReview) throw new AttendanceReviewConflict();
  const now = new Date().toISOString();
  const payload = JSON.stringify(entries.map(entry => ({ ...entry, attendanceId: entry.expectedRecord?.id ?? crypto.randomUUID() })));
  let committed = false;
  try {
    const rows = await getDb().insert(attendanceReviews).select(sql`select ${data.clientRequestId},${principal.schoolId},${classId},${data.date},
      ${principal.id},${data.reason},${hash},${payload},${now} where ${academicClassWrite(principal, classId)}`)
      .onConflictDoNothing({ target: attendanceReviews.id }).returning();
    committed = rows.length === 1;
  } catch (error) { if (!recognizedConflict(error)) throw error; }
  const outcome = await retry(principal, classId, data, hash);
  if (outcome) return { ...outcome, replayed: !committed };
  // Do not release a committed outcome after access changes during the readback.
  if (committed) throw new AccessError('Review evidence is no longer available', 404);
  throw new AttendanceReviewConflict();
}

export async function listAttendanceReviews(principal: Principal, classId: string, filter: { date: string; studentId?: string }): Promise<AttendanceReviewHistory> {
  assertAcademicStaff(principal); identifier.parse(classId); attendanceEditorDateSchema.parse(filter.date);
  if (filter.studentId !== undefined) identifier.parse(filter.studentId);
  const pupil = filter.studentId === undefined ? sql`1` : sql`exists(select 1 from attendance_review_entries selected
    where selected.review_id=receipt.id and selected.student_id=${filter.studentId})`;
  const payload = sql<string>`(with visible as (
    select receipt.* from attendance_reviews receipt where receipt.class_id=${classId} and receipt.attendance_date=${filter.date}
      and ${receiptScope(principal, 'receipt')} and ${pupil}
  ) select json_object('items',json((select coalesce(json_group_array(json(${reviewPayload('displayed')})),'[]')
    from (select * from visible order by created_at desc,id desc limit 100) displayed)),
    'total',(select count(*) from visible),'limit',100,'truncated',json(case when (select count(*) from visible)>100 then 'true' else 'false' end)))`;
  const [row] = await getDb().select({ payload }).from(classes).where(and(eq(classes.id, classId), academicClassWrite(principal, classId))).limit(1);
  if (!row) throw new AccessError('Class not found', 404);
  return JSON.parse(row.payload) as AttendanceReviewHistory;
}
