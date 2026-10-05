import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { reportCards, schools, students, users } from './schema';

// Private commit evidence. Historical publications are deliberately not backfilled.
export const reportPublicationReceipts = sqliteTable('report_publication_receipts', {
  id: text('id').primaryKey(),
  reportId: text('report_id').notNull().references(() => reportCards.id),
  studentId: text('student_id').notNull().references(() => students.id),
  schoolId: text('school_id').notNull().references(() => schools.id),
  publishedBy: text('published_by').notNull().references(() => users.id),
  publishedAt: text('published_at').notNull(),
}, table => [uniqueIndex('report_publication_receipts_report').on(table.reportId)]);
