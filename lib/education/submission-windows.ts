import { z } from 'zod';
import { and, desc, eq, sql, type SQL, type AnyColumn } from 'drizzle-orm';
import { getDb } from '@/db/index';
import { classes, resourceAssignments, resourceVersions, teachingResources } from '@/db/schema';
import { assignmentSubmissionWindows } from '@/db/submission-window-schema';
import { AccessError, assertPrincipal, classScope } from './access';
import { digest } from './identity';
import type { Principal } from './types';

const identifier = z.string().min(1).max(120);
export const submissionWindowSchema = z
  .object({
    clientPolicyId: z.string().uuid(),
    expectedRevision: z.number().int().min(0).max(999999),
    state: z.enum(['open', 'closed']),
    closesAt: z
      .string()
      .datetime({ offset: false, precision: 3 })
      .refine((value) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value)
      .nullable(),
    reviewConfirmed: z.literal(true),
    reason: z
      .string()
      .trim()
      .min(10)
      .max(500)
      .refine((value) => !/[\x00-\x1f\x7f]/.test(value)),
  })
  .strict()
  .refine(
    (value) => value.state === 'open' || value.closesAt === null,
    'A closed window has no future closing time',
  );
export type SubmissionWindowInput = z.infer<typeof submissionWindowSchema>;
type WindowRow = typeof assignmentSubmissionWindows.$inferSelect;
export type SubmissionWindowReview = Omit<WindowRow, 'requestHash' | 'state'> & { state: 'open' | 'closed' };
export type SubmissionWindow = {
  assignmentId: string;
  revision: number;
  state: 'open' | 'closed';
  closesAt: string | null;
  configured: boolean;
  acceptingSubmissions: boolean;
  asOf: string;
};
export type SubmissionWindowResult = { review: SubmissionWindowReview; window: SubmissionWindow };
export class SubmissionWindowConflict extends AccessError {
  constructor() {
    super('Submission-window conflict', 409);
  }
}
export class SubmissionWindowClosed extends AccessError {
  constructor() {
    super('Submission window closed', 409);
  }
}
function allowed(principal: Principal) {
  assertPrincipal(principal);
  if (principal.role === 'guardian')
    throw new AccessError('Guardian submission-window access is not available');
}
export function assertWindowStaff(principal: Principal) {
  assertPrincipal(principal);
  if (principal.role !== 'admin' && principal.role !== 'teacher')
    throw new AccessError('Staff submission-window review required');
}
function scope(principal: Principal): SQL {
  allowed(principal);
  return and(
    classScope(principal),
    eq(teachingResources.schoolId, principal.schoolId!),
    sql`exists (select 1 from users window_actor where window_actor.id = ${principal.id}
      and window_actor.school_id = ${principal.schoolId!} and window_actor.role = ${principal.role}
      and window_actor.disabled_at is null and coalesce(window_actor.identity_issuer, '') <> ''
      and coalesce(window_actor.identity_subject, '') <> '')`,
    sql`${resourceVersions.resourceId} = ${resourceAssignments.resourceId} and ${resourceVersions.approvedAt} is not null
      and ${resourceVersions.approvedBy} is not null`,
  )!;
}
function assignmentQuery(principal: Principal) {
  allowed(principal);
  return getDb()
    .select({ assignmentId: resourceAssignments.id, policy: assignmentSubmissionWindows })
    .from(resourceAssignments)
    .innerJoin(classes, eq(classes.id, resourceAssignments.classId))
    .innerJoin(teachingResources, eq(teachingResources.id, resourceAssignments.resourceId))
    .innerJoin(resourceVersions, eq(resourceVersions.id, resourceAssignments.versionId))
    .leftJoin(
      assignmentSubmissionWindows,
      eq(assignmentSubmissionWindows.assignmentId, resourceAssignments.id),
    );
}
function reviewView(row: WindowRow): SubmissionWindowReview {
  const { requestHash, ...safe } = row;
  void requestHash;
  return { ...safe, state: row.state as SubmissionWindowReview['state'] };
}
function view(assignmentId: string, row: WindowRow | null): SubmissionWindow {
  const asOf = new Date().toISOString();
  return {
    assignmentId,
    revision: row?.revision ?? 0,
    state: (row?.state as SubmissionWindow['state']) ?? 'open',
    closesAt: row?.closesAt ?? null,
    configured: row !== null,
    asOf,
    acceptingSubmissions:
      !row || (row.state === 'open' && (!row.closesAt || Date.parse(row.closesAt) > Date.parse(asOf))),
  };
}
export async function getSubmissionWindow(
  principal: Principal,
  assignmentId: string,
): Promise<SubmissionWindow> {
  const [row] = await assignmentQuery(principal)
    .where(
      and(
        eq(resourceAssignments.id, identifier.parse(assignmentId)),
        scope(principal),
        sql`not exists (select 1 from assignment_submission_windows newer where newer.assignment_id = ${resourceAssignments.id}
      and newer.revision > ${assignmentSubmissionWindows.revision})`,
      ),
    )
    .limit(1);
  if (!row) throw new AccessError('Assignment not found', 404);
  return view(row.assignmentId, row.policy);
}
export async function listSubmissionWindowReviews(
  principal: Principal,
  assignmentId: string,
): Promise<SubmissionWindowReview[]> {
  assertWindowStaff(principal);
  await getSubmissionWindow(principal, assignmentId);
  const rows = await assignmentQuery(principal)
    .where(and(eq(resourceAssignments.id, identifier.parse(assignmentId)), scope(principal)))
    .orderBy(desc(assignmentSubmissionWindows.revision))
    .limit(100);
  if (!rows.length) throw new AccessError('Assignment not found', 404);
  return rows.flatMap((row) => (row.policy ? [reviewView(row.policy)] : []));
}
async function retry(
  principal: Principal,
  assignmentId: string,
  data: SubmissionWindowInput,
  hash: string,
): Promise<SubmissionWindowResult | null> {
  const [row] = await assignmentQuery(principal)
    .where(
      and(
        eq(resourceAssignments.id, assignmentId),
        eq(assignmentSubmissionWindows.id, data.clientPolicyId),
        scope(principal),
      ),
    )
    .limit(1);
  if (!row?.policy) return null;
  if (row.policy.reviewedBy !== principal.id || row.policy.requestHash !== hash)
    throw new SubmissionWindowConflict();
  return { review: reviewView(row.policy), window: await getSubmissionWindow(principal, assignmentId) };
}
export async function reviewSubmissionWindow(
  principal: Principal,
  assignmentId: string,
  input: SubmissionWindowInput,
): Promise<SubmissionWindowResult> {
  assertWindowStaff(principal);
  identifier.parse(assignmentId);
  const data = submissionWindowSchema.parse(input),
    hash = await digest(JSON.stringify({ assignmentId, input: data }));
  await getSubmissionWindow(principal, assignmentId);
  const replay = await retry(principal, assignmentId, data, hash);
  if (replay) return replay;
  const [created] = await getDb()
    .insert(assignmentSubmissionWindows)
    .select(
      sql`select
    ${data.clientPolicyId}, ${resourceAssignments.id}, ${data.expectedRevision + 1}, ${data.state}, ${data.closesAt},
    ${principal.id}, ${new Date().toISOString()}, ${data.reason}, ${hash}
    from resource_assignments join classes on classes.id = resource_assignments.class_id
    join teaching_resources on teaching_resources.id = resource_assignments.resource_id
    join resource_versions on resource_versions.id = resource_assignments.version_id
    where ${resourceAssignments.id} = ${assignmentId} and ${scope(principal)}
      and coalesce((select max(existing.revision) from assignment_submission_windows existing
        where existing.assignment_id = ${resourceAssignments.id}), 0) = ${data.expectedRevision}
    limit 1`,
    )
    .onConflictDoNothing()
    .returning();
  if (created)
    return { review: reviewView(created), window: await getSubmissionWindow(principal, assignmentId) };
  await getSubmissionWindow(principal, assignmentId);
  const raced = await retry(principal, assignmentId, data, hash);
  if (raced) return raced;
  throw new SubmissionWindowConflict();
}

/** Applied in the actual attempt INSERT, using the database clock. A prior
 * committed attempt can still be replayed because replay precedes this guard. */
export function submissionWindowAllows(assignmentId: AnyColumn | string): SQL {
  return sql`not exists (select 1 from assignment_submission_windows current_window
    where current_window.assignment_id = ${assignmentId}
      and not exists (select 1 from assignment_submission_windows newer_window
        where newer_window.assignment_id = current_window.assignment_id and newer_window.revision > current_window.revision)
      and (current_window.state <> 'open' or (current_window.closes_at is not null and julianday(current_window.closes_at) <= julianday('now'))))`;
}
