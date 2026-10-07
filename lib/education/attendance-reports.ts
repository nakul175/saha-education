// Scoped attendance reports. Counts are of saved rows only: there is no school-day calendar,
// so nothing here is a percentage and no unmarked day is invented. Dates are literal YYYY-MM-DD text.
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { classes, students } from '@/db/schema';
import { AccessError, assertPrincipal, classScope, studentScope } from './access';
import { academicClassWrite, assertAcademicStaff } from './academic-integrity';
import { attendanceEditorDateSchema } from './attendance-reviews';
import type { Principal, Role } from './types';

export const ATTENDANCE_REPORT_PUPIL_LIMIT = 100;
export const ATTENDANCE_REPORT_DAY_LIMIT = 100;
export const STUDENT_ATTENDANCE_RECORD_LIMIT = 200;

export const attendanceRangeSchema = z.object({ from: attendanceEditorDateSchema.optional(), to: attendanceEditorDateSchema.optional() })
  .superRefine((value, context) => { if (value.from && value.to && value.from > value.to) context.addIssue({ code: 'custom', message: 'The start date must not be after the end date' }); });
export type AttendanceRange = { from: string | null; to: string | null };

export type StatusCounts = { present: number; absent: number; late: number; excused: number; other: number };
export type ClassAttendanceReport = {
  class: { id: string; name: string }; range: AttendanceRange; asOf: string;
  rosterActive: number; invalidDateRows: number;
  totals: StatusCounts & { recordedRows: number };
  /** Only dates that have at least one saved row. Absence of a date means nothing was saved, not "no school". */
  days: { items: (StatusCounts & { date: string; recordedRows: number; unmarkedCurrentPupils: number })[]; total: number; limit: number; truncated: boolean };
  pupils: { items: (StatusCounts & { id: string; firstName: string; lastName: string; admissionNumber: string; currentActive: boolean; recordedRows: number })[];
    total: number; limit: number; truncated: boolean };
};
export type StudentAttendanceReport = {
  role: Role; student: { id: string; firstName: string; lastName: string; admissionNumber: string };
  range: AttendanceRange; asOf: string; invalidDateRows: number;
  totals: StatusCounts & { recordedRows: number };
  classes: (StatusCounts & { id: string; name: string; recordedRows: number })[];
  records: { items: { id: string; classId: string; className: string; date: string; dateValid: boolean; status: string; note: string | null; recordedByName: string | null }[];
    total: number; limit: number; truncated: boolean };
};

const validDate = (column: string) => sql.raw(`(length(${column}) = 10 and ${column} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and date(${column}, '+0 days') = ${column})`);
function rangePredicate(column: string, range: AttendanceRange) {
  return sql`${range.from === null ? sql`1` : sql`${sql.raw(column)} >= ${range.from}`} and ${range.to === null ? sql`1` : sql`${sql.raw(column)} <= ${range.to}`}`;
}
function parseRange(input: { from?: string; to?: string }): AttendanceRange {
  const value = attendanceRangeSchema.parse(input);
  return { from: value.from ?? null, to: value.to ?? null };
}
// json_object key/value pairs for a status-count object, and the same counts as SELECT columns.
const countPairs = (alias: string) => sql.raw(`'present', coalesce(sum(${alias}.status = 'present'), 0), 'absent', coalesce(sum(${alias}.status = 'absent'), 0),
  'late', coalesce(sum(${alias}.status = 'late'), 0), 'excused', coalesce(sum(${alias}.status = 'excused'), 0),
  'other', coalesce(sum(${alias}.status not in ('present', 'absent', 'late', 'excused')), 0)`);
const countColumns = (alias: string) => sql.raw(`coalesce(sum(${alias}.status = 'present'), 0) present, coalesce(sum(${alias}.status = 'absent'), 0) absent,
  coalesce(sum(${alias}.status = 'late'), 0) late, coalesce(sum(${alias}.status = 'excused'), 0) excused,
  coalesce(sum(${alias}.status not in ('present', 'absent', 'late', 'excused')), 0) other`);

/** Staff only. A teacher must be currently assigned to the class; an administrator must be in its school. */
export async function getClassAttendanceReport(principal: Principal, classId: string, input: { from?: string; to?: string }): Promise<ClassAttendanceReport | null> {
  assertAcademicStaff(principal);
  const range = parseRange(input);
  const payload = sql<string>`(with pupils_in_school as (
      select id, first_name, last_name, admission_number from students where school_id = ${principal.schoolId}
    ), roster as (
      select e.student_id from enrolments e join pupils_in_school p on p.id = e.student_id
      where e.class_id = ${classId} and e.status = 'active' group by e.student_id
    ), class_rows as (
      select a.student_id, a.status, a.date, ${validDate('a.date')} date_ok
      from attendance a join pupils_in_school p on p.id = a.student_id where a.class_id = ${classId}
    ), in_range as (
      select * from class_rows where date_ok and ${rangePredicate('date', range)}
    ), day_stats as (
      select date, count(*) recorded_rows, ${countColumns('in_range')} from in_range group by date
    ), pupil_stats as (
      select student_id, count(*) recorded_rows, ${countColumns('in_range')} from in_range group by student_id
    ), shown_pupils as (
      select p.*, exists(select 1 from roster r where r.student_id = p.id) current_active from pupils_in_school p
      where exists(select 1 from roster r where r.student_id = p.id) or exists(select 1 from in_range v where v.student_id = p.id)
    ) select json_object('class', json_object('id', ${classId}, 'name', classes.name),
      'range', json_object('from', ${range.from}, 'to', ${range.to}), 'asOf', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
      'rosterActive', (select count(*) from roster),
      'invalidDateRows', (select count(*) from class_rows where not date_ok),
      'totals', (select json_object('recordedRows', count(*), ${countPairs('in_range')}) from in_range),
      'days', json_object('total', (select count(*) from day_stats), 'limit', ${ATTENDANCE_REPORT_DAY_LIMIT},
        'truncated', json(case when (select count(*) from day_stats) > ${ATTENDANCE_REPORT_DAY_LIMIT} then 'true' else 'false' end),
        'items', json(coalesce((select json_group_array(json_object('date', d.date, 'recordedRows', d.recorded_rows,
          'present', d.present, 'absent', d.absent, 'late', d.late, 'excused', d.excused, 'other', d.other,
          'unmarkedCurrentPupils', (select count(*) from roster r where not exists(select 1 from in_range v where v.date = d.date and v.student_id = r.student_id))))
          from (select * from day_stats order by date desc limit ${ATTENDANCE_REPORT_DAY_LIMIT}) d), '[]'))),
      'pupils', json_object('total', (select count(*) from shown_pupils), 'limit', ${ATTENDANCE_REPORT_PUPIL_LIMIT},
        'truncated', json(case when (select count(*) from shown_pupils) > ${ATTENDANCE_REPORT_PUPIL_LIMIT} then 'true' else 'false' end),
        'items', json(coalesce((select json_group_array(json_object('id', p.id, 'firstName', p.first_name, 'lastName', p.last_name,
          'admissionNumber', p.admission_number, 'currentActive', json(case when p.current_active then 'true' else 'false' end),
          'recordedRows', coalesce(s.recorded_rows, 0), 'present', coalesce(s.present, 0), 'absent', coalesce(s.absent, 0),
          'late', coalesce(s.late, 0), 'excused', coalesce(s.excused, 0), 'other', coalesce(s.other, 0)))
          from (select * from shown_pupils order by first_name, last_name, id limit ${ATTENDANCE_REPORT_PUPIL_LIMIT}) p
          left join pupil_stats s on s.student_id = p.id), '[]'))))
    )`;
  const [row] = await getDb().select({ payload }).from(classes).where(and(eq(classes.id, classId), academicClassWrite(principal, classId))).limit(1);
  return row ? JSON.parse(row.payload) as ClassAttendanceReport : null;
}

/**
 * Own-record view for every role. Access is the intersection of the existing current student scope
 * (self, linked guardian, assigned teacher, school administrator) and current class scope, so a
 * teacher never sees the same learner's rows from a class they do not teach and a family never
 * sees a class it is not currently linked to. Teacher notes and recorder names are staff-only.
 */
export async function getStudentAttendanceReport(principal: Principal, studentId: string, input: { from?: string; to?: string }): Promise<StudentAttendanceReport | null> {
  assertPrincipal(principal);
  if (typeof studentId !== 'string' || !studentId || studentId.length > 120) throw new AccessError('Not found', 404);
  const range = parseRange(input);
  const staff = principal.role === 'admin' || principal.role === 'teacher' ? 1 : 0;
  const payload = sql<string>`(with permitted_class as materialized (
      select classes.id, classes.name from classes where ${classScope(principal)}
    ), mine as (
      select a.id, a.class_id, pc.name class_name, a.date, a.status, a.note, a.recorded_by, ${validDate('a.date')} date_ok
      from attendance a join permitted_class pc on pc.id = a.class_id where a.student_id = ${studentId}
    ), shown as (
      select * from mine where (date_ok and ${rangePredicate('date', range)}) or (${range.from === null && range.to === null ? sql`1` : sql`0`} and not date_ok)
    ), by_class as (
      select class_id, class_name, count(*) recorded_rows, ${countColumns('shown')} from shown group by class_id, class_name
    ) select json_object('role', ${principal.role},
      'student', json_object('id', students.id, 'firstName', students.first_name, 'lastName', students.last_name, 'admissionNumber', students.admission_number),
      'range', json_object('from', ${range.from}, 'to', ${range.to}), 'asOf', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
      'invalidDateRows', (select count(*) from mine where not date_ok),
      'totals', (select json_object('recordedRows', count(*), ${countPairs('shown')}) from shown),
      'classes', json(coalesce((select json_group_array(json_object('id', b.class_id, 'name', b.class_name, 'recordedRows', b.recorded_rows,
          'present', b.present, 'absent', b.absent, 'late', b.late, 'excused', b.excused, 'other', b.other))
        from (select * from by_class order by class_name, class_id) b), '[]')),
      'records', json_object('total', (select count(*) from shown), 'limit', ${STUDENT_ATTENDANCE_RECORD_LIMIT},
        'truncated', json(case when (select count(*) from shown) > ${STUDENT_ATTENDANCE_RECORD_LIMIT} then 'true' else 'false' end),
        'items', json(coalesce((select json_group_array(json_object('id', r.id, 'classId', r.class_id, 'className', r.class_name, 'date', r.date,
          'dateValid', json(case when r.date_ok then 'true' else 'false' end), 'status', r.status,
          'note', case when ${staff} = 1 then r.note else null end,
          'recordedByName', case when ${staff} = 1 then (select u.name from users u where u.id = r.recorded_by and u.school_id = ${principal.schoolId}) else null end))
          from (select * from shown order by date desc, class_name, id limit ${STUDENT_ATTENDANCE_RECORD_LIMIT}) r), '[]')))
    ))`;
  const [row] = await getDb().select({ payload }).from(students).where(and(eq(students.id, studentId), studentScope(principal))).limit(1);
  return row ? JSON.parse(row.payload) as StudentAttendanceReport : null;
}
