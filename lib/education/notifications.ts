import { getDb } from '@/db/index';
import type { InsertNotification, SelectNotification } from '@/db/schema';
import { notificationSchema } from './validation';

export async function listNotifications(): Promise<SelectNotification[]> {
  const db = getDb();
  return await db.select().from(db.schema.notifications);
}

export async function getNotification(id: string): Promise<SelectNotification | null> {
  const db = getDb();
  const [notification] = await db.select().from(db.schema.notifications).where(db.sql`id = ${id}`);
  return notification ?? null;
}

export async function createNotification(input: InsertNotification): Promise<SelectNotification> {
  const validatedInput = notificationSchema.parse(input);
  const db = getDb();
  
  const [notification] = await db.insert(db.schema.notifications).values(validatedInput).returning();
  return notification;
}

export async function listNotificationsForUser(userId: string): Promise<SelectNotification[]> {
  const db = getDb();
  return await db.select().from(db.schema.notifications).where(db.sql`user_id = ${userId}`);
}

export async function markNotificationRead(id: string): Promise<SelectNotification> {
  const db = getDb();
  
  const [updated] = await db.update(db.schema.notifications)
    .set({
      readAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
    .where(db.sql`id = ${id}`)
    .returning();
    
  return updated;
}