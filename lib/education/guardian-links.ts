import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/index';
import { guardians, students, studentGuardians, users } from '@/db/schema';
import { studentGuardianDetails, studentGuardianEvents } from '@/db/school-records-schema';
import { AccessError, assertAdmin, livePrincipalScope, studentScope } from './access';
import { RecordConflict, constraintFailure, digestOf, identifier, plainText, reasonSchema, requestIdSchema, versionSchema } from './record-support';
import { profileAdminScope } from './profile-links';
import type { Principal } from './types';

export type GuardianLinkView = { guardianId: string; name: string; relationship: string; profileRelationship: string; isPrimary: boolean; hasLogin: boolean; version: number };
export type GuardianCandidate = { id: string; name: string; relationship: string; hasLogin: boolean; version: number };
export type GuardianLinkEventView = { id: string; guardianId: string; guardianName: string; action: 'link' | 'update' | 'unlink'; relationshipBefore: string | null; relationshipAfter: string | null;
  primaryBefore: boolean | null; primaryAfter: boolean | null; reason: string; actorName: string; createdAt: string; resultingVersion: number };
export type GuardianLinkInventory = { student: { id: string; name: string }; links: GuardianLinkView[]; candidates: GuardianCandidate[]; history: GuardianLinkEventView[] };

const common = { guardianId: identifier, reason: reasonSchema, clientRequestId: requestIdSchema, expectedVersion: versionSchema };
export const guardianLinkSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('link'), ...common, relationship: plainText('Relationship', 60), isPrimary: z.boolean() }).strict(),
  z.object({ action: z.literal('update'), ...common, relationship: plainText('Relationship', 60).optional(), isPrimary: z.boolean().optional() }).strict(),
  z.object({ action: z.literal('unlink'), ...common }).strict(),
]);
export type GuardianLinkInput = z.input<typeof guardianLinkSchema>;

const pairVersion = (studentId: string | ReturnType<typeof sql>, guardianId: string | ReturnType<typeof sql>) =>
  sql`(select count(*) from student_guardian_events pair_event where pair_event.student_id = ${studentId} and pair_event.guardian_id = ${guardianId})`;

async function liveAdmin(principal: Principal): Promise<void> {
  const [actor] = await getDb().select({ id: users.id }).from(users).where(and(eq(users.id, principal.id), profileAdminScope(principal))).limit(1);
  if (!actor) throw new AccessError('Administrator access required');
}

export async function listGuardianLinks(principal: Principal, studentId: string): Promise<GuardianLinkInventory> {
  assertAdmin(principal);
  const db = getDb(), schoolId = principal.schoolId!;
  const [student] = await db.select({ id: students.id, name: sql<string>`${students.firstName} || ' ' || ${students.lastName}` }).from(students)
    .where(and(eq(students.id, studentId), studentScope(principal), profileAdminScope(principal))).limit(1);
  if (!student) throw new AccessError('Student not found', 404);
  const links = await db.select({ guardianId: guardians.id, name: guardians.name, relationship: sql<string>`coalesce(${studentGuardianDetails.relationship}, ${guardians.relationship})`,
    profileRelationship: guardians.relationship, isPrimary: studentGuardians.isPrimary, hasLogin: sql<number>`case when ${guardians.userId} is null then 0 else 1 end`,
    version: sql<number>`${pairVersion(sql`${studentGuardians.studentId}`, sql`${studentGuardians.guardianId}`)}` })
    .from(studentGuardians).innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
    .leftJoin(studentGuardianDetails, and(eq(studentGuardianDetails.studentId, studentGuardians.studentId), eq(studentGuardianDetails.guardianId, studentGuardians.guardianId)))
    .where(and(eq(studentGuardians.studentId, studentId), eq(guardians.schoolId, schoolId))).orderBy(guardians.name, guardians.id).limit(100);
  const candidates = await db.select({ id: guardians.id, name: guardians.name, relationship: guardians.relationship, hasLogin: sql<number>`case when ${guardians.userId} is null then 0 else 1 end`,
    version: sql<number>`${pairVersion(sql`${studentId}`, sql`${guardians.id}`)}` }).from(guardians)
    .where(and(eq(guardians.schoolId, schoolId), sql`not exists (select 1 from student_guardians linked where linked.student_id = ${studentId} and linked.guardian_id = ${guardians.id})`)).orderBy(guardians.name, guardians.id).limit(500);
  const history = await db.select({ id: studentGuardianEvents.id, guardianId: studentGuardianEvents.guardianId, guardianName: guardians.name, action: studentGuardianEvents.action,
    relationshipBefore: studentGuardianEvents.relationshipBefore, relationshipAfter: studentGuardianEvents.relationshipAfter, primaryBefore: studentGuardianEvents.primaryBefore,
    primaryAfter: studentGuardianEvents.primaryAfter, reason: studentGuardianEvents.reason, actorName: users.name, createdAt: studentGuardianEvents.createdAt, resultingVersion: studentGuardianEvents.resultingVersion })
    .from(studentGuardianEvents).innerJoin(guardians, eq(guardians.id, studentGuardianEvents.guardianId)).leftJoin(users, eq(users.id, studentGuardianEvents.actorId))
    .where(and(eq(studentGuardianEvents.studentId, studentId), eq(studentGuardianEvents.schoolId, schoolId))).orderBy(desc(studentGuardianEvents.createdAt), desc(studentGuardianEvents.id)).limit(100);
  await liveAdmin(principal);
  const flag = (value: number | null) => value === null ? null : Boolean(value);
  return {
    student,
    links: links.map(row => ({ ...row, isPrimary: Boolean(row.isPrimary), hasLogin: Boolean(row.hasLogin), version: Number(row.version) })),
    candidates: candidates.map(row => ({ ...row, hasLogin: Boolean(row.hasLogin), version: Number(row.version) })),
    history: history.map(row => ({ ...row, action: row.action as GuardianLinkEventView['action'], primaryBefore: flag(row.primaryBefore), primaryAfter: flag(row.primaryAfter), actorName: row.actorName ?? 'Former administrator' })),
  };
}

/** One reviewed, version-checked link change. Every statement is conditional on this attempt's own event row,
 * so a stale or revoked administrator or a lost race changes nothing; an exact UUID retry returns the original. */
export async function reviewGuardianLink(principal: Principal, studentId: string, value: GuardianLinkInput): Promise<{ inventory: GuardianLinkInventory; replayed: boolean }> {
  assertAdmin(principal);
  const input = guardianLinkSchema.parse(value);
  const db = getDb(), schoolId = principal.schoolId!;
  const { clientRequestId, ...evidence } = input;
  const hash = await digestOf({ studentId, ...evidence });
  const [prior] = await db.select().from(studentGuardianEvents).where(eq(studentGuardianEvents.id, clientRequestId)).limit(1);
  if (prior) {
    if (prior.actorId !== principal.id || prior.schoolId !== schoolId || prior.requestHash !== hash) throw new RecordConflict('request-reused');
    return { inventory: await listGuardianLinks(principal, studentId), replayed: true };
  }
  const [student] = await db.select({ id: students.id }).from(students).where(and(eq(students.id, studentId), studentScope(principal), profileAdminScope(principal))).limit(1);
  const [guardian] = await db.select({ id: guardians.id, relationship: guardians.relationship }).from(guardians).where(and(eq(guardians.id, input.guardianId), eq(guardians.schoolId, schoolId), profileAdminScope(principal))).limit(1);
  if (!student || !guardian) throw new AccessError('Student or guardian not found', 404);
  const [link] = await db.select({ isPrimary: studentGuardians.isPrimary, relationship: sql<string>`coalesce(${studentGuardianDetails.relationship}, ${guardians.relationship})` }).from(studentGuardians)
    .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
    .leftJoin(studentGuardianDetails, and(eq(studentGuardianDetails.studentId, studentGuardians.studentId), eq(studentGuardianDetails.guardianId, studentGuardians.guardianId)))
    .where(and(eq(studentGuardians.studentId, studentId), eq(studentGuardians.guardianId, input.guardianId))).limit(1);
  const [{ n: version }] = await db.select({ n: sql<number>`count(*)` }).from(studentGuardianEvents).where(and(eq(studentGuardianEvents.studentId, studentId), eq(studentGuardianEvents.guardianId, input.guardianId)));
  if (input.action === 'link' && link) throw new RecordConflict('already-linked');
  if (input.action !== 'link' && !link) throw new RecordConflict('not-linked');
  if (Number(version) !== input.expectedVersion) throw new RecordConflict('stale');
  const wantsPrimary = input.action === 'link' ? input.isPrimary : input.action === 'update' ? input.isPrimary : undefined;
  if (input.action === 'update' && link && (input.relationship === undefined || input.relationship === link.relationship) && (input.isPrimary === undefined || input.isPrimary === Boolean(link.isPrimary))) throw new RecordConflict('no-change');

  const stamp = new Date().toISOString(), attemptId = crypto.randomUUID(), live = livePrincipalScope(principal);
  const own = sql`exists (select 1 from student_guardian_events where id = ${clientRequestId} and attempt_id = ${attemptId})`;
  const target = sql`students.id = ${studentId} and students.school_id = ${schoolId} and exists (select 1 from guardians where id = ${input.guardianId} and school_id = ${schoolId})`;
  const fresh = sql`${pairVersion(studentId, input.guardianId)} = ${input.expectedVersion} and not exists (select 1 from student_guardian_events where id = ${clientRequestId})`;
  const head = sql`${clientRequestId}, ${schoolId}, ${studentId}, ${input.guardianId}, ${principal.id}`;
  const tail = sql`${input.reason}, ${stamp}, ${hash}, ${attemptId}`;
  const movePrimary = wantsPrimary === true && !(link && link.isPrimary);
  const statements = [];
  if (input.action === 'link') {
    statements.push(
      db.insert(studentGuardianEvents).select(sql`select ${head}, 'link', ${input.expectedVersion}, ${input.expectedVersion + 1}, NULL, ${input.relationship}, NULL, ${input.isPrimary ? 1 : 0}, ${tail}
        from students where ${target} and ${live} and not exists (select 1 from student_guardians where student_id = ${studentId} and guardian_id = ${input.guardianId}) and ${fresh}`),
      db.insert(studentGuardians).select(sql`select student_id, guardian_id, primary_after from student_guardian_events where id = ${clientRequestId} and attempt_id = ${attemptId}`).onConflictDoNothing(),
      db.insert(studentGuardianDetails).select(sql`select student_id, guardian_id, relationship_after from student_guardian_events where id = ${clientRequestId} and attempt_id = ${attemptId}`)
        .onConflictDoUpdate({ target: [studentGuardianDetails.studentId, studentGuardianDetails.guardianId], set: { relationship: sql`excluded.relationship` } }),
    );
  } else if (input.action === 'update') {
    statements.push(
      db.insert(studentGuardianEvents).select(sql`select ${head}, 'update', ${input.expectedVersion}, ${input.expectedVersion + 1}, coalesce(d.relationship, g.relationship),
        coalesce(${input.relationship ?? null}, d.relationship, g.relationship), sg.is_primary, coalesce(${input.isPrimary === undefined ? null : input.isPrimary ? 1 : 0}, sg.is_primary), ${tail}
        from student_guardians sg join guardians g on g.id = sg.guardian_id join students on students.id = sg.student_id
        left join student_guardian_details d on d.student_id = sg.student_id and d.guardian_id = sg.guardian_id
        where sg.student_id = ${studentId} and sg.guardian_id = ${input.guardianId} and ${target} and ${live} and ${fresh}
        and (coalesce(${input.relationship ?? null}, d.relationship, g.relationship) <> coalesce(d.relationship, g.relationship)
          or coalesce(${input.isPrimary === undefined ? null : input.isPrimary ? 1 : 0}, sg.is_primary) <> sg.is_primary)`),
      db.insert(studentGuardianDetails).select(sql`select student_id, guardian_id, relationship_after from student_guardian_events where id = ${clientRequestId} and attempt_id = ${attemptId}`)
        .onConflictDoUpdate({ target: [studentGuardianDetails.studentId, studentGuardianDetails.guardianId], set: { relationship: sql`excluded.relationship` } }),
      db.update(studentGuardians).set({ isPrimary: sql`(select primary_after from student_guardian_events where id = ${clientRequestId} and attempt_id = ${attemptId})` })
        .where(and(eq(studentGuardians.studentId, studentId), eq(studentGuardians.guardianId, input.guardianId), own)),
    );
  } else {
    statements.push(
      db.insert(studentGuardianEvents).select(sql`select ${head}, 'unlink', ${input.expectedVersion}, ${input.expectedVersion + 1}, coalesce(d.relationship, g.relationship), NULL, sg.is_primary, NULL, ${tail}
        from student_guardians sg join guardians g on g.id = sg.guardian_id join students on students.id = sg.student_id
        left join student_guardian_details d on d.student_id = sg.student_id and d.guardian_id = sg.guardian_id
        where sg.student_id = ${studentId} and sg.guardian_id = ${input.guardianId} and ${target} and ${live} and ${fresh}`),
      db.delete(studentGuardianDetails).where(and(eq(studentGuardianDetails.studentId, studentId), eq(studentGuardianDetails.guardianId, input.guardianId), own)),
      db.delete(studentGuardians).where(and(eq(studentGuardians.studentId, studentId), eq(studentGuardians.guardianId, input.guardianId), own)),
    );
  }
  if (movePrimary) {
    // Only one primary contact per student: others are demoted with their own history rows in the same batch.
    statements.push(
      db.insert(studentGuardianEvents).select(sql`select lower(hex(randomblob(16))), ${schoolId}, sg.student_id, sg.guardian_id, ${principal.id}, 'update', ${pairVersion(sql`sg.student_id`, sql`sg.guardian_id`)},
        ${pairVersion(sql`sg.student_id`, sql`sg.guardian_id`)} + 1, coalesce(d.relationship, g.relationship), coalesce(d.relationship, g.relationship), 1, 0,
        'Primary contact changed to another guardian', ${stamp}, ${hash}, ${attemptId}
        from student_guardians sg join guardians g on g.id = sg.guardian_id left join student_guardian_details d on d.student_id = sg.student_id and d.guardian_id = sg.guardian_id
        where sg.student_id = ${studentId} and sg.guardian_id <> ${input.guardianId} and sg.is_primary = 1 and ${own}`),
      db.update(studentGuardians).set({ isPrimary: 0 }).where(and(eq(studentGuardians.studentId, studentId), sql`${studentGuardians.guardianId} <> ${input.guardianId}`, eq(studentGuardians.isPrimary, 1), own)),
    );
  }
  try {
    await db.batch(statements as [typeof statements[number], ...typeof statements]);
  } catch (error) {
    if (constraintFailure(error, /constraint/i)) throw new RecordConflict('stale');
    throw error;
  }
  const [saved] = await db.select({ id: studentGuardianEvents.id }).from(studentGuardianEvents).where(and(eq(studentGuardianEvents.id, clientRequestId), eq(studentGuardianEvents.attemptId, attemptId))).limit(1);
  if (!saved) { await liveAdmin(principal); throw new RecordConflict('stale'); }
  return { inventory: await listGuardianLinks(principal, studentId), replayed: false };
}
