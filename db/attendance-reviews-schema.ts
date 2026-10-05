import { sql } from 'drizzle-orm';
import { sqliteTable, text, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { attendance, classes, schools, students, users } from './schema';

// These are reviewed-workflow decisions, not a backfill of legacy replacements.
export const attendanceReviews = sqliteTable('attendance_reviews', {
  id: text('id').primaryKey(),
  schoolId: text('school_id').notNull().references(() => schools.id),
  classId: text('class_id').notNull().references(() => classes.id),
  attendanceDate: text('attendance_date').notNull(),
  reviewedBy: text('reviewed_by').notNull().references(() => users.id),
  reason: text('reason').notNull(),
  requestHash: text('request_hash').notNull(),
  entriesJson: text('entries_json').notNull(),
  createdAt: text('created_at').notNull(),
}, t => [
  index('attendance_reviews_class_date_time').on(t.schoolId, t.classId, t.attendanceDate, t.createdAt),
  check('attendance_reviews_date', sql`length(${t.attendanceDate}) = 10 AND ${t.attendanceDate} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND coalesce(date(${t.attendanceDate}, '+0 days') = ${t.attendanceDate}, 0)`),
  check('attendance_reviews_reason', sql`length(${t.reason}) BETWEEN 10 AND 500`),
  check('attendance_reviews_entries', sql`json_valid(${t.entriesJson}) AND json_type(${t.entriesJson}) = 'array' AND json_array_length(${t.entriesJson}) BETWEEN 1 AND 100`),
]);

export const attendanceReviewEntries = sqliteTable('attendance_review_entries', {
  id: text('id').primaryKey(),
  reviewId: text('review_id').notNull().references(() => attendanceReviews.id),
  attendanceId: text('attendance_id').notNull().references(() => attendance.id),
  studentId: text('student_id').notNull().references(() => students.id),
  beforeRecord: text('before_record'),
  afterRecord: text('after_record').notNull(),
}, t => [
  uniqueIndex('attendance_review_entries_pupil').on(t.reviewId, t.studentId),
  index('attendance_review_entries_student').on(t.studentId, t.reviewId),
  check('attendance_review_entries_before', sql`${t.beforeRecord} IS NULL OR (json_valid(${t.beforeRecord}) AND json_type(${t.beforeRecord}) = 'object')`),
  check('attendance_review_entries_after', sql`json_valid(${t.afterRecord}) AND json_type(${t.afterRecord}) = 'object'`),
]);
