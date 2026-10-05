import { getDb } from '@/db/index';
import type { SelectClass, InsertClass } from '@/db/schema';
import { classSchema } from './validation';
import { eq } from 'drizzle-orm';
import { classes } from '@/db/schema';

export async function listClasses(schoolId?: string): Promise<SelectClass[]> {
  const db = getDb();
  
  if (schoolId) {
    return await db.select().from(classes).where(eq(classes.schoolId, schoolId));
  }
  
  return await db.select().from(classes);
}

export async function getClass(id: string): Promise<SelectClass | null> {
  const db = getDb();
  const [classRecord] = await db.select().from(classes).where(eq(classes.id, id)).limit(1);
  return classRecord ?? null;
}

export async function createClass(input: Omit<InsertClass, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectClass> {
  const validatedInput = classSchema.parse(input);
  const db = getDb();
  
  const now = new Date().toISOString();
  const [classRecord] = await db.insert(classes).values({ 
    ...validatedInput, 
    id: crypto.randomUUID(), 
    createdAt: now, 
    updatedAt: now 
  }).returning();
  return classRecord;
}

export async function updateClass(id: string, input: Omit<InsertClass, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectClass | null> {
  const validatedInput = classSchema.parse(input);
  const db = getDb();
  
  const now = new Date().toISOString();
  const [classRecord] = await db.update(classes)
    .set({ ...validatedInput, updatedAt: now })
    .where(eq(classes.id, id))
    .returning();
  
  return classRecord ?? null;
}