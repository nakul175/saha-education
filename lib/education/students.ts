import { getDb } from '@/db/index';
import type { InsertStudent, SelectStudent } from '@/db/schema';
import { studentSchema } from './validation';

export async function listStudents(): Promise<SelectStudent[]> {
  const db = getDb();
  return await db.select().from(db.schema.students);
}

export async function getStudent(id: string): Promise<SelectStudent | null> {
  const db = getDb();
  const [student] = await db.select().from(db.schema.students).where(db.sql`id = ${id}`);
  return student ?? null;
}

export async function createStudent(input: InsertStudent): Promise<SelectStudent> {
  const validatedInput = studentSchema.parse(input);
  const db = getDb();
  
  const [student] = await db.insert(db.schema.students).values(validatedInput).returning();
  return student;
}

export async function linkGuardian(studentId: string, guardianId: string): Promise<void> {
  const db = getDb();
  
  // Check if the relationship already exists
  const existing = await db.select().from(db.schema.studentGuardians)
    .where(db.sql`student_id = ${studentId} AND guardian_id = ${guardianId}`);
  
  if (existing.length === 0) {
    await db.insert(db.schema.studentGuardians).values({
      studentId,
      guardianId,
      isPrimary: false
    });
  }
}

export async function listGuardiansForStudent(studentId: string): Promise<{ guardian: SelectStudentGuardian, user?: SelectUser }[]> {
  const db = getDb();
  
  // Join with guardians table to get guardian data
  const result = await db.select({
    guardian: db.schema.studentGuardians,
    user: db.schema.users
  }).from(db.schema.studentGuardians)
  .leftJoin(db.schema.guardians, db.sql`student_guardians.guardian_id = guardians.id`)
  .leftJoin(db.schema.users, db.sql`guardians.user_id = users.id`)
  .where(db.sql`student_guardians.student_id = ${studentId}`);
  
  return result;
}