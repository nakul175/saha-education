import { getDb } from '@/db/index';
import type { SelectEnrolment, InsertEnrolment } from '@/db/schema';
import { enrolmentSchema } from './validation';
import { eq } from 'drizzle-orm';
import { enrolments } from '@/db/schema';

export async function listEnrolments(filter?: { studentId?: string; classId?: string }): Promise<SelectEnrolment[]> {
  const db = getDb();
  
  let query = db.select().from(enrolments);
  
  if (filter) {
    if (filter.studentId) {
      query = query.where(eq(enrolments.studentId, filter.studentId));
    }
    if (filter.classId) {
      query = query.where(eq(enrolments.classId, filter.classId));
    }
  }
  
  return await query;
}

export async function getEnrolment(id: string): Promise<SelectEnrolment | null> {
  const db = getDb();
  const [enrolment] = await db.select().from(enrolments).where(eq(enrolments.id, id)).limit(1);
  return enrolment ?? null;
}

export async function createEnrolment(input: Omit<InsertEnrolment, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectEnrolment> {
  const validatedInput = enrolmentSchema.parse(input);
  const db = getDb();
  
  const now = new Date().toISOString();
  const [enrolment] = await db.insert(enrolments).values({ 
    ...validatedInput, 
    id: crypto.randomUUID(), 
    createdAt: now, 
    updatedAt: now 
  }).returning();
  return enrolment;
}

export async function updateEnrolment(id: string, input: Omit<InsertEnrolment, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectEnrolment | null> {
  const validatedInput = enrolmentSchema.parse(input);
  const db = getDb();
  
  const now = new Date().toISOString();
  const [enrolment] = await db.update(enrolments)
    .set({ ...validatedInput, updatedAt: now })
    .where(eq(enrolments.id, id))
    .returning();
  
  return enrolment ?? null;
}