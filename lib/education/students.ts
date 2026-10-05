import type { Principal } from './types';
import { getDb } from '@/db/index';
import type { SelectStudent, InsertStudent } from '@/db/schema';
import { students, studentGuardians, guardians } from '@/db/schema';
import { studentSchema } from './validation';
import { and, eq } from 'drizzle-orm';
import { AccessError, assertPrincipal, assertAdmin, assertSchool, assertUserLink, studentScope, guardianScope } from './access';

export async function listStudents(principal: Principal, schoolId?: string): Promise<SelectStudent[]> {
  assertPrincipal(principal);
  assertSchool(principal, schoolId);
  return await getDb().select().from(students).where(studentScope(principal));
}
export async function getStudent(principal: Principal, id: string): Promise<SelectStudent | null> {
  assertPrincipal(principal);
  const [record] = await getDb().select().from(students).where(and(eq(students.id, id), studentScope(principal))).limit(1);
  return record ?? null;
}
export async function createStudent(principal: Principal, input: Omit<InsertStudent, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectStudent> {
  assertAdmin(principal);
  assertSchool(principal, input.schoolId);
  const data = studentSchema.parse(input);
  const userId = input.userId ?? null;
  const db = getDb();
  await assertUserLink(principal, input.userId, 'student');
  const now = new Date().toISOString();
  const [record] = await db.insert(students).values({ ...data, userId, id: crypto.randomUUID(), createdAt: now, updatedAt: now }).returning();
  return record;
}
export async function updateStudent(principal: Principal, id: string, input: Omit<InsertStudent, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectStudent | null> {
  assertAdmin(principal);
  assertSchool(principal, input.schoolId);
  const existing = await getStudent(principal, id);
  if (!existing) throw new AccessError('Student not found', 404);
  const data = studentSchema.omit({ id: true, createdAt: true, updatedAt: true }).parse(input);
  const userId = input.userId === undefined ? existing.userId : input.userId;
  const db = getDb();
  await assertUserLink(principal, input.userId, 'student');
  const [record] = await db.update(students).set({ ...data, userId, updatedAt: new Date().toISOString() }).where(and(eq(students.id, id), studentScope(principal))).returning();
  return record ?? null;
}

export async function linkGuardian(principal: Principal, studentId: string, guardianId: string): Promise<void> {
  assertAdmin(principal);
  const student = await getStudent(principal, studentId);
  const [guardian] = await getDb().select({ id: guardians.id }).from(guardians).where(and(eq(guardians.id, guardianId), guardianScope(principal))).limit(1);
  if (!student || !guardian) throw new AccessError('Student or guardian not found', 404);
  await getDb().insert(studentGuardians).values({ studentId, guardianId, isPrimary: 0 }).onConflictDoNothing();
}
export async function listGuardiansForStudent(principal: Principal, studentId: string): Promise<{ id: string; name: string; relationship: string; userId: string | null }[]> {
  if (!await getStudent(principal, studentId)) throw new AccessError('Student not found', 404);
  return await getDb().select({ id: guardians.id, name: guardians.name, relationship: guardians.relationship, userId: guardians.userId })
    .from(studentGuardians).innerJoin(guardians, eq(studentGuardians.guardianId, guardians.id))
    .where(and(eq(studentGuardians.studentId, studentId), guardianScope(principal)));
}
// Parameter is a guardian PROFILE ID. Login identity is resolved via guardians.userId.
export async function listStudentsForGuardian(principal: Principal, guardianId?: string): Promise<SelectStudent[]> {
  assertPrincipal(principal);
  if (principal.role !== 'guardian' && principal.role !== 'admin') throw new AccessError('Guardian access required');
  const query = getDb().selectDistinct({ id: students.id, userId: students.userId, schoolId: students.schoolId,
    firstName: students.firstName, lastName: students.lastName, dateOfBirth: students.dateOfBirth,
    admissionNumber: students.admissionNumber, gradeLevel: students.gradeLevel, createdAt: students.createdAt, updatedAt: students.updatedAt })
    .from(studentGuardians).innerJoin(students, eq(studentGuardians.studentId, students.id)).innerJoin(guardians, eq(studentGuardians.guardianId, guardians.id));
  return await query.where(and(studentScope(principal), guardianScope(principal), guardianId ? eq(guardians.id, guardianId) : undefined));
}
