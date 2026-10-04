import { getDb } from '@/db/index';
import type { InsertClass, SelectClass, SelectStudent } from '@/db/schema';
import { classSchema } from './validation';
import { classes as classesTable, students, enrolments } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

export async function listClasses({ schoolId, teacherId }: { schoolId?: string; teacherId?: string }): Promise<SelectClass[]> {
  const db = getDb();
  let whereClause = undefined;
  
  if (schoolId && teacherId) {
    whereClause = and(
      eq(classesTable.schoolId, schoolId),
      eq(classesTable.teacherId, teacherId)
    );
  } else if (schoolId) {
    whereClause = eq(classesTable.schoolId, schoolId);
  } else if (teacherId) {
    whereClause = eq(classesTable.teacherId, teacherId);
  }
  
  return await db.select().from(classesTable).where(whereClause);
}

export async function getClass(id: string): Promise<SelectClass | null> {
  const db = getDb();
  const [classEntry] = await db.select().from(classesTable).where(eq(classesTable.id, id)).limit(1);
  return classEntry ?? null;
}

export async function getClassWithStudents(id: string): Promise<{ class: SelectClass; students: SelectStudent[] } | null> {
  const db = getDb();
  
  // Get the class
  const [classEntry] = await db.select().from(classesTable).where(eq(classesTable.id, id)).limit(1);
  if (!classEntry) {
    return null;
  }
  
  // Get students enrolled in this class
  const studentEnrolments = await db.select({
    studentId: enrolments.studentId
  })
  .from(enrolments)
  .where(eq(enrolments.classId, id));
  
  if (studentEnrolments.length === 0) {
    return { class: classEntry, students: [] };
  }
  
  const studentIds = studentEnrolments.map(e => e.studentId);
  
  // Fix the logic for selecting multiple students
  const studentRows = await db.select().from(students).where(inArray(students.id, studentIds));
  
  return {
    class: classEntry,
    students: studentRows
  };
}

export async function createClass(input: Omit<InsertClass, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectClass> {
  const validatedInput = classSchema.parse(input);
  const db = getDb();
  
  // Generate the ID and timestamps
  const now = new Date().toISOString();
  const insertData: InsertClass = {
    ...validatedInput,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now
  };
  
  const [classEntry] = await db.insert(classesTable).values(insertData).returning();
  return classEntry;
}

export async function updateClass(id: string, input: Omit<InsertClass, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectClass | null> {
  const validatedInput = classSchema.parse(input);
  const db = getDb();
  
  // Generate the updated timestamp
  const now = new Date().toISOString();
  const updateData: Omit<InsertClass, 'id' | 'createdAt'> = {
    ...validatedInput,
    updatedAt: now
  };
  
  const [classEntry] = await db.update(classesTable).set(updateData).where(eq(classesTable.id, id)).returning();
  return classEntry ?? null;
}