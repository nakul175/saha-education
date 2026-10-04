import { getDb } from '@/db/index';
import type { 
  InsertStudent, 
  SelectStudent,
  SelectGuardian,
  SelectStudentGuardian,
  SelectUser
} from '@/db/schema';
import { studentSchema } from './validation';
import { eq, and, or, like, desc, asc, sql, inArray } from 'drizzle-orm';
import { students, guardians, studentGuardians } from '@/db/schema';

export async function listStudents(search?: string): Promise<SelectStudent[]> {
  const db = getDb();
  
  if (search) {
    return await db.select().from(students)
      .where(or(
        like(students.firstName, `%${search}%`),
        like(students.lastName, `%${search}%`),
        like(students.admissionNumber, `%${search}%`)
      ));
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

export async function updateStudent(id: string, input: Omit<InsertStudent, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectStudent> {
  const db = getDb();
  const now = new Date().toISOString();
  
  const [student] = await db.update(students).set({ 
    ...input, 
    updatedAt: now 
  }).where(eq(students.id, id)).returning();
  
  return student;
}

export async function linkGuardian(studentId: string, guardianId: string, isPrimary = false): Promise<void> {
  const db = getDb();
  
  // Check if the relationship already exists
  const existing = await db.select().from(studentGuardians)
    .where(and(
      eq(studentGuardians.studentId, studentId),
      eq(studentGuardians.guardianId, guardianId)
    ));
  
  if (existing.length === 0) {
    await db.insert(studentGuardians).values({
      studentId,
      guardianId,
      isPrimary: isPrimary ? 1 : 0
    });
  }
}

export async function listGuardiansForStudent(studentId: string) {
  const db = getDb();
  return db.select({ 
    guardian: guardians, 
    isPrimary: studentGuardians.isPrimary 
  })
  .from(studentGuardians)
  .innerJoin(guardians, eq(studentGuardians.guardianId, guardians.id))
  .where(eq(studentGuardians.studentId, studentId));
}