import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { readingChecks, users } from './schema';

// Corrections retain the original observation rather than changing its evidence.
export const readingCorrections = sqliteTable(
  'reading_corrections',
  {
    id: text('id').primaryKey(),
    readingCheckId: text('reading_check_id')
      .notNull()
      .references(() => readingChecks.id),
    revision: integer('revision').notNull(),
    correctedBy: text('corrected_by')
      .notNull()
      .references(() => users.id),
    correctedAt: text('corrected_at').notNull(),
    reason: text('reason').notNull(),
    language: text('language').notNull(),
    passageReference: text('passage_reference').notNull(),
    readingDate: text('reading_date').notNull(),
    durationMs: integer('duration_ms').notNull(),
    wordsAttempted: integer('words_attempted').notNull(),
    wordsCorrect: integer('words_correct').notNull(),
  },
  (t) => [
    uniqueIndex('reading_corrections_check_revision').on(t.readingCheckId, t.revision),
    index('reading_corrections_actor').on(t.correctedBy, t.correctedAt),
    check(
      'reading_corrections_revision',
      sql`typeof(${t.revision}) = 'integer' AND ${t.revision} BETWEEN 1 AND 1000000`,
    ),
    check('reading_corrections_reason', sql`length(trim(${t.reason})) BETWEEN 1 AND 1000`),
    check(
      'reading_corrections_duration',
      sql`typeof(${t.durationMs}) = 'integer' AND ${t.durationMs} BETWEEN 1000 AND 3600000`,
    ),
    check(
      'reading_corrections_word_counts',
      sql`typeof(${t.wordsAttempted}) = 'integer' AND typeof(${t.wordsCorrect}) = 'integer' AND ${t.wordsAttempted} BETWEEN 1 AND 500 AND ${t.wordsCorrect} BETWEEN 0 AND ${t.wordsAttempted}`,
    ),
  ],
);

export type SelectReadingCorrection = typeof readingCorrections.$inferSelect;
