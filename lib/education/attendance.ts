import { getDb } from '@/db/index';
import type { SelectAttendance, InsertAttendance } from '@/db/schema';
import { attendanceSchema } from './validation';
import { sql, eq, desc, and } from 'drizzle-orm';
import { attendance as attendanceTable } from '@/db/schema';

export async function listAttendance(filter?: { classId?: string; date?: string; studentId?: string }): Promise<SelectAttendance[]> {
  const db = getDb();
  
  let query = db.select().from(attendanceTable);
  
  if (filter) {
    if (filter.classId) {
      query = query.where(eq(attendanceTable.classId, filter.classId));
    }
    if (filter.date) {
      query = query.where(eq(attendanceTable.date, filter.date));
    }
    if (filter.studentId) {
      query = query.where(eq(attendanceTable.studentId, filter.studentId));
    }
  }
  
  return await query;
}

export async function getAttendance(id: string): Promise<SelectAttendance | null> {
  const db = getDb();
  const [attendance] = await db.select().from(attendanceTable).where(eq(attendanceTable.id, id)).limit(1);
  return attendance ?? null;
}

export async function createAttendance(input: InsertAttendance): Promise<SelectAttendance> {
  const validatedInput = attendanceSchema.parse(input);
  const db = getDb();
  
  // Remove id from validated input since we'll generate one
  const { id, ...insertData } = validatedInput;
  
  const [attendance] = await db.insert(attendanceTable).values({
    ...insertData,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }).returning();
  return attendance;
}

export async function markAttendance(classId: string, date: string, entries: { studentId: string; status: 'present' | 'absent' | 'late' | 'excused'; note?: string }[], recordedBy: string): Promise<SelectAttendance[]> {
  const db = getDb();
  
  const results: SelectAttendance[] = [];
  
  // Upsert each record
  for (const entry of entries) {
    try {
      // Create a new record with required fields
      const newRecord: InsertAttendance = {
        id: crypto.randomUUID(),
        classId,
        studentId: entry.studentId,
        date,
        status: entry.status,
        note: entry.note,
        recordedBy,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      // Try to find existing attendance record first
      const existing = await db.select({ id: attendanceTable.id })
        .from(attendanceTable)
        .where(and(
          eq(attendanceTable.classId, classId),
          eq(attendanceTable.studentId, entry.studentId),
          eq(attendanceTable.date, date)
        ));
      
      if (existing.length > 0) {
        // Update existing
        const [updated] = await db.update(attendanceTable)
          .set({
            status: newRecord.status,
            note: newRecord.note,
            recordedBy: newRecord.recordedBy,
            updatedAt: new Date().toISOString()
          })
          .where(eq(attendanceTable.id, existing[0].id))
          .returning();
        results.push(updated);
      } else {
        // Create new
        const [attendance] = await db.insert(attendanceTable)
          .values(newRecord)
          .returning();
        results.push(attendance);
      }
    } catch (error) {
      // If this fails, we'll still return what we have so far
      throw error;
    }
  }
  
  return results;
}

export function attendancePercentage(records: { status: string }[]): number {
  if (records.length === 0) return 0;
  
  const attended = records.filter(record => record.status === 'present' || record.status === 'late').length;
  return (attended / records.length) * 100;
}