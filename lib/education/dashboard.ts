// Server-only read service: the database binding must never enter client code.
import { and, eq, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/db';
import { attendance, users } from '@/db/schema';
import { assertPrincipal, classReferenceScope, classScope, livePrincipalScope, studentScope } from './access';
import type { Principal } from './types';

export const DASHBOARD_LIMITS = { classes: 100, assessments: 100, profiles: 50, reports: 20 } as const;
export type DashboardList<T> = { items: T[]; total: number; limit: number; truncated: boolean };
type DashboardBase = { schoolId: string; asOf: string };
export type AdminDashboard = DashboardBase & {
  role: 'admin'; school: { id: string; name: string };
  counts: { students: number; courses: number; classes: number; enabledMappedTeachers: number };
};
export type DashboardClass = { id: string; name: string; courseId: string; courseTitle: string | null; term: string; activeStudents: number };
export type DashboardCoverage = {
  state: 'no-current-roster' | 'missing-results' | 'recorded-for-current-roster' | 'needs-review';
  activeStudents: number; recordedStudents: number; missingStudents: number;
  ambiguousEnrolmentStudents: number; ambiguousResultStudents: number; invalidResultStudents: number; invalidMaximum: boolean;
};
export type DashboardAssessment = { id: string; classId: string; title: string; kind: string; date: string; maxScore: number | null; coverage: DashboardCoverage };
export type TeacherDashboard = DashboardBase & { role: 'teacher'; classes: DashboardList<DashboardClass>; assessments: DashboardList<DashboardAssessment> };
export type DashboardAttendance = {
  recordedRows: number; counts: { present: number; absent: number; late: number; excused: number; other: number };
  firstDate: string | null; lastDate: string | null; invalidDateRows: number;
};
export type DashboardReport = { id: string; term: string; overallGrade: string; publishedAt: string };
export type DashboardProfile = {
  id: string; firstName: string; lastName: string; admissionNumber: string;
  attendance: DashboardAttendance; reports: DashboardList<DashboardReport>;
};
export type FamilyDashboard = DashboardBase & { role: 'guardian' | 'student'; profiles: DashboardList<DashboardProfile> };
export type RoleDashboard = AdminDashboard | TeacherDashboard | FamilyDashboard;

// JSON must retain its subtype across subquery boundaries on SQLite and D1.
function listPayload(items: SQL, total: SQL, limit: number): SQL {
  return sql`json_object('items', json(coalesce((${items}), '[]')), 'total', (${total}), 'limit', ${limit},
    'truncated', json(case when (${total}) > ${limit} then 'true' else 'false' end))`;
}
const clock = sql`strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

function adminPayload(principal: Principal): SQL {
  return sql`json_object('role', 'admin', 'schoolId', ${principal.schoolId}, 'asOf', ${clock},
    'school', json_object('id', ${principal.schoolId}, 'name', (select name from schools where id = ${principal.schoolId})),
    'counts', json_object(
      'students', (select count(*) from students where school_id = ${principal.schoolId}),
      'courses', (select count(*) from courses where school_id = ${principal.schoolId}),
      'classes', (select count(*) from classes where school_id = ${principal.schoolId}),
      'enabledMappedTeachers', (select count(*) from users teacher where teacher.school_id = ${principal.schoolId}
        and teacher.role = 'teacher' and teacher.disabled_at is null
        and teacher.identity_issuer is not null and teacher.identity_issuer <> ''
        and teacher.identity_subject is not null and teacher.identity_subject <> '')))`;
}

function teacherPayload(principal: Principal): SQL {
  const classItems = sql`select json_group_array(json_object('id', displayed.id, 'name', displayed.name,
    'courseId', displayed.course_id, 'courseTitle', displayed.course_title, 'term', displayed.term,
    'activeStudents', (select count(*) from roster where roster.class_id = displayed.id)))
    from (select * from scoped_classes order by name, id limit ${DASHBOARD_LIMITS.classes}) displayed`;
  const assessmentItems = sql`select json_group_array(json_object('id', displayed.id, 'classId', displayed.class_id,
    'title', displayed.title, 'kind', displayed.kind, 'date', displayed.date,
    'maxScore', case when displayed.invalid_maximum then null else displayed.max_score end,
    'coverage', json_object('state', case
      when displayed.invalid_maximum or displayed.ambiguous_enrolments > 0 or displayed.ambiguous_results > 0 or displayed.invalid_results > 0 then 'needs-review'
      when displayed.active_students = 0 then 'no-current-roster'
      when displayed.missing_students > 0 then 'missing-results' else 'recorded-for-current-roster' end,
      'activeStudents', displayed.active_students, 'recordedStudents', displayed.recorded_students,
      'missingStudents', displayed.missing_students, 'ambiguousEnrolmentStudents', displayed.ambiguous_enrolments,
      'ambiguousResultStudents', displayed.ambiguous_results, 'invalidResultStudents', displayed.invalid_results,
      'invalidMaximum', json(case when displayed.invalid_maximum then 'true' else 'false' end))))
    from (select * from coverage order by date desc, id desc limit ${DASHBOARD_LIMITS.assessments}) displayed`;
  return sql`(with scoped_classes as (
      select classes.id, classes.name, classes.course_id, classes.term, courses.title course_title
      from classes left join courses on courses.id = classes.course_id and courses.school_id = classes.school_id
      where ${classScope(principal)}
    ), roster as (
      select e.class_id, s.id student_id,
        (select count(*) from enrolments pair where pair.class_id = e.class_id and pair.student_id = s.id) pair_rows
      from enrolments e join students s on s.id = e.student_id and s.school_id = ${principal.schoolId}
      join scoped_classes c on c.id = e.class_id where e.status = 'active' group by e.class_id, s.id
    ), result_pairs as (
      select a.id assessment_id, r.student_id, r.pair_rows, count(saved.id) result_rows,
        sum(case when typeof(a.max_score) = 'integer' and a.max_score >= 0 and a.max_score <= 9007199254740991
          and typeof(saved.score) = 'integer' and saved.score >= 0 and saved.score <= a.max_score then 1 else 0 end) valid_rows
      from assessments a join scoped_classes c on c.id = a.class_id join roster r on r.class_id = a.class_id
      left join assessment_results saved on saved.assessment_id = a.id and saved.student_id = r.student_id
      group by a.id, r.student_id
    ), coverage as (
      select a.*,
        (typeof(a.max_score) <> 'integer' or a.max_score < 0 or a.max_score > 9007199254740991) invalid_maximum,
        (select count(*) from roster r where r.class_id = a.class_id) active_students,
        (select count(*) from result_pairs r where r.assessment_id = a.id and r.result_rows = 1 and r.valid_rows = 1) recorded_students,
        (select count(*) from result_pairs r where r.assessment_id = a.id and r.result_rows = 0) missing_students,
        (select count(*) from result_pairs r where r.assessment_id = a.id and r.pair_rows > 1) ambiguous_enrolments,
        (select count(*) from result_pairs r where r.assessment_id = a.id and r.result_rows > 1) ambiguous_results,
        (select count(*) from result_pairs r where r.assessment_id = a.id and r.result_rows = 1 and r.valid_rows = 0) invalid_results
      from assessments a join scoped_classes c on c.id = a.class_id
    ) select json_object('role', 'teacher', 'schoolId', ${principal.schoolId}, 'asOf', ${clock},
      'classes', ${listPayload(classItems, sql`select count(*) from scoped_classes`, DASHBOARD_LIMITS.classes)},
      'assessments', ${listPayload(assessmentItems, sql`select count(*) from coverage`, DASHBOARD_LIMITS.assessments)}))`;
}

function familyPayload(principal: Principal): SQL {
  const reports = listPayload(sql`select json_group_array(json_object('id', displayed_report.id,
    'term', displayed_report.term, 'overallGrade', displayed_report.overall_grade, 'publishedAt', displayed_report.published_at))
    from (select * from published_reports where student_id = p.id
      order by published_at desc, id desc limit ${DASHBOARD_LIMITS.reports}) displayed_report`,
  sql`select count(*) from published_reports where student_id = p.id`, DASHBOARD_LIMITS.reports);
  const profiles = sql`select json_group_array(json_object('id', p.id, 'firstName', p.first_name, 'lastName', p.last_name,
    'admissionNumber', p.admission_number,
    'attendance', json_object('recordedRows', coalesce(stats.recorded_rows, 0),
      'counts', json_object('present', coalesce(stats.present_rows, 0), 'absent', coalesce(stats.absent_rows, 0),
        'late', coalesce(stats.late_rows, 0), 'excused', coalesce(stats.excused_rows, 0), 'other', coalesce(stats.other_rows, 0)),
      'firstDate', stats.first_date, 'lastDate', stats.last_date, 'invalidDateRows', coalesce(stats.invalid_date_rows, 0)),
    'reports', ${reports}))
    from (select * from scoped_profiles order by first_name, last_name, id limit ${DASHBOARD_LIMITS.profiles}) p
    left join attendance_stats stats on stats.student_id = p.id`;
  return sql`(with scoped_profiles as (
      select students.id, students.first_name, students.last_name, students.admission_number from students where ${studentScope(principal)}
    ), visible_attendance as (
      select attendance.student_id, attendance.status, attendance.date,
        case when length(attendance.date) = 10 and attendance.date glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
          and date(attendance.date, '+0 days') = attendance.date then attendance.date else null end valid_date
      from attendance join scoped_profiles p on p.id = attendance.student_id
      where ${classReferenceScope(principal, attendance.classId)}
    ), attendance_stats as (
      select student_id, count(*) recorded_rows,
        sum(status = 'present') present_rows, sum(status = 'absent') absent_rows,
        sum(status = 'late') late_rows, sum(status = 'excused') excused_rows,
        sum(status not in ('present', 'absent', 'late', 'excused')) other_rows,
        min(valid_date) first_date, max(valid_date) last_date, sum(valid_date is null) invalid_date_rows
      from visible_attendance group by student_id
    ), published_reports as (
      select r.id, r.student_id, r.term, r.overall_grade, r.published_at from report_cards r
      join scoped_profiles p on p.id = r.student_id where r.published_at is not null
    ) select json_object('role', ${principal.role}, 'schoolId', ${principal.schoolId}, 'asOf', ${clock},
      'profiles', ${listPayload(profiles, sql`select count(*) from scoped_profiles`, DASHBOARD_LIMITS.profiles)}))`;
}

/** One current-authority SELECT snapshot; null is denied authority, never zero totals.
 * Relationships are evaluated at that statement's snapshot. Principal carries no
 * session hash, so this does not promise session-only revocation after resolution.
 */
export async function getRoleDashboard(principal: Principal): Promise<RoleDashboard | null> {
  assertPrincipal(principal);
  const payload = principal.role === 'admin' ? adminPayload(principal)
    : principal.role === 'teacher' ? teacherPayload(principal) : familyPayload(principal);
  const [row] = await getDb().select({ payload: sql<string>`${payload}` }).from(users).where(and(
    eq(users.id, principal.id), livePrincipalScope(principal),
    sql`exists (select 1 from schools where schools.id = ${principal.schoolId})`
  )).limit(1);
  return row ? JSON.parse(row.payload) as RoleDashboard : null;
}
