import type { Principal } from './types';
import { getDb } from '@/db/index';
import type { SelectGuardian, InsertGuardian } from '@/db/schema';
import { guardians } from '@/db/schema';
import { guardianSchema } from './validation';
import { and, eq } from 'drizzle-orm';
import { AccessError, assertPrincipal, assertAdmin, assertSchool, assertUserLink, guardianScope } from './access';

export async function listGuardians(principal: Principal, schoolId?: string): Promise<SelectGuardian[]> {
  assertPrincipal(principal);
  assertSchool(principal, schoolId);
  return await getDb().select().from(guardians).where(guardianScope(principal));
}
export async function getGuardian(principal: Principal, id: string): Promise<SelectGuardian | null> {
  assertPrincipal(principal);
  const [record] = await getDb().select().from(guardians).where(and(eq(guardians.id, id), guardianScope(principal))).limit(1);
  return record ?? null;
}
export async function createGuardian(principal: Principal, input: Omit<InsertGuardian, 'id' | 'createdAt' | 'updatedAt' | 'schoolId'> & { schoolId?: string | null }): Promise<SelectGuardian> {
  assertAdmin(principal);
  assertSchool(principal, input.schoolId);
  const data = guardianSchema.parse(input);
  const db = getDb();
  await assertUserLink(principal, data.userId, 'guardian');
  const now = new Date().toISOString();
  const [record] = await db.insert(guardians).values({ ...data, schoolId: principal.schoolId!, id: crypto.randomUUID(), createdAt: now, updatedAt: now }).returning();
  return record;
}
export async function updateGuardian(principal: Principal, id: string, input: Omit<InsertGuardian, 'id' | 'createdAt' | 'updatedAt' | 'schoolId'> & { schoolId?: string | null }): Promise<SelectGuardian | null> {
  assertAdmin(principal);
  assertSchool(principal, input.schoolId);
  const existing = await getGuardian(principal, id);
  if (!existing) throw new AccessError('Guardian not found', 404);
  const data = guardianSchema.omit({ id: true, createdAt: true, updatedAt: true }).parse(input);
  const db = getDb();
  const userId = input.userId === undefined ? existing.userId : input.userId;
  await assertUserLink(principal, userId, 'guardian');
  const [record] = await db.update(guardians).set({ ...data, schoolId: principal.schoolId!, userId, updatedAt: new Date().toISOString() }).where(and(eq(guardians.id, id), guardianScope(principal))).returning();
  return record ?? null;
}
