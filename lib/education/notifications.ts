import type { Principal } from './types';
import { getDb } from '@/db/index';
import type { SelectNotification, InsertNotification } from '@/db/schema';
import { notifications, users, students, guardians } from '@/db/schema';
import { notificationSchema } from './validation';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AccessError, assertPrincipal, livePrincipalScope, studentScope } from './access';

export async function listNotifications(
  principal: Principal,
  userId: string = principal.id,
): Promise<SelectNotification[]> {
  assertPrincipal(principal);
  if (userId !== principal.id) throw new AccessError('Notifications are private');
  return await getDb()
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, principal.id), livePrincipalScope(principal)));
}
// Newest first. A cursor is the last row's `createdAt|id`; paging never skips or repeats a row.
export const notificationPageSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z
      .string()
      .max(300)
      .regex(/^[^|]{1,60}\|[^|]{1,200}$/)
      .optional(),
    unread: z.enum(['1']).optional(),
  })
  .strict();
export type NotificationPage = {
  items: SelectNotification[];
  total: number;
  unread: number;
  nextCursor: string | null;
};
export async function listNotificationPage(
  principal: Principal,
  filter: z.input<typeof notificationPageSchema> = {},
): Promise<NotificationPage> {
  assertPrincipal(principal);
  const { limit = 25, cursor, unread } = notificationPageSchema.parse(filter);
  const [boundary, boundaryId] = cursor ? cursor.split('|') : [];
  const own = and(eq(notifications.userId, principal.id), livePrincipalScope(principal));
  const rows = await getDb()
    .select()
    .from(notifications)
    .where(
      and(
        own,
        unread ? isNull(notifications.readAt) : undefined,
        cursor
          ? or(
              sql`${notifications.createdAt} < ${boundary}`,
              and(eq(notifications.createdAt, boundary!), sql`${notifications.id} < ${boundaryId}`),
            )
          : undefined,
      ),
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1);
  const [counts] = await getDb()
    .select({
      total: sql<number>`count(*)`,
      unread: sql<number>`coalesce(sum(case when ${notifications.readAt} is null then 1 else 0 end), 0)`,
    })
    .from(notifications)
    .where(own);
  const items = rows.slice(0, limit),
    last = items.at(-1);
  return {
    items,
    total: Number(counts?.total ?? 0),
    unread: Number(counts?.unread ?? 0),
    nextCursor: rows.length > limit && last ? `${last.createdAt}|${last.id}` : null,
  };
}
export async function getNotification(principal: Principal, id: string): Promise<SelectNotification | null> {
  assertPrincipal(principal);
  const [record] = await getDb()
    .select()
    .from(notifications)
    .where(
      and(eq(notifications.id, id), eq(notifications.userId, principal.id), livePrincipalScope(principal)),
    )
    .limit(1);
  return record ?? null;
}
export function assertNotificationWriter(principal: Principal): void {
  assertPrincipal(principal);
  if (principal.role !== 'admin' && principal.role !== 'teacher')
    throw new AccessError('Notification write access required');
}
function recipientScope(principal: Principal, userId: string) {
  assertNotificationWriter(principal);
  return and(
    eq(users.id, userId),
    eq(users.schoolId, principal.schoolId!),
    isNull(users.disabledAt),
    livePrincipalScope(principal),
    sql`${users.identityIssuer} is not null and ${users.identityIssuer} <> ''
      and ${users.identitySubject} is not null and ${users.identitySubject} <> ''`,
    principal.role === 'teacher'
      ? or(
          eq(users.id, principal.id),
          and(
            eq(users.role, 'student'),
            sql`exists (select 1 from students where ${students.userId} = ${users.id} and ${studentScope(principal)})`,
          ),
          and(
            eq(users.role, 'guardian'),
            sql`exists (select 1 from guardians join student_guardians on student_guardians.guardian_id = guardians.id
        join students on students.id = student_guardians.student_id where ${guardians.userId} = ${users.id}
        and ${guardians.schoolId} = ${principal.schoolId} and ${studentScope(principal)})`,
          ),
        )
      : undefined,
  );
}
export async function assertNotificationRecipient(principal: Principal, userId: string): Promise<void> {
  const [user] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(recipientScope(principal, userId))
    .limit(1);
  if (!user) throw new AccessError('Notification recipient not found', 404);
}
export async function createNotification(
  principal: Principal,
  input: Omit<InsertNotification, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<SelectNotification> {
  assertNotificationWriter(principal);
  const data = notificationSchema.parse(input);
  await assertNotificationRecipient(principal, data.userId);
  const now = new Date().toISOString();
  const [record] = await getDb()
    .insert(notifications)
    .select(
      sql`select ${crypto.randomUUID()}, ${users.id},
    ${data.channel}, ${data.title}, ${data.body}, null, ${now}, ${now} from users where ${recipientScope(principal, data.userId)}`,
    )
    .returning();
  if (!record) throw new AccessError('Notification authority changed; reload before saving', 409);
  return record;
}
export async function markNotificationRead(principal: Principal, id: string): Promise<void> {
  assertPrincipal(principal);
  const now = new Date().toISOString();
  const [record] = await getDb()
    .update(notifications)
    .set({
      readAt: sql`coalesce(${notifications.readAt}, ${now})`,
      updatedAt: sql`case when ${notifications.readAt} is null then ${now} else ${notifications.updatedAt} end`,
    })
    .where(
      and(eq(notifications.id, id), eq(notifications.userId, principal.id), livePrincipalScope(principal)),
    )
    .returning({ id: notifications.id });
  if (!record) throw new AccessError('Notification not found', 404);
}
