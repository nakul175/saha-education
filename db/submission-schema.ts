import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { resourceAssignments, resourceVersions, students, users } from './schema';

// Content and review evidence append. An attempt always refers to the assigned
// approved version, even after the author creates a newer resource draft.
export const submissionAttempts = sqliteTable('submission_attempts', {
  id: text('id').primaryKey(),
  assignmentId: text('assignment_id').notNull().references(() => resourceAssignments.id),
  versionId: text('version_id').notNull().references(() => resourceVersions.id),
  studentId: text('student_id').notNull().references(() => students.id),
  submittedBy: text('submitted_by').notNull().references(() => users.id),
  attempt: integer('attempt').notNull(),
  response: text('response').notNull(),
  createdAt: text('created_at').notNull(),
}, t => [
  uniqueIndex('submission_attempts_assignment_student_number').on(t.assignmentId, t.studentId, t.attempt),
  index('submission_attempts_assignment').on(t.assignmentId, t.createdAt),
  check('submission_attempts_positive', sql`typeof(${t.attempt}) = 'integer' AND ${t.attempt} BETWEEN 1 AND 1000001`),
  check('submission_attempts_response', sql`length(trim(${t.response})) BETWEEN 1 AND 20000`),
]);

export const submissionFeedback = sqliteTable('submission_feedback', {
  id: text('id').primaryKey(),
  submissionId: text('submission_id').notNull().references(() => submissionAttempts.id),
  revision: integer('revision').notNull(),
  feedback: text('feedback').notNull(),
  reviewedBy: text('reviewed_by').notNull().references(() => users.id),
  reviewedAt: text('reviewed_at').notNull(),
}, t => [
  uniqueIndex('submission_feedback_submission_revision').on(t.submissionId, t.revision),
  index('submission_feedback_submission').on(t.submissionId),
  check('submission_feedback_positive', sql`typeof(${t.revision}) = 'integer' AND ${t.revision} BETWEEN 1 AND 1000001`),
  check('submission_feedback_text', sql`length(trim(${t.feedback})) BETWEEN 1 AND 8000`),
]);

export type SubmissionFeedback = typeof submissionFeedback.$inferSelect;
export type SubmissionAttempt = typeof submissionAttempts.$inferSelect & { feedback: SubmissionFeedback[] };
