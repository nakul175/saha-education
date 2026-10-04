import { getDb } from '@/db/index';
import type { InsertGuardian, SelectGuardian } from '@/db/schema';
import { guardianSchema } from './validation';

export async function listGuardians(): Promise<SelectGuardian[]> {
  const db = getDb();
  return await db.select().from(db.schema.guardians);
}

export async function getGuardian(id: string): Promise<SelectGuardian | null> {
  const db = getDb();
  const [guardian] = await db.select().from(db.schema.guardians).where(db.sql`id = ${id}`);
  return guardian ?? null;
}

export async function createGuardian(input: InsertGuardian): Promise<SelectGuardian> {
  const validatedInput = guardianSchema.parse(input);
  const db = getDb();
  
  const [guardian] = await db.insert(db.schema.guardians).values(validatedInput).returning();
  return guardian;
}