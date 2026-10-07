import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { users, authSessions } from '@/db/schema';
import { identityAdminEvents, identityAdminUserVersions } from '@/db/identity-admin-schema';
import { AccessError, assertAdmin, livePrincipalScope } from './access';
import { digest } from './identity';
import { DEMO_ISSUER, demoRuntimeAllowed } from './demo-policy';
import type { Principal, Role } from './types';

export const identifier = z.string().min(1).max(120);
export const reason = z.string().trim().min(10).max(500).refine(value => !/[\x00-\x1f\x7f]/.test(value));
export const issuer = z.string().min(1).max(2048).refine(value => {
  try {
    const url = new URL(value);
    return value === value.trim() && url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}, 'Use the exact trusted HTTPS issuer');
export const review = { clientRequestId: z.string().uuid(), reviewConfirmed: z.literal(true), reason };
export const provisionIdentitySchema = z.object({
  ...review, name: z.string().trim().min(1).max(120), email: z.string().trim().email().max(254),
  role: z.enum(['admin', 'teacher', 'guardian', 'student']), identityIssuer: issuer,
  identitySubject: z.string().min(1).max(255).refine(value => value === value.trim() && !/[\x00-\x1f\x7f]/.test(value)),
}).strict();
export const changeIdentityStatusSchema = z.object({
  ...review, expectedVersion: z.number().int().min(0).max(1000000), enabled: z.boolean(),
}).strict();
export type ProvisionIdentityInput = z.infer<typeof provisionIdentitySchema>;
export type ChangeIdentityStatusInput = z.infer<typeof changeIdentityStatusSchema>;
export type AdminUser = {
  id: string; name: string; email: string; role: Role; schoolId: string;
  identityIssuer: string | null; identitySubject: string | null; disabledAt: string | null;
  version: number; createdAt: string; updatedAt: string;
};
export type IdentityAdminEvent = {
  id: string; schoolId: string; actorId: string; userId: string; action: 'provision' | 'enable' | 'disable';
  reason: string; reviewedAt: string; previousEnabled: boolean | null; nextEnabled: boolean;
  expectedVersion: number; resultingVersion: number;
};
export type IdentityAdminResult = { user: AdminUser; event: IdentityAdminEvent };
export class IdentityAdminConflict extends Error {
  readonly status = 409;
  /** Short machine reason so the review screen can explain the refusal in plain language. */
  readonly reason: string | undefined;
  constructor(reason?: string) { super('Identity administration conflict'); this.name = 'IdentityAdminConflict'; this.reason = reason; }
}
export function liveActor(principal: Principal) {
  assertAdmin(principal);
  return livePrincipalScope(principal);
}
export async function liveAdmin(principal: Principal): Promise<void> {
  assertAdmin(principal);
  const [row] = await getDb().select({ id: users.id }).from(users)
    .where(and(eq(users.id, principal.id), liveActor(principal))).limit(1);
  if (!row) throw new AccessError('Administrator access required');
}
export function userView(row: typeof users.$inferSelect, version: number): AdminUser {
  return { ...row, role: row.role as Role, schoolId: row.schoolId!, version };
}
type EventRow = typeof identityAdminEvents.$inferSelect;
function eventView(row: EventRow): IdentityAdminEvent {
  const { requestHash, attemptId, ...safe } = row;
  void requestHash; void attemptId;
  return { ...safe, action: row.action as IdentityAdminEvent['action'], previousEnabled: row.previousEnabled === null ? null : row.previousEnabled === 1, nextEnabled: row.nextEnabled === 1 };
}
export async function currentUser(principal: Principal, id: string): Promise<AdminUser | null> {
  const [row] = await getDb().select({ user: users, version: sql<number>`coalesce(${identityAdminUserVersions.version}, 0)` })
    .from(users).leftJoin(identityAdminUserVersions, eq(identityAdminUserVersions.userId, users.id))
    .where(and(eq(users.id, identifier.parse(id)), eq(users.schoolId, principal.schoolId!), liveActor(principal))).limit(1);
  return row ? userView(row.user, row.version) : null;
}
export async function listAdminUsers(principal: Principal): Promise<AdminUser[]> {
  await liveAdmin(principal);
  const rows = await getDb().select({ user: users, version: sql<number>`coalesce(${identityAdminUserVersions.version}, 0)` })
    .from(users).leftJoin(identityAdminUserVersions, eq(identityAdminUserVersions.userId, users.id))
    .where(and(eq(users.schoolId, principal.schoolId!), liveActor(principal))).orderBy(users.name, users.id).limit(500);
  return rows.map(row => userView(row.user, row.version));
}
export async function listIdentityAdminEvents(principal: Principal): Promise<IdentityAdminEvent[]> {
  await liveAdmin(principal);
  const rows = await getDb().select().from(identityAdminEvents)
    .where(and(eq(identityAdminEvents.schoolId, principal.schoolId!), liveActor(principal)))
    .orderBy(desc(identityAdminEvents.reviewedAt), desc(identityAdminEvents.id)).limit(200);
  return rows.map(eventView);
}
async function retry(principal: Principal, id: string, hash: string): Promise<IdentityAdminResult | null> {
  const [event] = await getDb().select().from(identityAdminEvents).where(and(eq(identityAdminEvents.id, id), liveActor(principal))).limit(1);
  if (!event) return null;
  if (event.schoolId !== principal.schoolId || event.actorId !== principal.id || event.requestHash !== hash) throw new IdentityAdminConflict();
  const user = await currentUser(principal, event.userId);
  if (!user) throw new IdentityAdminConflict();
  return { user, event: eventView(event) };
}
export function uniqueFailure(error: unknown): boolean {
  return error instanceof Error && (/UNIQUE constraint failed|PRIMARY KEY constraint failed/i.test(error.message) || uniqueFailure(error.cause));
}

export async function provisionIdentity(principal: Principal, value: ProvisionIdentityInput): Promise<IdentityAdminResult> {
  await liveAdmin(principal);
  const input = provisionIdentitySchema.parse(value);
  // An isolated synthetic installation closes when any other issuer appears in its school.
  if (demoRuntimeAllowed() && input.identityIssuer !== DEMO_ISSUER) throw new IdentityAdminConflict('demo_issuer');
  const hash = await digest(JSON.stringify({ action: 'provision', input }));
  const replay = await retry(principal, input.clientRequestId, hash);
  if (replay) return replay;
  const db = getDb(); const userId = crypto.randomUUID(); const attemptId = crypto.randomUUID(); const stamp = new Date().toISOString();
  try {
    // D1 batch is one transaction. An attempt marker prevents a concurrent replay
    // from applying an old decision again; the unique request key retains evidence.
    await db.batch([
      db.insert(users).select(db.select({
        id: sql<string>`${userId}`.as('id'), name: sql<string>`${input.name}`.as('name'), email: sql<string>`${input.email}`.as('email'), role: sql<string>`${input.role}`.as('role'),
        identityIssuer: sql<string>`${input.identityIssuer}`.as('identity_issuer'), identitySubject: sql<string>`${input.identitySubject}`.as('identity_subject'),
        disabledAt: sql<string>`NULL`.as('disabled_at'), schoolId: sql<string>`${principal.schoolId!}`.as('school_id'), createdAt: sql<string>`${stamp}`.as('created_at'), updatedAt: sql<string>`${stamp}`.as('updated_at'),
      }).from(sql`(SELECT 1)`).where(sql`${liveActor(principal)} AND NOT EXISTS (SELECT 1 FROM identity_admin_events WHERE id = ${input.clientRequestId})`)),
      db.insert(identityAdminEvents).select(db.select({
        id: sql<string>`${input.clientRequestId}`.as('id'), schoolId: sql<string>`${principal.schoolId!}`.as('school_id'), actorId: sql<string>`${principal.id}`.as('actor_id'),
        userId: sql<string>`${userId}`.as('user_id'), action: sql<string>`'provision'`.as('action'), reason: sql<string>`${input.reason}`.as('reason'), reviewedAt: sql<string>`${stamp}`.as('reviewed_at'),
        previousEnabled: sql<number>`NULL`.as('previous_enabled'), nextEnabled: sql<number>`1`.as('next_enabled'), expectedVersion: sql<number>`0`.as('expected_version'), resultingVersion: sql<number>`1`.as('resulting_version'),
        requestHash: sql<string>`${hash}`.as('request_hash'), attemptId: sql<string>`${attemptId}`.as('attempt_id'),
      }).from(users).where(sql`${users.id} = ${userId} AND ${liveActor(principal)} AND NOT EXISTS (SELECT 1 FROM identity_admin_events WHERE id = ${input.clientRequestId})`)),
      db.insert(identityAdminUserVersions).select(db.select({ userId: identityAdminEvents.userId, version: identityAdminEvents.resultingVersion })
        .from(identityAdminEvents).where(and(eq(identityAdminEvents.id, input.clientRequestId), eq(identityAdminEvents.attemptId, attemptId)))),
    ]);
  } catch (error) {
    if (!uniqueFailure(error)) throw error;
    const replayed = await retry(principal, input.clientRequestId, hash);
    if (replayed) return replayed;
    throw new IdentityAdminConflict();
  }
  await liveAdmin(principal);
  const result = await retry(principal, input.clientRequestId, hash);
  if (!result) throw new IdentityAdminConflict();
  return result;
}

export async function changeIdentityStatus(principal: Principal, id: string, value: ChangeIdentityStatusInput): Promise<IdentityAdminResult> {
  await liveAdmin(principal);
  const userId = identifier.parse(id); const input = changeIdentityStatusSchema.parse(value);
  // An active administrator must keep their own access while administering others.
  if (!input.enabled && userId === principal.id) throw new IdentityAdminConflict();
  const hash = await digest(JSON.stringify({ action: input.enabled ? 'enable' : 'disable', userId, input }));
  const replay = await retry(principal, input.clientRequestId, hash);
  if (replay) return replay;
  if (!await currentUser(principal, userId)) {
    // The scoped read also returns no row after actor revocation. Preserve a
    // permission failure for that case without revealing whether the target exists.
    await liveAdmin(principal);
    throw new AccessError('User not found', 404);
  }
  const db = getDb(); const attemptId = crypto.randomUUID(); const stamp = new Date().toISOString();
  try {
    await db.batch([
      db.insert(identityAdminEvents).select(db.select({
        id: sql<string>`${input.clientRequestId}`.as('id'), schoolId: sql<string>`${principal.schoolId!}`.as('school_id'), actorId: sql<string>`${principal.id}`.as('actor_id'),
        userId: sql<string>`target.id`.as('user_id'), action: sql<string>`${input.enabled ? 'enable' : 'disable'}`.as('action'), reason: sql<string>`${input.reason}`.as('reason'),
        reviewedAt: sql<string>`${stamp}`.as('reviewed_at'), previousEnabled: sql<number>`CASE WHEN target.disabled_at IS NULL THEN 1 ELSE 0 END`.as('previous_enabled'),
        nextEnabled: sql<number>`${input.enabled ? 1 : 0}`.as('next_enabled'), expectedVersion: sql<number>`${input.expectedVersion}`.as('expected_version'), resultingVersion: sql<number>`${input.expectedVersion + 1}`.as('resulting_version'),
        requestHash: sql<string>`${hash}`.as('request_hash'), attemptId: sql<string>`${attemptId}`.as('attempt_id'),
      }).from(sql`users target LEFT JOIN identity_admin_user_versions revisions ON revisions.user_id = target.id`).where(sql`
        target.id = ${userId} AND target.school_id = ${principal.schoolId!} AND ${liveActor(principal)}
          AND coalesce(revisions.version, 0) = ${input.expectedVersion}
          AND (${input.enabled ? 1 : 0} = 1 OR target.id <> ${principal.id})
          AND (${input.enabled ? 1 : 0} = 1 OR target.role <> 'admin' OR
            (SELECT count(*) FROM users enabled_admin WHERE enabled_admin.school_id = ${principal.schoolId!} AND enabled_admin.role = 'admin'
              AND enabled_admin.disabled_at IS NULL AND enabled_admin.identity_issuer IS NOT NULL AND enabled_admin.identity_issuer <> ''
              AND enabled_admin.identity_subject IS NOT NULL AND enabled_admin.identity_subject <> '') > 1)
          AND NOT EXISTS (SELECT 1 FROM identity_admin_events WHERE id = ${input.clientRequestId})`)),
      db.update(users).set({ disabledAt: input.enabled ? null : stamp, updatedAt: stamp }).where(sql`
        ${users.id} = ${userId} AND EXISTS (SELECT 1 FROM identity_admin_events WHERE id = ${input.clientRequestId} AND attempt_id = ${attemptId})`),
      db.delete(authSessions).where(sql`${authSessions.userId} = ${userId} AND EXISTS
        (SELECT 1 FROM identity_admin_events WHERE id = ${input.clientRequestId} AND attempt_id = ${attemptId} AND next_enabled = 0)`),
      db.insert(identityAdminUserVersions).select(db.select({ userId: identityAdminEvents.userId, version: identityAdminEvents.resultingVersion })
        .from(identityAdminEvents).where(and(eq(identityAdminEvents.id, input.clientRequestId), eq(identityAdminEvents.attemptId, attemptId))))
        .onConflictDoUpdate({ target: identityAdminUserVersions.userId, set: { version: sql`excluded.version` } }),
    ]);
  } catch (error) { if (!uniqueFailure(error)) throw error; }
  await liveAdmin(principal);
  const result = await retry(principal, input.clientRequestId, hash);
  if (!result) throw new IdentityAdminConflict();
  return result;
}
