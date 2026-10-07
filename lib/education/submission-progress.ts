import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { getDb } from '@/db/index';
import { classes, enrolments, resourceAssignments, resourceVersions, students, teachingResources } from '@/db/schema';
import { submissionAttempts } from '@/db/submission-schema';
import { assignmentSubmissionWindows } from '@/db/submission-window-schema';
import { AccessError, assertPrincipal, classReferenceScope, livePrincipalScope } from './access';
import type { Principal } from './types';

// Read-only progress views over existing evidence. Nothing here creates attempts, feedback,
// grades or policy: status is derived from saved attempts and reviewed feedback only.
export type ProgressStatus = 'not-submitted' | 'awaiting-feedback' | 'feedback-given';
export type WindowSummary = { state: 'open' | 'closed'; closesAt: string | null; configured: boolean; acceptingSubmissions: boolean };
export type AssignmentSummary = {
  assignmentId: string; title: string; type: string; resourceVersion: number; classId: string; className: string;
  dueDate: string | null; dueDatePassed: boolean; window: WindowSummary;
  mine?: { attempts: number; latestAttemptAt: string | null; latestAfterDueDate: boolean; status: ProgressStatus };
  classProgress?: { enrolled: number; submitted: number; awaitingFeedback: number; feedbackGiven: number };
};
export type AssignmentSummaries = { role: 'student' | 'staff'; asOf: string; items: AssignmentSummary[]; truncated: boolean };
export type RosterRow = {
  studentId: string; name: string; enrolled: boolean; attempts: number; latestAttemptNumber: number | null; latestAttemptAt: string | null;
  latestAfterDueDate: boolean; feedbackRevision: number | null; status: ProgressStatus;
};
export type AssignmentRoster = {
  assignmentId: string; title: string; className: string; dueDate: string | null; dueDatePassed: boolean; asOf: string;
  totals: { enrolled: number; submitted: number; awaitingFeedback: number; feedbackGiven: number; notSubmitted: number };
  rows: RosterRow[]; truncated: boolean;
};

const itemLimit = 100, rosterLimit = 200, chunkSize = 40;
function allowed(principal: Principal): void {
  assertPrincipal(principal);
  if (principal.role === 'guardian') throw new AccessError('Guardian submission access is not available');
}
function staffOnly(principal: Principal): void {
  assertPrincipal(principal);
  if (principal.role !== 'admin' && principal.role !== 'teacher') throw new AccessError('Staff progress access required');
}
function chunks<T>(items: T[]): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) result.push(items.slice(index, index + chunkSize));
  return result;
}
// Same boundary as the assigned-learning feed: exact approved version, current school, current class access.
function assignmentFilter(principal: Principal) {
  return and(eq(teachingResources.schoolId, principal.schoolId!), livePrincipalScope(principal), isNotNull(resourceVersions.approvedAt), isNotNull(resourceVersions.approvedBy),
    classReferenceScope(principal, resourceAssignments.classId));
}
function assignmentSelect() {
  return getDb().select({ id: resourceAssignments.id, classId: resourceAssignments.classId, className: classes.name, dueDate: resourceAssignments.dueDate,
    versionId: resourceAssignments.versionId, title: resourceVersions.title, type: resourceVersions.type, version: resourceVersions.version }).from(resourceAssignments)
    .innerJoin(resourceVersions, and(eq(resourceVersions.id, resourceAssignments.versionId), eq(resourceVersions.resourceId, resourceAssignments.resourceId)))
    .innerJoin(teachingResources, eq(teachingResources.id, resourceAssignments.resourceId))
    .innerJoin(classes, eq(classes.id, resourceAssignments.classId));
}
function todayUtc(now: Date): string { return now.toISOString().slice(0, 10); }
function afterDue(createdAt: string | null, dueDate: string | null): boolean { return Boolean(createdAt && dueDate && createdAt.slice(0, 10) > dueDate); }
function statusOf(attempts: number, revision: number | null): ProgressStatus { return attempts === 0 ? 'not-submitted' : revision ? 'feedback-given' : 'awaiting-feedback'; }
function windowSummary(row: typeof assignmentSubmissionWindows.$inferSelect | undefined, now: Date): WindowSummary {
  if (!row) return { state: 'open', closesAt: null, configured: false, acceptingSubmissions: true };
  const state = row.state === 'closed' ? 'closed' : 'open';
  return { state, closesAt: row.closesAt, configured: true, acceptingSubmissions: state === 'open' && (!row.closesAt || Date.parse(row.closesAt) > now.getTime()) };
}
// Latest attempt per learner, with the attempt count and highest reviewed-feedback revision.
function latestAttempts(assignmentIds: string[], studentId?: string) {
  return getDb().select({ assignmentId: submissionAttempts.assignmentId, studentId: submissionAttempts.studentId, number: submissionAttempts.attempt, createdAt: submissionAttempts.createdAt,
    count: sql<number>`(select count(*) from submission_attempts c where c.assignment_id = ${submissionAttempts.assignmentId} and c.student_id = ${submissionAttempts.studentId} and c.version_id = ${submissionAttempts.versionId})`,
    revision: sql<number | null>`(select max(f.revision) from submission_feedback f where f.submission_id = ${submissionAttempts.id})`,
    enrolled: sql<number>`exists (select 1 from enrolments e where e.student_id = ${submissionAttempts.studentId} and e.class_id = ${resourceAssignments.classId} and e.status = 'active')` })
    .from(submissionAttempts)
    .innerJoin(resourceAssignments, and(eq(resourceAssignments.id, submissionAttempts.assignmentId), eq(resourceAssignments.versionId, submissionAttempts.versionId)))
    .where(and(inArray(submissionAttempts.assignmentId, assignmentIds), studentId ? eq(submissionAttempts.studentId, studentId) : undefined,
      sql`not exists (select 1 from submission_attempts newer where newer.assignment_id = ${submissionAttempts.assignmentId}
        and newer.student_id = ${submissionAttempts.studentId} and newer.version_id = ${submissionAttempts.versionId} and newer.attempt > ${submissionAttempts.attempt})`));
}

/** One line per assigned resource: a learner's own status, or a class-level tally for staff. */
export async function getAssignmentSummaries(principal: Principal): Promise<AssignmentSummaries> {
  allowed(principal);
  const now = new Date(), staff = principal.role !== 'student';
  const found = await assignmentSelect().where(assignmentFilter(principal)).orderBy(desc(resourceAssignments.createdAt)).limit(itemLimit + 1);
  const rows = found.slice(0, itemLimit), ids = rows.map(row => row.id);
  let ownStudent: string | undefined;
  if (!staff) {
    const [profile] = await getDb().select({ id: students.id }).from(students).where(and(eq(students.userId, principal.id), eq(students.schoolId, principal.schoolId!))).limit(1);
    if (!profile) return { role: 'student', asOf: now.toISOString(), items: [], truncated: false };
    ownStudent = profile.id;
  }
  const windows = new Map<string, typeof assignmentSubmissionWindows.$inferSelect>(), latest = new Map<string, Awaited<ReturnType<typeof latestAttempts>>>();
  const enrolledCounts = new Map<string, number>();
  for (const part of chunks(ids)) {
    for (const row of await getDb().select().from(assignmentSubmissionWindows).where(and(inArray(assignmentSubmissionWindows.assignmentId, part),
      sql`not exists (select 1 from assignment_submission_windows newer where newer.assignment_id = ${assignmentSubmissionWindows.assignmentId} and newer.revision > ${assignmentSubmissionWindows.revision})`))) windows.set(row.assignmentId, row);
    for (const row of await latestAttempts(part, ownStudent)) latest.set(row.assignmentId, [...(latest.get(row.assignmentId) ?? []), row]);
  }
  if (staff) for (const part of chunks([...new Set(rows.map(row => row.classId))])) {
    for (const row of await getDb().select({ classId: enrolments.classId, total: sql<number>`count(*)` }).from(enrolments)
      .where(and(inArray(enrolments.classId, part), eq(enrolments.status, 'active'))).groupBy(enrolments.classId)) enrolledCounts.set(row.classId, Number(row.total));
  }
  const today = todayUtc(now);
  const items = rows.map((row): AssignmentSummary => {
    const attempts = latest.get(row.id) ?? [];
    const base = { assignmentId: row.id, title: row.title, type: row.type, resourceVersion: row.version, classId: row.classId, className: row.className, dueDate: row.dueDate,
      dueDatePassed: Boolean(row.dueDate && row.dueDate < today), window: windowSummary(windows.get(row.id), now) };
    if (!staff) {
      const own = attempts[0];
      return { ...base, mine: { attempts: own ? Number(own.count) : 0, latestAttemptAt: own?.createdAt ?? null, latestAfterDueDate: afterDue(own?.createdAt ?? null, row.dueDate),
        status: statusOf(own ? Number(own.count) : 0, own?.revision ?? null) } };
    }
    const current = attempts.filter(item => Number(item.enrolled) === 1);
    return { ...base, classProgress: { enrolled: enrolledCounts.get(row.classId) ?? 0, submitted: current.length,
      awaitingFeedback: current.filter(item => !item.revision).length, feedbackGiven: current.filter(item => Boolean(item.revision)).length } };
  });
  return { role: staff ? 'staff' : 'student', asOf: now.toISOString(), items, truncated: found.length > itemLimit };
}

/** Every actively enrolled learner for one assignment with saved-attempt and reviewed-feedback status. */
export async function getAssignmentRoster(principal: Principal, assignmentId: string): Promise<AssignmentRoster> {
  staffOnly(principal);
  const now = new Date();
  const [assignment] = await assignmentSelect().where(and(eq(resourceAssignments.id, assignmentId.slice(0, 120)), assignmentFilter(principal))).limit(1);
  if (!assignment) throw new AccessError('Assignment not found', 404);
  const enrolledRows = await getDb().select({ id: students.id, firstName: students.firstName, lastName: students.lastName }).from(enrolments)
    .innerJoin(students, eq(students.id, enrolments.studentId))
    .where(and(eq(enrolments.classId, assignment.classId), eq(enrolments.status, 'active'), eq(students.schoolId, principal.schoolId!)))
    .orderBy(students.lastName, students.firstName, students.id).limit(rosterLimit + 1);
  const attemptRows = await latestAttempts([assignment.id]);
  const names = new Map(enrolledRows.map(row => [row.id, `${row.firstName} ${row.lastName}`]));
  const others = attemptRows.map(row => row.studentId).filter(id => !names.has(id));
  for (const part of chunks([...new Set(others)])) {
    for (const row of await getDb().select({ id: students.id, firstName: students.firstName, lastName: students.lastName }).from(students)
      .where(and(inArray(students.id, part), eq(students.schoolId, principal.schoolId!)))) names.set(row.id, `${row.firstName} ${row.lastName}`);
  }
  const byStudent = new Map(attemptRows.map(row => [row.studentId, row]));
  const rows: RosterRow[] = enrolledRows.slice(0, rosterLimit).map(row => rosterRow(row.id, names.get(row.id)!, true, byStudent.get(row.id), assignment.dueDate));
  // Learners who submitted and later left the class stay visible to staff as history.
  for (const attempt of attemptRows) if (Number(attempt.enrolled) !== 1) rows.push(rosterRow(attempt.studentId, names.get(attempt.studentId) ?? 'Former class member', false, attempt, assignment.dueDate));
  const current = rows.filter(row => row.enrolled);
  const submitted = current.filter(row => row.attempts > 0);
  return { assignmentId: assignment.id, title: assignment.title, className: assignment.className, dueDate: assignment.dueDate, dueDatePassed: Boolean(assignment.dueDate && assignment.dueDate < todayUtc(now)),
    asOf: now.toISOString(), rows, truncated: enrolledRows.length > rosterLimit,
    totals: { enrolled: current.length, submitted: submitted.length, notSubmitted: current.length - submitted.length,
      awaitingFeedback: submitted.filter(row => row.status === 'awaiting-feedback').length, feedbackGiven: submitted.filter(row => row.status === 'feedback-given').length } };
}
function rosterRow(studentId: string, name: string, enrolled: boolean, attempt: Awaited<ReturnType<typeof latestAttempts>>[number] | undefined, dueDate: string | null): RosterRow {
  const attempts = attempt ? Number(attempt.count) : 0;
  return { studentId, name, enrolled, attempts, latestAttemptNumber: attempt?.number ?? null, latestAttemptAt: attempt?.createdAt ?? null,
    latestAfterDueDate: afterDue(attempt?.createdAt ?? null, dueDate), feedbackRevision: attempt?.revision ?? null, status: statusOf(attempts, attempt?.revision ?? null) };
}
