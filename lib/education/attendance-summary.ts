// Server-only attendance evidence: names, totals and access share one SQL snapshot.
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { attendance, classes } from '@/db/schema';
import { assertPrincipal, classReferenceScope, classScope, studentScope } from './access';
import type { Principal, Role } from './types';

export const ATTENDANCE_SUMMARY_LIMIT = 100;
export type AttendanceEvidence = {
  recordedRows: number;
  counts: { present: number; absent: number; late: number; excused: number; other: number };
  firstDate: string | null; lastDate: string | null; invalidDateRows: number;
};
export type AttendanceSummaryPupil = {
  id: string; firstName: string; lastName: string; admissionNumber: string;
  currentActive: boolean; attendance: AttendanceEvidence;
};
export type AttendanceSummary = {
  role: Role; class: { id: string; name: string }; asOf: string;
  pupils: { items: AttendanceSummaryPupil[]; total: number; limit: number; truncated: boolean };
};

/** Current class access and existing attendance/profile eligibility apply at one
 * statement snapshot. A compact Principal has no session hash; this does not
 * promise session-only revocation after principal resolution.
 */
export async function getAttendanceSummary(principal: Principal, classId: string): Promise<AttendanceSummary | null> {
  assertPrincipal(principal);
  const payload = sql<string>`(with visible_students as (
      select students.id, students.first_name, students.last_name, students.admission_number
      from students where ${studentScope(principal)}
    ), current_roster as (
      select e.student_id from enrolments e join visible_students p on p.id = e.student_id
      where e.class_id = ${classId} and e.status = 'active' group by e.student_id
    ), visible_records as (
      select attendance.student_id, attendance.status, attendance.date,
        case when length(attendance.date) = 10 and attendance.date glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
          and date(attendance.date, '+0 days') = attendance.date then attendance.date else null end valid_date
      from attendance join visible_students p on p.id = attendance.student_id
      where attendance.class_id = ${classId} and ${classReferenceScope(principal, attendance.classId)}
    ), stats as (
      select student_id, count(*) recorded_rows,
        sum(status = 'present') present_rows, sum(status = 'absent') absent_rows,
        sum(status = 'late') late_rows, sum(status = 'excused') excused_rows,
        sum(status not in ('present', 'absent', 'late', 'excused')) other_rows,
        min(valid_date) first_date, max(valid_date) last_date, sum(valid_date is null) invalid_date_rows
      from visible_records group by student_id
    ), pupils as (
      select p.*, exists(select 1 from current_roster r where r.student_id = p.id) current_active
      from visible_students p where exists(select 1 from current_roster r where r.student_id = p.id)
        or exists(select 1 from visible_records a where a.student_id = p.id)
    ) select json_object('role', ${principal.role}, 'class', json_object('id', ${classId}, 'name', classes.name),
      'asOf', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
      'pupils', json_object('total', (select count(*) from pupils), 'limit', ${ATTENDANCE_SUMMARY_LIMIT},
        'truncated', json(case when (select count(*) from pupils) > ${ATTENDANCE_SUMMARY_LIMIT} then 'true' else 'false' end),
        'items', json(coalesce((select json_group_array(json_object('id', p.id, 'firstName', p.first_name,
          'lastName', p.last_name, 'admissionNumber', p.admission_number,
          'currentActive', json(case when p.current_active then 'true' else 'false' end),
          'attendance', json_object('recordedRows', coalesce(s.recorded_rows, 0),
            'counts', json_object('present', coalesce(s.present_rows, 0), 'absent', coalesce(s.absent_rows, 0),
              'late', coalesce(s.late_rows, 0), 'excused', coalesce(s.excused_rows, 0), 'other', coalesce(s.other_rows, 0)),
            'firstDate', s.first_date, 'lastDate', s.last_date, 'invalidDateRows', coalesce(s.invalid_date_rows, 0))))
          from (select * from pupils order by first_name, last_name, id limit ${ATTENDANCE_SUMMARY_LIMIT}) p
          left join stats s on s.student_id = p.id), '[]')))))`;
  const [row] = await getDb().select({ payload }).from(classes).where(and(eq(classes.id, classId), classScope(principal))).limit(1);
  return row ? JSON.parse(row.payload) as AttendanceSummary : null;
}
