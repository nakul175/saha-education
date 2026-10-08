import { z } from 'zod';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/db/index';
import { classes, resourceAssignments, resourceVersions, teachingResources, students } from '@/db/schema';
import {
  submissionAttempts,
  submissionFeedback,
  type SubmissionAttempt,
  type SubmissionFeedback,
} from '@/db/submission-schema';
import { AccessError, assertPrincipal, classScope, livePrincipalScope } from './access';
import type { Principal } from './types';
import { getSubmissionWindow, submissionWindowAllows, SubmissionWindowClosed } from './submission-windows';

const identifier = z.string().min(1).max(120);
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
      'Unsupported control character',
    );
export const submissionSchema = z
  .object({
    response: text(20000),
    expectedAttempt: z.number().int().min(0).max(1000000),
    clientSubmissionId: z.string().uuid(),
  })
  .strict();
export const feedbackSchema = z
  .object({
    feedback: text(8000),
    reviewed: z.literal(true),
    expectedRevision: z.number().int().min(0).max(1000000),
    clientFeedbackId: z.string().uuid(),
  })
  .strict();
export class SubmissionConflict extends Error {
  readonly status = 409;
  constructor() {
    super('Submission conflict');
    this.name = 'SubmissionConflict';
  }
}
type AttemptRow = typeof submissionAttempts.$inferSelect;

function allowed(principal: Principal): void {
  assertPrincipal(principal);
  if (principal.role === 'guardian') throw new AccessError('Guardian submission access is not available');
}
function liveUser(principal: Principal): SQL {
  return livePrincipalScope(principal);
}
function assignmentScope(principal: Principal): SQL {
  allowed(principal);
  return and(
    eq(teachingResources.schoolId, principal.schoolId!),
    classScope(principal),
    liveUser(principal),
    sql`${resourceVersions.id} = ${resourceAssignments.versionId} and ${resourceVersions.resourceId} = ${resourceAssignments.resourceId}
      and ${resourceVersions.approvedAt} is not null and ${resourceVersions.approvedBy} is not null`,
  )!;
}
async function requiredAssignment(principal: Principal, assignmentId: string) {
  const [assignment] = await getDb()
    .select({ id: resourceAssignments.id, versionId: resourceAssignments.versionId })
    .from(resourceAssignments)
    .innerJoin(classes, eq(classes.id, resourceAssignments.classId))
    .innerJoin(teachingResources, eq(teachingResources.id, resourceAssignments.resourceId))
    .innerJoin(resourceVersions, eq(resourceVersions.id, resourceAssignments.versionId))
    .where(and(eq(resourceAssignments.id, identifier.parse(assignmentId)), assignmentScope(principal)))
    .limit(1);
  if (!assignment) throw new AccessError('Assignment not found', 404);
  return assignment;
}
function attemptScope(principal: Principal): SQL {
  return and(
    assignmentScope(principal),
    eq(students.schoolId, principal.schoolId!),
    principal.role === 'student' ? eq(students.userId, principal.id) : undefined,
    eq(submissionAttempts.versionId, resourceAssignments.versionId),
  )!;
}
async function requiredAttempt(
  principal: Principal,
  assignmentId: string,
  submissionId: string,
): Promise<AttemptRow> {
  allowed(principal);
  const [row] = await attemptQuery(principal, assignmentId)
    .where(and(eq(submissionAttempts.id, identifier.parse(submissionId)), attemptScope(principal)))
    .limit(1);
  if (!row) throw new AccessError('Submission not found', 404);
  return row.attempt;
}
function attemptQuery(principal: Principal, assignmentId: string) {
  allowed(principal);
  return getDb()
    .select({ attempt: submissionAttempts })
    .from(submissionAttempts)
    .innerJoin(
      resourceAssignments,
      and(
        eq(resourceAssignments.id, submissionAttempts.assignmentId),
        eq(resourceAssignments.id, identifier.parse(assignmentId)),
      ),
    )
    .innerJoin(classes, eq(classes.id, resourceAssignments.classId))
    .innerJoin(teachingResources, eq(teachingResources.id, resourceAssignments.resourceId))
    .innerJoin(resourceVersions, eq(resourceVersions.id, resourceAssignments.versionId))
    .innerJoin(students, eq(students.id, submissionAttempts.studentId));
}
function feedbackQuery(principal: Principal, assignmentId: string) {
  allowed(principal);
  return getDb()
    .select({ feedback: submissionFeedback })
    .from(submissionAttempts)
    .leftJoin(submissionFeedback, eq(submissionFeedback.submissionId, submissionAttempts.id))
    .innerJoin(
      resourceAssignments,
      and(
        eq(resourceAssignments.id, submissionAttempts.assignmentId),
        eq(resourceAssignments.id, identifier.parse(assignmentId)),
      ),
    )
    .innerJoin(classes, eq(classes.id, resourceAssignments.classId))
    .innerJoin(teachingResources, eq(teachingResources.id, resourceAssignments.resourceId))
    .innerJoin(resourceVersions, eq(resourceVersions.id, resourceAssignments.versionId))
    .innerJoin(students, eq(students.id, submissionAttempts.studentId));
}
async function feedbackFor(
  principal: Principal,
  assignmentId: string,
  submissionId: string,
): Promise<SubmissionFeedback[]> {
  // A LEFT JOIN distinguishes an authorized attempt with no feedback from an
  // attempt no longer available after revocation/reassignment/withdrawal.
  const rows = await feedbackQuery(principal, assignmentId)
    .where(and(eq(submissionAttempts.id, submissionId), attemptScope(principal)))
    .orderBy(desc(submissionFeedback.revision));
  if (!rows.length) throw new AccessError('Submission not found', 404);
  return rows.flatMap((row) => (row.feedback ? [row.feedback] : []));
}
export async function listSubmissions(
  principal: Principal,
  assignmentId: string,
): Promise<SubmissionAttempt[]> {
  await requiredAssignment(principal, assignmentId);
  const rows = await attemptQuery(principal, assignmentId)
    .where(attemptScope(principal))
    .orderBy(desc(submissionAttempts.attempt), desc(submissionAttempts.createdAt));
  return Promise.all(
    rows.map(async ({ attempt }) => ({
      ...attempt,
      feedback: await feedbackFor(principal, assignmentId, attempt.id),
    })),
  );
}
async function attemptRetry(
  principal: Principal,
  assignmentId: string,
  data: z.infer<typeof submissionSchema>,
): Promise<SubmissionAttempt | null> {
  const [row] = await getDb()
    .select()
    .from(submissionAttempts)
    .where(eq(submissionAttempts.id, data.clientSubmissionId))
    .limit(1);
  if (!row) return null;
  if (
    row.assignmentId !== assignmentId ||
    row.submittedBy !== principal.id ||
    row.attempt !== data.expectedAttempt + 1 ||
    row.response !== data.response
  )
    throw new SubmissionConflict();
  const authorized = await requiredAttempt(principal, assignmentId, row.id);
  return { ...authorized, feedback: await feedbackFor(principal, assignmentId, row.id) };
}
export async function submitAssignment(
  principal: Principal,
  assignmentId: string,
  input: z.infer<typeof submissionSchema>,
): Promise<SubmissionAttempt> {
  allowed(principal);
  if (principal.role !== 'student') throw new AccessError('Student submission access required');
  const data = submissionSchema.parse(input);
  await requiredAssignment(principal, assignmentId);
  const prior = await attemptRetry(principal, assignmentId, data);
  if (prior) return prior;
  if (!(await getSubmissionWindow(principal, assignmentId)).acceptingSubmissions)
    throw new SubmissionWindowClosed();
  const [created] = await getDb()
    .insert(submissionAttempts)
    .select(
      sql`select
    ${data.clientSubmissionId}, ${resourceAssignments.id}, ${resourceAssignments.versionId}, ${students.id}, ${principal.id},
    ${data.expectedAttempt + 1}, ${data.response}, ${new Date().toISOString()}
    from resource_assignments join classes on classes.id = resource_assignments.class_id
    join teaching_resources on teaching_resources.id = resource_assignments.resource_id
    join resource_versions on resource_versions.id = resource_assignments.version_id
    join students on students.user_id = ${principal.id} and students.school_id = ${principal.schoolId!}
    where ${resourceAssignments.id} = ${identifier.parse(assignmentId)} and ${assignmentScope(principal)}
      and ${submissionWindowAllows(resourceAssignments.id)}
      and exists (select 1 from enrolments e where e.student_id = ${students.id}
        and e.class_id = ${resourceAssignments.classId} and e.status = 'active')
      and (select coalesce(max(a.attempt), 0) from submission_attempts a
        where a.assignment_id = ${resourceAssignments.id} and a.student_id = ${students.id}) = ${data.expectedAttempt}
    limit 1`,
    )
    .onConflictDoNothing()
    .returning();
  if (created) return { ...created, feedback: [] };
  await requiredAssignment(principal, assignmentId);
  const retry = await attemptRetry(principal, assignmentId, data);
  if (retry) return retry;
  if (!(await getSubmissionWindow(principal, assignmentId)).acceptingSubmissions)
    throw new SubmissionWindowClosed();
  throw new SubmissionConflict();
}
export async function listSubmissionFeedback(
  principal: Principal,
  assignmentId: string,
  submissionId: string,
): Promise<SubmissionFeedback[]> {
  const attempt = await requiredAttempt(principal, assignmentId, submissionId);
  return feedbackFor(principal, assignmentId, attempt.id);
}
async function feedbackRetry(
  principal: Principal,
  assignmentId: string,
  submissionId: string,
  data: z.infer<typeof feedbackSchema>,
): Promise<SubmissionFeedback | null> {
  const [result] = await feedbackQuery(principal, assignmentId)
    .where(
      and(
        eq(submissionAttempts.id, submissionId),
        eq(submissionFeedback.id, data.clientFeedbackId),
        attemptScope(principal),
      ),
    )
    .limit(1);
  const row = result?.feedback;
  if (!row) return null;
  if (
    row.submissionId !== submissionId ||
    row.reviewedBy !== principal.id ||
    row.revision !== data.expectedRevision + 1 ||
    row.feedback !== data.feedback
  )
    throw new SubmissionConflict();
  return row;
}
export async function reviewSubmission(
  principal: Principal,
  assignmentId: string,
  submissionId: string,
  input: z.infer<typeof feedbackSchema>,
): Promise<SubmissionFeedback> {
  allowed(principal);
  if (principal.role !== 'admin' && principal.role !== 'teacher')
    throw new AccessError('Staff review access required');
  const data = feedbackSchema.parse(input);
  await requiredAttempt(principal, assignmentId, submissionId);
  const prior = await feedbackRetry(principal, assignmentId, submissionId, data);
  if (prior) return prior;
  const [created] = await getDb()
    .insert(submissionFeedback)
    .select(
      sql`select
    ${data.clientFeedbackId}, ${submissionAttempts.id}, ${data.expectedRevision + 1}, ${data.feedback}, ${principal.id}, ${new Date().toISOString()}
    from submission_attempts join resource_assignments on resource_assignments.id = submission_attempts.assignment_id
    join classes on classes.id = resource_assignments.class_id
    join teaching_resources on teaching_resources.id = resource_assignments.resource_id
    join resource_versions on resource_versions.id = resource_assignments.version_id
    join students on students.id = submission_attempts.student_id
    where ${submissionAttempts.id} = ${identifier.parse(submissionId)} and ${resourceAssignments.id} = ${identifier.parse(assignmentId)}
      and ${attemptScope(principal)}
      and (select coalesce(max(f.revision), 0) from submission_feedback f where f.submission_id = ${submissionAttempts.id}) = ${data.expectedRevision}
    limit 1`,
    )
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  await requiredAttempt(principal, assignmentId, submissionId);
  const retry = await feedbackRetry(principal, assignmentId, submissionId, data);
  if (retry) return retry;
  throw new SubmissionConflict();
}
