import { getDb } from '@/db/index';
import type { InsertSchool, SelectSchool } from '@/db/schema';
import { schoolSchema } from './validation';

export async function listSchools(): Promise<SelectSchool[]> {
  const db = getDb();
  return await db.select().from(db.schema.schools);
}

export async function getSchool(id: string): Promise<SelectSchool | null> {
  const db = getDb();
  const [school] = await db.select().from(db.schema.schools).where(db.sql`id = ${id}`);
  return school ?? null;
}

export async function createSchool(input: InsertSchool): Promise<SelectSchool> {
  const validatedInput = schoolSchema.parse(input);
  const db = getDb();
  
  const [school] = await db.insert(db.schema.schools).values(validatedInput).returning();
  return school;
}