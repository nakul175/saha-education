import { getDb } from '@/db/index';
import type { InsertEnrolment, SelectEnrolment } from '@/db/schema';
import { enrolmentSchema } from './validation';

export async function listEnrolments(): Promise<SelectEnrolment[]> {
  const db = getDb();
  return await db.select().from(db.schema.enrolments);
}

export async function getEnrolment(id: string): Promise<SelectEnrolment | null> {
  const db = getDb();
  const [enrolment] = await db.select().from(db.schema.enrolments).where(db.sql`id = ${id}`);
  return enrolment ?? null;
}

export async function createEnrolment(input: InsertEnrolment): Promise<SelectEnrolment> {
  const validatedInput = enrolmentSchema.parse(input);
  const db = getDb();
  
  const [enrolment] = await db.insert(db.schema.enrolments).values(validatedInput).returning();
  return enrolment;
}