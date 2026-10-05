import type { Principal } from './types';
import { getDb } from '@/db/index';
import type { SelectGuardian, InsertGuardian } from '@/db/schema';
import { guardians, users } from '@/db/schema';
import { guardianSchema } from './validation';
import { and, eq, sql } from 'drizzle-orm';
import { AccessError, assertPrincipal, assertAdmin, assertSchool, guardianScope } from './access';
import { ProfileLinkReviewRequired, profileAdminScope, profileActorScope } from './profile-links';

export async function listGuardians(principal: Principal, schoolId?: string): Promise<SelectGuardian[]> {
  assertPrincipal(principal);
  assertSchool(principal, schoolId);
  return await getDb().select().from(guardians).where(and(guardianScope(principal), profileActorScope(principal)));
}
export async function getGuardian(principal: Principal, id: string): Promise<SelectGuardian | null> {
  assertPrincipal(principal);
  const [record] = await getDb().select().from(guardians).where(and(eq(guardians.id, id), guardianScope(principal), profileActorScope(principal))).limit(1);
  return record ?? null;
}
export async function createGuardian(principal: Principal, input: Omit<InsertGuardian, 'id' | 'createdAt' | 'updatedAt' | 'schoolId'> & { schoolId?: string | null }): Promise<SelectGuardian> {
  assertAdmin(principal);
  assertSchool(principal, input.schoolId);
  if (input.userId !== undefined && input.userId !== null) throw new ProfileLinkReviewRequired();
  const data = guardianSchema.omit({ userId: true }).parse(input);
  const db = getDb();
  const now = new Date().toISOString();
  const [record] = await db.insert(guardians).select(db.select({
    id: sql<string>`${crypto.randomUUID()}`.as('id'), schoolId: sql<string>`${principal.schoolId!}`.as('school_id'), userId: sql<null>`NULL`.as('user_id'),
    name: sql<string>`${data.name}`.as('name'), phone: sql<string | null>`${data.phone ?? null}`.as('phone'), email: sql<string | null>`${data.email ?? null}`.as('email'),
    relationship: sql<string>`${data.relationship}`.as('relationship'), createdAt: sql<string>`${now}`.as('created_at'), updatedAt: sql<string>`${now}`.as('updated_at'),
  }).from(users).where(and(eq(users.id, principal.id), profileAdminScope(principal)))).returning();
  if (!record) throw new AccessError('Administrator access required');
  return record;
}
export async function updateGuardian(principal: Principal, id: string, input: Omit<InsertGuardian, 'id' | 'createdAt' | 'updatedAt' | 'schoolId'> & { schoolId?: string | null }): Promise<SelectGuardian | null> {
  assertAdmin(principal);
  assertSchool(principal, input.schoolId);
  const existing = await getGuardian(principal, id);
  if (!existing) throw new AccessError('Guardian not found', 404);
  if (input.userId !== undefined && input.userId !== existing.userId) throw new ProfileLinkReviewRequired();
  const data = guardianSchema.omit({ id: true, createdAt: true, updatedAt: true, userId: true }).parse(input);
  const db = getDb();
  const [record] = await db.update(guardians).set({ ...data, schoolId: principal.schoolId!, updatedAt: new Date().toISOString() }).where(and(eq(guardians.id, id), guardianScope(principal), profileAdminScope(principal), sql`${guardians.userId} IS ${existing.userId}`)).returning();
  return record ?? null;
}
