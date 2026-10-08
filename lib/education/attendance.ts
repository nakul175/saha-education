import type { Principal } from './types';
import { getDb } from '@/db/index';
import type { SelectAttendance, InsertAttendance } from '@/db/schema';
import { attendance as attendanceTable } from '@/db/schema';
import { attendanceSchema } from './validation';
import { and, eq, sql } from 'drizzle-orm';
import {
  AccessError,
  classReferenceScope,
  studentReferenceScope,
  assertClassWrite,
  assertStudentInClass,
} from './access';
import {
  AcademicConflict,
  academicStudentInClass,
  liveAcademicPrincipal,
  rethrowAcademicConflict,
} from './academic-integrity';

function scope(principal: Principal) {
  return and(
    liveAcademicPrincipal(principal),
    classReferenceScope(principal, attendanceTable.classId),
    studentReferenceScope(principal, attendanceTable.studentId),
  );
}
export async function listAttendance(
  principal: Principal,
  filter?: { classId?: string; date?: string; studentId?: string },
): Promise<SelectAttendance[]> {
  return await getDb()
    .select()
    .from(attendanceTable)
    .where(
      and(
        scope(principal),
        filter?.classId ? eq(attendanceTable.classId, filter.classId) : undefined,
        filter?.date ? eq(attendanceTable.date, filter.date) : undefined,
        filter?.studentId ? eq(attendanceTable.studentId, filter.studentId) : undefined,
      ),
    );
}
export async function getAttendance(principal: Principal, id: string): Promise<SelectAttendance | null> {
  const [record] = await getDb()
    .select()
    .from(attendanceTable)
    .where(and(eq(attendanceTable.id, id), scope(principal)))
    .limit(1);
  return record ?? null;
}
export async function createAttendance(
  principal: Principal,
  input: InsertAttendance,
): Promise<SelectAttendance> {
  const data = attendanceSchema.parse({ ...input, recordedBy: principal.id });
  await assertClassWrite(principal, data.classId);
  await assertStudentInClass(principal, data.studentId, data.classId);
  const now = new Date().toISOString();
  let record: SelectAttendance | undefined;
  try {
    [record] = await getDb()
      .insert(attendanceTable)
      .select(
        sql`select ${crypto.randomUUID()}, ${data.classId}, ${data.studentId},
      ${data.date}, ${data.status}, ${data.note ?? null}, ${principal.id}, ${now}, ${now}
      where ${academicStudentInClass(principal, data.studentId, data.classId)}`,
      )
      .returning();
  } catch (error) {
    rethrowAcademicConflict(error);
  }
  if (!record) throw new AcademicConflict();
  return record;
}
export async function markAttendance(
  principal: Principal,
  classId: string,
  date: string,
  entries: { studentId: string; status: 'present' | 'absent' | 'late' | 'excused'; note?: string }[],
  recordedBy: string,
): Promise<SelectAttendance[]> {
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
  const payload = JSON.stringify(
    rows.map((row) => ({
      id: crypto.randomUUID(),
      studentId: row.studentId,
      status: row.status,
      note: row.note ?? null,
    })),
  );
  // The entire batch has one eligibility predicate in one atomic statement.
  // Withdrawal, transfer or class reassignment cannot leave a partial batch.
  const eligible = sql`not exists (select 1 from json_each(${payload}) pending
    where not (${academicStudentInClass(principal, sql`json_extract(pending.value, '$.studentId')`, classId)}))`;
  let saved: SelectAttendance[];
  try {
    saved = await db
      .insert(attendanceTable)
      .select(
        sql`select json_extract(pending.value, '$.id'), ${classId},
      json_extract(pending.value, '$.studentId'), ${date}, json_extract(pending.value, '$.status'),
      json_extract(pending.value, '$.note'), ${principal.id}, ${now}, ${now} from json_each(${payload}) pending where ${eligible}`,
      )
      .onConflictDoUpdate({
        target: [attendanceTable.classId, attendanceTable.studentId, attendanceTable.date],
        set: {
          status: sql`excluded.status`,
          note: sql`excluded.note`,
          recordedBy: principal.id,
          updatedAt: now,
        },
      })
      .returning();
  } catch (error) {
    rethrowAcademicConflict(error);
  }
  if (saved.length !== rows.length) throw new AcademicConflict();
  return saved;
}
export function attendancePercentage(records: { status: string }[]): number {
  if (!records.length) return 0;
  return (
    (records.filter((record) => record.status === 'present' || record.status === 'late').length /
      records.length) *
    100
  );
}
