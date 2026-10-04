import { getDb } from '@/db/index';
import type { SelectStudent, InsertStudent } from '@/db/schema';
import { studentSchema } from './validation';
import { eq } from 'drizzle-orm';
import { students, studentGuardians, guardians } from '@/db/schema';

export async function listStudents(schoolId?: string): Promise<SelectStudent[]> {
  const db = getDb();
  
  if (schoolId) {
    return await db.select().from(students).where(eq(students.schoolId, schoolId));
  }
  
  return await db.select().from(students);
}

export async function getStudent(id: string): Promise<SelectStudent | null> {
  const db = getDb();
  const [student] = await db.select().from(students).where(eq(students.id, id)).limit(1);
  return student ?? null;
}

export async function createStudent(input: Omit<InsertStudent, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectStudent> {
  const validatedInput = studentSchema.parse(input);
  const db = getDb();
  
  const now = new Date().toISOString();
  const [student] = await db.insert(students).values({ 
    ...validatedInput, 
    id: crypto.randomUUID(), 
    createdAt: now, 
    updatedAt: now 
  }).returning();
  return student;
}

export async function updateStudent(id: string, input: Omit<InsertStudent, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectStudent | null> {
  const validatedInput = studentSchema.parse(input);
  const db = getDb();
  
  const now = new Date().toISOString();
  const [student] = await db.update(students)
    .set({ ...validatedInput, updatedAt: now })
    .where(eq(students.id, id))
    .returning();
  
  return student ?? null;
}

export async function linkGuardian(studentId: string, guardianId: string): Promise<void> {
  const db = getDb();
  
  await db.insert(studentGuardians).values({
    studentId,
    guardianId,
    isPrimary: 0
  });
}

export async function listGuardiansForStudent(studentId: string): Promise<{ id: string; name: string; relationship: string }[]> {
  const db = getDb();
  
  return await db.select({
    id: studentGuardians.guardianId,
    name: guardians.name,
    relationship: guardians.relationship
  })
  .from(studentGuardians)
  .innerJoin(guardians, eq(studentGuardians.guardianId, guardians.id))
  .where(eq(studentGuardians.studentId, studentId));
}