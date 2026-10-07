import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, check } from 'drizzle-orm/sqlite-core';
import { schools, users } from './schema';

// A separate revision table keeps existing identity/profile rows intact.
export const identityAdminUserVersions = sqliteTable('identity_admin_user_versions', {
  userId: text('user_id').primaryKey().references(() => users.id),
  version: integer('version').notNull(),
}, t => [check('identity_admin_version_nonnegative', sql`typeof(${t.version}) = 'integer' AND ${t.version} >= 0`)]);

// Evidence records the reviewed administration decision, not provider tokens or claims.
export const identityAdminEvents = sqliteTable('identity_admin_events', {
  id: text('id').primaryKey(),
  schoolId: text('school_id').notNull().references(() => schools.id),
  actorId: text('actor_id').notNull().references(() => users.id),
  userId: text('user_id').notNull().references(() => users.id),
  action: text('action').notNull(),
  reason: text('reason').notNull(),
  reviewedAt: text('reviewed_at').notNull(),
  previousEnabled: integer('previous_enabled'),
  nextEnabled: integer('next_enabled').notNull(),
  expectedVersion: integer('expected_version').notNull(),
  resultingVersion: integer('resulting_version').notNull(),
  requestHash: text('request_hash').notNull(),
  attemptId: text('attempt_id').notNull(),
}, t => [
  index('identity_admin_events_school_reviewed').on(t.schoolId, t.reviewedAt),
  index('identity_admin_events_user').on(t.userId),
  check('identity_admin_events_action', sql`${t.action} IN ('provision', 'enable', 'disable')`),
  check('identity_admin_events_flags', sql`(${t.previousEnabled} IS NULL OR ${t.previousEnabled} IN (0, 1)) AND ${t.nextEnabled} IN (0, 1)`),
  check('identity_admin_events_versions', sql`typeof(${t.expectedVersion}) = 'integer' AND typeof(${t.resultingVersion}) = 'integer' AND ${t.expectedVersion} >= 0 AND ${t.resultingVersion} > ${t.expectedVersion}`),
]);

// Role and sign-in identity decisions keep exact before/after values. Rows are
// immutable (database triggers); request hash and attempt marker stay private.
export const identityAdminChanges = sqliteTable('identity_admin_changes', {
  id: text('id').primaryKey(),
  schoolId: text('school_id').notNull().references(() => schools.id),
  actorId: text('actor_id').notNull().references(() => users.id),
  userId: text('user_id').notNull().references(() => users.id),
  action: text('action').notNull(),
  reason: text('reason').notNull(),
  reviewedAt: text('reviewed_at').notNull(),
  previousRole: text('previous_role').notNull(),
  nextRole: text('next_role').notNull(),
  previousIssuer: text('previous_issuer'),
  previousSubject: text('previous_subject'),
  nextIssuer: text('next_issuer'),
  nextSubject: text('next_subject'),
  expectedVersion: integer('expected_version').notNull(),
  resultingVersion: integer('resulting_version').notNull(),
  requestHash: text('request_hash').notNull(),
  attemptId: text('attempt_id').notNull(),
}, t => [
  index('identity_admin_changes_school_reviewed').on(t.schoolId, t.reviewedAt),
  index('identity_admin_changes_user').on(t.userId),
  check('identity_admin_changes_action', sql`${t.action} IN ('change_role', 'link_identity', 'unlink_identity')`),
  check('identity_admin_changes_roles', sql`${t.previousRole} IN ('admin', 'teacher', 'guardian', 'student') AND ${t.nextRole} IN ('admin', 'teacher', 'guardian', 'student')`),
  check('identity_admin_changes_versions', sql`typeof(${t.expectedVersion}) = 'integer' AND typeof(${t.resultingVersion}) = 'integer' AND ${t.expectedVersion} >= 0 AND ${t.resultingVersion} = ${t.expectedVersion} + 1`),
  check('identity_admin_changes_reason', sql`length(${t.reason}) BETWEEN 10 AND 500`),
]);
