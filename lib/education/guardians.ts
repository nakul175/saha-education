import { getDb } from '@/db/index';
import type { SelectGuardian, InsertGuardian } from '@/db/schema';
import { guardianSchema } from './validation';
import { eq } from 'drizzle-orm';
import { guardians } from '@/db/schema';

export async function listGuardians(schoolId?: string): Promise<SelectGuardian[]> {
  const db = getDb();
  
  if (schoolId) {
    // This would require a join with users to filter by school - we need to adjust
    return await db.select().from(guardians);
  }
  
  return await db.select().from(guardians);
}

export async function getGuardian(id: string): Promise<SelectGuardian | null> {
  const db = getDb();
  const [guardian] = await db.select().from(guardians).where(eq(guardians.id, id)).limit(1);
  return guardian ?? null;
}

export async function createGuardian(input: Omit<InsertGuardian, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectGuardian> {
  const validatedInput = guardianSchema.parse(input);
  const db = getDb();
  
  const now = new Date().toISOString();
  const [guardian] = await db.insert(guardians).values({ 
    ...validatedInput, 
    id: crypto.randomUUID(), 
    createdAt: now, 
    updatedAt: now 
  }).returning();
  return guardian;
}

export async function updateGuardian(id: string, input: Omit<InsertGuardian, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectGuardian | null> {
  const validatedInput = guardianSchema.parse(input);
  const db = getDb();
  
  const now = new Date().toISOString();
  const [guardian] = await db.update(guardians)
    .set({ ...validatedInput, updatedAt: now })
    .where(eq(guardians.id, id))
    .returning();
  
  return guardian ?? null;
}