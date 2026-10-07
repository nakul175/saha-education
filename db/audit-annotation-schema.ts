import { sql } from 'drizzle-orm';
import { sqliteTable, text, index, check } from 'drizzle-orm/sqlite-core';
import { schools, users } from './schema';

// An annotation adds an administrator's reasoned correction beside an audit
// entry. It never edits or hides the entry it refers to.
export const auditAnnotations = sqliteTable('audit_annotations', {
  id: text('id').primaryKey(),
  schoolId: text('school_id').notNull().references(() => schools.id),
  source: text('source').notNull(),
  sourceId: text('source_id').notNull(),
  notedBy: text('noted_by').notNull().references(() => users.id),
  note: text('note').notNull(),
  requestHash: text('request_hash').notNull(),
  createdAt: text('created_at').notNull(),
}, t => [
  index('audit_annotations_entry').on(t.schoolId, t.source, t.sourceId),
  index('audit_annotations_time').on(t.schoolId, t.createdAt),
  check('audit_annotations_note', sql`length(trim(${t.note})) BETWEEN 10 AND 500`),
  check('audit_annotations_source', sql`length(${t.source}) BETWEEN 1 AND 40 AND length(${t.sourceId}) BETWEEN 1 AND 200`),
]);
