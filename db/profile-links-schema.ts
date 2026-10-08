import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, primaryKey, uniqueIndex, index, check } from 'drizzle-orm/sqlite-core';
import { schools, users, students, guardians } from './schema';

export const profileLinkVersions = sqliteTable(
  'profile_link_versions',
  {
    profileType: text('profile_type').notNull(),
    profileId: text('profile_id').notNull(),
    studentId: text('student_id').references(() => students.id),
    guardianId: text('guardian_id').references(() => guardians.id),
    version: integer('version').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.profileType, t.profileId] }),
    check(
      'profile_link_versions_target',
      sql`(${t.profileType} = 'student' AND ${t.studentId} IS NOT NULL AND ${t.studentId} = ${t.profileId} AND ${t.guardianId} IS NULL) OR (${t.profileType} = 'guardian' AND ${t.guardianId} IS NOT NULL AND ${t.guardianId} = ${t.profileId} AND ${t.studentId} IS NULL)`,
    ),
    check(
      'profile_link_versions_number',
      sql`typeof(${t.version}) = 'integer' AND ${t.version} BETWEEN 1 AND 1000000`,
    ),
  ],
);

// Historical decisions retain exact profile/account IDs; private retry markers
// are never returned to clients. Existing bindings are not backfilled as reviews.
export const profileLinkEvents = sqliteTable(
  'profile_link_events',
  {
    id: text('id').primaryKey(),
    schoolId: text('school_id')
      .notNull()
      .references(() => schools.id),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id),
    profileType: text('profile_type').notNull(),
    profileId: text('profile_id').notNull(),
    studentId: text('student_id').references(() => students.id),
    guardianId: text('guardian_id').references(() => guardians.id),
    previousUserId: text('previous_user_id').references(() => users.id),
    nextUserId: text('next_user_id').references(() => users.id),
    expectedVersion: integer('expected_version').notNull(),
    resultingVersion: integer('resulting_version').notNull(),
    reason: text('reason').notNull(),
    reviewedAt: text('reviewed_at').notNull(),
    requestHash: text('request_hash').notNull(),
    attemptId: text('attempt_id').notNull(),
  },
  (t) => [
    uniqueIndex('profile_link_events_revision').on(t.profileType, t.profileId, t.resultingVersion),
    index('profile_link_events_school_time').on(t.schoolId, t.reviewedAt),
    check(
      'profile_link_events_target',
      sql`(${t.profileType} = 'student' AND ${t.studentId} IS NOT NULL AND ${t.studentId} = ${t.profileId} AND ${t.guardianId} IS NULL) OR (${t.profileType} = 'guardian' AND ${t.guardianId} IS NOT NULL AND ${t.guardianId} = ${t.profileId} AND ${t.studentId} IS NULL)`,
    ),
    check(
      'profile_link_events_number',
      sql`typeof(${t.expectedVersion}) = 'integer' AND typeof(${t.resultingVersion}) = 'integer' AND ${t.expectedVersion} BETWEEN 0 AND 999999 AND ${t.resultingVersion} = ${t.expectedVersion} + 1`,
    ),
    check('profile_link_events_changed', sql`${t.previousUserId} IS NOT ${t.nextUserId}`),
    check('profile_link_events_reason', sql`length(${t.reason}) BETWEEN 10 AND 500`),
  ],
);
