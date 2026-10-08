import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { classes, courses, enrolments, schools, users } from './schema';

// Current lifecycle state. Absence of a row means "active" (courses) or "open, unlimited, undated" (classes);
// no legacy row is backfilled. History lives in the immutable event ledger below.
export const courseLifecycle = sqliteTable(
  'course_lifecycle',
  {
    courseId: text('course_id')
      .primaryKey()
      .references(() => courses.id),
    status: text('status').notNull(),
    changedAt: text('changed_at').notNull(),
    changedBy: text('changed_by')
      .notNull()
      .references(() => users.id),
    reason: text('reason'),
  },
  (t) => [check('course_lifecycle_status', sql`${t.status} IN ('active', 'retired')`)],
);

export const classSettings = sqliteTable(
  'class_settings',
  {
    classId: text('class_id')
      .primaryKey()
      .references(() => classes.id),
    capacity: integer('capacity'),
    startsOn: text('starts_on'),
    endsOn: text('ends_on'),
    status: text('status').notNull().default('open'),
    closedAt: text('closed_at'),
    closedBy: text('closed_by').references(() => users.id),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    check(
      'class_settings_capacity',
      sql`${t.capacity} IS NULL OR (typeof(${t.capacity}) = 'integer' AND ${t.capacity} BETWEEN 1 AND 500)`,
    ),
    check('class_settings_status', sql`${t.status} IN ('open', 'closed')`),
  ],
);

export const enrolmentLifecycle = sqliteTable(
  'enrolment_lifecycle',
  {
    enrolmentId: text('enrolment_id')
      .primaryKey()
      .references(() => enrolments.id),
    startedOn: text('started_on').notNull(),
    endedOn: text('ended_on'),
    endKind: text('end_kind'),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    check(
      'enrolment_lifecycle_kind',
      sql`${t.endKind} IS NULL OR ${t.endKind} IN ('withdrawn', 'completed', 'transferred')`,
    ),
  ],
);

// One immutable header per client request UUID. Its items_json is expanded by trigger into events whose own
// triggers guard and apply each effect, so the whole request commits or fails as one statement.
export const academicChangeRequests = sqliteTable(
  'academic_change_requests',
  {
    id: text('id').primaryKey(),
    schoolId: text('school_id')
      .notNull()
      .references(() => schools.id),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id),
    requestHash: text('request_hash').notNull(),
    reason: text('reason'),
    itemsJson: text('items_json').notNull(),
    itemCount: integer('item_count').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('academic_change_requests_actor_time').on(t.schoolId, t.actorId, t.createdAt)],
);

export const academicEvents = sqliteTable(
  'academic_events',
  {
    id: text('id').primaryKey(),
    requestId: text('request_id')
      .notNull()
      .references(() => academicChangeRequests.id),
    seq: integer('seq').notNull(),
    schoolId: text('school_id')
      .notNull()
      .references(() => schools.id),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id),
    kind: text('kind').notNull(),
    subjectId: text('subject_id').notNull(),
    classId: text('class_id'),
    relatedClassId: text('related_class_id'),
    studentId: text('student_id'),
    effectiveOn: text('effective_on'),
    payload: text('payload').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('academic_events_request').on(t.requestId, t.seq),
    index('academic_events_subject').on(t.schoolId, t.subjectId, t.createdAt),
    index('academic_events_class').on(t.schoolId, t.classId, t.createdAt),
    index('academic_events_related_class').on(t.schoolId, t.relatedClassId, t.createdAt),
    index('academic_events_student').on(t.schoolId, t.studentId, t.createdAt),
  ],
);
