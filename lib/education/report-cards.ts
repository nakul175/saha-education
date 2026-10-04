import { getDb } from '@/db/index';
import type { InsertReportCard, SelectReportCard } from '@/db/schema';
import { reportCardSchema } from './validation';

export async function listReportCards(): Promise<SelectReportCard[]> {
  const db = getDb();
  return await db.select().from(db.schema.reportCards);
}

export async function getReportCard(id: string): Promise<SelectReportCard | null> {
  const db = getDb();
  const [reportCard] = await db.select().from(db.schema.reportCards).where(db.sql`id = ${id}`);
  return reportCard ?? null;
}

export async function createReportCard(input: InsertReportCard): Promise<SelectReportCard> {
  const validatedInput = reportCardSchema.parse(input);
  const db = getDb();
  
  const [reportCard] = await db.insert(db.schema.reportCards).values(validatedInput).returning();
  return reportCard;
}

export async function publishReportCard(id: string): Promise<SelectReportCard> {
  const db = getDb();
  
  const [updated] = await db.update(db.schema.reportCards)
    .set({
      publishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
    .where(db.sql`id = ${id}`)
    .returning();
    
  return updated;
}

export async function listReportCardsForStudent(studentId: string): Promise<SelectReportCard[]> {
  const db = getDb();
  return await db.select().from(db.schema.reportCards).where(db.sql`student_id = ${studentId}`);
}