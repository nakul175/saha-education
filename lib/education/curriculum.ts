import { z } from 'zod';
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db/index';
import { teachingResources, resourceVersions } from '@/db/schema';
import { curriculumReferences, curriculumReferenceVersions, resourceReferenceBindings } from '@/db/curriculum-schema';
import { AccessError, assertPrincipal, livePrincipalScope } from './access';
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
export type CurriculumContent = z.infer<typeof curriculumContentSchema>;
export type CurriculumVersion = typeof curriculumReferenceVersions.$inferSelect;
export type CurriculumReference = typeof curriculumReferences.$inferSelect & { canManage: boolean; latest: CurriculumVersion };
export type CurriculumSnapshot = { referenceId: string; versionId: string; version: number; content: CurriculumVersion; suggestedDraft: ResourceContent };
export type CurriculumProvenance = typeof resourceReferenceBindings.$inferSelect;
export class CurriculumConflict extends Error {
  readonly status = 409;
  constructor() { super('Curriculum reference conflict'); this.name = 'CurriculumConflict'; }
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
function referenceView(principal: Principal, row: typeof curriculumReferences.$inferSelect, latest: CurriculumVersion): CurriculumReference {
  return { ...row, canManage: canManage(principal, row), latest };
}
async function referenceRow(principal: Principal, id: string, managed = false) {
  staff(principal);
  const [row] = await getDb().select().from(curriculumReferences).where(and(eq(curriculumReferences.id, identifier.parse(id)), managed ? manageScope(principal) : schoolScope(principal))).limit(1);
  if (!row) throw new AccessError('Curriculum reference not found', 404);
  return row;
}
function approved() { return and(isNotNull(curriculumReferenceVersions.approvedAt), isNotNull(curriculumReferenceVersions.approvedBy)); }
async function exactApproved(principal: Principal, id: string, versionId: string): Promise<CurriculumVersion> {
  await referenceRow(principal, id);
  const [version] = await getDb().select().from(curriculumReferenceVersions).where(and(eq(curriculumReferenceVersions.referenceId, id), eq(curriculumReferenceVersions.id, identifier.parse(versionId)), approved(), schoolReference(principal, id))).limit(1);
  if (!version) throw new AccessError('Approved curriculum version not found', 404);
  return version;
}
async function exactManaged(principal: Principal, id: string, versionId: string): Promise<CurriculumVersion> {
  await referenceRow(principal, id, true);
  const [version] = await getDb().select().from(curriculumReferenceVersions).where(and(eq(curriculumReferenceVersions.referenceId, id), eq(curriculumReferenceVersions.id, identifier.parse(versionId)), manageReference(principal, id))).limit(1);
  if (!version) throw new AccessError('Curriculum version not found', 404);
  return version;
}
export async function listCurriculumReferences(principal: Principal): Promise<CurriculumReference[]> {
  staff(principal);
  const rows = await getDb().select().from(curriculumReferences).where(schoolScope(principal)).orderBy(desc(curriculumReferences.createdAt));
  const result: CurriculumReference[] = [];
  for (const row of rows) {
    const [latest] = await getDb().select().from(curriculumReferenceVersions).where(and(eq(curriculumReferenceVersions.referenceId, row.id), visibleVersion(principal))).orderBy(desc(curriculumReferenceVersions.version)).limit(1);
    if (latest) result.push(referenceView(principal, row, latest));
  }
  return result;
}
export async function getCurriculumReference(principal: Principal, id: string): Promise<CurriculumReference> {
  const row = await referenceRow(principal, id);
  const [latest] = await getDb().select().from(curriculumReferenceVersions).where(and(eq(curriculumReferenceVersions.referenceId, id), visibleVersion(principal))).orderBy(desc(curriculumReferenceVersions.version)).limit(1);
  if (!latest) throw new AccessError('Curriculum reference not found', 404);
  return referenceView(principal, row, latest);
}
export async function listCurriculumVersions(principal: Principal, id: string): Promise<CurriculumVersion[]> {
  await referenceRow(principal, id);
  const versions = await getDb().select().from(curriculumReferenceVersions).where(and(eq(curriculumReferenceVersions.referenceId, id), visibleVersion(principal))).orderBy(desc(curriculumReferenceVersions.version));
  if (!versions.length) throw new AccessError('Curriculum reference not found', 404);
  return versions;
}
async function createRetry(principal: Principal, id: string, content: CurriculumContent): Promise<CurriculumReference> {
  const [row] = await getDb().select().from(curriculumReferences).where(and(eq(curriculumReferences.id, id), eq(curriculumReferences.authorId, principal.id), schoolScope(principal))).limit(1);
  const [version] = await getDb().select().from(curriculumReferenceVersions).where(and(eq(curriculumReferenceVersions.referenceId, id), eq(curriculumReferenceVersions.version, 1), ownedReference(principal, id))).limit(1);
  if (!row || !version || !Object.entries(content).every(([key, value]) => version[key as keyof CurriculumVersion] === value)) throw new CurriculumConflict();
  return referenceView(principal, row, version);
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
  return referenceView(principal, rows[0], versions[0]);
}
export async function reviseCurriculumReference(principal: Principal, id: string, input: z.input<typeof reviseCurriculumSchema>): Promise<CurriculumReference> {
  const row = await referenceRow(principal, id, true), data = reviseCurriculumSchema.parse(input);
  const [version] = await versionInsert(principal, id, crypto.randomUUID(), data.expectedVersion + 1, new Date().toISOString(), data.content,
    sql`exists (select 1 from curriculum_reference_versions v where v.reference_id = ${id} and v.version = ${data.expectedVersion})
      and not exists (select 1 from curriculum_reference_versions v where v.reference_id = ${id} and v.version > ${data.expectedVersion})`);
  if (!version) throw new CurriculumConflict();
  return referenceView(principal, row, version);
}
export async function approveCurriculumReference(principal: Principal, id: string, input: z.infer<typeof approveCurriculumSchema>): Promise<CurriculumVersion> {
  const data = approveCurriculumSchema.parse(input), version = await exactManaged(principal, id, data.versionId);
  if (version.approvedAt) return version;
  const [reviewed] = await getDb().update(curriculumReferenceVersions).set({ approvedBy: principal.id, approvedAt: new Date().toISOString() })
    .where(and(eq(curriculumReferenceVersions.id, data.versionId), eq(curriculumReferenceVersions.referenceId, id), isNull(curriculumReferenceVersions.approvedAt), isNull(curriculumReferenceVersions.approvedBy), manageReference(principal, id))).returning();
  return reviewed ?? exactManaged(principal, id, data.versionId);
}
function draftContent(version: CurriculumVersion, type: ResourceType = 'lesson'): ResourceContent {
  return { title: version.title, type, curriculum: version.curriculum, gradeLevel: version.gradeLevel, subject: version.subject,
    language: version.language, objectives: version.objectives, body: version.body, teacherNotes: '', answerKey: '' };
}
export async function getCurriculumSnapshot(principal: Principal, id: string, versionId: string): Promise<CurriculumSnapshot> {
  const content = await exactApproved(principal, id, versionId);
  return { referenceId: id, versionId: content.id, version: content.version, content, suggestedDraft: draftContent(content) };
}
function approvedSource(principal: Principal, id: string, versionId: string) {
  return and(eq(curriculumReferences.id, id), schoolScope(principal), eq(curriculumReferenceVersions.referenceId, id), eq(curriculumReferenceVersions.id, versionId), approved());
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
  const data = copyCurriculumSchema.parse(input), source = await exactApproved(principal, id, data.versionId);
  const db = getDb(), resourceId = data.clientResourceId ?? crypto.randomUUID(), versionId = crypto.randomUUID(), bindingId = crypto.randomUUID(), createdAt = new Date().toISOString();
  const [already] = await db.select({ id: teachingResources.id }).from(teachingResources).where(eq(teachingResources.id, resourceId)).limit(1);
  if (already) return copyRetry(principal, resourceId, id, source, data.type);
  const sourcePredicate = approvedSource(principal, id, data.versionId);
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
