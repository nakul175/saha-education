import type { Principal } from './types';
import { getDb } from '@/db/index';
import type { SelectStudent, InsertStudent } from '@/db/schema';
import { students, studentGuardians, guardians, users } from '@/db/schema';
import { studentGuardianDetails, studentGuardianEvents } from '@/db/school-records-schema';
import { constraintFailure } from './record-support';
import { studentSchema } from './validation';
import { and, eq, sql } from 'drizzle-orm';
import { AccessError, assertPrincipal, assertAdmin, assertSchool, studentScope, guardianScope } from './access';
import { ProfileLinkReviewRequired, profileAdminScope, profileActorScope } from './profile-links';
import { AcademicConflict, liveAcademicPrincipal } from './academic-integrity';

export async function listStudents(principal: Principal, schoolId?: string): Promise<SelectStudent[]> {
  assertPrincipal(principal);
  assertSchool(principal, schoolId);
  return await getDb().select().from(students).where(and(studentScope(principal), profileActorScope(principal)));
}
export async function getStudent(principal: Principal, id: string): Promise<SelectStudent | null> {
  assertPrincipal(principal);
  const [record] = await getDb().select().from(students).where(and(eq(students.id, id), studentScope(principal), profileActorScope(principal))).limit(1);
  return record ?? null;
}
export async function createStudent(principal: Principal, input: Omit<InsertStudent, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectStudent> {
  assertAdmin(principal);
  assertSchool(principal, input.schoolId);
  if (input.userId !== undefined && input.userId !== null) throw new ProfileLinkReviewRequired();
  const data = studentSchema.omit({ userId: true }).parse(input);
  const db = getDb();
  const now = new Date().toISOString();
  const [record] = await db.insert(students).select(db.select({
    id: sql<string>`${crypto.randomUUID()}`.as('id'), userId: sql<null>`NULL`.as('user_id'), schoolId: sql<string>`${principal.schoolId!}`.as('school_id'),
    firstName: sql<string>`${data.firstName}`.as('first_name'), lastName: sql<string>`${data.lastName}`.as('last_name'),
    dateOfBirth: sql<string>`${data.dateOfBirth}`.as('date_of_birth'), admissionNumber: sql<string>`${data.admissionNumber}`.as('admission_number'),
    gradeLevel: sql<string>`${data.gradeLevel}`.as('grade_level'), createdAt: sql<string>`${now}`.as('created_at'), updatedAt: sql<string>`${now}`.as('updated_at'),
  }).from(users).where(and(eq(users.id, principal.id), profileAdminScope(principal)))).returning();
  if (!record) throw new AccessError('Administrator access required');
  return record;
}
export async function updateStudent(principal: Principal, id: string, input: Omit<InsertStudent, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectStudent | null> {
  assertAdmin(principal);
  assertSchool(principal, input.schoolId);
  const existing = await getStudent(principal, id);
  if (!existing) throw new AccessError('Student not found', 404);
  if (input.userId !== undefined && input.userId !== existing.userId) throw new ProfileLinkReviewRequired();
  const data = studentSchema.omit({ id: true, createdAt: true, updatedAt: true, userId: true }).parse(input);
  const db = getDb();
  const [record] = await db.update(students).set({ ...data, updatedAt: new Date().toISOString() }).where(and(eq(students.id, id), studentScope(principal), profileAdminScope(principal), sql`${students.userId} IS ${existing.userId}`)).returning();
  return record ?? null;
}

export async function linkGuardian(principal: Principal, studentId: string, guardianId: string): Promise<void> {
  assertAdmin(principal);
  const student = await getStudent(principal, studentId);
  const [guardian] = await getDb().select({ id: guardians.id }).from(guardians).where(and(eq(guardians.id, guardianId), guardianScope(principal))).limit(1);
  if (!student || !guardian) throw new AccessError('Student or guardian not found', 404);
  const eligible = sql`${liveAcademicPrincipal(principal)} and exists (select 1 from students relationship_student
    join guardians relationship_guardian on relationship_guardian.id = ${guardianId}
    where relationship_student.id = ${studentId} and relationship_student.school_id = ${principal.schoolId}
      and relationship_guardian.school_id = ${principal.schoolId})`;
  // The reviewed link history row and the relationship are written in one atomic batch. The history row is
  // inserted first and only for a genuinely new pair; an exact retry of an existing pair keeps its evidence.
  const db = getDb(), eventId = crypto.randomUUID(), attemptId = crypto.randomUUID(), stamp = new Date().toISOString();
  const pairVersion = sql`(select count(*) from student_guardian_events pair_event where pair_event.student_id = ${studentId} and pair_event.guardian_id = ${guardianId})`;
  try {
    await db.batch([
      db.insert(studentGuardianEvents).select(sql`select ${eventId}, ${principal.schoolId}, ${studentId}, ${guardianId}, ${principal.id}, 'link', ${pairVersion}, ${pairVersion} + 1, NULL,
        (select relationship from guardians where id = ${guardianId}), NULL, 0, 'Linked through the original guardian link endpoint', ${stamp}, 'legacy-link-endpoint', ${attemptId}
        where ${eligible} and not exists (select 1 from student_guardians where student_id = ${studentId} and guardian_id = ${guardianId})`),
      db.insert(studentGuardians).select(sql`select student_id, guardian_id, 0 from student_guardian_events where id = ${eventId} and attempt_id = ${attemptId}`).onConflictDoNothing(),
    ]);
  } catch (error) {
    // A concurrent identical link can win the history revision; the pair check below decides the outcome.
    if (!constraintFailure(error, /UNIQUE constraint failed/)) throw error;
  }
  // Retries retain the established isPrimary evidence and recheck authority.
  const [existing] = await db.select({ studentId: studentGuardians.studentId }).from(studentGuardians)
    .where(and(eq(studentGuardians.studentId, studentId), eq(studentGuardians.guardianId, guardianId), eligible)).limit(1);
  if (!existing) throw new AcademicConflict();
}
export async function listGuardiansForStudent(principal: Principal, studentId: string): Promise<{ id: string; name: string; relationship: string; userId: string | null }[]> {
  if (!await getStudent(principal, studentId)) throw new AccessError('Student not found', 404);
  // The link's own relationship (set by reviewed link administration) takes precedence over the profile default.
  return await getDb().select({ id: guardians.id, name: guardians.name, relationship: sql<string>`coalesce(${studentGuardianDetails.relationship}, ${guardians.relationship})`, userId: guardians.userId })
    .from(studentGuardians).innerJoin(guardians, eq(studentGuardians.guardianId, guardians.id))
    .leftJoin(studentGuardianDetails, and(eq(studentGuardianDetails.studentId, studentGuardians.studentId), eq(studentGuardianDetails.guardianId, studentGuardians.guardianId)))
    .where(and(eq(studentGuardians.studentId, studentId), liveAcademicPrincipal(principal), guardianScope(principal),
      sql`exists (select 1 from students where ${students.id} = ${studentId} and ${studentScope(principal)})`));
}
// Parameter is a guardian PROFILE ID. Login identity is resolved via guardians.userId.
export async function listStudentsForGuardian(principal: Principal, guardianId?: string): Promise<SelectStudent[]> {
  assertPrincipal(principal);
  if (principal.role !== 'guardian' && principal.role !== 'admin') throw new AccessError('Guardian access required');
  const query = getDb().selectDistinct({ id: students.id, userId: students.userId, schoolId: students.schoolId,
    firstName: students.firstName, lastName: students.lastName, dateOfBirth: students.dateOfBirth,
    admissionNumber: students.admissionNumber, gradeLevel: students.gradeLevel, createdAt: students.createdAt, updatedAt: students.updatedAt })
    .from(studentGuardians).innerJoin(students, eq(studentGuardians.studentId, students.id)).innerJoin(guardians, eq(studentGuardians.guardianId, guardians.id));
  return await query.where(and(liveAcademicPrincipal(principal), studentScope(principal), guardianScope(principal), guardianId ? eq(guardians.id, guardianId) : undefined));
}
