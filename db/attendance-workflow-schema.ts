import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, check } from 'drizzle-orm/sqlite-core';
import { schools, users } from './schema';

// School-local calendar choices for attendance. No row means the legacy defaults:
// UTC calendar dates and future dates allowed. Only a current administrator writes it.
export const schoolAttendanceSettings = sqliteTable('school_attendance_settings', {
  schoolId: text('school_id').primaryKey().references(() => schools.id),
  timezone: text('timezone').notNull(),
  futureDatesAllowed: integer('future_dates_allowed').notNull().default(1),
  updatedBy: text('updated_by').notNull().references(() => users.id),
  updatedAt: text('updated_at').notNull(),
}, t => [
  check('school_attendance_settings_timezone', sql`length(${t.timezone}) BETWEEN 1 AND 64 AND ${t.timezone} NOT GLOB '*[^A-Za-z0-9_+/-]*'`),
  check('school_attendance_settings_future', sql`${t.futureDatesAllowed} IN (0,1)`),
]);

// Database-written, immutable record of every saved mark that was replaced or deleted.
// It is written by triggers so no route, legacy or reviewed, can change a mark silently.
export const attendanceChanges = sqliteTable('attendance_changes', {
  id: text('id').primaryKey(),
  attendanceId: text('attendance_id').notNull(),
  classId: text('class_id').notNull(),
  studentId: text('student_id').notNull(),
  attendanceDate: text('attendance_date').notNull(),
  changeKind: text('change_kind').notNull(),
  beforeRecord: text('before_record').notNull(),
  afterRecord: text('after_record'),
  changedAt: text('changed_at').notNull(),
}, t => [
  index('attendance_changes_class_date').on(t.classId, t.attendanceDate, t.changedAt),
  index('attendance_changes_student').on(t.studentId, t.changedAt),
  check('attendance_changes_kind', sql`${t.changeKind} IN ('update','delete')`),
  check('attendance_changes_before', sql`json_valid(${t.beforeRecord}) AND json_type(${t.beforeRecord}) = 'object'`),
  check('attendance_changes_after', sql`${t.afterRecord} IS NULL OR (json_valid(${t.afterRecord}) AND json_type(${t.afterRecord}) = 'object')`),
]);
