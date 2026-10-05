import { sql } from 'drizzle-orm';
import { sqliteTable, text, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { assessmentResults, assessments, classes, schools, students, users } from './schema';

// Additive reviewed decisions. Legacy result replacements are not backfilled.
export const assessmentReviews = sqliteTable('assessment_reviews', {
  id: text('id').primaryKey(),
  schoolId: text('school_id').notNull().references(() => schools.id),
  assessmentId: text('assessment_id').notNull().references(() => assessments.id),
  classId: text('class_id').notNull().references(() => classes.id),
  assessmentSnapshot: text('assessment_snapshot').notNull(),
  reviewedBy: text('reviewed_by').notNull().references(() => users.id),
  reason: text('reason').notNull(),
  requestHash: text('request_hash').notNull(),
  entriesJson: text('entries_json').notNull(),
  createdAt: text('created_at').notNull(),
}, t => [
  index('assessment_reviews_assessment_time').on(t.schoolId, t.assessmentId, t.createdAt),
  check('assessment_reviews_snapshot', sql`json_valid(${t.assessmentSnapshot}) AND json_type(${t.assessmentSnapshot}) = 'object'`),
  check('assessment_reviews_reason', sql`length(${t.reason}) BETWEEN 10 AND 500`),
  check('assessment_reviews_entries', sql`json_valid(${t.entriesJson}) AND json_type(${t.entriesJson}) = 'array' AND json_array_length(${t.entriesJson}) BETWEEN 1 AND 100`),
]);

export const assessmentReviewEntries = sqliteTable('assessment_review_entries', {
  id: text('id').primaryKey(),
  reviewId: text('review_id').notNull().references(() => assessmentReviews.id),
  resultId: text('result_id').notNull().references(() => assessmentResults.id),
  studentId: text('student_id').notNull().references(() => students.id),
  beforeRecord: text('before_record'),
  afterRecord: text('after_record').notNull(),
}, t => [
  uniqueIndex('assessment_review_entries_pupil').on(t.reviewId, t.studentId),
  index('assessment_review_entries_student').on(t.studentId, t.reviewId),
  check('assessment_review_entries_before', sql`${t.beforeRecord} IS NULL OR (json_valid(${t.beforeRecord}) AND json_type(${t.beforeRecord}) = 'object')`),
  check('assessment_review_entries_after', sql`json_valid(${t.afterRecord}) AND json_type(${t.afterRecord}) = 'object'`),
]);
