import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { authSessions, classes, guardians, students, users } from '@/db/schema';
import {
  identityAdminChanges,
  identityAdminEvents,
  identityAdminUserVersions,
} from '@/db/identity-admin-schema';
import { AccessError } from './access';
import { DEMO_ISSUER, demoRuntimeAllowed } from './demo-policy';
import { digest } from './identity';
import {
  currentUser,
  IdentityAdminConflict,
  identifier,
  issuer,
  liveActor,
  liveAdmin,
  review,
  uniqueFailure,
  type AdminUser,
} from './identity-admin';
import type { Principal, Role } from './types';

/** Reviewed role and sign-in identity decisions for existing school accounts.
 * The school, actor and time always come from the server. Every decision is
 * versioned (compare-and-set), attributable, immutable evidence and revokes the
 * target account's sessions in the same database batch. */
const roleSchema = z.enum(['admin', 'teacher', 'guardian', 'student']);
const expectedVersion = z.number().int().min(0).max(1000000);
const subject = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => value === value.trim() && !/[\x00-\x1f\x7f]/.test(value));
export const changeRoleSchema = z.object({ ...review, expectedVersion, role: roleSchema }).strict();
export const changeIdentitySchema = z.discriminatedUnion('action', [
  z
    .object({
      ...review,
      expectedVersion,
      action: z.literal('link'),
      identityIssuer: issuer,
      identitySubject: subject,
    })
    .strict(),
  z.object({ ...review, expectedVersion, action: z.literal('unlink') }).strict(),
]);
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;
export type ChangeIdentityInput = z.infer<typeof changeIdentitySchema>;
export type IdentityChangeAction = 'change_role' | 'link_identity' | 'unlink_identity';
export type IdentityChangeEvent = {
  id: string;
  schoolId: string;
  actorId: string;
  userId: string;
  action: IdentityChangeAction;
  reason: string;
  reviewedAt: string;
  previousRole: Role;
  nextRole: Role;
  previousIssuer: string | null;
  previousSubject: string | null;
  nextIssuer: string | null;
  nextSubject: string | null;
  expectedVersion: number;
  resultingVersion: number;
};
export type IdentityChangeResult = { user: AdminUser; event: IdentityChangeEvent };
export type ConflictReason =
  | 'stale_version'
  | 'self'
  | 'no_change'
  | 'last_admin'
  | 'profile_linked'
  | 'class_assigned'
  | 'identity_in_use'
  | 'already_mapped'
  | 'not_mapped'
  | 'fixed_demo_account'
  | 'demo_unlink'
  | 'demo_issuer'
  | 'request_reused';
export type AdminUserDetail = {
  user: AdminUser;
  profile: { kind: 'student' | 'guardian'; name: string } | null;
  classCount: number;
  /** True when the account is the only enabled, mapped administrator in the school. */
  lastEnabledAdministrator: boolean;
  /** Fixed synthetic demo role accounts keep their sign-in identity. */
  fixedDemoAccount: boolean;
  demoRuntime: boolean;
};

type ChangeRow = typeof identityAdminChanges.$inferSelect;
function changeView(row: ChangeRow): IdentityChangeEvent {
  const { requestHash, attemptId, ...safe } = row;
  void requestHash;
  void attemptId;
  return {
    ...safe,
    action: row.action as IdentityChangeAction,
    previousRole: row.previousRole as Role,
    nextRole: row.nextRole as Role,
  };
}

const mappedAdmin = (alias: string) =>
  sql.raw(`${alias}.role = 'admin' AND ${alias}.disabled_at IS NULL
  AND ${alias}.identity_issuer IS NOT NULL AND ${alias}.identity_issuer <> '' AND ${alias}.identity_subject IS NOT NULL AND ${alias}.identity_subject <> ''`);

export async function listIdentityChanges(principal: Principal): Promise<IdentityChangeEvent[]> {
  await liveAdmin(principal);
  const rows = await getDb()
    .select()
    .from(identityAdminChanges)
    .where(and(eq(identityAdminChanges.schoolId, principal.schoolId!), liveActor(principal)))
    .orderBy(desc(identityAdminChanges.reviewedAt), desc(identityAdminChanges.id))
    .limit(200);
  return rows.map(changeView);
}

export async function getAdminUserDetail(principal: Principal, id: string): Promise<AdminUserDetail> {
  await liveAdmin(principal);
  const user = await currentUser(principal, id);
  if (!user) throw new AccessError('User not found', 404);
  const db = getDb();
  const [student] = await db
    .select({ first: students.firstName, last: students.lastName })
    .from(students)
    .where(and(eq(students.userId, user.id), eq(students.schoolId, principal.schoolId!)))
    .limit(1);
  const [guardian] = await db
    .select({ name: guardians.name })
    .from(guardians)
    .where(and(eq(guardians.userId, user.id), eq(guardians.schoolId, principal.schoolId!)))
    .limit(1);
  const [assigned] = await db
    .select({ n: sql<number>`count(*)` })
    .from(classes)
    .where(and(eq(classes.teacherId, user.id), eq(classes.schoolId, principal.schoolId!)));
  const [others] = await db
    .select({ n: sql<number>`count(*)` })
    .from(users)
    .where(
      sql`${users.schoolId} = ${principal.schoolId!} AND ${users.id} <> ${user.id} AND ${mappedAdmin('users')}`,
    );
  const mapped = Boolean(user.identityIssuer && user.identitySubject);
  return {
    user,
    profile: student
      ? { kind: 'student', name: `${student.first} ${student.last}` }
      : guardian
        ? { kind: 'guardian', name: guardian.name }
        : null,
    classCount: Number(assigned?.n ?? 0),
    lastEnabledAdministrator:
      user.role === 'admin' && !user.disabledAt && mapped && Number(others?.n ?? 0) === 0,
    fixedDemoAccount: user.identityIssuer === DEMO_ISSUER && user.identitySubject === user.id,
    demoRuntime: demoRuntimeAllowed(),
  };
}

async function replay(principal: Principal, id: string, hash: string): Promise<IdentityChangeResult | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(identityAdminChanges)
    .where(and(eq(identityAdminChanges.id, id), liveActor(principal)))
    .limit(1);
  if (!row) {
    // A request UUID is one decision only; it cannot be reused for a different kind of review.
    const [other] = await db
      .select({ id: identityAdminEvents.id })
      .from(identityAdminEvents)
      .where(eq(identityAdminEvents.id, id))
      .limit(1);
    if (other) throw new IdentityAdminConflict('request_reused');
    return null;
  }
  if (row.schoolId !== principal.schoolId || row.actorId !== principal.id || row.requestHash !== hash)
    throw new IdentityAdminConflict('request_reused');
  const user = await currentUser(principal, row.userId);
  if (!user) throw new IdentityAdminConflict();
  return { user, event: changeView(row) };
}

type Operation =
  | { kind: 'change_role'; role: Role }
  | { kind: 'link_identity'; issuer: string; subject: string }
  | { kind: 'unlink_identity' };

/** Plain reason for a refused decision. It only explains; the atomic guards in
 * the batch below remain the authority. */
async function explain(
  principal: Principal,
  userId: string,
  expected: number,
  operation: Operation,
): Promise<ConflictReason | undefined> {
  const detail = await getAdminUserDetail(principal, userId).catch(() => null);
  if (!detail) return undefined;
  const { user } = detail;
  if (userId === principal.id) return 'self';
  if (user.version !== expected) return 'stale_version';
  const mapped = Boolean(user.identityIssuer && user.identitySubject);
  if (operation.kind === 'change_role') {
    if (user.role === operation.role) return 'no_change';
    if (user.role === 'admin' && !user.disabledAt && detail.lastEnabledAdministrator) return 'last_admin';
    if ((user.role === 'student' || user.role === 'guardian') && detail.profile?.kind === user.role)
      return 'profile_linked';
    if (user.role === 'teacher' && detail.classCount > 0) return 'class_assigned';
  } else if (operation.kind === 'link_identity') {
    if (mapped) return 'already_mapped';
    const [used] = await getDb()
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.identityIssuer, operation.issuer), eq(users.identitySubject, operation.subject)))
      .limit(1);
    if (used) return 'identity_in_use';
  } else {
    if (!mapped) return 'not_mapped';
    if (detail.fixedDemoAccount) return 'fixed_demo_account';
    if (user.role === 'admin' && !user.disabledAt && detail.lastEnabledAdministrator) return 'last_admin';
  }
  return undefined;
}

async function decide(
  principal: Principal,
  id: string,
  request: { clientRequestId: string; reason: string; expectedVersion: number },
  operation: Operation,
): Promise<IdentityChangeResult> {
  await liveAdmin(principal);
  const userId = identifier.parse(id);
  const hash = await digest(JSON.stringify({ operation, userId, request }));
  const replayed = await replay(principal, request.clientRequestId, hash);
  if (replayed) return replayed;
  if (userId === principal.id) throw new IdentityAdminConflict('self');
  // Synthetic installations stay isolated only while every account keeps the synthetic issuer.
  if (operation.kind === 'link_identity' && demoRuntimeAllowed() && operation.issuer !== DEMO_ISSUER)
    throw new IdentityAdminConflict('demo_issuer');
  if (operation.kind === 'unlink_identity' && demoRuntimeAllowed())
    throw new IdentityAdminConflict('demo_unlink');
  if (!(await currentUser(principal, userId))) {
    await liveAdmin(principal);
    throw new AccessError('User not found', 404);
  }
  const db = getDb();
  const attemptId = crypto.randomUUID();
  const stamp = new Date().toISOString();
  const schoolId = principal.schoolId!;
  const isRole = operation.kind === 'change_role';
  const isLink = operation.kind === 'link_identity';
  const nextRole = operation.kind === 'change_role' ? operation.role : null;
  const nextIssuer = operation.kind === 'link_identity' ? operation.issuer : null;
  const nextSubject = operation.kind === 'link_identity' ? operation.subject : null;
  const unmapped = sql`(coalesce(target.identity_issuer, '') = '' OR coalesce(target.identity_subject, '') = '')`;
  const guards = sql`
    target.id = ${userId} AND target.school_id = ${schoolId} AND ${liveActor(principal)}
    AND coalesce(revisions.version, 0) = ${request.expectedVersion}
    AND target.id <> ${principal.id}
    AND NOT EXISTS (SELECT 1 FROM identity_admin_changes WHERE id = ${request.clientRequestId})
    AND NOT EXISTS (SELECT 1 FROM identity_admin_events WHERE id = ${request.clientRequestId})
    AND (${isRole ? 1 : 0} = 0 OR (target.role <> ${nextRole ?? ''}
      AND (target.role <> 'admin' OR target.disabled_at IS NOT NULL OR EXISTS (SELECT 1 FROM users other_admin
        WHERE other_admin.school_id = ${schoolId} AND other_admin.id <> target.id AND ${mappedAdmin('other_admin')}))
      AND NOT (target.role = 'student' AND EXISTS (SELECT 1 FROM students WHERE user_id = target.id))
      AND NOT (target.role = 'guardian' AND EXISTS (SELECT 1 FROM guardians WHERE user_id = target.id))
      AND NOT (target.role = 'teacher' AND EXISTS (SELECT 1 FROM classes WHERE teacher_id = target.id))))
    AND (${isLink ? 1 : 0} = 0 OR (${unmapped}
      AND NOT EXISTS (SELECT 1 FROM users holder WHERE holder.identity_issuer = ${nextIssuer ?? ''} AND holder.identity_subject = ${nextSubject ?? ''})))
    AND (${operation.kind === 'unlink_identity' ? 1 : 0} = 0 OR (NOT ${unmapped}
      AND NOT (target.identity_issuer = ${DEMO_ISSUER} AND target.identity_subject = target.id)
      AND (target.role <> 'admin' OR target.disabled_at IS NOT NULL OR EXISTS (SELECT 1 FROM users other_admin
        WHERE other_admin.school_id = ${schoolId} AND other_admin.id <> target.id AND ${mappedAdmin('other_admin')}))))`;
  const eventExists = sql`EXISTS (SELECT 1 FROM identity_admin_changes WHERE id = ${request.clientRequestId} AND attempt_id = ${attemptId})`;
  const userUpdate =
    operation.kind === 'change_role'
      ? { role: operation.role, updatedAt: stamp }
      : operation.kind === 'link_identity'
        ? { identityIssuer: operation.issuer, identitySubject: operation.subject, updatedAt: stamp }
        : { identityIssuer: null, identitySubject: null, updatedAt: stamp };
  try {
    await db.batch([
      db.insert(identityAdminChanges).select(
        db
          .select({
            id: sql<string>`${request.clientRequestId}`.as('id'),
            schoolId: sql<string>`${schoolId}`.as('school_id'),
            actorId: sql<string>`${principal.id}`.as('actor_id'),
            userId: sql<string>`target.id`.as('user_id'),
            action: sql<string>`${operation.kind}`.as('action'),
            reason: sql<string>`${request.reason}`.as('reason'),
            reviewedAt: sql<string>`${stamp}`.as('reviewed_at'),
            previousRole: sql<string>`target.role`.as('previous_role'),
            nextRole: (nextRole === null ? sql<string>`target.role` : sql<string>`${nextRole}`).as(
              'next_role',
            ),
            previousIssuer: sql<string>`target.identity_issuer`.as('previous_issuer'),
            previousSubject: sql<string>`target.identity_subject`.as('previous_subject'),
            nextIssuer: sql<string>`${nextIssuer}`.as('next_issuer'),
            nextSubject: sql<string>`${nextSubject}`.as('next_subject'),
            expectedVersion: sql<number>`${request.expectedVersion}`.as('expected_version'),
            resultingVersion: sql<number>`${request.expectedVersion + 1}`.as('resulting_version'),
            requestHash: sql<string>`${hash}`.as('request_hash'),
            attemptId: sql<string>`${attemptId}`.as('attempt_id'),
          })
          .from(
            sql`users target LEFT JOIN identity_admin_user_versions revisions ON revisions.user_id = target.id`,
          )
          .where(guards),
      ),
      db
        .update(users)
        .set(userUpdate)
        .where(sql`${users.id} = ${userId} AND ${eventExists}`),
      db.delete(authSessions).where(sql`${authSessions.userId} = ${userId} AND ${eventExists}`),
      db
        .insert(identityAdminUserVersions)
        .select(
          db
            .select({ userId: identityAdminChanges.userId, version: identityAdminChanges.resultingVersion })
            .from(identityAdminChanges)
            .where(
              and(
                eq(identityAdminChanges.id, request.clientRequestId),
                eq(identityAdminChanges.attemptId, attemptId),
              ),
            ),
        )
        .onConflictDoUpdate({
          target: identityAdminUserVersions.userId,
          set: { version: sql`excluded.version` },
        }),
    ]);
  } catch (error) {
    if (!uniqueFailure(error)) throw error;
    // Same-request retry races and identity collisions land here; replay first, then explain.
    const raced = await replay(principal, request.clientRequestId, hash);
    if (raced) return raced;
    if (isLink) throw new IdentityAdminConflict('identity_in_use');
    throw new IdentityAdminConflict();
  }
  await liveAdmin(principal);
  const result = await replay(principal, request.clientRequestId, hash);
  if (!result)
    throw new IdentityAdminConflict(await explain(principal, userId, request.expectedVersion, operation));
  return result;
}

export async function changeRole(
  principal: Principal,
  id: string,
  value: ChangeRoleInput,
): Promise<IdentityChangeResult> {
  await liveAdmin(principal);
  const input = changeRoleSchema.parse(value);
  return decide(
    principal,
    id,
    { clientRequestId: input.clientRequestId, reason: input.reason, expectedVersion: input.expectedVersion },
    { kind: 'change_role', role: input.role },
  );
}

export async function changeIdentity(
  principal: Principal,
  id: string,
  value: ChangeIdentityInput,
): Promise<IdentityChangeResult> {
  await liveAdmin(principal);
  const input = changeIdentitySchema.parse(value);
  const request = {
    clientRequestId: input.clientRequestId,
    reason: input.reason,
    expectedVersion: input.expectedVersion,
  };
  return decide(
    principal,
    id,
    request,
    input.action === 'link'
      ? { kind: 'link_identity', issuer: input.identityIssuer, subject: input.identitySubject }
      : { kind: 'unlink_identity' },
  );
}
