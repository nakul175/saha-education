import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db/index';
import { classes, courses, enrolments, students, users } from '@/db/schema';
import { academicChangeRequests, academicEvents, classSettings, courseLifecycle, enrolmentLifecycle } from '@/db/academic-lifecycle-schema';
import { AccessError, assertAdmin, assertPrincipal, classScope, livePrincipalScope, studentScope } from './access';
import { isExactCalendarDate } from './calendar-date';
import type { Principal } from './types';
import type { ChangeKind, ChangeReceipt, ChangeRequest, ChangeResult, ClassLifecycle, CourseLifecycle, HistoryEvent, ReceiptItem, RosterRow, StudentHistory } from './academic-lifecycle-types';

/** Stable machine-readable outcome. `http.ts` returns the code beside the generic status text; it never carries record contents. */
export class LifecycleError extends AccessError {
  readonly code: string;
  constructor(code: string, status: 400 | 403 | 404 | 409 = 409) { super(code, status); this.code = code; }
}

// ---------------------------------------------------------------- input
const requestId = z.string().uuid().transform(value => value.toLowerCase());
const token = z.string().min(1).max(64);
const plain = (max: number) => z.string().trim().min(1).max(max).refine(value => !/[\u0000-\u001f\u007f<>]/.test(value), 'Plain text only');
const optionalPlain = (max: number) => z.union([z.string().trim().max(max).refine(value => !/[\u0000-\u001f\u007f<>]/.test(value), 'Plain text only'), z.null()]).optional()
  .transform(value => value === undefined || value === null || value === '' ? null : value);
const day = z.string().refine(isExactCalendarDate, 'Use a real calendar date (YYYY-MM-DD)');
const optionalDay = z.union([day, z.null(), z.literal('')]).optional().transform(value => value ? value : null);
const capacity = z.union([z.number().int().min(1).max(500), z.null()]).optional().transform(value => value ?? null);
const id = z.string().min(1).max(120);

const courseFields = { code: plain(60), title: plain(200), description: optionalPlain(2000), gradeLevel: plain(40) };
const classFields = { courseId: id, name: plain(120), term: plain(80), schedule: optionalPlain(200), capacity, startsOn: optionalDay, endsOn: optionalDay };
const changeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('course.create'), ...courseFields }).strict(),
  z.object({ kind: z.literal('course.edit'), courseId: id, expectedUpdatedAt: token, ...courseFields }).strict(),
  z.object({ kind: z.enum(['course.retire', 'course.reinstate']), courseId: id, expectedUpdatedAt: token }).strict(),
  z.object({ kind: z.literal('class.create'), teacherId: id, ...classFields }).strict(),
  z.object({ kind: z.literal('class.edit'), classId: id, expectedUpdatedAt: token, ...classFields }).strict(),
  z.object({ kind: z.literal('class.teacher'), classId: id, expectedUpdatedAt: token, teacherId: z.union([id, z.null()]) }).strict(),
  z.object({ kind: z.literal('class.close'), classId: id, expectedUpdatedAt: token, completeActive: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal('class.reopen'), classId: id, expectedUpdatedAt: token }).strict(),
  z.object({ kind: z.literal('enrolment.enrol'), studentId: id, classId: id, effectiveOn: day }).strict(),
  z.object({ kind: z.enum(['enrolment.withdraw', 'enrolment.complete', 'enrolment.reenrol']), enrolmentId: id, expectedUpdatedAt: token, effectiveOn: day }).strict(),
  z.object({ kind: z.literal('enrolment.transfer'), enrolmentId: id, expectedUpdatedAt: token, toClassId: id, effectiveOn: day }).strict(),
]);
const reason = z.string().trim().min(5).max(500).refine(value => !/[\u0000-\u001f\u007f<>]/.test(value), 'Plain text only');
export const changeRequestSchema = z.object({
  clientRequestId: requestId,
  reason: reason.optional(),
  changes: z.array(changeSchema).min(1).max(25),
}).strict();
type Change = z.infer<typeof changeSchema>;
const NEEDS_REASON = new Set<ChangeKind>(['course.edit', 'course.retire', 'course.reinstate', 'class.edit', 'class.teacher', 'class.close', 'class.reopen', 'enrolment.withdraw', 'enrolment.complete', 'enrolment.reenrol', 'enrolment.transfer']);

// ---------------------------------------------------------------- helpers
type Item = { id: string; kind: ChangeKind; subjectId: string; classId: string | null; relatedClassId: string | null; studentId: string | null; effectiveOn: string | null; payload: Record<string, unknown> };
const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : 1).map(([key, entry]) => [key, stable(entry)])) : value;
async function digest(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
function* errorChain(error: unknown): Generator<Error> {
  const seen = new Set<unknown>(); let current: unknown = error;
  while (current instanceof Error && !seen.has(current)) { seen.add(current); yield current; current = current.cause; }
}
/** Only known guard/constraint failures are conflicts. Anything else is an uncertain outcome and is rethrown. */
function conflictCode(error: unknown): string | null {
  for (const item of errorChain(error)) {
    const guard = /saha_academic_conflict:([a-z-]+)/.exec(item.message);
    if (guard) return guard[1];
    if (/UNIQUE constraint failed: courses\.code/.test(item.message)) return 'course-code-taken';
    if (/saha_enrolment_pair_conflict/.test(item.message)) return 'already-enrolled';
    if (/CHECK constraint failed: (class_settings_(capacity|starts|ends|window)|enrolment_lifecycle_)/.test(item.message)) return 'invalid-input';
  }
  return null;
}
export function rethrowLifecycleConflict(error: unknown): never {
  const code = conflictCode(error);
  if (code) throw new LifecycleError(code, 409);
  throw error;
}

// ---------------------------------------------------------------- receipts
type EventRow = typeof academicEvents.$inferSelect;
function eventLabel(kind: ChangeKind, payload: Record<string, unknown>, effectiveOn: string | null): string {
  const text = (key: string, fallback = 'a record') => typeof payload[key] === 'string' && payload[key] ? payload[key] as string : fallback;
  const on = effectiveOn ? ` effective ${effectiveOn}` : '';
  switch (kind) {
    case 'course.create': return `Created course ${text('title', 'course')} (${text('code', 'code')})`;
    case 'course.edit': return `Edited course ${text('title', 'course')}`;
    case 'course.retire': return `Retired course ${text('title', 'course')}`;
    case 'course.reinstate': return `Reinstated course ${text('title', 'course')}`;
    case 'class.create': return `Created class ${text('name', 'class')}`;
    case 'class.edit': return `Edited class ${text('name', 'class')}`;
    case 'class.teacher': return `Teacher for ${text('className', 'class')} changed from ${text('fromTeacherName', 'previous teacher')} to ${text('toTeacherName', 'new teacher')}`;
    case 'class.close': return `Closed class ${text('className', 'class')}${payload.completeActive === true ? ' and completed active enrolments' : ''}`;
    case 'class.reopen': return `Reopened class ${text('className', 'class')}`;
    case 'enrolment.enrol': return `Enrolled ${text('studentName', 'learner')} in ${text('className', 'class')}${on}`;
    case 'enrolment.withdraw': return `Withdrew ${text('studentName', 'learner')} from ${text('className', 'class')}${on}`;
    case 'enrolment.complete': return `Completed ${text('className', 'class')} for ${text('studentName', 'learner')}${on}${payload.cause === 'class-close' ? ' (class closed)' : ''}`;
    case 'enrolment.reenrol': return `Re-enrolled ${text('studentName', 'learner')} in ${text('className', 'class')}${on}`;
    case 'enrolment.transfer': return `Transferred ${text('studentName', 'learner')} from ${text('className', 'class')} to ${text('toClassName', 'another class')}${on}`;
  }
}
const parsePayload = (value: string): Record<string, unknown> => { try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } };
function receiptItem(row: EventRow): ReceiptItem {
  const payload = parsePayload(row.payload);
  return { id: row.id, seq: row.seq, kind: row.kind as ChangeKind, subjectId: row.subjectId, classId: row.classId, relatedClassId: row.relatedClassId,
    studentId: row.studentId, effectiveOn: row.effectiveOn, label: eventLabel(row.kind as ChangeKind, payload, row.effectiveOn), payload, createdAt: row.createdAt };
}
function receiptScope(principal: Principal) {
  assertAdmin(principal);
  return and(eq(academicChangeRequests.schoolId, principal.schoolId!), eq(academicChangeRequests.actorId, principal.id), livePrincipalScope(principal))!;
}
async function loadReceipt(principal: Principal, requestKey: string): Promise<{ receipt: ChangeReceipt; hash: string } | null> {
  const db = getDb();
  const [header] = await db.select().from(academicChangeRequests).where(and(eq(academicChangeRequests.id, requestKey), receiptScope(principal))).limit(1);
  if (!header) return null;
  const rows = await db.select().from(academicEvents).where(and(eq(academicEvents.requestId, header.id), eq(academicEvents.schoolId, header.schoolId), livePrincipalScope(principal)))
    .orderBy(academicEvents.seq, sql.raw('academic_events.rowid'));
  return { hash: header.requestHash, receipt: { id: header.id, schoolId: header.schoolId, createdBy: header.actorId, reason: header.reason, createdAt: header.createdAt, items: rows.map(receiptItem) } };
}
export async function getAcademicChange(principal: Principal, key: string): Promise<ChangeReceipt> {
  assertAdmin(principal);
  const found = await loadReceipt(principal, requestId.parse(key));
  if (!found) throw new LifecycleError('not-found', 404);
  return found.receipt;
}

// ---------------------------------------------------------------- building events
type Ctx = { principal: Principal & { schoolId: string }; items: Item[]; subjects: Set<string> };
function claim(ctx: Ctx, key: string) { if (ctx.subjects.has(key)) throw new LifecycleError('duplicate-subject', 400); ctx.subjects.add(key); }
const item = (kind: ChangeKind, subjectId: string, rest: Partial<Item> & { payload: Record<string, unknown> }): Item => ({
  id: crypto.randomUUID(), kind, subjectId, classId: null, relatedClassId: null, studentId: null, effectiveOn: null, ...rest });
const same = (a: unknown, b: unknown) => a === b;

async function courseRow(ctx: Ctx, courseId: string) {
  const [row] = await getDb().select({ course: courses, status: courseLifecycle.status }).from(courses)
    .leftJoin(courseLifecycle, eq(courseLifecycle.courseId, courses.id))
    .where(and(eq(courses.id, courseId), eq(courses.schoolId, ctx.principal.schoolId), livePrincipalScope(ctx.principal))).limit(1);
  if (!row) throw new LifecycleError('not-found', 404);
  return { ...row.course, retired: row.status === 'retired' };
}
async function classRow(ctx: Ctx, classId: string) {
  const [row] = await getDb().select({ record: classes, settings: classSettings, teacherName: users.name }).from(classes)
    .leftJoin(classSettings, eq(classSettings.classId, classes.id)).leftJoin(users, eq(users.id, classes.teacherId))
    .where(and(eq(classes.id, classId), eq(classes.schoolId, ctx.principal.schoolId), livePrincipalScope(ctx.principal))).limit(1);
  if (!row) throw new LifecycleError('not-found', 404);
  return { ...row.record, settings: row.settings, teacherName: row.teacherName ?? 'Teacher' };
}
async function teacherName(ctx: Ctx, teacherId: string): Promise<string> {
  const [row] = await getDb().select({ name: users.name }).from(users).where(and(eq(users.id, teacherId), eq(users.schoolId, ctx.principal.schoolId), eq(users.role, 'teacher'), livePrincipalScope(ctx.principal))).limit(1);
  if (!row) throw new LifecycleError('teacher-unavailable', 409);
  return row.name;
}
async function enrolmentRow(ctx: Ctx, enrolmentId: string) {
  const [row] = await getDb().select({ enrolment: enrolments, className: classes.name, firstName: students.firstName, lastName: students.lastName }).from(enrolments)
    .innerJoin(classes, eq(classes.id, enrolments.classId)).innerJoin(students, eq(students.id, enrolments.studentId))
    .where(and(eq(enrolments.id, enrolmentId), eq(classes.schoolId, ctx.principal.schoolId), eq(students.schoolId, ctx.principal.schoolId), livePrincipalScope(ctx.principal))).limit(1);
  if (!row) throw new LifecycleError('not-found', 404);
  return { ...row.enrolment, className: row.className, studentName: `${row.firstName} ${row.lastName}` };
}
function assertToken(actual: string, expected: string) { if (actual !== expected) throw new LifecycleError('stale', 409); }

async function build(ctx: Ctx, change: Change): Promise<void> {
  const db = getDb();
  switch (change.kind) {
    case 'course.create': {
      const subject = crypto.randomUUID(); claim(ctx, 'course:' + change.code);
      ctx.items.push(item('course.create', subject, { payload: { code: change.code, title: change.title, description: change.description, gradeLevel: change.gradeLevel } }));
      return;
    }
    case 'course.edit': {
      claim(ctx, 'course:' + change.courseId); const course = await courseRow(ctx, change.courseId); assertToken(change.expectedUpdatedAt, course.updatedAt);
      if (same(course.code, change.code) && same(course.title, change.title) && same(course.description ?? null, change.description) && same(course.gradeLevel, change.gradeLevel)) throw new LifecycleError('no-change', 400);
      ctx.items.push(item('course.edit', course.id, { payload: { expectedUpdatedAt: change.expectedUpdatedAt, code: change.code, title: change.title, description: change.description, gradeLevel: change.gradeLevel,
        before: { code: course.code, title: course.title, description: course.description ?? null, gradeLevel: course.gradeLevel } } }));
      return;
    }
    case 'course.retire': case 'course.reinstate': {
      claim(ctx, 'course:' + change.courseId); const course = await courseRow(ctx, change.courseId); assertToken(change.expectedUpdatedAt, course.updatedAt);
      if (change.kind === 'course.retire' && course.retired) throw new LifecycleError('already-retired');
      if (change.kind === 'course.reinstate' && !course.retired) throw new LifecycleError('not-retired');
      ctx.items.push(item(change.kind, course.id, { payload: { expectedUpdatedAt: change.expectedUpdatedAt, title: course.title, code: course.code } }));
      return;
    }
    case 'class.create': {
      const subject = crypto.randomUUID(); claim(ctx, 'class:new:' + subject);
      const name = await teacherName(ctx, change.teacherId);
      ctx.items.push(item('class.create', subject, { classId: subject, payload: { courseId: change.courseId, teacherId: change.teacherId, teacherName: name, name: change.name, term: change.term,
        schedule: change.schedule, capacity: change.capacity, startsOn: change.startsOn, endsOn: change.endsOn } }));
      return;
    }
    case 'class.edit': {
      claim(ctx, 'class:' + change.classId); const row = await classRow(ctx, change.classId); assertToken(change.expectedUpdatedAt, row.updatedAt);
      const before = { courseId: row.courseId, name: row.name, term: row.term, schedule: row.schedule ?? null, capacity: row.settings?.capacity ?? null, startsOn: row.settings?.startsOn ?? null, endsOn: row.settings?.endsOn ?? null };
      const after = { courseId: change.courseId, name: change.name, term: change.term, schedule: change.schedule, capacity: change.capacity, startsOn: change.startsOn, endsOn: change.endsOn };
      if (JSON.stringify(stable(before)) === JSON.stringify(stable(after))) throw new LifecycleError('no-change', 400);
      ctx.items.push(item('class.edit', row.id, { classId: row.id, payload: { expectedUpdatedAt: change.expectedUpdatedAt, ...after, before } }));
      return;
    }
    case 'class.teacher': {
      claim(ctx, 'class:' + change.classId);
      if (change.teacherId === null) throw new LifecycleError('teacher-required', 400);
      const row = await classRow(ctx, change.classId); assertToken(change.expectedUpdatedAt, row.updatedAt);
      if (row.teacherId === change.teacherId) throw new LifecycleError('teacher-unchanged');
      const toName = await teacherName(ctx, change.teacherId);
      ctx.items.push(item('class.teacher', row.id, { classId: row.id, payload: { expectedUpdatedAt: change.expectedUpdatedAt, className: row.name, fromTeacherId: row.teacherId, fromTeacherName: row.teacherName, toTeacherId: change.teacherId, toTeacherName: toName } }));
      return;
    }
    case 'class.close': case 'class.reopen': {
      claim(ctx, 'class:' + change.classId); const row = await classRow(ctx, change.classId); assertToken(change.expectedUpdatedAt, row.updatedAt);
      const closed = row.settings?.status === 'closed';
      if (change.kind === 'class.close' && closed) throw new LifecycleError('class-closed');
      if (change.kind === 'class.reopen' && !closed) throw new LifecycleError('not-closed');
      ctx.items.push(item(change.kind, row.id, { classId: row.id, payload: { expectedUpdatedAt: change.expectedUpdatedAt, className: row.name, ...(change.kind === 'class.close' ? { completeActive: change.completeActive === true } : {}) } }));
      return;
    }
    case 'enrolment.enrol': {
      claim(ctx, `pair:${change.studentId}:${change.classId}`);
      const [student] = await db.select({ id: students.id, firstName: students.firstName, lastName: students.lastName }).from(students).where(and(eq(students.id, change.studentId), eq(students.schoolId, ctx.principal.schoolId), livePrincipalScope(ctx.principal))).limit(1);
      if (!student) throw new LifecycleError('student-unavailable', 404);
      const cls = await classRow(ctx, change.classId);
      const subject = crypto.randomUUID();
      ctx.items.push(item('enrolment.enrol', subject, { classId: cls.id, studentId: student.id, effectiveOn: change.effectiveOn, payload: { studentName: `${student.firstName} ${student.lastName}`, className: cls.name } }));
      return;
    }
    case 'enrolment.withdraw': case 'enrolment.complete': case 'enrolment.reenrol': {
      claim(ctx, 'enrolment:' + change.enrolmentId); const row = await enrolmentRow(ctx, change.enrolmentId); assertToken(change.expectedUpdatedAt, row.updatedAt);
      ctx.items.push(item(change.kind, row.id, { classId: row.classId, studentId: row.studentId, effectiveOn: change.effectiveOn,
        payload: { expectedUpdatedAt: change.expectedUpdatedAt, studentName: row.studentName, className: row.className, previousStatus: row.status } }));
      return;
    }
    case 'enrolment.transfer': {
      claim(ctx, 'enrolment:' + change.enrolmentId); const row = await enrolmentRow(ctx, change.enrolmentId); assertToken(change.expectedUpdatedAt, row.updatedAt);
      if (row.classId === change.toClassId) throw new LifecycleError('same-class', 400);
      claim(ctx, `pair:${row.studentId}:${change.toClassId}`);
      const target = await classRow(ctx, change.toClassId);
      ctx.items.push(item('enrolment.transfer', row.id, { classId: row.classId, relatedClassId: target.id, studentId: row.studentId, effectiveOn: change.effectiveOn,
        payload: { expectedUpdatedAt: change.expectedUpdatedAt, studentName: row.studentName, className: row.className, toClassName: target.name, toEnrolmentId: crypto.randomUUID(), previousStatus: row.status } }));
      return;
    }
  }
}

// ---------------------------------------------------------------- apply
/** Applies one reviewed request atomically: one INSERT creates the immutable header, its trigger expands the events and every
 * event trigger guards/applies its effect. Exact same actor/request UUID/payload replays the original receipt without reapplying. */
export async function applyAcademicChanges(principal: Principal, raw: unknown): Promise<ChangeResult> {
  assertAdmin(principal);
  assertPrincipal(principal);
  const input = changeRequestSchema.parse(raw) as ChangeRequest & { changes: Change[] };
  if (input.changes.some(change => NEEDS_REASON.has(change.kind as ChangeKind)) && !input.reason) throw new LifecycleError('reason-required', 400);
  const hash = await digest(JSON.stringify(stable({ reason: input.reason ?? null, changes: input.changes })));
  const existing = await loadReceipt(principal, input.clientRequestId);
  if (existing) {
    if (existing.hash !== hash) throw new LifecycleError('request-id-reused');
    return { receipt: existing.receipt, replayed: true };
  }
  const ctx: Ctx = { principal: principal as Principal & { schoolId: string }, items: [], subjects: new Set() };
  for (const change of input.changes) await build(ctx, change);
  const createdAt = new Date().toISOString();
  let created = false;
  try {
    const rows = await getDb().insert(academicChangeRequests).select(sql`select ${input.clientRequestId}, ${principal.schoolId}, ${principal.id}, ${hash}, ${input.reason ?? null},
      ${JSON.stringify(ctx.items)}, ${ctx.items.length}, ${createdAt} where ${livePrincipalScope(principal)}`)
      .onConflictDoNothing({ target: academicChangeRequests.id }).returning({ id: academicChangeRequests.id });
    created = rows.length > 0;
  } catch (error) {
    const code = conflictCode(error);
    if (!code) throw error;
    // A raced identical request is a replay; anything else is a safe conflict with no partial effect (one statement).
    const raced = await loadReceipt(principal, input.clientRequestId);
    if (raced && raced.hash === hash) return { receipt: raced.receipt, replayed: true };
    throw new LifecycleError(code, 409);
  }
  const saved = await loadReceipt(principal, input.clientRequestId);
  if (!saved) {
    // Zero rows without a receipt means the live-actor predicate failed: nothing was applied. A committed request whose
    // readback is unavailable stays an honest "unavailable"; the same UUID can recover it under restored access.
    if (created) throw new LifecycleError('not-found', 404);
    // The id already belongs to another administrator's (or school's) request: it can never be claimed or read by this one.
    const [taken] = await getDb().select({ id: academicChangeRequests.id }).from(academicChangeRequests).where(eq(academicChangeRequests.id, input.clientRequestId)).limit(1);
    throw new LifecycleError(taken ? 'request-id-reused' : 'authority', 409);
  }
  if (saved.hash !== hash) throw new LifecycleError('request-id-reused');
  if (!created) return { receipt: saved.receipt, replayed: true };
  return { receipt: saved.receipt, replayed: false };
}

// ---------------------------------------------------------------- reads
const asOf = () => new Date().toISOString();
const isStaff = (principal: Principal) => principal.role === 'admin' || principal.role === 'teacher';

export async function listCourseStates(principal: Principal): Promise<{ courseId: string; status: 'active' | 'retired' }[]> {
  assertPrincipal(principal);
  const rows = await getDb().select({ id: courses.id, status: courseLifecycle.status }).from(courses)
    .leftJoin(courseLifecycle, eq(courseLifecycle.courseId, courses.id))
    .where(and(eq(courses.schoolId, principal.schoolId), livePrincipalScope(principal)));
  return rows.map(row => ({ courseId: row.id, status: row.status === 'retired' ? 'retired' as const : 'active' as const }));
}
export async function getCourseLifecycle(principal: Principal, courseId: string): Promise<CourseLifecycle | null> {
  assertPrincipal(principal);
  const [row] = await getDb().select({ course: courses, status: courseLifecycle.status, changedAt: courseLifecycle.changedAt, reason: courseLifecycle.reason }).from(courses)
    .leftJoin(courseLifecycle, eq(courseLifecycle.courseId, courses.id))
    .where(and(eq(courses.id, courseId), eq(courses.schoolId, principal.schoolId), livePrincipalScope(principal))).limit(1);
  if (!row) return null;
  let classCount: number | null = null;
  if (principal.role === 'admin') {
    const [count] = await getDb().select({ total: sql<number>`count(*)` }).from(classes).where(and(eq(classes.courseId, courseId), eq(classes.schoolId, principal.schoolId), livePrincipalScope(principal)));
    classCount = Number(count?.total ?? 0);
  }
  const admin = principal.role === 'admin';
  return { id: row.course.id, code: row.course.code, title: row.course.title, description: row.course.description ?? null, gradeLevel: row.course.gradeLevel, updatedAt: row.course.updatedAt,
    status: row.status === 'retired' ? 'retired' : 'active', statusChangedAt: row.status ? row.changedAt : null, statusReason: admin && row.status === 'retired' ? row.reason ?? null : null,
    classCount, canManage: admin, asOf: asOf() };
}
export async function getClassLifecycle(principal: Principal, classId: string): Promise<ClassLifecycle | null> {
  assertPrincipal(principal);
  const db = getDb();
  const [row] = await db.select({ record: classes, settings: classSettings, courseTitle: courses.title, courseCode: courses.code, courseStatus: courseLifecycle.status, teacherName: users.name }).from(classes)
    .leftJoin(classSettings, eq(classSettings.classId, classes.id)).leftJoin(courses, eq(courses.id, classes.courseId))
    .leftJoin(courseLifecycle, eq(courseLifecycle.courseId, classes.courseId)).leftJoin(users, eq(users.id, classes.teacherId))
    .where(and(eq(classes.id, classId), classScope(principal))).limit(1);
  if (!row) return null;
  let activeCount: number | null = null;
  if (isStaff(principal)) {
    const [count] = await db.select({ total: sql<number>`count(*)` }).from(enrolments).where(and(eq(enrolments.classId, classId), eq(enrolments.status, 'active'), sql`exists (select 1 from classes where classes.id = ${enrolments.classId} and ${classScope(principal)})`));
    activeCount = Number(count?.total ?? 0);
  }
  const staff = isStaff(principal);
  return { id: row.record.id, name: row.record.name, term: row.record.term, schedule: row.record.schedule ?? null, updatedAt: row.record.updatedAt, courseId: row.record.courseId,
    courseTitle: row.courseTitle ?? null, courseCode: row.courseCode ?? null, courseStatus: row.courseStatus === 'retired' ? 'retired' : 'active',
    teacher: row.teacherName ? { id: row.record.teacherId, name: row.teacherName } : null,
    settings: { capacity: staff ? row.settings?.capacity ?? null : null, startsOn: row.settings?.startsOn ?? null, endsOn: row.settings?.endsOn ?? null,
      status: row.settings?.status === 'closed' ? 'closed' : 'open', closedAt: row.settings?.status === 'closed' ? row.settings.closedAt ?? null : null },
    activeCount, canManage: principal.role === 'admin', asOf: asOf() };
}
export async function listClassRoster(principal: Principal, classId: string): Promise<RosterRow[] | null> {
  assertPrincipal(principal);
  if (!isStaff(principal)) throw new AccessError('Staff access required');
  const db = getDb();
  const [cls] = await db.select({ id: classes.id }).from(classes).where(and(eq(classes.id, classId), classScope(principal))).limit(1);
  if (!cls) return null;
  const rows = await db.select({ enrolment: enrolments, firstName: students.firstName, lastName: students.lastName, admissionNumber: students.admissionNumber, gradeLevel: students.gradeLevel,
    startedOn: enrolmentLifecycle.startedOn, endedOn: enrolmentLifecycle.endedOn, endKind: enrolmentLifecycle.endKind }).from(enrolments)
    .innerJoin(students, and(eq(students.id, enrolments.studentId), eq(students.schoolId, principal.schoolId!)))
    .leftJoin(enrolmentLifecycle, eq(enrolmentLifecycle.enrolmentId, enrolments.id))
    .where(and(eq(enrolments.classId, classId), sql`exists (select 1 from classes where classes.id = ${enrolments.classId} and ${classScope(principal)})`))
    .orderBy(students.lastName, students.firstName, enrolments.id);
  const legacyStart = (value: string) => /^\d{4}-\d{2}-\d{2}/.test(value) && isExactCalendarDate(value.slice(0, 10)) ? value.slice(0, 10) : null;
  return rows.map(row => ({ enrolmentId: row.enrolment.id, studentId: row.enrolment.studentId, firstName: row.firstName, lastName: row.lastName, admissionNumber: row.admissionNumber, gradeLevel: row.gradeLevel,
    status: row.enrolment.status as RosterRow['status'], startedOn: row.startedOn ?? legacyStart(row.enrolment.enrolledAt), endedOn: row.endedOn ?? null, endKind: (row.endKind ?? null) as RosterRow['endKind'], updatedAt: row.enrolment.updatedAt }));
}

const HISTORY_LIMIT = 100;
function historyEvent(row: EventRow & { reason: string | null; actorName: string | null }, admin: boolean, mine: Set<string> | null): HistoryEvent {
  const payload = parsePayload(row.payload);
  // A teacher sees only the side of a transfer that belongs to a class they currently teach: the other class is never named.
  const text = (key: string, fallback: string) => (typeof payload[key] === 'string' ? (payload[key] as string) : fallback);
  const on = row.effectiveOn ? ` effective ${row.effectiveOn}` : '';
  let label: string;
  if (mine && row.kind === 'enrolment.transfer') {
    const fromMine = !!row.classId && mine.has(row.classId), toMine = !!row.relatedClassId && mine.has(row.relatedClassId);
    label = fromMine && toMine ? eventLabel(row.kind as ChangeKind, payload, row.effectiveOn)
      : toMine ? `Transferred ${text('studentName', 'learner')} into ${text('toClassName', 'the class')}${on}`
      : `Transferred ${text('studentName', 'learner')} out of ${text('className', 'the class')}${on}`;
  } else label = eventLabel(row.kind as ChangeKind, payload, row.effectiveOn);
  return { id: row.id, requestId: row.requestId, kind: row.kind as ChangeKind, effectiveOn: row.effectiveOn, createdAt: row.createdAt, label, reason: admin ? row.reason : null, actorName: admin ? row.actorName : null };
}
async function eventsWhere(principal: Principal, where: ReturnType<typeof and>, admin: boolean, mine: Set<string> | null = null) {
  const rows = await getDb().select({ event: academicEvents, reason: academicChangeRequests.reason, actorName: users.name }).from(academicEvents)
    .innerJoin(academicChangeRequests, eq(academicChangeRequests.id, academicEvents.requestId)).leftJoin(users, eq(users.id, academicEvents.actorId))
    .where(and(eq(academicEvents.schoolId, principal.schoolId!), where)).orderBy(desc(academicEvents.createdAt), desc(academicEvents.seq), desc(sql.raw('academic_events.rowid'))).limit(HISTORY_LIMIT + 1);
  return { items: rows.slice(0, HISTORY_LIMIT).map(row => historyEvent({ ...row.event, reason: row.reason, actorName: row.actorName }, admin, mine)), truncated: rows.length > HISTORY_LIMIT };
}
export async function listClassHistory(principal: Principal, classId: string): Promise<{ items: HistoryEvent[]; limit: number; truncated: boolean } | null> {
  assertPrincipal(principal);
  if (!isStaff(principal)) throw new AccessError('Staff access required');
  const [cls] = await getDb().select({ id: classes.id }).from(classes).where(and(eq(classes.id, classId), classScope(principal))).limit(1);
  if (!cls) return null;
  const admin = principal.role === 'admin';
  const { items, truncated } = await eventsWhere(principal, and(or(eq(academicEvents.classId, classId), eq(academicEvents.relatedClassId, classId)), inArray(academicEvents.kind, ['class.create', 'class.edit', 'class.teacher', 'class.close', 'class.reopen', 'enrolment.enrol', 'enrolment.withdraw', 'enrolment.complete', 'enrolment.reenrol', 'enrolment.transfer']))!, admin, admin ? null : new Set([classId]));
  return { items, limit: HISTORY_LIMIT, truncated };
}
export async function listCourseHistory(principal: Principal, courseId: string): Promise<{ items: HistoryEvent[]; limit: number; truncated: boolean } | null> {
  assertAdmin(principal);
  const [course] = await getDb().select({ id: courses.id }).from(courses).where(and(eq(courses.id, courseId), eq(courses.schoolId, principal.schoolId!), livePrincipalScope(principal))).limit(1);
  if (!course) return null;
  const { items, truncated } = await eventsWhere(principal, and(eq(academicEvents.subjectId, courseId), inArray(academicEvents.kind, ['course.create', 'course.edit', 'course.retire', 'course.reinstate']))!, true);
  return { items, limit: HISTORY_LIMIT, truncated };
}

/** One learner's enrolments and history. Families and students see only their own linked learner; a teacher sees only
 * the part of the history that belongs to classes they currently teach; administrators see the school. */
export async function getStudentHistory(principal: Principal, studentId: string): Promise<StudentHistory | null> {
  assertPrincipal(principal);
  const db = getDb();
  const [student] = await db.select({ id: students.id, firstName: students.firstName, lastName: students.lastName }).from(students).where(and(eq(students.id, studentId), studentScope(principal))).limit(1);
  if (!student) return null;
  const teacher = principal.role === 'teacher', admin = principal.role === 'admin';
  const classFilter = teacher ? eq(classes.teacherId, principal.id) : undefined;
  const rows = await db.select({ enrolment: enrolments, className: classes.name, term: classes.term, courseTitle: courses.title, startedOn: enrolmentLifecycle.startedOn, endedOn: enrolmentLifecycle.endedOn, endKind: enrolmentLifecycle.endKind }).from(enrolments)
    .innerJoin(classes, and(eq(classes.id, enrolments.classId), eq(classes.schoolId, principal.schoolId!)))
    .leftJoin(courses, eq(courses.id, classes.courseId)).leftJoin(enrolmentLifecycle, eq(enrolmentLifecycle.enrolmentId, enrolments.id))
    .where(and(eq(enrolments.studentId, studentId), classFilter, livePrincipalScope(principal))).orderBy(enrolments.enrolledAt, enrolments.id);
  const taught = teacher ? (await db.select({ id: classes.id }).from(classes).where(and(eq(classes.teacherId, principal.id), eq(classes.schoolId, principal.schoolId!), livePrincipalScope(principal)))).map(row => row.id) : [];
  const eventFilter = and(eq(academicEvents.studentId, studentId), inArray(academicEvents.kind, ['enrolment.enrol', 'enrolment.withdraw', 'enrolment.complete', 'enrolment.reenrol', 'enrolment.transfer']),
    teacher ? (taught.length ? or(inArray(academicEvents.classId, taught), inArray(academicEvents.relatedClassId, taught)) : sql`0`) : undefined)!;
  const { items, truncated } = await eventsWhere(principal, eventFilter, admin, teacher ? new Set(taught) : null);
  const legacyStart = (value: string) => /^\d{4}-\d{2}-\d{2}/.test(value) && isExactCalendarDate(value.slice(0, 10)) ? value.slice(0, 10) : null;
  return { student: { id: student.id, name: `${student.firstName} ${student.lastName}` },
    enrolments: rows.map(row => ({ enrolmentId: row.enrolment.id, classId: row.enrolment.classId, className: row.className, term: row.term, courseTitle: row.courseTitle ?? null,
      status: row.enrolment.status as 'active' | 'withdrawn' | 'completed', startedOn: row.startedOn ?? legacyStart(row.enrolment.enrolledAt), endedOn: row.endedOn ?? null, endKind: row.endKind ?? null })),
    events: items, limit: HISTORY_LIMIT, truncated, asOf: asOf() };
}
