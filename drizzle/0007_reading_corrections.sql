CREATE TABLE `reading_corrections` (
  `id` text PRIMARY KEY NOT NULL,
  `reading_check_id` text NOT NULL REFERENCES `reading_checks` (`id`),
  `revision` integer NOT NULL,
  `corrected_by` text NOT NULL REFERENCES `users` (`id`),
  `corrected_at` text NOT NULL,
  `reason` text NOT NULL,
  `language` text NOT NULL,
  `passage_reference` text NOT NULL,
  `reading_date` text NOT NULL,
  `duration_ms` integer NOT NULL,
  `words_attempted` integer NOT NULL,
  `words_correct` integer NOT NULL,
  CONSTRAINT `reading_corrections_revision` CHECK (typeof(`revision`) = 'integer' AND `revision` BETWEEN 1 AND 1000000),
  CONSTRAINT `reading_corrections_reason` CHECK (length(trim(`reason`)) BETWEEN 1 AND 1000),
  CONSTRAINT `reading_corrections_duration` CHECK (typeof(`duration_ms`) = 'integer' AND `duration_ms` BETWEEN 1000 AND 3600000),
  CONSTRAINT `reading_corrections_word_counts` CHECK (typeof(`words_attempted`) = 'integer' AND typeof(`words_correct`) = 'integer' AND `words_attempted` BETWEEN 1 AND 500 AND `words_correct` BETWEEN 0 AND `words_attempted`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reading_corrections_check_revision` ON `reading_corrections` (`reading_check_id`, `revision`);
--> statement-breakpoint
CREATE INDEX `reading_corrections_actor` ON `reading_corrections` (`corrected_by`, `corrected_at`);
--> statement-breakpoint
CREATE TRIGGER `reading_corrections_no_update` BEFORE UPDATE ON `reading_corrections`
BEGIN SELECT RAISE(ABORT, 'Reading corrections are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `reading_corrections_no_delete` BEFORE DELETE ON `reading_corrections`
BEGIN SELECT RAISE(ABORT, 'Reading corrections are immutable'); END;
