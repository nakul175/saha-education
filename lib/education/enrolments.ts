import { getDb } from '@/db/index';
import type { InsertEnrolment, SelectEnrolment } from '@/db/schema';
import { enrolmentSchema } from './validation';
import { eq, and } from 'drizzle-orm';
import { enrolments } from '@/db/schema';

export async function listEnrolments({ studentId, classId }: { studentId?: string; classId?: string }): Promise<SelectEnrolment[]> {
  const db = getDb();
  
  if (studentId && classId) {
    return await db.select().from(enrolments).where(and(
      eq(enrolments.studentId, studentId),
      eq(enrolments.classId, classId)
    ));
  } else if (studentId) {
    return await db.select().from(enrolments).where(eq(enrolments.studentId, studentId));
  } else if (classId) {
    return await db.select().from(enrolments).where(eq(enrolments.classId, classId));
  } else {
    return await db.select().from(enrolments);
  }
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

export async function updateEnrolmentStatus(id: string, status: 'active' | 'withdrawn' | 'completed'): Promise<SelectEnrolment> {
  const db = getDb();
  const now = new Date().toISOString();
  
  const [enrolment] = await db.update(enrolments)
    .set({ 
      status,
      updatedAt: now
    })
    .where(eq(enrolments.id, id))
    .returning();
    
  return enrolment;
}

export async function enrolStudent(studentId: string, classId: string): Promise<SelectEnrolment> {
  const db = getDb();
  const now = new Date().toISOString();
  
  // Use the validation schema to check the required fields
  const validatedInput = enrolmentSchema.parse({
    studentId,
    classId,
    status: 'active',
    enrolledAt: now
  });
  
  const [enrolment] = await db.insert(enrolments).values({ 
    ...validatedInput, 
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now
  }).returning();
  
  return enrolment;
}