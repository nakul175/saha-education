import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/index';
import { enrolments, students, users } from '@/db/schema';
import { studentRecordStatus, studentStatusEvents } from '@/db/school-records-schema';
import { AccessError, assertAdmin, assertPrincipal, livePrincipalScope, studentScope } from './access';
import {
  RecordConflict,
  calendarDate,
  constraintFailure,
  digestOf,
  nextStamp,
  plainText,
  reasonSchema,
  requestIdSchema,
  timestampSchema,
  todayUtc,
  versionSchema,
} from './record-support';
import { profileActorScope, profileAdminScope } from './profile-links';
import type { Principal } from './types';

export type StudentStatus = 'active' | 'inactive';
export type StudentRecord = {
  id: string;
  schoolId: string;
  hasLogin: boolean;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  admissionNumber: string;
  gradeLevel: string;
  createdAt: string;
  updatedAt: string;
  status: StudentStatus;
  statusVersion: number;
  statusChangedAt: string | null;
};
export type StudentDirectory = {
  items: StudentRecord[];
  total: number;
  limit: number;
  offset: number;
  grades: string[];
};
export type StudentStatusEventView = {
  id: string;
  action: 'deactivate' | 'reactivate';
  reason: string;
  withdrawnEnrolments: number;
  resultingVersion: number;
  actorName: string;
  createdAt: string;
};
export type StudentRecordDetail = {
  student: StudentRecord;
  activeEnrolments: number;
  history: StudentStatusEventView[];
};

export const directoryQuerySchema = z
  .object({
    q: z.string().max(100).optional(),
    grade: z.string().max(20).optional(),
    status: z.enum(['active', 'inactive', 'all']).default('active'),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).max(100000).default(0),
  })
  .strict();
export const studentEditSchema = z
  .object({
    firstName: plainText('First name', 80),
    lastName: plainText('Last name', 80),
    dateOfBirth: calendarDate.refine(
      (value) => value >= '1900-01-01' && value <= todayUtc(),
      'Enter a birth date that is not in the future',
    ),
    admissionNumber: plainText('Admission number', 40),
    gradeLevel: plainText('Grade level', 20),
    expectedUpdatedAt: timestampSchema,
  })
  .strict();
export const studentStatusSchema = z
  .object({
    action: z.enum(['deactivate', 'reactivate']),
    reason: reasonSchema,
    expectedVersion: versionSchema,
    clientRequestId: requestIdSchema,
  })
  .strict();
export type StudentEditInput = z.input<typeof studentEditSchema>;
export type StudentStatusInput = z.input<typeof studentStatusSchema>;

const statusColumn = sql<StudentStatus>`coalesce(${studentRecordStatus.status}, 'active')`;
const versionColumn = sql<number>`coalesce(${studentRecordStatus.version}, 0)`;
const recordColumns = {
  id: students.id,
  schoolId: students.schoolId,
  hasLogin: sql<number>`case when ${students.userId} is null then 0 else 1 end`,
  firstName: students.firstName,
  lastName: students.lastName,
  dateOfBirth: students.dateOfBirth,
  admissionNumber: students.admissionNumber,
  gradeLevel: students.gradeLevel,
  createdAt: students.createdAt,
  updatedAt: students.updatedAt,
  status: statusColumn,
  statusVersion: versionColumn,
  statusChangedAt: studentRecordStatus.changedAt,
};
async function liveAdmin(principal: Principal): Promise<void> {
  const [actor] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, principal.id), profileAdminScope(principal)))
    .limit(1);
  if (!actor) throw new AccessError('Administrator access required');
}
const toRecord = (row: { hasLogin: number | boolean }) => ({ ...row, hasLogin: Boolean(row.hasLogin) });
function selectRecords() {
  return getDb()
    .select(recordColumns)
    .from(students)
    .leftJoin(studentRecordStatus, eq(studentRecordStatus.studentId, students.id));
}

/** Search/filter stay inside the caller's existing scope (administrator: own school; teacher: assigned
 * classes; guardian: linked children; student: self). Every term must match name, admission number or grade. */
export async function listStudentDirectory(
  principal: Principal,
  value: z.input<typeof directoryQuerySchema> = {},
): Promise<StudentDirectory> {
  assertPrincipal(principal);
  const query = directoryQuerySchema.parse(value);
  const terms = (query.q ?? '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5);
  const haystack = sql`lower(${students.firstName} || ' ' || ${students.lastName} || ' ' || ${students.admissionNumber})`;
  const where = and(
    studentScope(principal),
    profileActorScope(principal),
    query.grade ? eq(students.gradeLevel, query.grade) : undefined,
    query.status === 'all' ? undefined : sql`${statusColumn} = ${query.status}`,
    ...terms.map((term) => sql`instr(${haystack}, ${term}) > 0`),
  );
  const db = getDb();
  const items = await selectRecords()
    .where(where)
    .orderBy(students.lastName, students.firstName, students.id)
    .limit(query.limit)
    .offset(query.offset);
  const [count] = await db
    .select({ total: sql<number>`count(*)` })
    .from(students)
    .leftJoin(studentRecordStatus, eq(studentRecordStatus.studentId, students.id))
    .where(where);
  const grades = await db
    .selectDistinct({ grade: students.gradeLevel })
    .from(students)
    .where(and(studentScope(principal), profileActorScope(principal)))
    .orderBy(students.gradeLevel)
    .limit(100);
  await liveActorFor(principal);
  return {
    items: items.map(toRecord) as StudentRecord[],
    total: Number(count?.total ?? 0),
    limit: query.limit,
    offset: query.offset,
    grades: grades.map((row) => row.grade),
  };
}
async function liveActorFor(principal: Principal): Promise<void> {
  const [actor] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, principal.id), profileActorScope(principal)))
    .limit(1);
  if (!actor) throw new AccessError('School access required');
}

function eventView(row: {
  id: string;
  action: string;
  reason: string;
  withdrawnEnrolments: number;
  resultingVersion: number;
  actorName: string | null;
  createdAt: string;
}): StudentStatusEventView {
  return {
    id: row.id,
    action: row.action as StudentStatusEventView['action'],
    reason: row.reason,
    withdrawnEnrolments: row.withdrawnEnrolments,
    resultingVersion: row.resultingVersion,
    actorName: row.actorName ?? 'Former administrator',
    createdAt: row.createdAt,
  };
}
export async function getStudentRecord(principal: Principal, id: string): Promise<StudentRecordDetail> {
  assertAdmin(principal);
  const [student] = await selectRecords()
    .where(and(eq(students.id, id), studentScope(principal), profileAdminScope(principal)))
    .limit(1);
  if (!student) throw new AccessError('Student not found', 404);
  const db = getDb();
  const [active] = await db
    .select({ n: sql<number>`count(*)` })
    .from(enrolments)
    .where(and(eq(enrolments.studentId, id), eq(enrolments.status, 'active')));
  const history = await db
    .select({
      id: studentStatusEvents.id,
      action: studentStatusEvents.action,
      reason: studentStatusEvents.reason,
      withdrawnEnrolments: studentStatusEvents.withdrawnEnrolments,
      resultingVersion: studentStatusEvents.resultingVersion,
      actorName: users.name,
      createdAt: studentStatusEvents.createdAt,
    })
    .from(studentStatusEvents)
    .leftJoin(users, eq(users.id, studentStatusEvents.actorId))
    .where(and(eq(studentStatusEvents.studentId, id), eq(studentStatusEvents.schoolId, principal.schoolId!)))
    .orderBy(sql`${studentStatusEvents.resultingVersion} desc`)
    .limit(50);
  await liveAdmin(principal);
  return {
    student: toRecord(student) as StudentRecord,
    activeEnrolments: Number(active?.n ?? 0),
    history: history.map(eventView),
  };
}

/** Version-checked ordinary edit. The login binding is never touched here (reviewed link workflow). */
export async function updateStudentRecord(
  principal: Principal,
  id: string,
  value: StudentEditInput,
): Promise<StudentRecord> {
  assertAdmin(principal);
  const input = studentEditSchema.parse(value);
  const db = getDb();
  const [existing] = await db
    .select({ id: students.id, updatedAt: students.updatedAt })
    .from(students)
    .where(and(eq(students.id, id), studentScope(principal), profileAdminScope(principal)))
    .limit(1);
  if (!existing) throw new AccessError('Student not found', 404);
  const [taken] = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.admissionNumber, input.admissionNumber), sql`${students.id} <> ${id}`))
    .limit(1);
  if (taken) throw new RecordConflict('admission-number');
  let updated: { id: string }[] = [];
  try {
    updated = await db
      .update(students)
      .set({
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth,
        admissionNumber: input.admissionNumber,
        gradeLevel: input.gradeLevel,
        updatedAt: nextStamp(existing.updatedAt),
      })
      .where(
        and(
          eq(students.id, id),
          studentScope(principal),
          profileAdminScope(principal),
          eq(students.updatedAt, input.expectedUpdatedAt),
        ),
      )
      .returning({ id: students.id });
  } catch (error) {
    if (constraintFailure(error, /UNIQUE constraint failed: students\.admission_number/))
      throw new RecordConflict('admission-number');
    throw error;
  }
  if (!updated[0]) {
    await liveAdmin(principal);
    throw new RecordConflict('stale');
  }
  const [saved] = await selectRecords()
    .where(and(eq(students.id, id), studentScope(principal), profileAdminScope(principal)))
    .limit(1);
  if (!saved) throw new AccessError('Student not found', 404);
  return toRecord(saved) as StudentRecord;
}

/** Deactivate/reactivate is append-only history: nothing is deleted. Deactivation withdraws the student's
 * active enrolments (rows retained) in the same atomic batch; reactivation never re-enrols automatically. */
export async function setStudentStatus(
  principal: Principal,
  id: string,
  value: StudentStatusInput,
): Promise<{ detail: StudentRecordDetail; replayed: boolean }> {
  assertAdmin(principal);
  const input = studentStatusSchema.parse(value);
  const db = getDb(),
    schoolId = principal.schoolId!;
  const hash = await digestOf({
    studentId: id,
    action: input.action,
    reason: input.reason,
    expectedVersion: input.expectedVersion,
  });
  const [prior] = await db
    .select()
    .from(studentStatusEvents)
    .where(eq(studentStatusEvents.id, input.clientRequestId))
    .limit(1);
  if (prior) {
    if (prior.actorId !== principal.id || prior.schoolId !== schoolId || prior.requestHash !== hash)
      throw new RecordConflict('request-reused');
    return { detail: await getStudentRecord(principal, id), replayed: true };
  }
  const [target] = await selectRecords()
    .where(and(eq(students.id, id), studentScope(principal), profileAdminScope(principal)))
    .limit(1);
  if (!target) throw new AccessError('Student not found', 404);
  const wanted: StudentStatus = input.action === 'deactivate' ? 'inactive' : 'active';
  if (target.status === wanted)
    throw new RecordConflict(wanted === 'inactive' ? 'already-inactive' : 'already-active');
  const stamp = new Date().toISOString(),
    attemptId = crypto.randomUUID();
  const own = sql`exists (select 1 from student_status_events where id = ${input.clientRequestId} and attempt_id = ${attemptId})`;
  try {
    await db.batch([
      db.insert(studentStatusEvents)
        .select(sql`select ${input.clientRequestId}, ${schoolId}, ${id}, ${principal.id}, ${input.action}, ${input.expectedVersion}, ${input.expectedVersion + 1}, ${input.reason},
        ${input.action === 'deactivate' ? sql`(select count(*) from enrolments where student_id = ${id} and status = 'active')` : sql`0`}, ${stamp}, ${hash}, ${attemptId}
        from students where students.id = ${id} and students.school_id = ${schoolId} and ${livePrincipalScope(principal)}
        and coalesce((select version from student_record_status where student_id = ${id}), 0) = ${input.expectedVersion}
        and coalesce((select status from student_record_status where student_id = ${id}), 'active') = ${input.action === 'deactivate' ? 'active' : 'inactive'}
        and not exists (select 1 from student_status_events where id = ${input.clientRequestId})`),
      db
        .insert(studentRecordStatus)
        .select(
          sql`select student_id, ${wanted}, resulting_version, actor_id, created_at from student_status_events
        where id = ${input.clientRequestId} and attempt_id = ${attemptId}`,
        )
        .onConflictDoUpdate({
          target: studentRecordStatus.studentId,
          set: { status: wanted, version: sql`excluded.version`, changedBy: principal.id, changedAt: stamp },
        }),
      ...(input.action === 'deactivate'
        ? [
            db
              .update(enrolments)
              .set({ status: 'withdrawn', updatedAt: stamp })
              .where(and(eq(enrolments.studentId, id), eq(enrolments.status, 'active'), own)),
          ]
        : []),
    ]);
  } catch (error) {
    if (constraintFailure(error, /constraint/i)) throw new RecordConflict('stale');
    throw error;
  }
  const [saved] = await db
    .select({ id: studentStatusEvents.id })
    .from(studentStatusEvents)
    .where(
      and(eq(studentStatusEvents.id, input.clientRequestId), eq(studentStatusEvents.attemptId, attemptId)),
    )
    .limit(1);
  if (!saved) {
    await liveAdmin(principal);
    throw new RecordConflict('stale');
  }
  return { detail: await getStudentRecord(principal, id), replayed: false };
}
