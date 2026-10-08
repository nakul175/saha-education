import type { Principal } from './types';
import { getDb } from '@/db/index';
import type { SelectClass, SelectStudent, InsertClass } from '@/db/schema';
import { classes, courses, students, enrolments } from '@/db/schema';
import { classSchema } from './validation';
import { and, eq, sql } from 'drizzle-orm';
import { rethrowAcademicConflict } from './academic-integrity';
import {
  AccessError,
  assertPrincipal,
  assertAdmin,
  assertSchool,
  assertUserLink,
  classScope,
  studentScope,
  studentReferenceScope,
  livePrincipalScope,
} from './access';

// These references are checked again by the mutation itself: a successful
// earlier lookup does not keep a transferred course or revoked teacher valid.
function classReferences(principal: Principal, courseId: string, teacherId: string) {
  return sql`exists (select 1 from courses selected_course where selected_course.id = ${courseId}
    and selected_course.school_id = ${principal.schoolId}) and exists (select 1 from users selected_teacher
    where selected_teacher.id = ${teacherId} and selected_teacher.school_id = ${principal.schoolId}
      and selected_teacher.role = 'teacher' and selected_teacher.disabled_at is null
      and selected_teacher.identity_issuer is not null and selected_teacher.identity_issuer <> ''
      and selected_teacher.identity_subject is not null and selected_teacher.identity_subject <> '')`;
}

export async function listClasses(principal: Principal, schoolId?: string): Promise<SelectClass[]> {
  assertPrincipal(principal);
  assertSchool(principal, schoolId);
  return await getDb().select().from(classes).where(classScope(principal));
}
export async function getClass(principal: Principal, id: string): Promise<SelectClass | null> {
  assertPrincipal(principal);
  const [record] = await getDb()
    .select()
    .from(classes)
    .where(and(eq(classes.id, id), classScope(principal)))
    .limit(1);
  return record ?? null;
}
export async function getClassWithStudents(
  principal: Principal,
  id: string,
): Promise<(SelectClass & { enrolledStudents: SelectStudent[] }) | null> {
  assertPrincipal(principal);
  // One statement scopes the class and each roster member together. Sequential
  // lookups could otherwise return a class snapshot after its access changed.
  const rows = await getDb()
    .select({ record: classes, student: students })
    .from(classes)
    .leftJoin(
      enrolments,
      and(eq(enrolments.classId, classes.id), studentReferenceScope(principal, enrolments.studentId)),
    )
    .leftJoin(students, and(eq(students.id, enrolments.studentId), studentScope(principal)))
    .where(and(eq(classes.id, id), classScope(principal)));
  if (!rows.length) return null;
  return { ...rows[0].record, enrolledStudents: rows.flatMap((row) => (row.student ? [row.student] : [])) };
}
export async function createClass(
  principal: Principal,
  input: Omit<InsertClass, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<SelectClass> {
  assertAdmin(principal);
  assertSchool(principal, input.schoolId);
  const data = classSchema.parse(input);
  const db = getDb();
  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(
      and(
        eq(courses.id, data.courseId),
        eq(courses.schoolId, principal.schoolId!),
        livePrincipalScope(principal),
      ),
    )
    .limit(1);
  if (!course) throw new AccessError('Course must belong to this school', 400);
  await assertUserLink(principal, data.teacherId, 'teacher');
  const now = new Date().toISOString();
  let record: SelectClass | undefined;
  try {
    [record] = await db
      .insert(classes)
      .select(
        sql`select ${crypto.randomUUID()}, ${principal.schoolId}, ${data.courseId},
      ${data.teacherId}, ${data.name}, ${data.term}, ${data.schedule ?? null}, ${now}, ${now}
      where ${livePrincipalScope(principal)} and ${classReferences(principal, data.courseId, data.teacherId)}`,
      )
      .returning();
  } catch (error) {
    rethrowAcademicConflict(error);
  }
  if (!record) throw new AccessError('Class references or administrator authority changed', 409);
  return record;
}
export async function updateClass(
  principal: Principal,
  id: string,
  input: Omit<InsertClass, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<SelectClass | null> {
  assertAdmin(principal);
  assertSchool(principal, input.schoolId);
  const existing = await getClass(principal, id);
  if (!existing) throw new AccessError('Class not found', 404);
  const data = classSchema.omit({ id: true, createdAt: true, updatedAt: true }).parse(input);
  const db = getDb();
  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(
      and(
        eq(courses.id, data.courseId),
        eq(courses.schoolId, principal.schoolId!),
        livePrincipalScope(principal),
      ),
    )
    .limit(1);
  if (!course) throw new AccessError('Course must belong to this school', 400);
  await assertUserLink(principal, data.teacherId, 'teacher');
  let record: SelectClass | undefined;
  try {
    [record] = await db
      .update(classes)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(classes.id, id),
          classScope(principal),
          classReferences(principal, data.courseId, data.teacherId),
        ),
      )
      .returning();
  } catch (error) {
    rethrowAcademicConflict(error);
  }
  if (!record) throw new AccessError('Class references or administrator authority changed', 409);
  return record;
}
