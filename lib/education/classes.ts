import { getDb } from '@/db/index';
import type { InsertClass, SelectClass } from '@/db/schema';
import { classSchema } from './validation';
import { classes as classesTable } from '@/db/schema';
import { sql } from 'drizzle-orm';

export async function listClasses(): Promise<SelectClass[]> {
  const db = getDb();
  return await db.select().from(classesTable);
}

export async function getClass(id: string): Promise<SelectClass | null> {
  const db = getDb();
  const [classEntry] = await db.select().from(classesTable).where(sql`id = ${id}`);
  return classEntry ?? null;
}

export async function createClass(input: InsertClass): Promise<SelectClass> {
  const validatedInput = classSchema.parse(input);
  const db = getDb();
  
  const [classEntry] = await db.insert(classesTable).values(validatedInput).returning();
  return classEntry;
}