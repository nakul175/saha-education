import { getDb } from '@/db/index';
import type { SelectEnrolment, InsertEnrolment } from '@/db/schema';
import { enrolmentSchema } from './validation';
import { eq, and } from 'drizzle-orm';
import { enrolments } from '@/db/schema';

export async function listEnrolments(filter?: { studentId?: string; classId?: string }): Promise<SelectEnrolment[]> {
  const db = getDb();
  
  if (filter?.studentId && filter?.classId) {
    return await db.select().from(enrolments).where(and(
      eq(enrolments.studentId, filter.studentId),
      eq(enrolments.classId, filter.classId)
    ));
  } else if (filter?.studentId) {
    return await db.select().from(enrolments).where(eq(enrolments.studentId, filter.studentId));
  } else if (filter?.classId) {
    return await db.select().from(enrolments).where(eq(enrolments.classId, filter.classId));
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

export async function updateEnrolmentStatus(id: string, status: 'active' | 'withdrawn' | 'completed'): Promise<SelectEnrolment | null> {
  const db = getDb();
  const now = new Date().toISOString();
  const [enrolment] = await db.update(enrolments)
    .set({ status, updatedAt: now })
    .where(eq(enrolments.id, id))
    .returning();
  
  return enrolment ?? null;
}

export async function enrolStudent(studentId: string, classId: string): Promise<SelectEnrolment> {
  const db = getDb();
  const now = new Date().toISOString();
  
  // First check if the student is already enrolled in this class
  const existingEnrolment = await db.select()
    .from(enrolments)
    .where(and(
      eq(enrolments.studentId, studentId),
      eq(enrolments.classId, classId)
    ))
    .limit(1);
  
  if (existingEnrolment.length > 0) {
    throw new Error('Student is already enrolled in this class');
  }
  
  const [enrolment] = await db.insert(enrolments).values({
    studentId,
    classId,
    status: 'active',
    enrolledAt: now,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now
  }).returning();
  
  return enrolment;
}