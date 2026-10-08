// Read-only view of the database-written attendance change log (migration 0019).
// It shows every saved mark that was replaced or deleted, including changes made by the
// legacy replacement API that never produced a review receipt.
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { classes } from '@/db/schema';
import { AccessError } from './access';
import { academicClassWrite, assertAcademicStaff } from './academic-integrity';
import { attendanceEditorDateSchema, type AttendanceRecordSnapshot } from './attendance-reviews';
import type { Principal } from './types';

export const ATTENDANCE_CHANGES_LIMIT = 100;
export type AttendanceChange = {
  id: string;
  attendanceId: string;
  studentId: string;
  studentName: string;
  date: string;
  kind: 'update' | 'delete';
  beforeRecord: AttendanceRecordSnapshot;
  afterRecord: AttendanceRecordSnapshot | null;
  changedAt: string;
  /** True only when an immutable review receipt for the same save exists. False means no reason was recorded. */
  reviewed: boolean;
};
export type AttendanceChanges = {
  items: AttendanceChange[];
  total: number;
  limit: typeof ATTENDANCE_CHANGES_LIMIT;
  truncated: boolean;
  actors: { id: string; name: string }[];
};

export async function listAttendanceChanges(
  principal: Principal,
  classId: string,
  filter: { date: string; studentId?: string },
): Promise<AttendanceChanges> {
  assertAcademicStaff(principal);
  if (typeof classId !== 'string' || !classId || classId.length > 120)
    throw new AccessError('Class not found', 404);
  attendanceEditorDateSchema.parse(filter.date);
  if (filter.studentId !== undefined && (!filter.studentId || filter.studentId.length > 120))
    throw new AccessError('Invalid request', 400);
  const pupil = filter.studentId === undefined ? sql`1` : sql`c.student_id = ${filter.studentId}`;
  const payload = sql<string>`(with visible as (
    select c.id, c.attendance_id, c.student_id, c.attendance_date, c.change_kind, c.before_record, c.after_record, c.changed_at,
      p.first_name || ' ' || p.last_name pupil_name,
      exists(select 1 from attendance_review_entries e join attendance_reviews r on r.id = e.review_id
        where e.attendance_id = c.attendance_id and r.class_id = c.class_id and r.attendance_date = c.attendance_date
          and c.after_record is not null
          and json_extract(e.after_record, '$.updatedAt') is json_extract(c.after_record, '$.updatedAt')
          and json_extract(e.after_record, '$.status') is json_extract(c.after_record, '$.status')) reviewed
    from attendance_changes c join students p on p.id = c.student_id
    where c.class_id = ${classId} and c.attendance_date = ${filter.date} and p.school_id = ${principal.schoolId} and ${pupil}
  ) select json_object(
    'items', json((select coalesce(json_group_array(json_object('id', v.id, 'attendanceId', v.attendance_id, 'studentId', v.student_id,
      'studentName', v.pupil_name, 'date', v.attendance_date, 'kind', v.change_kind, 'beforeRecord', json(v.before_record),
      'afterRecord', case when v.after_record is null then json('null') else json(v.after_record) end, 'changedAt', v.changed_at,
      'reviewed', json(case when v.reviewed then 'true' else 'false' end))), '[]')
      from (select * from visible order by changed_at desc, id desc limit ${ATTENDANCE_CHANGES_LIMIT}) v)),
    'total', (select count(*) from visible), 'limit', ${ATTENDANCE_CHANGES_LIMIT},
    'truncated', json(case when (select count(*) from visible) > ${ATTENDANCE_CHANGES_LIMIT} then 'true' else 'false' end),
    'actors', json((select coalesce(json_group_array(json_object('id', u.id, 'name', u.name)), '[]') from users u
      where u.school_id = ${principal.schoolId} and u.id in (
        select recorded_by from attendance where class_id = ${classId} and date = ${filter.date}
        union select reviewed_by from attendance_reviews where class_id = ${classId} and attendance_date = ${filter.date}
        union select json_extract(before_record, '$.recordedBy') from visible
        union select json_extract(after_record, '$.recordedBy') from visible where after_record is not null))))
  )`;
  const [row] = await getDb()
    .select({ payload })
    .from(classes)
    .where(and(eq(classes.id, classId), academicClassWrite(principal, classId)))
    .limit(1);
  if (!row) throw new AccessError('Class not found', 404);
  return JSON.parse(row.payload) as AttendanceChanges;
}
