import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { resourceAssignments, users } from './schema';

// Every policy change is a reviewed immutable revision. No row means the
// original unrestricted submission behavior, independently of the due date.
export const assignmentSubmissionWindows = sqliteTable('assignment_submission_windows', {
  id: text('id').primaryKey(),
  assignmentId: text('assignment_id').notNull().references(() => resourceAssignments.id),
  revision: integer('revision').notNull(),
  state: text('state').notNull(),
  closesAt: text('closes_at'),
  reviewedBy: text('reviewed_by').notNull().references(() => users.id),
  reviewedAt: text('reviewed_at').notNull(),
  reason: text('reason').notNull(),
  requestHash: text('request_hash').notNull(),
}, t => [
  uniqueIndex('assignment_submission_windows_assignment_revision').on(t.assignmentId, t.revision),
  check('assignment_submission_windows_revision', sql`typeof(${t.revision}) = 'integer' AND ${t.revision} BETWEEN 1 AND 1000000`),
  check('assignment_submission_windows_state', sql`${t.state} IN ('open', 'closed')`),
  check('assignment_submission_windows_reason', sql`length(trim(${t.reason})) BETWEEN 10 AND 500`),
  check('assignment_submission_windows_closing', sql`(${t.state} = 'open' OR ${t.closesAt} IS NULL) AND (${t.closesAt} IS NULL OR (length(${t.closesAt}) = 24 AND substr(${t.closesAt}, 24, 1) = 'Z' AND julianday(${t.closesAt}) IS NOT NULL))`),
]);
