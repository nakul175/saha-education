import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { assessmentResults, assessments, classes, reportCards, schools, students, users } from './schema';

// Additive lifecycle evidence. Nothing here is backfilled and every row is immutable.
// Publication events: the latest event per assessment is its current state.
export const assessmentPublications = sqliteTable(
  'assessment_publications',
  {
    id: text('id').primaryKey(),
    schoolId: text('school_id')
      .notNull()
      .references(() => schools.id),
    assessmentId: text('assessment_id')
      .notNull()
      .references(() => assessments.id),
    classId: text('class_id')
      .notNull()
      .references(() => classes.id),
    action: text('action').notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id),
    reason: text('reason'),
    partialConfirmed: integer('partial_confirmed').notNull().default(0),
    expectedPupils: integer('expected_pupils').notNull(),
    recordedResults: integer('recorded_results').notNull(),
    requestHash: text('request_hash').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('assessment_publications_assessment').on(t.assessmentId, t.createdAt),
    check('assessment_publications_action', sql`${t.action} IN ('publish','unpublish')`),
    check(
      'assessment_publications_reason',
      sql`${t.reason} IS NULL OR length(${t.reason}) BETWEEN 10 AND 500`,
    ),
    check('assessment_publications_partial', sql`${t.partialConfirmed} IN (0,1)`),
    check('assessment_publications_expected', sql`${t.expectedPupils} >= 0`),
    check('assessment_publications_recorded', sql`${t.recordedResults} >= 0`),
    check('assessment_publications_time', sql`length(${t.createdAt}) > 0`),
  ],
);

export const assessmentMetadataEdits = sqliteTable(
  'assessment_metadata_edits',
  {
    id: text('id').primaryKey(),
    schoolId: text('school_id')
      .notNull()
      .references(() => schools.id),
    assessmentId: text('assessment_id')
      .notNull()
      .references(() => assessments.id),
    classId: text('class_id')
      .notNull()
      .references(() => classes.id),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id),
    reason: text('reason'),
    beforeSnapshot: text('before_snapshot').notNull(),
    afterSnapshot: text('after_snapshot').notNull(),
    requestHash: text('request_hash').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('assessment_metadata_edits_assessment').on(t.assessmentId, t.createdAt),
    check(
      'assessment_metadata_edits_reason',
      sql`${t.reason} IS NULL OR length(${t.reason}) BETWEEN 10 AND 500`,
    ),
    check(
      'assessment_metadata_edits_before',
      sql`json_valid(${t.beforeSnapshot}) AND json_type(${t.beforeSnapshot})='object'`,
    ),
    check(
      'assessment_metadata_edits_after',
      sql`json_valid(${t.afterSnapshot}) AND json_type(${t.afterSnapshot})='object'`,
    ),
    check('assessment_metadata_edits_time', sql`length(${t.createdAt}) > 0`),
  ],
);

export const reportCardLines = sqliteTable(
  'report_card_lines',
  {
    id: text('id').primaryKey(),
    reportId: text('report_id')
      .notNull()
      .references(() => reportCards.id),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id),
    assessmentId: text('assessment_id')
      .notNull()
      .references(() => assessments.id),
    resultId: text('result_id')
      .notNull()
      .references(() => assessmentResults.id),
    publicationId: text('publication_id')
      .notNull()
      .references(() => assessmentPublications.id),
    assessmentTitle: text('assessment_title').notNull(),
    assessmentKind: text('assessment_kind').notNull(),
    assessmentDate: text('assessment_date').notNull(),
    maxScore: integer('max_score').notNull(),
    score: integer('score').notNull(),
    grade: text('grade'),
    resultUpdatedAt: text('result_updated_at').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('report_card_lines_pair').on(t.reportId, t.assessmentId),
    index('report_card_lines_assessment').on(t.assessmentId),
    check('report_card_lines_max', sql`${t.maxScore} >= 0`),
    check('report_card_lines_score', sql`${t.score} >= 0 AND ${t.score} <= ${t.maxScore}`),
  ],
);

export const reportCardCorrections = sqliteTable(
  'report_card_corrections',
  {
    id: text('id').primaryKey(),
    schoolId: text('school_id')
      .notNull()
      .references(() => schools.id),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id),
    originalReportId: text('original_report_id')
      .notNull()
      .references(() => reportCards.id),
    replacementReportId: text('replacement_report_id')
      .notNull()
      .references(() => reportCards.id),
    reason: text('reason').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('report_card_corrections_replacement').on(t.replacementReportId),
    index('report_card_corrections_original').on(t.originalReportId),
    check('report_card_corrections_reason', sql`length(${t.reason}) BETWEEN 10 AND 500`),
    check('report_card_corrections_time', sql`length(${t.createdAt}) > 0`),
  ],
);
