import { getDb } from '@/db/index';
import type { SelectReportCard, InsertReportCard } from '@/db/schema';
import { reportCardSchema } from './validation';
import { eq } from 'drizzle-orm';
import { reportCards } from '@/db/schema';

export async function listReportCards(filter?: { studentId?: string; term?: string }): Promise<SelectReportCard[]> {
  const db = getDb();
  
  let query = db.select().from(reportCards);
  
  if (filter) {
    if (filter.studentId) {
      query = query.where(eq(reportCards.studentId, filter.studentId));
    }
    if (filter.term) {
      query = query.where(eq(reportCards.term, filter.term));
    }
  }
  
  return await query;
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

export async function updateReportCard(id: string, input: Omit<InsertReportCard, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectReportCard | null> {
  const validatedInput = reportCardSchema.parse(input);
  const db = getDb();
  
  const now = new Date().toISOString();
  const [reportCard] = await db.update(reportCards)
    .set({ ...validatedInput, updatedAt: now })
    .where(eq(reportCards.id, id))
    .returning();
  
  return reportCard ?? null;
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