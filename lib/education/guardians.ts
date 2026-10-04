import { getDb } from '@/db/index';
import type { InsertGuardian, SelectGuardian } from '@/db/schema';
import { guardianSchema } from './validation';
import { guardians, studentGuardians, students } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function listGuardians(): Promise<SelectGuardian[]> {
  const db = getDb();
  return await db.select().from(guardians);
}

export async function getGuardian(id: string): Promise<SelectGuardian | null> {
  const db = getDb();
  const [guardian] = await db.select().from(guardians).where(eq(guardians.id, id));
  return guardian ?? null;
}

export async function createGuardian(input: Omit<InsertGuardian, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectGuardian> {
  const db = getDb();
  const now = new Date().toISOString();
  
  // Validate the input first
  const parsedInput = guardianSchema.parse(input);
  
  // Create the final insert data with required fields set properly
  const insertData: InsertGuardian = {
    id: crypto.randomUUID(),
    name: parsedInput.name,
    phone: parsedInput.phone,
    email: parsedInput.email,
    relationship: parsedInput.relationship,
    userId: parsedInput.userId,
    createdAt: now,
    updatedAt: now
  };
  
  const [guardian] = await db.insert(guardians).values(insertData).returning();
  return guardian;
}

export async function updateGuardian(id: string, input: Partial<Omit<InsertGuardian, 'id' | 'createdAt'>>): Promise<SelectGuardian | null> {
  const db = getDb();
  const now = new Date().toISOString();
  
  const [guardian] = await db.update(guardians)
    .set({ ...input, updatedAt: now })
    .where(eq(guardians.id, id))
    .returning();
    
  return guardian ?? null;
}

export async function listStudentsForGuardian(guardianId: string) {
  const db = getDb();
  return db.select({
    studentId: studentGuardians.studentId,
    firstName: students.firstName,
    lastName: students.lastName
  })
  .from(studentGuardians)
  .innerJoin(students, eq(studentGuardians.studentId, students.id))
  .where(eq(studentGuardians.guardianId, guardianId));
}