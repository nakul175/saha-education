import type { Principal } from './types';
import { getDb } from '@/db/index';
import type { SelectEnrolment, InsertEnrolment } from '@/db/schema';
import { enrolments } from '@/db/schema';
import { enrolmentSchema } from './validation';
import { and, eq } from 'drizzle-orm';
import { AccessError, assertAdmin, studentReferenceScope, classReferenceScope, assertStudentAccess } from './access';
import { getClass } from './classes';

function scope(principal: Principal) { return and(studentReferenceScope(principal, enrolments.studentId), classReferenceScope(principal, enrolments.classId)); }
export async function listEnrolments(principal: Principal, filter?: { studentId?: string; classId?: string }): Promise<SelectEnrolment[]> {
  return await getDb().select().from(enrolments).where(and(scope(principal), filter?.studentId ? eq(enrolments.studentId, filter.studentId) : undefined, filter?.classId ? eq(enrolments.classId, filter.classId) : undefined));
}
export async function getEnrolment(principal: Principal, id: string): Promise<SelectEnrolment | null> {
  const [record] = await getDb().select().from(enrolments).where(and(eq(enrolments.id, id), scope(principal))).limit(1);
  return record ?? null;
}
async function validateLinks(principal: Principal, studentId: string, classId: string) {
  assertAdmin(principal);
  await assertStudentAccess(principal, studentId);
  if (!await getClass(principal, classId)) throw new AccessError('Class not found', 404);
}
export async function createEnrolment(principal: Principal, input: Omit<InsertEnrolment, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectEnrolment> {
  const data = enrolmentSchema.parse(input);
  await validateLinks(principal, data.studentId, data.classId);
  const now = new Date().toISOString();
  const [record] = await getDb().insert(enrolments).values({ ...data, id: crypto.randomUUID(), createdAt: now, updatedAt: now }).returning();
  return record;
}
export async function updateEnrolment(principal: Principal, id: string, input: Omit<InsertEnrolment, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectEnrolment | null> {
  assertAdmin(principal);
  if (!await getEnrolment(principal, id)) throw new AccessError('Enrolment not found', 404);
  const data = enrolmentSchema.omit({ id: true, createdAt: true, updatedAt: true }).parse(input);
  await validateLinks(principal, data.studentId, data.classId);
  const [record] = await getDb().update(enrolments).set({ ...data, updatedAt: new Date().toISOString() }).where(and(eq(enrolments.id, id), scope(principal))).returning();
  return record ?? null;
}
export async function updateEnrolmentStatus(principal: Principal, id: string, status: 'active' | 'withdrawn' | 'completed'): Promise<SelectEnrolment | null> {
  assertAdmin(principal);
  enrolmentSchema.shape.status.parse(status);
  const [record] = await getDb().update(enrolments).set({ status, updatedAt: new Date().toISOString() }).where(and(eq(enrolments.id, id), scope(principal))).returning();
  return record ?? null;
}
export async function enrolStudent(principal: Principal, studentId: string, classId: string): Promise<SelectEnrolment> {
  await validateLinks(principal, studentId, classId);
  const existing = await listEnrolments(principal, { studentId, classId });
  if (existing.length) throw new AccessError('Student is already enrolled in this class', 400);
  return await createEnrolment(principal, { studentId, classId, status: 'active', enrolledAt: new Date().toISOString() });
}
