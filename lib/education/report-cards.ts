import { getDb } from '@/db/index';
import type { InsertReportCard, SelectReportCard } from '@/db/schema';
import { reportCardSchema } from './validation';
import { reportCards } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function listReportCards(studentId?: string): Promise<SelectReportCard[]> {
  const db = getDb();
  if (studentId) {
    return await db.select().from(reportCards).where(eq(reportCards.studentId, studentId));
  }
  return await db.select().from(reportCards);
}

export async function getReportCard(id: string): Promise<SelectReportCard | null> {
  const db = getDb();
  const [reportCard] = await db.select().from(reportCards).where(eq(reportCards.id, id)).limit(1);
  return reportCard ?? null;
}

export async function createReportCard(input: Omit<InsertReportCard, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectReportCard> {
  const validatedInput = reportCardSchema.parse(input);
  const db = getDb();
  const now = new Date().toISOString();
  
  const [reportCard] = await db.insert(reportCards).values({ ...validatedInput, id: crypto.randomUUID(), createdAt: now, updatedAt: now }).returning();
  return reportCard;
}

export async function publishReportCard(id: string): Promise<SelectReportCard> {
  const db = getDb();
  
  const [updated] = await db.update(reportCards)
    .set({
      publishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
    .where(eq(reportCards.id, id))
    .returning();
    
  return updated;
}