import { and, eq, isNull, sql, type SQL, type AnyColumn } from 'drizzle-orm';
import { getDb } from '@/db/index';
import { classes, students, guardians, users, enrolments } from '@/db/schema';
import type { Principal } from './types';
import { sessionExecutionScope } from './principal-authority';

export class AccessError extends Error {
  readonly status: 400 | 403 | 404 | 409;
  constructor(message: string, status: 400 | 403 | 404 | 409 = 403) {
    super(message);
    this.name = 'AccessError';
    this.status = status;
  }
}

export function assertPrincipal(principal: Principal): asserts principal is Principal & { schoolId: string } {
  if (!principal?.id || !principal.schoolId || !['admin', 'teacher', 'guardian', 'student'].includes(principal.role)) {
    throw new AccessError('School access required');
  }
}
export function assertAdmin(principal: Principal): void {
  assertPrincipal(principal);
  if (principal.role !== 'admin') throw new AccessError('Administrator access required');
}
export function assertSchool(principal: Principal, schoolId?: string | null): void {
  assertPrincipal(principal);
  if (schoolId !== undefined && schoolId !== principal.schoolId) throw new AccessError('School access denied');
}

// A session lookup is only an earlier snapshot. Every protected database
// operation also checks that the account still holds that school and role and,
// for verified request principals, that its exact session and mapping are live.
export function livePrincipalScope(principal: Principal): SQL {
  assertPrincipal(principal);
  return and(sessionExecutionScope(principal), sql`exists (select 1 from users live_actor where live_actor.id = ${principal.id}
    and live_actor.school_id = ${principal.schoolId} and live_actor.role = ${principal.role}
    and live_actor.disabled_at is null
    and live_actor.identity_issuer is not null and live_actor.identity_issuer <> ''
    and live_actor.identity_subject is not null and live_actor.identity_subject <> '')`)!;
}

// Correlated EXISTS clauses scope records before they leave the database. Identity
// links are explicit foreign keys; a profile ID is never treated as a login ID.
export function studentScope(principal: Principal): SQL {
  assertPrincipal(principal);
  const school = and(eq(students.schoolId, principal.schoolId), livePrincipalScope(principal))!;
  if (principal.role === 'admin') return school;
  if (principal.role === 'student') return and(school, eq(students.userId, principal.id))!;
  if (principal.role === 'guardian') return and(school, sql`exists (
    select 1 from student_guardians sg join guardians g on g.id = sg.guardian_id
    where sg.student_id = ${students.id} and g.user_id = ${principal.id} and g.school_id = ${principal.schoolId}
  )`)!;
  return and(school, sql`exists (
    select 1 from enrolments e join classes c on c.id = e.class_id
    where e.student_id = ${students.id} and e.status = 'active'
    and c.teacher_id = ${principal.id} and c.school_id = ${principal.schoolId}
  )`)!;
}
export function classScope(principal: Principal): SQL {
  assertPrincipal(principal);
  const school = and(eq(classes.schoolId, principal.schoolId), livePrincipalScope(principal))!;
  if (principal.role === 'admin') return school;
  if (principal.role === 'teacher') return and(school, eq(classes.teacherId, principal.id))!;
  return and(school, sql`exists (
    select 1 from enrolments join students on students.id = enrolments.student_id
    where enrolments.class_id = ${classes.id} and enrolments.status = 'active' and ${studentScope(principal)}
  )`)!;
}
export function guardianScope(principal: Principal): SQL {
  assertPrincipal(principal);
  const school = and(eq(guardians.schoolId, principal.schoolId), livePrincipalScope(principal))!;
  if (principal.role === 'admin') return school;
  if (principal.role === 'guardian') return and(school, eq(guardians.userId, principal.id))!;
  return and(school, sql`exists (
    select 1 from student_guardians join students on students.id = student_guardians.student_id
    where student_guardians.guardian_id = ${guardians.id} and ${studentScope(principal)}
  )`)!;
}
export function studentReferenceScope(principal: Principal, column: AnyColumn): SQL {
  return sql`exists (select 1 from students where ${students.id} = ${column} and ${studentScope(principal)})`;
}
export function classReferenceScope(principal: Principal, column: AnyColumn): SQL {
  return sql`exists (select 1 from classes where ${classes.id} = ${column} and ${classScope(principal)})`;
}
export async function assertStudentAccess(principal: Principal, id: string): Promise<void> {
  const [row] = await getDb().select({ id: students.id }).from(students).where(and(eq(students.id, id), studentScope(principal))).limit(1);
  if (!row) throw new AccessError('Student not found', 404);
}
export async function assertClassWrite(principal: Principal, id: string): Promise<void> {
  assertPrincipal(principal);
  if (principal.role !== 'admin' && principal.role !== 'teacher') throw new AccessError('Academic write access required');
  const [row] = await getDb().select({ id: classes.id }).from(classes).where(and(eq(classes.id, id), classScope(principal))).limit(1);
  if (!row) throw new AccessError('Class not found', 404);
}
export async function assertStudentInClass(principal: Principal, studentId: string, classId: string): Promise<void> {
  await assertStudentAccess(principal, studentId);
  const [row] = await getDb().select({ id: enrolments.id }).from(enrolments).where(and(
    eq(enrolments.studentId, studentId), eq(enrolments.classId, classId), eq(enrolments.status, 'active'),
    classReferenceScope(principal, enrolments.classId), studentReferenceScope(principal, enrolments.studentId)
  )).limit(1);
  if (!row) throw new AccessError('Student must be actively enrolled in this class', 400);
}
export async function assertUserLink(principal: Principal, userId: string | null | undefined, role: 'student' | 'guardian' | 'teacher'): Promise<void> {
  assertPrincipal(principal);
  if (!userId) return;
  const [row] = await getDb().select({ id: users.id }).from(users).where(and(
    eq(users.id, userId), eq(users.schoolId, principal.schoolId), eq(users.role, role), isNull(users.disabledAt),
    sql`${users.identityIssuer} is not null and ${users.identityIssuer} <> ''
      and ${users.identitySubject} is not null and ${users.identitySubject} <> ''`, livePrincipalScope(principal)
  )).limit(1);
  if (!row) throw new AccessError('User must have the matching role in this school', 400);
}
