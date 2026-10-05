import { z } from 'zod';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { students, guardians, users, authSessions } from '@/db/schema';
import { profileLinkVersions, profileLinkEvents } from '@/db/profile-links-schema';
import { assertAdmin, AccessError, livePrincipalScope } from './access';
import { digest } from './identity';
import type { Principal } from './types';

const identifier = z.string().min(1).max(120).refine(value => value === value.trim() && !/[\x00-\x1f\x7f]/.test(value));
// Existing endpoints accept the raw nullable field only to detect an attempted
// binding change and return the fixed reviewed-workflow direction.
export const legacyProfileUserIdSchema = z.string().nullable().optional();
export const profileTypeSchema = z.enum(['student', 'guardian']);
export const reviewedProfileLinkSchema = z.object({
  profileType: profileTypeSchema, profileId: identifier, userId: identifier.nullable(),
  expectedVersion: z.number().int().min(0).max(999999), clientRequestId: z.string().uuid(),
  reviewConfirmed: z.literal(true), reason: z.string().trim().min(10).max(500).refine(value => Array.from(value).length >= 10 && !/[\x00-\x1f\x7f<>]/.test(value)),
}).strict();
export const profileLinkHistorySchema = z.object({ profileType: profileTypeSchema.optional(), profileId: identifier.optional() }).strict()
  .refine(value => Boolean(value.profileType) === Boolean(value.profileId), 'Select a profile type and ID together');
export type ProfileType = z.infer<typeof profileTypeSchema>;
export type ReviewedProfileLinkInput = z.infer<typeof reviewedProfileLinkSchema>;
export type ProfileLinkProfile = { profileType: ProfileType; profileId: string; name: string; userId: string | null; version: number; updatedAt: string };
export type ProfileLinkAccount = { id: string; name: string; email: string; role: 'student' | 'guardian' };
export type ProfileLinkInventory = { profiles: ProfileLinkProfile[]; accounts: ProfileLinkAccount[] };
export type ProfileLinkEvent = { id: string; schoolId: string; actorId: string; profileType: ProfileType; profileId: string;
  previousUserId: string | null; nextUserId: string | null; expectedVersion: number; resultingVersion: number; reason: string; reviewedAt: string };
export type ProfileLinkResult = { profile: ProfileLinkProfile; event: ProfileLinkEvent };
export class ProfileLinkConflict extends Error {
  readonly status = 409;
  constructor() { super('Profile link conflict'); this.name = 'ProfileLinkConflict'; }
}
export class ProfileLinkReviewRequired extends AccessError {
  constructor() { super('Use reviewed profile link administration at /admin/profile-links', 400); }
}

// Exported for legacy profile writes: they may edit ordinary fields, but cannot
// bypass a reviewed link decision or persist with a revoked administrator.
export function profileActorScope(principal: Principal) {
  return livePrincipalScope(principal);
}
export function profileAdminScope(principal: Principal) { assertAdmin(principal); return profileActorScope(principal); }
async function liveAdmin(principal: Principal): Promise<void> {
  const [actor] = await getDb().select({ id: users.id }).from(users).where(and(eq(users.id, principal.id), profileAdminScope(principal))).limit(1);
  if (!actor) throw new AccessError('Administrator access required');
}
function profileName(kind: ProfileType) {
  return kind === 'student' ? sql<string>`${students.firstName} || ' ' || ${students.lastName}` : sql<string>`${guardians.name}`;
}
async function profileRows(principal: Principal, kind: ProfileType, id?: string): Promise<ProfileLinkProfile[]> {
  const table = kind === 'student' ? students : guardians;
  const rows = await getDb().select({ profileId: table.id, name: profileName(kind), userId: table.userId,
    version: sql<number>`coalesce(${profileLinkVersions.version}, 0)`, updatedAt: table.updatedAt })
    .from(table).leftJoin(profileLinkVersions, and(eq(profileLinkVersions.profileType, kind), eq(profileLinkVersions.profileId, table.id)))
    .where(and(eq(table.schoolId, principal.schoolId!), profileAdminScope(principal), id ? eq(table.id, identifier.parse(id)) : undefined))
    .orderBy(table.id).limit(id ? 1 : 500);
  return rows.map(row => ({ ...row, profileType: kind }));
}
export async function listProfileLinks(principal: Principal): Promise<ProfileLinkInventory> {
  await liveAdmin(principal);
  const studentProfiles = await profileRows(principal, 'student');
  const guardianProfiles = await profileRows(principal, 'guardian');
  const accountRows = await getDb().select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users)
    .where(and(eq(users.schoolId, principal.schoolId!), isNull(users.disabledAt), profileAdminScope(principal),
      sql`${users.role} IN ('student', 'guardian') AND ${users.identityIssuer} IS NOT NULL AND ${users.identityIssuer} <> '' AND ${users.identitySubject} IS NOT NULL AND ${users.identitySubject} <> ''`))
    .orderBy(users.name, users.id).limit(500);
  // If authority changed during assembly, don't release previously read evidence.
  await liveAdmin(principal);
  return { profiles: [...studentProfiles, ...guardianProfiles], accounts: accountRows.map(row => ({ ...row, role: row.role as ProfileLinkAccount['role'] })) };
}
function eventView(row: typeof profileLinkEvents.$inferSelect): ProfileLinkEvent {
  const { requestHash, attemptId, studentId, guardianId, ...safe } = row;
  void requestHash; void attemptId; void studentId; void guardianId;
  return { ...safe, profileType: row.profileType as ProfileType };
}
function eventProfileScope(principal: Principal) {
  return sql`((profile_type = 'student' AND EXISTS (SELECT 1 FROM students profile_target
    WHERE profile_target.id = ${profileLinkEvents.profileId} AND profile_target.school_id = ${principal.schoolId!})) OR
    (profile_type = 'guardian' AND EXISTS (SELECT 1 FROM guardians profile_target
    WHERE profile_target.id = ${profileLinkEvents.profileId} AND profile_target.school_id = ${principal.schoolId!})))`;
}
export async function listProfileLinkHistory(principal: Principal, filter: z.infer<typeof profileLinkHistorySchema> = {}): Promise<ProfileLinkEvent[]> {
  await liveAdmin(principal); const data = profileLinkHistorySchema.parse(filter);
  const rows = await getDb().select().from(profileLinkEvents).where(and(eq(profileLinkEvents.schoolId, principal.schoolId!), profileAdminScope(principal), eventProfileScope(principal),
    data.profileType ? eq(profileLinkEvents.profileType, data.profileType) : undefined, data.profileId ? eq(profileLinkEvents.profileId, data.profileId) : undefined))
    .orderBy(desc(profileLinkEvents.reviewedAt), desc(profileLinkEvents.id)).limit(200);
  return rows.map(eventView);
}
async function retry(principal: Principal, id: string, hash: string): Promise<ProfileLinkResult | null> {
  const [event] = await getDb().select().from(profileLinkEvents).where(and(eq(profileLinkEvents.id, id), eq(profileLinkEvents.schoolId, principal.schoolId!), profileAdminScope(principal), eventProfileScope(principal))).limit(1);
  if (!event) return null;
  if (event.actorId !== principal.id || event.requestHash !== hash) throw new ProfileLinkConflict();
  const [profile] = await profileRows(principal, event.profileType as ProfileType, event.profileId);
  if (!profile) throw new ProfileLinkConflict();
  return { profile, event: eventView(event) };
}
function uniqueFailure(error: unknown): boolean {
  return error instanceof Error && (/UNIQUE constraint failed|PRIMARY KEY constraint failed|Guardian login already linked/i.test(error.message) || uniqueFailure(error.cause));
}
export async function reviewProfileLink(principal: Principal, value: ReviewedProfileLinkInput): Promise<ProfileLinkResult> {
  await liveAdmin(principal); const input = reviewedProfileLinkSchema.parse(value);
  const hash = await digest(JSON.stringify(input));
  const prior = await retry(principal, input.clientRequestId, hash); if (prior) return prior;
  const [existing] = await profileRows(principal, input.profileType, input.profileId);
  if (!existing) { await liveAdmin(principal); throw new AccessError('Profile not found', 404); }
  const table = input.profileType === 'student' ? students : guardians;
  const db = getDb(); const attemptId = crypto.randomUUID(); const stamp = new Date().toISOString();
  const newAccount = input.userId === null ? sql`1 = 1` : sql`EXISTS (SELECT 1 FROM users target_user
    WHERE target_user.id = ${input.userId} AND target_user.school_id = ${principal.schoolId!} AND target_user.role = ${input.profileType}
      AND target_user.disabled_at IS NULL AND target_user.identity_issuer IS NOT NULL AND target_user.identity_issuer <> ''
      AND target_user.identity_subject IS NOT NULL AND target_user.identity_subject <> '')`;
  const available = input.userId === null ? sql`1 = 1` : sql`NOT EXISTS (SELECT 1 FROM ${table} occupied
    WHERE occupied.user_id = ${input.userId} AND occupied.id <> ${input.profileId})`;
  const ownAttempt = sql`EXISTS (SELECT 1 FROM profile_link_events WHERE id = ${input.clientRequestId} AND attempt_id = ${attemptId})`;
  try {
    await db.batch([
      db.insert(profileLinkEvents).select(db.select({
        id: sql<string>`${input.clientRequestId}`.as('id'), schoolId: sql<string>`${principal.schoolId!}`.as('school_id'), actorId: sql<string>`${principal.id}`.as('actor_id'),
        profileType: sql<string>`${input.profileType}`.as('profile_type'), profileId: table.id,
        studentId: sql<string | null>`${input.profileType === 'student' ? input.profileId : null}`.as('student_id'),
        guardianId: sql<string | null>`${input.profileType === 'guardian' ? input.profileId : null}`.as('guardian_id'),
        previousUserId: table.userId, nextUserId: sql<string | null>`${input.userId}`.as('next_user_id'),
        expectedVersion: sql<number>`${input.expectedVersion}`.as('expected_version'), resultingVersion: sql<number>`${input.expectedVersion + 1}`.as('resulting_version'),
        reason: sql<string>`${input.reason}`.as('reason'), reviewedAt: sql<string>`${stamp}`.as('reviewed_at'),
        requestHash: sql<string>`${hash}`.as('request_hash'), attemptId: sql<string>`${attemptId}`.as('attempt_id'),
      }).from(table).leftJoin(profileLinkVersions, and(eq(profileLinkVersions.profileType, input.profileType), eq(profileLinkVersions.profileId, table.id)))
        .where(and(eq(table.id, input.profileId), eq(table.schoolId, principal.schoolId!), profileAdminScope(principal), newAccount, available,
          sql`${table.userId} IS NOT ${input.userId} AND coalesce(${profileLinkVersions.version}, 0) = ${input.expectedVersion}
          AND NOT EXISTS (SELECT 1 FROM profile_link_events WHERE id = ${input.clientRequestId})`))),
      db.update(table).set({ userId: input.userId, updatedAt: stamp }).where(and(eq(table.id, input.profileId), ownAttempt)),
      db.insert(profileLinkVersions).select(db.select({ profileType: profileLinkEvents.profileType, profileId: profileLinkEvents.profileId,
        studentId: profileLinkEvents.studentId, guardianId: profileLinkEvents.guardianId, version: profileLinkEvents.resultingVersion })
        .from(profileLinkEvents).where(and(eq(profileLinkEvents.id, input.clientRequestId), eq(profileLinkEvents.attemptId, attemptId))))
        .onConflictDoUpdate({ target: [profileLinkVersions.profileType, profileLinkVersions.profileId], set: { version: sql`excluded.version` } }),
      db.delete(authSessions).where(sql`EXISTS (SELECT 1 FROM profile_link_events WHERE id = ${input.clientRequestId}
        AND attempt_id = ${attemptId} AND (previous_user_id = ${authSessions.userId} OR next_user_id = ${authSessions.userId}))
        AND ${authSessions.userId} <> ${principal.id}`),
    ]);
  } catch (error) { if (!uniqueFailure(error)) throw error; }
  await liveAdmin(principal);
  const saved = await retry(principal, input.clientRequestId, hash); if (!saved) throw new ProfileLinkConflict();
  return saved;
}
