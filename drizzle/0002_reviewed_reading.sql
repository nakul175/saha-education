CREATE TABLE `reading_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`class_id` text NOT NULL,
	`student_id` text NOT NULL,
	`recorded_by` text NOT NULL,
	`source_app_id` text NOT NULL,
	`provenance` text NOT NULL,
	`language` text NOT NULL,
	`passage_reference` text NOT NULL,
	`reading_date` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`words_attempted` integer NOT NULL,
	`words_correct` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "reading_checks_duration" CHECK(typeof("reading_checks"."duration_ms") = 'integer' AND "reading_checks"."duration_ms" BETWEEN 1000 AND 3600000),
	CONSTRAINT "reading_checks_word_counts" CHECK(typeof("reading_checks"."words_attempted") = 'integer' AND typeof("reading_checks"."words_correct") = 'integer' AND "reading_checks"."words_attempted" BETWEEN 1 AND 500 AND "reading_checks"."words_correct" BETWEEN 0 AND "reading_checks"."words_attempted"),
	CONSTRAINT "reading_checks_source" CHECK("reading_checks"."source_app_id" = 'oral-reading-fluency' AND "reading_checks"."provenance" = 'manual-reviewed-external')
);
--> statement-breakpoint
CREATE INDEX `reading_checks_school_student` ON `reading_checks` (`school_id`,`student_id`,`reading_date`);--> statement-breakpoint
CREATE INDEX `reading_checks_class` ON `reading_checks` (`class_id`,`reading_date`);