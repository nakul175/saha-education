import { getDb } from '@/db/index';
import type { InsertAttendance, SelectAttendance } from '@/db/schema';
import { attendanceSchema } from './validation';
import { sql } from 'drizzle-orm';
import { attendance as attendanceTable } from '@/db/schema';

export async function listAttendance(): Promise<SelectAttendance[]> {
  const db = getDb();
  return await db.select().from(attendanceTable);
}

export async function getAttendance(id: string): Promise<SelectAttendance | null> {
  const db = getDb();
  const [attendance] = await db.select().from(attendanceTable).where(sql`id = ${id}`);
  return attendance ?? null;
}

export async function createAttendance(input: InsertAttendance): Promise<SelectAttendance> {
  const validatedInput = attendanceSchema.parse(input);
  const db = getDb();
  
  const [attendance] = await db.insert(attendanceTable).values(validatedInput).returning();
  return attendance;
}

export async function markAttendance(classId: string, date: string, studentId: string, status: 'present' | 'absent' | 'late' | 'excused', note?: string, recordedBy?: string): Promise<SelectAttendance> {
  const db = getDb();
  
  // Check if attendance already exists for this student on this date
  const existing = await db.select().from(attendanceTable)
    .where(sql`class_id = ${classId} AND student_id = ${studentId} AND date = ${date}`);
  
  if (existing.length > 0) {
    // Update existing attendance
    const [updated] = await db.update(attendanceTable)
      .set({
        status,
        note,
        recordedBy,
        updatedAt: new Date().toISOString()
      })
      .where(sql`id = ${existing[0].id}`)
      .returning();
    return updated;
  } else {
    // Create new attendance record
    const [attendance] = await db.insert(attendanceTable)
      .values({
        classId,
        date,
        studentId,
        status,
        note,
        recordedBy
      })
      .returning();
    return attendance;
  }
}

export async function getAttendanceSummary(studentId: string): Promise<{ 
  present: number, 
  absent: number, 
  late: number, 
  excused: number,
  total: number 
}> {
  const db = getDb();
  
  const result = await db.select({
    present: sql`COUNT(CASE WHEN status = 'present' THEN 1 END)`,
    absent: sql`COUNT(CASE WHEN status = 'absent' THEN 1 END)`,
    late: sql`COUNT(CASE WHEN status = 'late' THEN 1 END)`,
    excused: sql`COUNT(CASE WHEN status = 'excused' THEN 1 END)`,
    total: sql`COUNT(*)`
  }).from(attendanceTable)
  .where(sql`student_id = ${studentId}`);
  
  return {
    present: parseInt(result[0].present.toString()),
    absent: parseInt(result[0].absent.toString()),
    late: parseInt(result[0].late.toString()),
    excused: parseInt(result[0].excused.toString()),
    total: parseInt(result[0].total.toString())
  };
}