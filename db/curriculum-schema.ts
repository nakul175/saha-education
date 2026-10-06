import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { schools, users, teachingResources, resourceVersions } from './schema';

export const curriculumReferences = sqliteTable('curriculum_references', {
  id: text('id').primaryKey(),
  schoolId: text('school_id').notNull().references(() => schools.id),
  authorId: text('author_id').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
}, t => [index('curriculum_references_school_author').on(t.schoolId, t.authorId)]);

export const curriculumReferenceVersions = sqliteTable('curriculum_reference_versions', {
  id: text('id').primaryKey(),
  referenceId: text('reference_id').notNull().references(() => curriculumReferences.id),
  version: integer('version').notNull(),
  title: text('title').notNull(),
  curriculum: text('curriculum').notNull(),
  gradeLevel: text('grade_level').notNull(),
  subject: text('subject').notNull(),
  language: text('language').notNull(),
  objectives: text('objectives').notNull(),
  body: text('body').notNull(),
  rightsStatement: text('rights_statement').notNull(),
  sourceReference: text('source_reference').notNull().default(''),
  sourceUrl: text('source_url'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
  approvedBy: text('approved_by').references(() => users.id),
  approvedAt: text('approved_at'),
}, t => [
  uniqueIndex('curriculum_versions_reference_number').on(t.referenceId, t.version),
  check('curriculum_versions_positive', sql`typeof(${t.version}) = 'integer' AND ${t.version} BETWEEN 1 AND 1000000`),
  check('curriculum_versions_rights', sql`length(trim(${t.rightsStatement})) BETWEEN 1 AND 2000`),
  check('curriculum_versions_body', sql`length(trim(${t.body})) BETWEEN 1 AND 20000`),
  check('curriculum_versions_approval_pair', sql`(${t.approvedBy} IS NULL AND ${t.approvedAt} IS NULL) OR (${t.approvedBy} IS NOT NULL AND ${t.approvedAt} IS NOT NULL)`),
]);

// Retirement is an append-only status history; the highest revision is current.
// No row means the reference is active, exactly as before this table existed.
export const curriculumStatusEvents = sqliteTable('curriculum_reference_status_events', {
  id: text('id').primaryKey(),
  referenceId: text('reference_id').notNull().references(() => curriculumReferences.id),
  revision: integer('revision').notNull(),
  status: text('status').notNull(),
  reason: text('reason').notNull(),
  changedBy: text('changed_by').notNull().references(() => users.id),
  changedAt: text('changed_at').notNull(),
}, t => [
  uniqueIndex('curriculum_status_reference_revision').on(t.referenceId, t.revision),
  check('curriculum_status_revision', sql`typeof(${t.revision}) = 'integer' AND ${t.revision} BETWEEN 1 AND 1000000`),
  check('curriculum_status_state', sql`${t.status} IN ('active', 'retired')`),
  check('curriculum_status_reason', sql`length(trim(${t.reason})) BETWEEN 10 AND 500`),
]);

// A copied draft retains the exact immutable source, even after either is revised.
export const resourceReferenceBindings = sqliteTable('resource_reference_bindings', {
  id: text('id').primaryKey(),
  resourceId: text('resource_id').notNull().references(() => teachingResources.id),
  resourceVersionId: text('resource_version_id').notNull().references(() => resourceVersions.id),
  referenceId: text('reference_id').notNull().references(() => curriculumReferences.id),
  referenceVersionId: text('reference_version_id').notNull().references(() => curriculumReferenceVersions.id),
  selectedBy: text('selected_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
}, t => [
  uniqueIndex('resource_reference_bindings_resource_version').on(t.resourceVersionId),
  index('resource_reference_bindings_source').on(t.referenceVersionId),
]);
