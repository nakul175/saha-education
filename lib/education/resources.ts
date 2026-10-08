import { z } from 'zod';
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db/index';
import { teachingResources, resourceVersions, resourceAssignments, classes } from '@/db/schema';
import type { Principal } from './types';
import type {
  ResourceContent,
  ResourceVersion,
  TeachingResource,
  ResourceAssignment,
  ResourceType,
} from './resource-types';
import {
  AccessError,
  assertPrincipal,
  assertClassWrite,
  classReferenceScope,
  classScope,
  livePrincipalScope,
} from './access';
import { uniqueFailure } from './db-errors';

const identifier = z.string().min(1).max(120);
const short = (max: number) => z.string().trim().min(1).max(max);
export const resourceContentSchema = z
  .object({
    title: short(160),
    type: z.enum(['lesson', 'worksheet', 'quiz', 'activity']),
    curriculum: short(120),
    gradeLevel: short(40),
    subject: short(80),
    language: short(35).regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/),
    objectives: short(4000),
    body: short(20000),
    teacherNotes: z.string().max(8000),
    answerKey: z.string().max(8000),
  })
  .strict();
export const createResourceSchema = z
  .object({ content: resourceContentSchema, clientResourceId: z.string().uuid().optional() })
  .strict();
export const reviseResourceSchema = z
  .object({ expectedVersion: z.number().int().min(1).max(1000000), content: resourceContentSchema })
  .strict();
function calendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export const assignmentSchema = z
  .object({
    versionId: identifier,
    classId: identifier,
    dueDate: z.string().refine(calendarDate, 'Use a valid calendar date').optional(),
  })
  .strict();
export class ResourceConflict extends Error {
  readonly status = 409;
  constructor() {
    super('Resource conflict');
    this.name = 'ResourceConflict';
  }
}
function staff(principal: Principal): void {
  assertPrincipal(principal);
  if (principal.role !== 'admin' && principal.role !== 'teacher')
    throw new AccessError('Staff resource access required');
}
function liveActor(principal: Principal) {
  return livePrincipalScope(principal);
}
function resourceScope(principal: Principal) {
  staff(principal);
  return and(
    eq(teachingResources.schoolId, principal.schoolId!),
    liveActor(principal),
    principal.role === 'teacher' ? eq(teachingResources.authorId, principal.id) : undefined,
  );
}
function resourceAccess(principal: Principal, id: string, owned = false) {
  return sql`exists (select 1 from teaching_resources where ${teachingResources.id} = ${id} and ${resourceScope(principal)}
    ${owned ? sql`and ${teachingResources.authorId} = ${principal.id}` : sql``})`;
}
type VersionRow = typeof resourceVersions.$inferSelect;
type ResourceRow = typeof teachingResources.$inferSelect;
function versionView(row: VersionRow): ResourceVersion {
  return { ...row, type: row.type as ResourceType };
}
function resourceView(row: ResourceRow, latest: VersionRow): TeachingResource {
  return { ...row, latest: versionView(latest) };
}
function assignmentView(
  row: typeof resourceAssignments.$inferSelect,
  version: VersionRow,
): ResourceAssignment {
  const safe = versionView(version);
  // Omit private teaching material from the serialized assignment for every role.
  const { teacherNotes, answerKey, ...resource } = safe;
  void teacherNotes;
  void answerKey;
  return { ...row, resource };
}
async function resourceRow(principal: Principal, id: string): Promise<ResourceRow | null> {
  staff(principal);
  const [row] = await getDb()
    .select()
    .from(teachingResources)
    .where(and(eq(teachingResources.id, identifier.parse(id)), resourceScope(principal)))
    .limit(1);
  return row ?? null;
}
async function requiredResource(principal: Principal, id: string): Promise<ResourceRow> {
  const row = await resourceRow(principal, id);
  if (!row) throw new AccessError('Resource not found', 404);
  return row;
}
async function exactVersion(
  principal: Principal,
  resourceId: string,
  versionId: string,
): Promise<VersionRow> {
  const [row] = await getDb()
    .select()
    .from(resourceVersions)
    .where(
      and(
        eq(resourceVersions.id, identifier.parse(versionId)),
        eq(resourceVersions.resourceId, resourceId),
        resourceAccess(principal, resourceId),
      ),
    )
    .limit(1);
  if (!row) throw new AccessError('Resource version not found', 404);
  return row;
}
export async function listResources(principal: Principal): Promise<TeachingResource[]> {
  // Resolve every latest version in one scoped query instead of one query per
  // resource. The unique(resource_id, version) index supports the anti-join.
  const rows = await getDb()
    .select({ resource: teachingResources, latest: resourceVersions })
    .from(teachingResources)
    .innerJoin(resourceVersions, eq(resourceVersions.resourceId, teachingResources.id))
    .where(
      and(
        resourceScope(principal),
        sql`not exists (select 1 from resource_versions newer
      where newer.resource_id = ${teachingResources.id} and newer.version > ${resourceVersions.version})`,
      ),
    )
    .orderBy(desc(teachingResources.createdAt));
  return rows.map((row) => resourceView(row.resource, row.latest));
}
export async function getResource(principal: Principal, id: string): Promise<TeachingResource | null> {
  const row = await resourceRow(principal, id);
  if (!row) return null;
  const [latest] = await getDb()
    .select()
    .from(resourceVersions)
    .where(and(eq(resourceVersions.resourceId, row.id), resourceAccess(principal, row.id)))
    .orderBy(desc(resourceVersions.version))
    .limit(1);
  return latest ? resourceView(row, latest) : null;
}
async function originalRetry(
  principal: Principal,
  id: string,
  content: ResourceContent,
): Promise<TeachingResource> {
  const [row] = await getDb()
    .select()
    .from(teachingResources)
    .where(
      and(
        eq(teachingResources.id, id),
        eq(teachingResources.authorId, principal.id),
        resourceScope(principal),
      ),
    )
    .limit(1);
  if (!row) throw new ResourceConflict();
  const [version] = await getDb()
    .select()
    .from(resourceVersions)
    .where(
      and(
        eq(resourceVersions.resourceId, id),
        eq(resourceVersions.version, 1),
        resourceAccess(principal, id, true),
      ),
    )
    .limit(1);
  if (
    !version ||
    !Object.entries(content).every(([key, value]) => version[key as keyof VersionRow] === value)
  )
    throw new ResourceConflict();
  return resourceView(row, version);
}
function insertVersion(principal: Principal, version: VersionRow, expectedVersion?: number) {
  const current =
    expectedVersion === undefined
      ? sql`1 = 1`
      : sql`coalesce((select max(existing.version) from resource_versions existing
    where existing.resource_id = ${version.resourceId}), 0) = ${expectedVersion}`;
  return getDb()
    .insert(resourceVersions)
    .select(
      sql`select ${version.id}, ${version.resourceId}, ${version.version},
    ${version.title}, ${version.type}, ${version.curriculum}, ${version.gradeLevel}, ${version.subject}, ${version.language},
    ${version.objectives}, ${version.body}, ${version.teacherNotes}, ${version.answerKey}, ${principal.id}, ${version.createdAt}, null, null
    from teaching_resources where ${teachingResources.id} = ${version.resourceId} and ${resourceScope(principal)} and ${current}
    limit 1`,
    )
    .onConflictDoNothing()
    .returning();
}
export async function createResource(
  principal: Principal,
  input: { content: ResourceContent; clientResourceId?: string },
): Promise<TeachingResource> {
  staff(principal);
  const data = createResourceSchema.parse(input);
  const db = getDb();
  const id = data.clientResourceId ?? crypto.randomUUID();
  const [already] = await db
    .select({ id: teachingResources.id })
    .from(teachingResources)
    .where(eq(teachingResources.id, id))
    .limit(1);
  if (already) return originalRetry(principal, id, data.content);
  const createdAt = new Date().toISOString();
  const version = {
    ...data.content,
    id: crypto.randomUUID(),
    resourceId: id,
    version: 1,
    createdBy: principal.id,
    createdAt,
    approvedBy: null,
    approvedAt: null,
  };
  try {
    // Actual INSERT SELECT statements recheck live authority. D1 atomically
    // preserves the parent/version pair; zero-row writes are never fabricated as
    // successful creations, and collisions must match the scoped original retry.
    const [resources, versions] = await db.batch([
      db
        .insert(teachingResources)
        .select(
          sql`select ${id}, ${principal.schoolId}, ${principal.id}, ${createdAt}
        from users where users.id = ${principal.id} and ${liveActor(principal)} limit 1`,
        )
        .onConflictDoNothing()
        .returning(),
      insertVersion(principal, version),
    ]);
    if (!resources[0] || !versions[0]) return originalRetry(principal, id, data.content);
    return resourceView(resources[0], versions[0]);
  } catch (error) {
    if (uniqueFailure(error)) return originalRetry(principal, id, data.content);
    throw error;
  }
}
export async function reviseResource(
  principal: Principal,
  id: string,
  input: { expectedVersion: number; content: ResourceContent },
): Promise<TeachingResource> {
  const row = await requiredResource(principal, id);
  const data = reviseResourceSchema.parse(input);
  const [latest] = await getDb()
    .select()
    .from(resourceVersions)
    .where(and(eq(resourceVersions.resourceId, id), resourceAccess(principal, id)))
    .orderBy(desc(resourceVersions.version))
    .limit(1);
  if (!latest || latest.version !== data.expectedVersion) throw new ResourceConflict();
  const version = {
    ...data.content,
    id: crypto.randomUUID(),
    resourceId: id,
    version: data.expectedVersion + 1,
    createdBy: principal.id,
    createdAt: new Date().toISOString(),
    approvedBy: null,
    approvedAt: null,
  };
  // Scope and the latest expected version are rechecked in the actual INSERT;
  // the unique(resource_id, version) constraint arbitrates competing revisions.
  const [created] = await insertVersion(principal, version, data.expectedVersion);
  if (!created) throw new ResourceConflict();
  return resourceView(row, created);
}
export async function listResourceVersions(principal: Principal, id: string): Promise<ResourceVersion[]> {
  await requiredResource(principal, id);
  return (
    await getDb()
      .select()
      .from(resourceVersions)
      .where(and(eq(resourceVersions.resourceId, id), resourceAccess(principal, id)))
      .orderBy(desc(resourceVersions.version))
  ).map(versionView);
}
export async function approveResource(
  principal: Principal,
  id: string,
  versionId: string,
): Promise<ResourceVersion> {
  await requiredResource(principal, id);
  const version = await exactVersion(principal, id, versionId);
  if (version.approvedAt) return versionView(version);
  // Explicit human confirmation applies to this immutable version only. Authors
  // may review their own work; later revisions begin unapproved.
  const [approved] = await getDb()
    .update(resourceVersions)
    .set({ approvedBy: principal.id, approvedAt: new Date().toISOString() })
    .where(
      and(
        eq(resourceVersions.id, versionId),
        eq(resourceVersions.resourceId, id),
        isNull(resourceVersions.approvedAt),
        isNull(resourceVersions.approvedBy),
        resourceAccess(principal, id),
      ),
    )
    .returning();
  return versionView(approved ?? (await exactVersion(principal, id, versionId)));
}
export async function assignResource(
  principal: Principal,
  id: string,
  input: { versionId: string; classId: string; dueDate?: string },
): Promise<ResourceAssignment> {
  await requiredResource(principal, id);
  const data = assignmentSchema.parse(input);
  await assertClassWrite(principal, data.classId);
  const version = await exactVersion(principal, id, data.versionId);
  if (!version.approvedAt || !version.approvedBy)
    throw new AccessError('Confirm this exact resource version before assigning it', 400);
  const db = getDb();
  const payload = {
    resourceId: id,
    versionId: data.versionId,
    classId: data.classId,
    assignedBy: principal.id,
    dueDate: data.dueDate ?? null,
  };
  // Recheck the live class assignment in the INSERT itself so an administrator
  // reassigning a class between validation and persistence cannot grant a write.
  const [created] = await db
    .insert(resourceAssignments)
    .select(
      sql`select
    ${crypto.randomUUID()}, ${id}, ${data.versionId}, ${data.classId}, ${principal.id}, ${new Date().toISOString()}, ${payload.dueDate}
    from classes join teaching_resources on teaching_resources.id = ${id}
    join resource_versions on resource_versions.resource_id = teaching_resources.id
    where ${classes.id} = ${data.classId} and ${classScope(principal)} and ${resourceScope(principal)}
      and ${resourceVersions.id} = ${data.versionId} and ${resourceVersions.approvedAt} is not null and ${resourceVersions.approvedBy} is not null
    limit 1`,
    )
    .onConflictDoNothing()
    .returning();
  if (created) return assignmentView(created, version);
  const [existing] = await db
    .select()
    .from(resourceAssignments)
    .where(
      and(
        eq(resourceAssignments.versionId, data.versionId),
        eq(resourceAssignments.classId, data.classId),
        eq(resourceAssignments.resourceId, id),
        classReferenceScope(principal, resourceAssignments.classId),
        resourceAccess(principal, id),
        sql`exists (select 1 from resource_versions where ${resourceVersions.id} = ${resourceAssignments.versionId}
      and ${resourceVersions.resourceId} = ${resourceAssignments.resourceId} and ${resourceVersions.approvedAt} is not null and ${resourceVersions.approvedBy} is not null)`,
      ),
    )
    .limit(1);
  if (
    !existing ||
    !Object.entries(payload).every(([key, value]) => existing[key as keyof typeof existing] === value)
  )
    throw new ResourceConflict();
  return assignmentView(existing, version);
}
export async function listResourceAssignments(
  principal: Principal,
  filter: { classId?: string } = {},
): Promise<ResourceAssignment[]> {
  assertPrincipal(principal);
  if (principal.role === 'guardian') throw new AccessError('Guardian resource access is not available');
  const rows = await getDb()
    .select({ assignment: resourceAssignments, version: resourceVersions })
    .from(resourceAssignments)
    .innerJoin(
      resourceVersions,
      and(
        eq(resourceVersions.id, resourceAssignments.versionId),
        eq(resourceVersions.resourceId, resourceAssignments.resourceId),
      ),
    )
    .innerJoin(teachingResources, eq(teachingResources.id, resourceAssignments.resourceId))
    .where(
      and(
        eq(teachingResources.schoolId, principal.schoolId),
        liveActor(principal),
        isNotNull(resourceVersions.approvedAt),
        isNotNull(resourceVersions.approvedBy),
        classReferenceScope(principal, resourceAssignments.classId),
        filter.classId ? eq(resourceAssignments.classId, identifier.parse(filter.classId)) : undefined,
      ),
    )
    .orderBy(desc(resourceAssignments.createdAt));
  return rows.map((row) => assignmentView(row.assignment, row.version));
}
