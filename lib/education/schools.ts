import type { Principal } from './types';
import { getDb } from '@/db/index';
import type { SelectSchool, InsertSchool } from '@/db/schema';
import { schools } from '@/db/schema';
import { schoolSchema } from './validation';
import { and, eq } from 'drizzle-orm';
import { AccessError, assertPrincipal, assertAdmin, livePrincipalScope } from './access';

export async function listSchools(principal: Principal): Promise<SelectSchool[]> {
  assertPrincipal(principal);

  return await getDb().select().from(schools).where(and(eq(schools.id, principal.schoolId!), livePrincipalScope(principal)));
}
export async function getSchool(principal: Principal, id: string): Promise<SelectSchool | null> {
  assertPrincipal(principal);
  const [record] = await getDb().select().from(schools).where(and(eq(schools.id, id), eq(schools.id, principal.schoolId!), livePrincipalScope(principal))).limit(1);
  return record ?? null;
}
export async function createSchool(principal: Principal, input: Omit<InsertSchool, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectSchool> {
  assertAdmin(principal);
  void input;
  throw new AccessError('School provisioning is not available to school administrators');
}
export async function updateSchool(principal: Principal, id: string, input: Omit<InsertSchool, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectSchool | null> {
  assertAdmin(principal);

  const existing = await getSchool(principal, id);
  if (!existing) throw new AccessError('School not found', 404);
  const data = schoolSchema.omit({ id: true, createdAt: true, updatedAt: true }).parse(input);
  const db = getDb();
  const [record] = await db.update(schools).set({ ...data, updatedAt: new Date().toISOString() }).where(and(eq(schools.id, id), eq(schools.id, principal.schoolId!), livePrincipalScope(principal))).returning();
  if (!record) throw new AccessError('Administrator authority changed', 409);
  return record;
}
