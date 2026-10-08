import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { schools, classes, students, users, readingChecks } from './schema';

export const readingImportDrafts = sqliteTable(
  'reading_import_drafts',
  {
    id: text('id').primaryKey(),
    schoolId: text('school_id')
      .notNull()
      .references(() => schools.id),
    classId: text('class_id')
      .notNull()
      .references(() => classes.id),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    sourceLabel: text('source_label').notNull(),
    sourceReference: text('source_reference').notNull(),
    requestHash: text('request_hash').notNull(),
    rowsJson: text('rows_json').notNull(),
    status: text('status').notNull().default('staged'),
    revision: integer('revision').notNull().default(0),
    createdAt: text('created_at').notNull(),
    decisionId: text('decision_id'),
    decisionHash: text('decision_hash'),
    reviewedBy: text('reviewed_by').references(() => users.id),
    reviewedAt: text('reviewed_at'),
    reason: text('reason'),
  },
  (t) => [
    index('reading_import_drafts_school_creator').on(t.schoolId, t.createdBy),
    uniqueIndex('reading_import_decision_unique').on(t.decisionId),
  ],
);
export const readingImportItems = sqliteTable(
  'reading_import_items',
  {
    id: text('id').primaryKey(),
    importId: text('import_id')
      .notNull()
      .references(() => readingImportDrafts.id),
    readingCheckId: text('reading_check_id').notNull(),
    externalReference: text('external_reference').notNull(),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id),
    language: text('language').notNull(),
    passageReference: text('passage_reference').notNull(),
    readingDate: text('reading_date').notNull(),
    durationMs: integer('duration_ms').notNull(),
    wordsAttempted: integer('words_attempted').notNull(),
    wordsCorrect: integer('words_correct').notNull(),
  },
  (t) => [
    uniqueIndex('reading_import_item_reference').on(t.importId, t.externalReference),
    uniqueIndex('reading_import_item_check').on(t.readingCheckId),
  ],
);
export const readingImportReceipts = sqliteTable(
  'reading_import_receipts',
  {
    itemId: text('item_id')
      .primaryKey()
      .references(() => readingImportItems.id),
    schoolId: text('school_id')
      .notNull()
      .references(() => schools.id),
    sourceLabel: text('source_label').notNull(),
    externalReference: text('external_reference').notNull(),
    readingCheckId: text('reading_check_id')
      .notNull()
      .references(() => readingChecks.id),
    reviewedBy: text('reviewed_by')
      .notNull()
      .references(() => users.id),
    reviewedAt: text('reviewed_at').notNull(),
  },
  (t) => [
    uniqueIndex('reading_import_receipt_check').on(t.readingCheckId),
    uniqueIndex('reading_import_receipt_source').on(t.schoolId, t.sourceLabel, t.externalReference),
  ],
);
