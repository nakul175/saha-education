import { sqliteTable, text, integer, primaryKey, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { schools, users, students, guardians } from './schema';

// Additive school setup and record administration (migration 0017). Column order
// matches the migration because reviewed INSERT ... SELECT statements are positional.
export const schoolSetupTerms = sqliteTable(
  'school_setup_terms',
  {
    id: text('id').primaryKey(),
    schoolId: text('school_id')
      .notNull()
      .references(() => schools.id),
    academicYear: text('academic_year').notNull(),
    name: text('name').notNull(),
    startsOn: text('starts_on').notNull(),
    endsOn: text('ends_on').notNull(),
    version: integer('version').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('school_setup_terms_name_unique').on(t.schoolId, t.academicYear, t.name),
    index('school_setup_terms_school_start').on(t.schoolId, t.startsOn),
  ],
);

export const schoolSetupSettings = sqliteTable('school_setup_settings', {
  schoolId: text('school_id')
    .primaryKey()
    .references(() => schools.id),
  academicYear: text('academic_year'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  currentTermId: text('current_term_id').references(() => schoolSetupTerms.id),
  version: integer('version').notNull(),
  updatedBy: text('updated_by')
    .notNull()
    .references(() => users.id),
  updatedAt: text('updated_at').notNull(),
});

export const studentRecordStatus = sqliteTable('student_record_status', {
  studentId: text('student_id')
    .primaryKey()
    .references(() => students.id),
  status: text('status').notNull(),
  version: integer('version').notNull(),
  changedBy: text('changed_by')
    .notNull()
    .references(() => users.id),
  changedAt: text('changed_at').notNull(),
});

export const studentStatusEvents = sqliteTable(
  'student_status_events',
  {
    id: text('id').primaryKey(),
    schoolId: text('school_id')
      .notNull()
      .references(() => schools.id),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(),
    expectedVersion: integer('expected_version').notNull(),
    resultingVersion: integer('resulting_version').notNull(),
    reason: text('reason').notNull(),
    withdrawnEnrolments: integer('withdrawn_enrolments').notNull(),
    createdAt: text('created_at').notNull(),
    requestHash: text('request_hash').notNull(),
    attemptId: text('attempt_id').notNull(),
  },
  (t) => [
    uniqueIndex('student_status_events_revision').on(t.studentId, t.resultingVersion),
    index('student_status_events_school_time').on(t.schoolId, t.createdAt),
  ],
);

export const studentGuardianDetails = sqliteTable(
  'student_guardian_details',
  {
    studentId: text('student_id')
      .notNull()
      .references(() => students.id),
    guardianId: text('guardian_id')
      .notNull()
      .references(() => guardians.id),
    relationship: text('relationship').notNull(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.guardianId] })],
);

export const studentGuardianEvents = sqliteTable(
  'student_guardian_events',
  {
    id: text('id').primaryKey(),
    schoolId: text('school_id')
      .notNull()
      .references(() => schools.id),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id),
    guardianId: text('guardian_id')
      .notNull()
      .references(() => guardians.id),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(),
    expectedVersion: integer('expected_version').notNull(),
    resultingVersion: integer('resulting_version').notNull(),
    relationshipBefore: text('relationship_before'),
    relationshipAfter: text('relationship_after'),
    primaryBefore: integer('primary_before'),
    primaryAfter: integer('primary_after'),
    reason: text('reason').notNull(),
    createdAt: text('created_at').notNull(),
    requestHash: text('request_hash').notNull(),
    attemptId: text('attempt_id').notNull(),
  },
  (t) => [
    uniqueIndex('student_guardian_events_revision').on(t.studentId, t.guardianId, t.resultingVersion),
    index('student_guardian_events_student_time').on(t.studentId, t.createdAt),
    index('student_guardian_events_school_time').on(t.schoolId, t.createdAt),
  ],
);
