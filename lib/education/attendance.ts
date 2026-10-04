import { getDb } from '@/db/index';
import type { SelectAttendance, InsertAttendance } from '@/db/schema';
import { attendanceSchema } from './validation';
import { eq, and } from 'drizzle-orm';
import { attendance as attendanceTable } from '@/db/schema';

export async function listAttendance(filter?: { classId?: string; date?: string; studentId?: string }): Promise<SelectAttendance[]> {
  const db = getDb();
  
  // Simple direct approach without building complex query chains
  if (filter?.classId && filter?.date && filter?.studentId) {
    return await db.select().from(attendanceTable).where(and(
      eq(attendanceTable.classId, filter.classId),
      eq(attendanceTable.date, filter.date),
      eq(attendanceTable.studentId, filter.studentId)
    ));
  } else if (filter?.classId && filter?.date) {
    return await db.select().from(attendanceTable).where(and(
      eq(attendanceTable.classId, filter.classId),
      eq(attendanceTable.date, filter.date)
    ));
  } else if (filter?.classId && filter?.studentId) {
    return await db.select().from(attendanceTable).where(and(
      eq(attendanceTable.classId, filter.classId),
      eq(attendanceTable.studentId, filter.studentId)
    ));
  } else if (filter?.date && filter?.studentId) {
    return await db.select().from(attendanceTable).where(and(
      eq(attendanceTable.date, filter.date),
      eq(attendanceTable.studentId, filter.studentId)
    ));
  } else if (filter?.classId) {
    return await db.select().from(attendanceTable).where(eq(attendanceTable.classId, filter.classId));
  } else if (filter?.date) {
    return await db.select().from(attendanceTable).where(eq(attendanceTable.date, filter.date));
  } else if (filter?.studentId) {
    return await db.select().from(attendanceTable).where(eq(attendanceTable.studentId, filter.studentId));
  }
  
  // No filters applied
  return await db.select().from(attendanceTable);
}

export async function getAttendance(id: string): Promise<SelectAttendance | null> {
  const db = getDb();
  const rows = await db.select().from(attendanceTable).where(eq(attendanceTable.id, id)).limit(1);
  return rows[0] ?? null;
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
      
      // Try to find existing record first
      const [existing] = await db.select({ id: attendanceTable.id })
        .from(attendanceTable)
        .where(and(
          eq(attendanceTable.classId, classId),
          eq(attendanceTable.studentId, entry.studentId),
          eq(attendanceTable.date, date)
        ))
        .limit(1);
      
      if (existing) {
        // Update existing
        const [updated] = await db.update(attendanceTable)
          .set({
            status: newRecord.status,
            note: newRecord.note,
            recordedBy: newRecord.recordedBy,
            updatedAt: new Date().toISOString()
          })
          .where(eq(attendanceTable.id, existing.id))
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