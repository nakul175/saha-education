import type { Principal } from './types';
import { getDb } from '@/db/index';
import type { SelectClass, InsertClass } from '@/db/schema';
import { classes, courses } from '@/db/schema';
import { classSchema } from './validation';
import { and, eq } from 'drizzle-orm';
import { AccessError, assertPrincipal, assertAdmin, assertSchool, assertUserLink, classScope } from './access';

export async function listClasses(principal: Principal, schoolId?: string): Promise<SelectClass[]> {
  assertPrincipal(principal);
  assertSchool(principal, schoolId);
  return await getDb().select().from(classes).where(classScope(principal));
}
export async function getClass(principal: Principal, id: string): Promise<SelectClass | null> {
  assertPrincipal(principal);
  const [record] = await getDb().select().from(classes).where(and(eq(classes.id, id), classScope(principal))).limit(1);
  return record ?? null;
}
export async function createClass(principal: Principal, input: Omit<InsertClass, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectClass> {
  assertAdmin(principal);
  assertSchool(principal, input.schoolId);
  const data = classSchema.parse(input);
  const db = getDb();
  const [course] = await db.select({ id: courses.id }).from(courses).where(and(eq(courses.id, data.courseId), eq(courses.schoolId, principal.schoolId!))).limit(1);
  if (!course) throw new AccessError('Course must belong to this school', 400);
  await assertUserLink(principal, data.teacherId, 'teacher');
  const now = new Date().toISOString();
  const [record] = await db.insert(classes).values({ ...data, id: crypto.randomUUID(), createdAt: now, updatedAt: now }).returning();
  return record;
}
export async function updateClass(principal: Principal, id: string, input: Omit<InsertClass, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectClass | null> {
  assertAdmin(principal);
  assertSchool(principal, input.schoolId);
  const existing = await getClass(principal, id);
  if (!existing) throw new AccessError('Class not found', 404);
  const data = classSchema.omit({ id: true, createdAt: true, updatedAt: true }).parse(input);
  const db = getDb();
  const [course] = await db.select({ id: courses.id }).from(courses).where(and(eq(courses.id, data.courseId), eq(courses.schoolId, principal.schoolId!))).limit(1);
  if (!course) throw new AccessError('Course must belong to this school', 400);
  await assertUserLink(principal, data.teacherId, 'teacher');
  const [record] = await db.update(classes).set({ ...data, updatedAt: new Date().toISOString() }).where(and(eq(classes.id, id), classScope(principal))).returning();
  return record ?? null;
}
