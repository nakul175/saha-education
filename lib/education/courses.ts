import type { Principal } from './types';
import { getDb } from '@/db/index';
import type { SelectCourse, InsertCourse } from '@/db/schema';
import { courses } from '@/db/schema';
import { courseSchema } from './validation';
import { and, eq } from 'drizzle-orm';
import { AccessError, assertPrincipal, assertAdmin, assertSchool } from './access';

export async function listCourses(principal: Principal, schoolId?: string): Promise<SelectCourse[]> {
  assertPrincipal(principal);
  assertSchool(principal, schoolId);
  return await getDb().select().from(courses).where(eq(courses.schoolId, principal.schoolId!));
}
export async function getCourse(principal: Principal, id: string): Promise<SelectCourse | null> {
  assertPrincipal(principal);
  const [record] = await getDb().select().from(courses).where(and(eq(courses.id, id), eq(courses.schoolId, principal.schoolId!))).limit(1);
  return record ?? null;
}
export async function createCourse(principal: Principal, input: Omit<InsertCourse, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectCourse> {
  assertAdmin(principal);
  assertSchool(principal, input.schoolId);
  const data = courseSchema.parse(input);
  const db = getDb();
  const now = new Date().toISOString();
  const [record] = await db.insert(courses).values({ ...data, id: crypto.randomUUID(), createdAt: now, updatedAt: now }).returning();
  return record;
}
export async function updateCourse(principal: Principal, id: string, input: Omit<InsertCourse, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectCourse | null> {
  assertAdmin(principal);
  assertSchool(principal, input.schoolId);
  const existing = await getCourse(principal, id);
  if (!existing) throw new AccessError('Course not found', 404);
  const data = courseSchema.omit({ id: true, createdAt: true, updatedAt: true }).parse(input);
  const db = getDb();
  const [record] = await db.update(courses).set({ ...data, updatedAt: new Date().toISOString() }).where(and(eq(courses.id, id), eq(courses.schoolId, principal.schoolId!))).returning();
  return record ?? null;
}
