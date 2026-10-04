import { getDb } from '@/db/index';
import type { SelectNotification, InsertNotification } from '@/db/schema';
import { notificationSchema } from './validation';
import { eq } from 'drizzle-orm';
import { notifications } from '@/db/schema';

export async function listNotifications(userId: string): Promise<SelectNotification[]> {
  const db = getDb();
  
  return await db.select().from(notifications).where(eq(notifications.userId, userId));
}

export async function getNotification(id: string): Promise<SelectNotification | null> {
  const db = getDb();
  const [notification] = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
  return notification ?? null;
}

export async function createNotification(input: Omit<InsertNotification, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectNotification> {
  const validatedInput = notificationSchema.parse(input);
  const db = getDb();
  
  const now = new Date().toISOString();
  const [notification] = await db.insert(notifications).values({ 
    ...validatedInput, 
    id: crypto.randomUUID(), 
    createdAt: now, 
    updatedAt: now 
  }).returning();
  return notification;
}

export async function markNotificationRead(id: string): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  
  await db.update(notifications)
    .set({ readAt: now })
    .where(eq(notifications.id, id));
}