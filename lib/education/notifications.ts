import type { Principal } from './types';
import { getDb } from '@/db/index';
import type { SelectNotification, InsertNotification } from '@/db/schema';
import { notifications, users, students, guardians } from '@/db/schema';
import { notificationSchema } from './validation';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { AccessError, assertPrincipal, studentScope } from './access';

export async function listNotifications(principal: Principal, userId: string = principal.id): Promise<SelectNotification[]> {
  assertPrincipal(principal);
  if (userId !== principal.id) throw new AccessError('Notifications are private');
  return await getDb().select().from(notifications).where(eq(notifications.userId, principal.id));
}
export async function getNotification(principal: Principal, id: string): Promise<SelectNotification | null> {
  assertPrincipal(principal);
  const [record] = await getDb().select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.userId, principal.id))).limit(1);
  return record ?? null;
}
export async function assertNotificationRecipient(principal: Principal, userId: string): Promise<void> {
  assertPrincipal(principal);
  if (principal.role !== 'admin' && principal.role !== 'teacher') throw new AccessError('Notification write access required');
  const [user] = await getDb().select({ id: users.id }).from(users).where(and(eq(users.id, userId), eq(users.schoolId, principal.schoolId), isNull(users.disabledAt),
    principal.role === 'teacher' ? or(
      eq(users.id, principal.id),
      sql`exists (select 1 from students where ${students.userId} = ${users.id} and ${studentScope(principal)})`,
      sql`exists (select 1 from guardians join student_guardians on student_guardians.guardian_id = guardians.id
        join students on students.id = student_guardians.student_id where ${guardians.userId} = ${users.id}
        and ${guardians.schoolId} = ${principal.schoolId} and ${studentScope(principal)})`
    ) : undefined)).limit(1);
  if (!user) throw new AccessError('Notification recipient not found', 404);
}
export async function createNotification(principal: Principal, input: Omit<InsertNotification, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectNotification> {
  const data = notificationSchema.parse(input);
  await assertNotificationRecipient(principal, data.userId);
  const now = new Date().toISOString();
  const [record] = await getDb().insert(notifications).values({ ...data, readAt: null, id: crypto.randomUUID(), createdAt: now, updatedAt: now }).returning();
  return record;
}
export async function markNotificationRead(principal: Principal, id: string): Promise<void> {
  assertPrincipal(principal);
  const [record] = await getDb().update(notifications).set({ readAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, principal.id))).returning({ id: notifications.id });
  if (!record) throw new AccessError('Notification not found', 404);
}
