import { z } from 'zod';
import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db/index';
import { teachingResources, resourceVersions, resourceAssignments, classes, users } from '@/db/schema';
import { curriculumReferences, curriculumReferenceVersions, resourceReferenceBindings, curriculumStatusEvents } from '@/db/curriculum-schema';
import { AccessError, assertPrincipal, classScope, livePrincipalScope } from './access';
import type { Principal } from './types';
import type { ResourceContent, ResourceType, TeachingResource } from './resource-types';

const identifier = z.string().min(1).max(120);
const short = (max: number) => z.string().trim().min(1).max(max);
const sourceUrl = z.string().trim().max(2000).refine(value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.hash; }
  catch { return false; }
}, 'Use an HTTPS source URL without credentials or a fragment');
export const curriculumContentSchema = z.object({
  title: short(160), curriculum: short(120), gradeLevel: short(40), subject: short(80),
  language: short(35).regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/),
  objectives: short(4000), body: short(20000), rightsStatement: short(2000),
  sourceReference: z.string().trim().max(300).default(''), sourceUrl: sourceUrl.nullable().default(null),
}).strict();
export const createCurriculumSchema = z.object({ content: curriculumContentSchema, clientReferenceId: z.string().uuid().optional() }).strict();
export const reviseCurriculumSchema = z.object({ expectedVersion: z.number().int().min(1).max(999999), content: curriculumContentSchema }).strict();
export const approveCurriculumSchema = z.object({ versionId: identifier, confirmReview: z.literal(true) }).strict();
export const copyCurriculumSchema = z.object({ versionId: identifier, type: z.enum(['lesson', 'worksheet', 'quiz', 'activity']), clientResourceId: z.string().uuid().optional() }).strict();
const reasonText = z.string().trim().min(10).max(500).refine(value => !/[\u0000-\u001f\u007f]/.test(value), 'Unsupported control character');
// Retirement is a reviewed, reasoned, append-only status change guarded by the
// expected status revision and a stable client UUID, like other reviewed writes.
export const curriculumStatusSchema = z.object({
  clientEventId: z.string().uuid(), expectedRevision: z.number().int().min(0).max(999999),
  status: z.enum(['active', 'retired']), reason: reasonText,
}).strict();
const filterText = (max: number) => z.string().trim().max(max);
export const curriculumFilterSchema = z.object({
  q: filterText(200).optional(), curriculum: filterText(120).optional(), gradeLevel: filterText(40).optional(),
  subject: filterText(80).optional(), language: filterText(35).optional(),
  review: z.enum(['all', 'reviewed', 'draft']).default('all'), lifecycle: z.enum(['active', 'retired', 'all']).default('active'),
}).strict();
export type CurriculumFilter = z.input<typeof curriculumFilterSchema>;
export type CurriculumContent = z.infer<typeof curriculumContentSchema>;
export type CurriculumVersion = typeof curriculumReferenceVersions.$inferSelect & { createdByName?: string; approvedByName?: string | null };
export type CurriculumStatus = { state: 'active' | 'retired'; revision: number; reason: string | null; changedAt: string | null };
export type CurriculumStatusEvent = typeof curriculumStatusEvents.$inferSelect & { changedByName?: string };
export type CurriculumStatusResult = { event: CurriculumStatusEvent; status: CurriculumStatus };
export type CurriculumReference = typeof curriculumReferences.$inferSelect & { canManage: boolean; latest: CurriculumVersion; authorName: string; status: CurriculumStatus };
export type CurriculumUsageCopy = {
  resourceId: string; title: string; type: string; authorName: string; copiedAt: string; copiedFromVersion: number; copiedFromReviewedAt: string | null;
  latestResourceVersion: number; latestApproved: boolean;
  assignments: { assignmentId: string; classId: string; className: string; dueDate: string | null; assignedVersion: number }[];
};
export type CurriculumUsage = { referenceId: string; copies: CurriculumUsageCopy[]; copiesInSchool: number | null; scope: 'own' | 'school' };
export type ResourceSource = {
  referenceId: string; referenceVersionId: string; referenceVersion: number; title: string; curriculum: string; language: string; rightsStatement: string;
  sourceReference: string; sourceUrl: string | null; reviewedAt: string | null; reviewedByName: string | null; copiedAt: string; copiedByName: string;
  latestReferenceVersion: number | null; lifecycle: CurriculumStatus['state']; retiredReason: string | null; retiredAt: string | null; referenceAvailable: boolean;
};
export type CurriculumSnapshot = { referenceId: string; versionId: string; version: number; content: CurriculumVersion; suggestedDraft: ResourceContent };
export type CurriculumProvenance = typeof resourceReferenceBindings.$inferSelect;
export class CurriculumConflict extends Error {
  readonly status = 409;
  readonly code: string | undefined;
  constructor(code?: string) { super('Curriculum reference conflict'); this.name = 'CurriculumConflict'; this.code = code; }
}
export class CurriculumRetired extends CurriculumConflict {
  constructor() { super('curriculum-retired'); this.name = 'CurriculumRetired'; }
}

function staff(principal: Principal): void {
  assertPrincipal(principal);
  if (principal.role !== 'admin' && principal.role !== 'teacher') throw new AccessError('Staff curriculum access required');
}
// Recheck current enabled role and school in every mutation SQL statement, so a
// session resolved before an administrator's change cannot finish a stale write.
function liveStaff(principal: Principal) {
  staff(principal);
  return livePrincipalScope(principal);
}
function schoolScope(principal: Principal) {
  return and(eq(curriculumReferences.schoolId, principal.schoolId!), liveStaff(principal));
}
function manageScope(principal: Principal) {
  return and(schoolScope(principal), principal.role === 'teacher' ? eq(curriculumReferences.authorId, principal.id) : undefined);
}
function manageReference(principal: Principal, referenceId: string) {
  return sql`exists (select 1 from curriculum_references where ${curriculumReferences.id} = ${referenceId} and ${manageScope(principal)})`;
}
function schoolReference(principal: Principal, referenceId: string) {
  return sql`exists (select 1 from curriculum_references where ${curriculumReferences.id} = ${referenceId} and ${schoolScope(principal)})`;
}
function ownedReference(principal: Principal, referenceId: string) {
  return sql`exists (select 1 from curriculum_references where ${curriculumReferences.id} = ${referenceId}
    and ${curriculumReferences.authorId} = ${principal.id} and ${schoolScope(principal)})`;
}
function visibleVersion(principal: Principal) {
  // Recheck authority at the content SELECT, including current authorship. A
  // previously fetched reference row is not permission to reveal a private draft.
  return sql`exists (select 1 from curriculum_references where ${curriculumReferences.id} = ${curriculumReferenceVersions.referenceId}
    and ${schoolScope(principal)} and (${principal.role} = 'admin' or ${curriculumReferences.authorId} = ${principal.id}
      or (${curriculumReferenceVersions.approvedAt} is not null and ${curriculumReferenceVersions.approvedBy} is not null)))`;
}
function canManage(principal: Principal, row: typeof curriculumReferences.$inferSelect): boolean {
  return principal.role === 'admin' || row.authorId === principal.id;
}
const activeStatus: CurriculumStatus = { state: 'active', revision: 0, reason: null, changedAt: null };
function statusView(event: typeof curriculumStatusEvents.$inferSelect | undefined | null): CurriculumStatus {
  return event ? { state: event.status === 'retired' ? 'retired' : 'active', revision: event.revision, reason: event.reason, changedAt: event.changedAt } : activeStatus;
}
// Latest status event wins; no event means the reference was never retired.
function retiredNow(reference: unknown) {
  return sql`exists (select 1 from curriculum_reference_status_events retired_event where retired_event.reference_id = ${reference}
    and retired_event.status = 'retired' and not exists (select 1 from curriculum_reference_status_events newer_event
      where newer_event.reference_id = retired_event.reference_id and newer_event.revision > retired_event.revision))`;
}
async function currentStatus(id: string): Promise<CurriculumStatus> {
  const [event] = await getDb().select().from(curriculumStatusEvents).where(eq(curriculumStatusEvents.referenceId, id)).orderBy(desc(curriculumStatusEvents.revision)).limit(1);
  return statusView(event);
}
const staffFallback = 'School staff member';
async function userNames(principal: Principal, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((value): value is string => typeof value === 'string' && value.length > 0))];
  const found = new Map<string, string>();
  for (let index = 0; index < unique.length; index += 40) {
    const rows = await getDb().select({ id: users.id, name: users.name }).from(users)
      .where(and(inArray(users.id, unique.slice(index, index + 40)), eq(users.schoolId, principal.schoolId!)));
    for (const row of rows) found.set(row.id, row.name);
  }
  return found;
}
function named(version: CurriculumVersion, names: Map<string, string>): CurriculumVersion {
  return { ...version, createdByName: names.get(version.createdBy) ?? staffFallback, approvedByName: version.approvedBy ? names.get(version.approvedBy) ?? staffFallback : null };
}
async function namedVersions(principal: Principal, versions: CurriculumVersion[]): Promise<CurriculumVersion[]> {
  const names = await userNames(principal, versions.flatMap(version => [version.createdBy, version.approvedBy]));
  return versions.map(version => named(version, names));
}
function referenceView(principal: Principal, row: typeof curriculumReferences.$inferSelect, latest: CurriculumVersion, status: CurriculumStatus, names: Map<string, string>): CurriculumReference {
  return { ...row, canManage: canManage(principal, row), latest: named(latest, names), authorName: names.get(row.authorId) ?? staffFallback, status };
}
async function referenceRow(principal: Principal, id: string, managed = false) {
  staff(principal);
  const [row] = await getDb().select().from(curriculumReferences).where(and(eq(curriculumReferences.id, identifier.parse(id)), managed ? manageScope(principal) : schoolScope(principal))).limit(1);
  if (!row) throw new AccessError('Curriculum reference not found', 404);
  return row;
}
// A retired reference is visible only to people who manage it. Everyone else gets
// the same not-found answer as for a reference that never existed.
async function visibleReferenceRow(principal: Principal, id: string) {
  const row = await referenceRow(principal, id), status = await currentStatus(row.id);
  if (status.state === 'retired' && !canManage(principal, row)) throw new AccessError('Curriculum reference not found', 404);
  return { row, status };
}
function approved() { return and(isNotNull(curriculumReferenceVersions.approvedAt), isNotNull(curriculumReferenceVersions.approvedBy)); }
async function exactApproved(principal: Principal, id: string, versionId: string, includeRetired = false): Promise<CurriculumVersion> {
  await referenceRow(principal, id);
  const [version] = await getDb().select().from(curriculumReferenceVersions).where(and(eq(curriculumReferenceVersions.referenceId, id), eq(curriculumReferenceVersions.id, identifier.parse(versionId)), approved(), schoolReference(principal, id), includeRetired ? undefined : sql`not ${retiredNow(id)}`)).limit(1);
  if (!version) throw new AccessError('Approved curriculum version not found', 404);
  return version;
}
async function exactManaged(principal: Principal, id: string, versionId: string): Promise<CurriculumVersion> {
  await referenceRow(principal, id, true);
  const [version] = await getDb().select().from(curriculumReferenceVersions).where(and(eq(curriculumReferenceVersions.referenceId, id), eq(curriculumReferenceVersions.id, identifier.parse(versionId)), manageReference(principal, id))).limit(1);
  if (!version) throw new AccessError('Curriculum version not found', 404);
  return version;
}
function lowered(value: string | undefined): string { return (value ?? '').trim().toLowerCase(); }
function matchesFilter(reference: CurriculumReference, filter: z.output<typeof curriculumFilterSchema>): boolean {
  const version = reference.latest;
  for (const key of ['curriculum', 'gradeLevel', 'subject', 'language'] as const) {
    const wanted = lowered(filter[key]);
    if (wanted && version[key].trim().toLowerCase() !== wanted) return false;
  }
  if (filter.review === 'reviewed' && !version.approvedAt) return false;
  if (filter.review === 'draft' && version.approvedAt) return false;
  const terms = lowered(filter.q).split(/\s+/).filter(Boolean).slice(0, 8);
  if (terms.length) {
    const haystack = [version.title, version.curriculum, version.gradeLevel, version.subject, version.language, version.objectives, version.body,
      version.rightsStatement, version.sourceReference, reference.authorName].join('\n').toLowerCase();
    if (!terms.every(term => haystack.includes(term.slice(0, 60)))) return false;
  }
  return true;
}
export async function listCurriculumReferences(principal: Principal, input: CurriculumFilter = {}): Promise<CurriculumReference[]> {
  staff(principal);
  const filter = curriculumFilterSchema.parse(input);
  const rows = await getDb().select().from(curriculumReferences).where(schoolScope(principal)).orderBy(desc(curriculumReferences.createdAt));
  const events = await getDb().select({ event: curriculumStatusEvents }).from(curriculumStatusEvents)
    .innerJoin(curriculumReferences, eq(curriculumReferences.id, curriculumStatusEvents.referenceId))
    .where(and(schoolScope(principal), sql`not exists (select 1 from curriculum_reference_status_events newer_event
      where newer_event.reference_id = ${curriculumStatusEvents.referenceId} and newer_event.revision > ${curriculumStatusEvents.revision})`));
  const statuses = new Map(events.map(item => [item.event.referenceId, statusView(item.event)]));
  const found: { row: typeof curriculumReferences.$inferSelect; latest: CurriculumVersion; status: CurriculumStatus }[] = [];
  for (const row of rows) {
    const status = statuses.get(row.id) ?? activeStatus;
    // Retired references stay with the people who manage them, and only when asked for.
    if (status.state === 'retired' && !canManage(principal, row)) continue;
    if (filter.lifecycle === 'active' && status.state === 'retired') continue;
    if (filter.lifecycle === 'retired' && status.state !== 'retired') continue;
    const [latest] = await getDb().select().from(curriculumReferenceVersions).where(and(eq(curriculumReferenceVersions.referenceId, row.id), visibleVersion(principal))).orderBy(desc(curriculumReferenceVersions.version)).limit(1);
    if (latest) found.push({ row, latest, status });
  }
  const names = await userNames(principal, found.flatMap(item => [item.row.authorId, item.latest.createdBy, item.latest.approvedBy]));
  return found.map(item => referenceView(principal, item.row, item.latest, item.status, names)).filter(reference => matchesFilter(reference, filter));
}
export async function getCurriculumReference(principal: Principal, id: string): Promise<CurriculumReference> {
  const { row, status } = await visibleReferenceRow(principal, id);
  const [latest] = await getDb().select().from(curriculumReferenceVersions).where(and(eq(curriculumReferenceVersions.referenceId, id), visibleVersion(principal))).orderBy(desc(curriculumReferenceVersions.version)).limit(1);
  if (!latest) throw new AccessError('Curriculum reference not found', 404);
  return referenceView(principal, row, latest, status, await userNames(principal, [row.authorId, latest.createdBy, latest.approvedBy]));
}
export async function listCurriculumVersions(principal: Principal, id: string): Promise<CurriculumVersion[]> {
  await visibleReferenceRow(principal, id);
  const versions = await getDb().select().from(curriculumReferenceVersions).where(and(eq(curriculumReferenceVersions.referenceId, id), visibleVersion(principal))).orderBy(desc(curriculumReferenceVersions.version));
  if (!versions.length) throw new AccessError('Curriculum reference not found', 404);
  return namedVersions(principal, versions);
}
async function createRetry(principal: Principal, id: string, content: CurriculumContent): Promise<CurriculumReference> {
  const [row] = await getDb().select().from(curriculumReferences).where(and(eq(curriculumReferences.id, id), eq(curriculumReferences.authorId, principal.id), schoolScope(principal))).limit(1);
  const [version] = await getDb().select().from(curriculumReferenceVersions).where(and(eq(curriculumReferenceVersions.referenceId, id), eq(curriculumReferenceVersions.version, 1), ownedReference(principal, id))).limit(1);
  if (!row || !version || !Object.entries(content).every(([key, value]) => version[key as keyof typeof version] === value)) throw new CurriculumConflict();
  return referenceView(principal, row, version, await currentStatus(id), await userNames(principal, [row.authorId, version.createdBy, version.approvedBy]));
}
function versionInsert(principal: Principal, id: string, versionId: string, number: number, createdAt: string, content: CurriculumContent, predicate: ReturnType<typeof sql>) {
  return getDb().insert(curriculumReferenceVersions).select(sql`select ${versionId}, ${id}, ${number},
    ${content.title}, ${content.curriculum}, ${content.gradeLevel}, ${content.subject}, ${content.language}, ${content.objectives},
    ${content.body}, ${content.rightsStatement}, ${content.sourceReference}, ${content.sourceUrl}, ${principal.id}, ${createdAt}, null, null
    from curriculum_references where ${curriculumReferences.id} = ${id} and ${manageScope(principal)} and ${predicate} limit 1`).onConflictDoNothing().returning();
}
export async function createCurriculumReference(principal: Principal, input: z.input<typeof createCurriculumSchema>): Promise<CurriculumReference> {
  staff(principal);
  const data = createCurriculumSchema.parse(input);
  const db = getDb(), id = data.clientReferenceId ?? crypto.randomUUID(), createdAt = new Date().toISOString();
  const [already] = await db.select({ id: curriculumReferences.id }).from(curriculumReferences).where(eq(curriculumReferences.id, id)).limit(1);
  if (already) return createRetry(principal, id, data.content);
  const [rows, versions] = await db.batch([
    db.insert(curriculumReferences).select(sql`select ${id}, ${principal.schoolId}, ${principal.id}, ${createdAt}
      from users where users.id = ${principal.id} and ${liveStaff(principal)} limit 1`).onConflictDoNothing().returning(),
    versionInsert(principal, id, crypto.randomUUID(), 1, createdAt, data.content, sql`1 = 1`),
  ]);
  if (!rows[0] || !versions[0]) return createRetry(principal, id, data.content);
  return referenceView(principal, rows[0], versions[0], activeStatus, await userNames(principal, [rows[0].authorId, versions[0].createdBy]));
}
export async function reviseCurriculumReference(principal: Principal, id: string, input: z.input<typeof reviseCurriculumSchema>): Promise<CurriculumReference> {
  const row = await referenceRow(principal, id, true), data = reviseCurriculumSchema.parse(input);
  // A retired reference must be reinstated, with a recorded reason, before it changes again.
  if ((await currentStatus(id)).state === 'retired') throw new CurriculumRetired();
  const [version] = await versionInsert(principal, id, crypto.randomUUID(), data.expectedVersion + 1, new Date().toISOString(), data.content,
    sql`exists (select 1 from curriculum_reference_versions v where v.reference_id = ${id} and v.version = ${data.expectedVersion})
      and not exists (select 1 from curriculum_reference_versions v where v.reference_id = ${id} and v.version > ${data.expectedVersion})
      and not ${retiredNow(id)}`);
  if (!version) throw new CurriculumConflict();
  return referenceView(principal, row, version, await currentStatus(id), await userNames(principal, [row.authorId, version.createdBy, version.approvedBy]));
}
export async function approveCurriculumReference(principal: Principal, id: string, input: z.infer<typeof approveCurriculumSchema>): Promise<CurriculumVersion> {
  const data = approveCurriculumSchema.parse(input), version = await exactManaged(principal, id, data.versionId);
  const labelled = async (value: CurriculumVersion) => (await namedVersions(principal, [value]))[0];
  if (version.approvedAt) return labelled(version);
  if ((await currentStatus(id)).state === 'retired') throw new CurriculumRetired();
  const [reviewed] = await getDb().update(curriculumReferenceVersions).set({ approvedBy: principal.id, approvedAt: new Date().toISOString() })
    .where(and(eq(curriculumReferenceVersions.id, data.versionId), eq(curriculumReferenceVersions.referenceId, id), isNull(curriculumReferenceVersions.approvedAt), isNull(curriculumReferenceVersions.approvedBy), manageReference(principal, id), sql`not ${retiredNow(id)}`)).returning();
  return labelled(reviewed ?? await exactManaged(principal, id, data.versionId));
}
function statusRetryMatches(event: typeof curriculumStatusEvents.$inferSelect, principal: Principal, id: string, data: z.infer<typeof curriculumStatusSchema>): boolean {
  return event.referenceId === id && event.changedBy === principal.id && event.revision === data.expectedRevision + 1 && event.status === data.status && event.reason === data.reason;
}
async function statusResult(principal: Principal, event: typeof curriculumStatusEvents.$inferSelect): Promise<CurriculumStatusResult> {
  const names = await userNames(principal, [event.changedBy]);
  return { event: { ...event, changedByName: names.get(event.changedBy) ?? staffFallback }, status: await currentStatus(event.referenceId) };
}
/** Retire or reinstate a reference. Retiring never rewrites versions, copies or assignments;
 * it only stops new copies and hides the reference from other staff. */
export async function setCurriculumStatus(principal: Principal, id: string, input: z.input<typeof curriculumStatusSchema>): Promise<CurriculumStatusResult> {
  staff(principal);
  const data = curriculumStatusSchema.parse(input);
  await referenceRow(principal, id, true);
  const [prior] = await getDb().select().from(curriculumStatusEvents).where(eq(curriculumStatusEvents.id, data.clientEventId)).limit(1);
  if (prior) {
    // Exact retry returns the original event with today's current status; it never re-applies it.
    if (!statusRetryMatches(prior, principal, id, data)) throw new CurriculumConflict();
    await referenceRow(principal, id, true);
    return statusResult(principal, prior);
  }
  const [created] = await getDb().insert(curriculumStatusEvents).select(sql`select ${data.clientEventId}, ${id}, ${data.expectedRevision + 1}, ${data.status},
    ${data.reason}, ${principal.id}, ${new Date().toISOString()}
    from curriculum_references where ${curriculumReferences.id} = ${id} and ${manageScope(principal)}
      and coalesce((select max(e.revision) from curriculum_reference_status_events e where e.reference_id = ${id}), 0) = ${data.expectedRevision}
      and (case when ${retiredNow(id)} then 'retired' else 'active' end) <> ${data.status}
    limit 1`).onConflictDoNothing().returning();
  if (created) return statusResult(principal, created);
  await referenceRow(principal, id, true);
  const [raced] = await getDb().select().from(curriculumStatusEvents).where(eq(curriculumStatusEvents.id, data.clientEventId)).limit(1);
  if (raced && statusRetryMatches(raced, principal, id, data)) return statusResult(principal, raced);
  throw new CurriculumConflict();
}
export async function listCurriculumStatusEvents(principal: Principal, id: string): Promise<CurriculumStatusEvent[]> {
  await referenceRow(principal, id, true);
  const events = await getDb().select().from(curriculumStatusEvents).where(eq(curriculumStatusEvents.referenceId, id)).orderBy(desc(curriculumStatusEvents.revision)).limit(50);
  const names = await userNames(principal, events.map(event => event.changedBy));
  return events.map(event => ({ ...event, changedByName: names.get(event.changedBy) ?? staffFallback }));
}
function draftContent(version: CurriculumVersion, type: ResourceType = 'lesson'): ResourceContent {
  return { title: version.title, type, curriculum: version.curriculum, gradeLevel: version.gradeLevel, subject: version.subject,
    language: version.language, objectives: version.objectives, body: version.body, teacherNotes: '', answerKey: '' };
}
export async function getCurriculumSnapshot(principal: Principal, id: string, versionId: string): Promise<CurriculumSnapshot> {
  const content = await exactApproved(principal, id, versionId);
  const labelled = (await namedVersions(principal, [content]))[0];
  return { referenceId: id, versionId: content.id, version: content.version, content: labelled, suggestedDraft: draftContent(content) };
}
function approvedSource(principal: Principal, id: string, versionId: string) {
  return and(eq(curriculumReferences.id, id), schoolScope(principal), eq(curriculumReferenceVersions.referenceId, id), eq(curriculumReferenceVersions.id, versionId), approved());
}
// New copies additionally require the source to be active; an exact replay of an
// already committed copy uses approvedSource alone so retirement never erases it.
function activeApprovedSource(principal: Principal, id: string, versionId: string) {
  return and(approvedSource(principal, id, versionId), sql`not ${retiredNow(curriculumReferences.id)}`);
}
async function copyRetry(principal: Principal, resourceId: string, referenceId: string, source: CurriculumVersion, type: ResourceType): Promise<{ resource: TeachingResource; provenance: CurriculumProvenance }> {
  const [row] = await getDb().select().from(teachingResources).where(and(eq(teachingResources.id, resourceId), eq(teachingResources.authorId, principal.id), eq(teachingResources.schoolId, principal.schoolId!), liveStaff(principal))).limit(1);
  const ownedResource = sql`exists (select 1 from teaching_resources where ${teachingResources.id} = ${resourceId}
    and ${teachingResources.authorId} = ${principal.id} and ${teachingResources.schoolId} = ${principal.schoolId} and ${liveStaff(principal)})`;
  const currentSource = sql`exists (select 1 from curriculum_references join curriculum_reference_versions on curriculum_reference_versions.reference_id = curriculum_references.id
    where ${approvedSource(principal, referenceId, source.id)})`;
  const [version] = await getDb().select().from(resourceVersions).where(and(eq(resourceVersions.resourceId, resourceId), eq(resourceVersions.version, 1), ownedResource, currentSource)).limit(1);
  const [provenance] = await getDb().select().from(resourceReferenceBindings).where(and(eq(resourceReferenceBindings.resourceId, resourceId), eq(resourceReferenceBindings.referenceId, referenceId), eq(resourceReferenceBindings.referenceVersionId, source.id), eq(resourceReferenceBindings.selectedBy, principal.id), ownedResource, currentSource)).limit(1);
  if (!row || !version || !provenance || provenance.resourceVersionId !== version.id || !Object.entries(draftContent(source, type)).every(([key, value]) => version[key as keyof typeof version] === value)) throw new CurriculumConflict();
  return { resource: { ...row, latest: { ...version, type: version.type as ResourceType } }, provenance };
}
export async function copyCurriculumToDraft(principal: Principal, id: string, input: z.infer<typeof copyCurriculumSchema>): Promise<{ resource: TeachingResource; provenance: CurriculumProvenance }> {
  const data = copyCurriculumSchema.parse(input), source = await exactApproved(principal, id, data.versionId, true);
  const db = getDb(), resourceId = data.clientResourceId ?? crypto.randomUUID(), versionId = crypto.randomUUID(), bindingId = crypto.randomUUID(), createdAt = new Date().toISOString();
  const [already] = await db.select({ id: teachingResources.id }).from(teachingResources).where(eq(teachingResources.id, resourceId)).limit(1);
  if (already) return copyRetry(principal, resourceId, id, source, data.type);
  // A retired source is unavailable for any new copy, with the same answer as a missing version.
  if ((await currentStatus(id)).state === 'retired') throw new AccessError('Approved curriculum version not found', 404);
  const sourcePredicate = activeApprovedSource(principal, id, data.versionId);
  // All three INSERT SELECT statements recheck source approval and live scope;
  // D1's atomic batch leaves no detached resource/version/provenance on failure.
  const [resources, versions, bindings] = await db.batch([
    db.insert(teachingResources).select(sql`select ${resourceId}, ${principal.schoolId}, ${principal.id}, ${createdAt}
      from curriculum_references join curriculum_reference_versions on curriculum_reference_versions.reference_id = curriculum_references.id
      where ${sourcePredicate} limit 1`).onConflictDoNothing().returning(),
    db.insert(resourceVersions).select(sql`select ${versionId}, ${resourceId}, 1, curriculum_reference_versions.title, ${data.type},
      curriculum_reference_versions.curriculum, curriculum_reference_versions.grade_level, curriculum_reference_versions.subject,
      curriculum_reference_versions.language, curriculum_reference_versions.objectives, curriculum_reference_versions.body, '', '',
      ${principal.id}, ${createdAt}, null, null
      from curriculum_references join curriculum_reference_versions on curriculum_reference_versions.reference_id = curriculum_references.id
      join teaching_resources on teaching_resources.id = ${resourceId}
      where ${sourcePredicate} and teaching_resources.author_id = ${principal.id} and teaching_resources.school_id = ${principal.schoolId} limit 1`).onConflictDoNothing().returning(),
    db.insert(resourceReferenceBindings).select(sql`select ${bindingId}, ${resourceId}, ${versionId}, ${id}, ${data.versionId}, ${principal.id}, ${createdAt}
      from curriculum_references join curriculum_reference_versions on curriculum_reference_versions.reference_id = curriculum_references.id
      join teaching_resources on teaching_resources.id = ${resourceId} join resource_versions on resource_versions.resource_id = teaching_resources.id
      where ${sourcePredicate} and teaching_resources.author_id = ${principal.id} and teaching_resources.school_id = ${principal.schoolId}
        and resource_versions.id = ${versionId} and resource_versions.version = 1 limit 1`).onConflictDoNothing().returning(),
  ]);
  if (!resources[0] || !versions[0] || !bindings[0]) return copyRetry(principal, resourceId, id, source, data.type);
  return { resource: { ...resources[0], latest: { ...versions[0], type: versions[0].type as ResourceType } }, provenance: bindings[0] };
}
function ownResourceScope(principal: Principal) {
  return and(eq(teachingResources.schoolId, principal.schoolId!), liveStaff(principal), principal.role === 'teacher' ? eq(teachingResources.authorId, principal.id) : undefined);
}
const usageLimit = 40;
/** Teaching drafts created from this reference and the classes they were assigned to.
 * Teachers see only their own copies; administrators see the school's copies. */
export async function getCurriculumUsage(principal: Principal, id: string): Promise<CurriculumUsage> {
  const { row } = await visibleReferenceRow(principal, id);
  // A private draft with no reviewed version is invisible to peers, so is its usage.
  const [visible] = await getDb().select({ id: curriculumReferenceVersions.id }).from(curriculumReferenceVersions)
    .where(and(eq(curriculumReferenceVersions.referenceId, id), visibleVersion(principal))).limit(1);
  if (!visible) throw new AccessError('Curriculum reference not found', 404);
  const bindings = await getDb().select({ binding: resourceReferenceBindings, resource: teachingResources, source: curriculumReferenceVersions }).from(resourceReferenceBindings)
    .innerJoin(teachingResources, eq(teachingResources.id, resourceReferenceBindings.resourceId))
    .innerJoin(curriculumReferenceVersions, eq(curriculumReferenceVersions.id, resourceReferenceBindings.referenceVersionId))
    .where(and(eq(resourceReferenceBindings.referenceId, id), ownResourceScope(principal)))
    .orderBy(desc(resourceReferenceBindings.createdAt)).limit(usageLimit);
  let copiesInSchool: number | null = null;
  if (canManage(principal, row)) {
    const [counted] = await getDb().select({ total: sql<number>`count(*)` }).from(resourceReferenceBindings)
      .innerJoin(teachingResources, eq(teachingResources.id, resourceReferenceBindings.resourceId))
      .where(and(eq(resourceReferenceBindings.referenceId, id), eq(teachingResources.schoolId, principal.schoolId!), liveStaff(principal)));
    copiesInSchool = Number(counted?.total ?? 0);
  }
  const resourceIds = [...new Set(bindings.map(item => item.resource.id))];
  const latest = resourceIds.length ? await getDb().select().from(resourceVersions)
    .where(and(inArray(resourceVersions.resourceId, resourceIds), sql`not exists (select 1 from resource_versions newer_version
      where newer_version.resource_id = ${resourceVersions.resourceId} and newer_version.version > ${resourceVersions.version})`)) : [];
  const assigned = resourceIds.length ? await getDb().select({ assignment: resourceAssignments, className: classes.name, version: resourceVersions.version }).from(resourceAssignments)
    .innerJoin(classes, eq(classes.id, resourceAssignments.classId))
    .innerJoin(resourceVersions, eq(resourceVersions.id, resourceAssignments.versionId))
    .where(and(inArray(resourceAssignments.resourceId, resourceIds), classScope(principal))).orderBy(desc(resourceAssignments.createdAt)) : [];
  const names = await userNames(principal, bindings.map(item => item.resource.authorId));
  const copies = bindings.map(({ binding, resource, source }): CurriculumUsageCopy => {
    const current = latest.find(version => version.resourceId === resource.id);
    return {
      resourceId: resource.id, title: current?.title ?? source.title, type: current?.type ?? 'lesson', authorName: names.get(resource.authorId) ?? staffFallback,
      copiedAt: binding.createdAt, copiedFromVersion: source.version, copiedFromReviewedAt: source.approvedAt,
      latestResourceVersion: current?.version ?? 1, latestApproved: Boolean(current?.approvedAt && current.approvedBy),
      assignments: assigned.filter(item => item.assignment.resourceId === resource.id).map(item => ({
        assignmentId: item.assignment.id, classId: item.assignment.classId, className: item.className, dueDate: item.assignment.dueDate, assignedVersion: item.version })),
    };
  });
  return { referenceId: id, copies, copiesInSchool, scope: principal.role === 'teacher' ? 'own' : 'school' };
}
/** The exact curriculum source each copied teaching resource was made from, including
 * whether that source has since been retired. Source text itself is not returned. */
export async function getResourceSources(principal: Principal, resourceId: string): Promise<{ resourceId: string; sources: ResourceSource[] }> {
  staff(principal);
  const [resource] = await getDb().select({ id: teachingResources.id }).from(teachingResources).where(and(eq(teachingResources.id, identifier.parse(resourceId)), ownResourceScope(principal))).limit(1);
  if (!resource) throw new AccessError('Resource not found', 404);
  const rows = await getDb().select({ binding: resourceReferenceBindings, source: curriculumReferenceVersions, reference: curriculumReferences }).from(resourceReferenceBindings)
    .innerJoin(curriculumReferenceVersions, eq(curriculumReferenceVersions.id, resourceReferenceBindings.referenceVersionId))
    .innerJoin(curriculumReferences, eq(curriculumReferences.id, resourceReferenceBindings.referenceId))
    .where(and(eq(resourceReferenceBindings.resourceId, resource.id), eq(curriculumReferences.schoolId, principal.schoolId!)))
    .orderBy(desc(resourceReferenceBindings.createdAt)).limit(20);
  const names = await userNames(principal, rows.flatMap(item => [item.binding.selectedBy, item.source.approvedBy]));
  const sources: ResourceSource[] = [];
  for (const { binding, source, reference } of rows) {
    const status = await currentStatus(reference.id);
    const [newest] = await getDb().select({ version: curriculumReferenceVersions.version }).from(curriculumReferenceVersions)
      .where(and(eq(curriculumReferenceVersions.referenceId, reference.id), visibleVersion(principal))).orderBy(desc(curriculumReferenceVersions.version)).limit(1);
    const retired = status.state === 'retired';
    sources.push({
      referenceId: reference.id, referenceVersionId: source.id, referenceVersion: source.version, title: source.title, curriculum: source.curriculum, language: source.language,
      rightsStatement: source.rightsStatement, sourceReference: source.sourceReference, sourceUrl: source.sourceUrl, reviewedAt: source.approvedAt,
      reviewedByName: source.approvedBy ? names.get(source.approvedBy) ?? staffFallback : null, copiedAt: binding.createdAt, copiedByName: names.get(binding.selectedBy) ?? staffFallback,
      latestReferenceVersion: newest?.version ?? null, lifecycle: status.state, retiredReason: retired ? status.reason : null, retiredAt: retired ? status.changedAt : null,
      referenceAvailable: Boolean(newest) && (!retired || canManage(principal, reference)),
    });
  }
  return { resourceId: resource.id, sources };
}
