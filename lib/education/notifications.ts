import { getDb } from '@/db/index';
import type { InsertNotification, SelectNotification } from '@/db/schema';
import { notificationSchema } from './validation';
import { eq, sql, desc } from 'drizzle-orm';
import { notifications, users, guardians, studentGuardians } from '@/db/schema';

export async function listNotifications(): Promise<SelectNotification[]> {
  const db = getDb();
  return await db.select().from(notifications);
}

export async function getNotification(id: string): Promise<SelectNotification | null> {
  const db = getDb();
  const [notification] = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
  return notification ?? null;
}

export async function createNotification(input: InsertNotification): Promise<SelectNotification> {
  // Validate input
  const validatedInput = notificationSchema.parse(input);
  const db = getDb();
  
  // Add required fields and process the insert properly
  const now = new Date().toISOString();
  const insertValues = {
    ...validatedInput,
    id: validatedInput.id || crypto.randomUUID(),
    createdAt: validatedInput.createdAt || now,
    updatedAt: validatedInput.updatedAt || now
  };
  
  const [notification] = await db.insert(notifications).values(insertValues).returning();
  return notification;
}

export async function listNotificationsForUser(userId: string): Promise<SelectNotification[]> {
  const db = getDb();
  return await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
}

export async function markNotificationRead(id: string): Promise<SelectNotification> {
  const db = getDb();
  
  const [updated] = await db.update(notifications)
    .set({
      readAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
    .where(eq(notifications.id, id))
    .returning();
    
  return updated;
}

export async function notifyGuardiansOfStudent(studentId: string, title: string, body: string): Promise<void> {
  const db = getDb();
  
  // Get all guardians for this student
  const guardianLinks = await db.select({
    guardianId: studentGuardians.guardianId
  })
  .from(studentGuardians)
  .where(eq(studentGuardians.studentId, studentId));
  
  // For each guardian, get their userId and create notification
  for (const link of guardianLinks) {
    const guardian = await db.select({
      userId: guardians.userId
    })
    .from(guardians)
    .where(eq(guardians.id, link.guardianId))
    .limit(1);
    
    // Only create notification if guardian has a userId
    if (guardian.length > 0 && guardian[0].userId) {
      const now = new Date().toISOString();
      
      await db.insert(notifications).values({
        id: crypto.randomUUID(),
        userId: guardian[0].userId,
        channel: 'in_app',
        title,
        body,
        readAt: null,
        createdAt: now,
        updatedAt: now
      });
    }
  }
}