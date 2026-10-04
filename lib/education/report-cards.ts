import { getDb } from '@/db/index';
import type { SelectReportCard, InsertReportCard } from '@/db/schema';
import { reportCardSchema } from './validation';
import { eq } from 'drizzle-orm';
import { reportCards } from '@/db/schema';

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
  const [reportCard] = await db.insert(reportCards).values({ 
    ...validatedInput, 
    id: crypto.randomUUID(), 
    createdAt: now, 
    updatedAt: now 
  }).returning();
  return reportCard;
}

export async function publishReportCard(id: string): Promise<SelectReportCard | null> {
  const db = getDb();
  const now = new Date().toISOString();
  
  const [reportCard] = await db.update(reportCards)
    .set({ 
      publishedAt: now,
      updatedAt: now 
    })
    .where(eq(reportCards.id, id))
    .returning();
  
  return reportCard ?? null;
}