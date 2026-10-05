import type { Principal } from './types';
import { getDb } from '@/db/index';
import type { SelectAttendance, InsertAttendance } from '@/db/schema';
import { attendance as attendanceTable } from '@/db/schema';
import { attendanceSchema } from './validation';
import { and, eq } from 'drizzle-orm';
import { AccessError, classReferenceScope, studentReferenceScope, assertClassWrite, assertStudentInClass } from './access';

function scope(principal: Principal) { return and(classReferenceScope(principal, attendanceTable.classId), studentReferenceScope(principal, attendanceTable.studentId)); }
export async function listAttendance(principal: Principal, filter?: { classId?: string; date?: string; studentId?: string }): Promise<SelectAttendance[]> {
  return await getDb().select().from(attendanceTable).where(and(scope(principal),
    filter?.classId ? eq(attendanceTable.classId, filter.classId) : undefined,
    filter?.date ? eq(attendanceTable.date, filter.date) : undefined,
    filter?.studentId ? eq(attendanceTable.studentId, filter.studentId) : undefined));
}
export async function getAttendance(principal: Principal, id: string): Promise<SelectAttendance | null> {
  const [record] = await getDb().select().from(attendanceTable).where(and(eq(attendanceTable.id, id), scope(principal))).limit(1);
  return record ?? null;
}
export async function createAttendance(principal: Principal, input: InsertAttendance): Promise<SelectAttendance> {
  const data = attendanceSchema.parse({ ...input, recordedBy: principal.id });
  await assertClassWrite(principal, data.classId);
  await assertStudentInClass(principal, data.studentId, data.classId);
  const now = new Date().toISOString();
  const [record] = await getDb().insert(attendanceTable).values({ ...data, id: crypto.randomUUID(), recordedBy: principal.id, createdAt: now, updatedAt: now }).returning();
  return record;
}
export async function markAttendance(principal: Principal, classId: string, date: string, entries: { studentId: string; status: 'present' | 'absent' | 'late' | 'excused'; note?: string }[], recordedBy: string): Promise<SelectAttendance[]> {
  await assertClassWrite(principal, classId);
  if (recordedBy !== principal.id) throw new AccessError('Recorder must match the authenticated user', 400);
  const seen = new Set<string>();
  // Authorize and validate every entry before any write is attempted.
  const rows = [];
  for (const entry of entries) {
    if (seen.has(entry.studentId)) throw new AccessError('Duplicate student in attendance batch', 400);
    seen.add(entry.studentId);
    const row = attendanceSchema.parse({ ...entry, classId, date, recordedBy: principal.id });
    await assertStudentInClass(principal, row.studentId, classId);
    rows.push(row);
  }
  if (!rows.length) return [];
  const db = getDb();
  const now = new Date().toISOString();
  const queries = rows.map(row => db.insert(attendanceTable).values({ ...row, id: crypto.randomUUID(), createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: [attendanceTable.classId, attendanceTable.studentId, attendanceTable.date], set: { status: row.status, note: row.note ?? null, recordedBy: principal.id, updatedAt: now } }).returning());
  // D1 batch is transactional: a database failure rolls back the full set.
  const results = await db.batch(queries as [typeof queries[number], ...typeof queries[number][]]);
  return results.flat();
}
export function attendancePercentage(records: { status: string }[]): number {
  if (!records.length) return 0;
  return records.filter(record => record.status === 'present' || record.status === 'late').length / records.length * 100;
}
