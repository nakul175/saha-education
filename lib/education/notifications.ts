import type { Principal } from './types';
import { getDb } from '@/db/index';
import type { SelectNotification, InsertNotification } from '@/db/schema';
import { notifications, users, students, guardians } from '@/db/schema';
import { notificationSchema } from './validation';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { AccessError, assertPrincipal, livePrincipalScope, studentScope } from './access';

export async function listNotifications(principal: Principal, userId: string = principal.id): Promise<SelectNotification[]> {
  assertPrincipal(principal);
  if (userId !== principal.id) throw new AccessError('Notifications are private');
  return await getDb().select().from(notifications).where(and(eq(notifications.userId, principal.id), livePrincipalScope(principal)));
}
export async function getNotification(principal: Principal, id: string): Promise<SelectNotification | null> {
  assertPrincipal(principal);
  const [record] = await getDb().select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.userId, principal.id), livePrincipalScope(principal))).limit(1);
  return record ?? null;
}
export function assertNotificationWriter(principal: Principal): void {
  assertPrincipal(principal);
  if (principal.role !== 'admin' && principal.role !== 'teacher') throw new AccessError('Notification write access required');
}
function recipientScope(principal: Principal, userId: string) {
  assertNotificationWriter(principal);
  return and(eq(users.id, userId), eq(users.schoolId, principal.schoolId!), isNull(users.disabledAt), livePrincipalScope(principal),
    sql`${users.identityIssuer} is not null and ${users.identityIssuer} <> ''
      and ${users.identitySubject} is not null and ${users.identitySubject} <> ''`,
    principal.role === 'teacher' ? or(
      eq(users.id, principal.id),
      and(eq(users.role, 'student'), sql`exists (select 1 from students where ${students.userId} = ${users.id} and ${studentScope(principal)})`),
      and(eq(users.role, 'guardian'), sql`exists (select 1 from guardians join student_guardians on student_guardians.guardian_id = guardians.id
        join students on students.id = student_guardians.student_id where ${guardians.userId} = ${users.id}
        and ${guardians.schoolId} = ${principal.schoolId} and ${studentScope(principal)})`)
    ) : undefined);
}
export async function assertNotificationRecipient(principal: Principal, userId: string): Promise<void> {
  const [user] = await getDb().select({ id: users.id }).from(users).where(recipientScope(principal, userId)).limit(1);
  if (!user) throw new AccessError('Notification recipient not found', 404);
}
export async function createNotification(principal: Principal, input: Omit<InsertNotification, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectNotification> {
  assertNotificationWriter(principal);
  const data = notificationSchema.parse(input);
  await assertNotificationRecipient(principal, data.userId);
  const now = new Date().toISOString();
  const [record] = await getDb().insert(notifications).select(sql`select ${crypto.randomUUID()}, ${users.id},
    ${data.channel}, ${data.title}, ${data.body}, null, ${now}, ${now} from users where ${recipientScope(principal, data.userId)}`).returning();
  if (!record) throw new AccessError('Notification authority changed; reload before saving', 409);
  return record;
}
export async function markNotificationRead(principal: Principal, id: string): Promise<void> {
  assertPrincipal(principal);
  const now = new Date().toISOString();
  const [record] = await getDb().update(notifications).set({ readAt: sql`coalesce(${notifications.readAt}, ${now})`,
    updatedAt: sql`case when ${notifications.readAt} is null then ${now} else ${notifications.updatedAt} end` })
    .where(and(eq(notifications.id, id), eq(notifications.userId, principal.id), livePrincipalScope(principal))).returning({ id: notifications.id });
  if (!record) throw new AccessError('Notification not found', 404);
}
