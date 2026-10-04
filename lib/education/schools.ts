import { getDb } from '@/db/index';
import type { SelectSchool, InsertSchool } from '@/db/schema';
import { schoolSchema } from './validation';
import { eq } from 'drizzle-orm';
import { schools } from '@/db/schema';

export async function listSchools(): Promise<SelectSchool[]> {
  const db = getDb();
  return await db.select().from(schools);
}

export async function getSchool(id: string): Promise<SelectSchool | null> {
  const db = getDb();
  const [school] = await db.select().from(schools).where(eq(schools.id, id)).limit(1);
  return school ?? null;
}

export async function createSchool(input: Omit<InsertSchool, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectSchool> {
  const validatedInput = schoolSchema.parse(input);
  const db = getDb();
  
  const now = new Date().toISOString();
  const [school] = await db.insert(schools).values({ 
    ...validatedInput, 
    id: crypto.randomUUID(), 
    createdAt: now, 
    updatedAt: now 
  }).returning();
  return school;
}

export async function updateSchool(id: string, input: Omit<InsertSchool, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectSchool | null> {
  const validatedInput = schoolSchema.parse(input);
  const db = getDb();
  
  const now = new Date().toISOString();
  const [school] = await db.update(schools)
    .set({ ...validatedInput, updatedAt: now })
    .where(eq(schools.id, id))
    .returning();
  
  return school ?? null;
}