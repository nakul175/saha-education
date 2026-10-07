-- Additive school setup and student/guardian record administration. Existing
-- profiles, links, enrolments and receipts are not rewritten or backfilled.
-- Every statement is its own breakpoint piece for the hosted statement runner.
CREATE TABLE `school_setup_terms` (
  `id` text PRIMARY KEY NOT NULL,
  `school_id` text NOT NULL REFERENCES `schools`(`id`),
  `academic_year` text NOT NULL,
  `name` text NOT NULL,
  `starts_on` text NOT NULL,
  `ends_on` text NOT NULL,
  `version` integer NOT NULL,
  `created_by` text NOT NULL REFERENCES `users`(`id`),
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `school_setup_terms_year` CHECK (length(`academic_year`) BETWEEN 1 AND 20 AND `academic_year` = trim(`academic_year`)),
  CONSTRAINT `school_setup_terms_name` CHECK (length(`name`) BETWEEN 1 AND 60 AND `name` = trim(`name`)),
  CONSTRAINT `school_setup_terms_dates` CHECK (date(`starts_on`) IS `starts_on` AND date(`ends_on`) IS `ends_on` AND `ends_on` >= `starts_on`),
  CONSTRAINT `school_setup_terms_version` CHECK (typeof(`version`) = 'integer' AND `version` BETWEEN 1 AND 1000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `school_setup_terms_name_unique` ON `school_setup_terms` (`school_id`, `academic_year`, `name`);
--> statement-breakpoint
CREATE INDEX `school_setup_terms_school_start` ON `school_setup_terms` (`school_id`, `starts_on`);
--> statement-breakpoint
CREATE TABLE `school_setup_settings` (
  `school_id` text PRIMARY KEY NOT NULL REFERENCES `schools`(`id`),
  `academic_year` text,
  `contact_email` text,
  `contact_phone` text,
  `current_term_id` text REFERENCES `school_setup_terms`(`id`),
  `version` integer NOT NULL,
  `updated_by` text NOT NULL REFERENCES `users`(`id`),
  `updated_at` text NOT NULL,
  CONSTRAINT `school_setup_settings_year` CHECK (`academic_year` IS NULL OR (length(`academic_year`) BETWEEN 1 AND 20 AND `academic_year` = trim(`academic_year`))),
  CONSTRAINT `school_setup_settings_email` CHECK (`contact_email` IS NULL OR (length(`contact_email`) BETWEEN 3 AND 254 AND instr(`contact_email`, '@') > 1)),
  CONSTRAINT `school_setup_settings_phone` CHECK (`contact_phone` IS NULL OR length(`contact_phone`) BETWEEN 3 AND 30),
  CONSTRAINT `school_setup_settings_version` CHECK (typeof(`version`) = 'integer' AND `version` BETWEEN 1 AND 1000000)
);
--> statement-breakpoint
CREATE TABLE `student_record_status` (
  `student_id` text PRIMARY KEY NOT NULL REFERENCES `students`(`id`),
  `status` text NOT NULL,
  `version` integer NOT NULL,
  `changed_by` text NOT NULL REFERENCES `users`(`id`),
  `changed_at` text NOT NULL,
  CONSTRAINT `student_record_status_value` CHECK (`status` IN ('active', 'inactive')),
  CONSTRAINT `student_record_status_version` CHECK (typeof(`version`) = 'integer' AND `version` BETWEEN 1 AND 1000000)
);
--> statement-breakpoint
CREATE TABLE `student_status_events` (
  `id` text PRIMARY KEY NOT NULL,
  `school_id` text NOT NULL REFERENCES `schools`(`id`),
  `student_id` text NOT NULL REFERENCES `students`(`id`),
  `actor_id` text NOT NULL REFERENCES `users`(`id`),
  `action` text NOT NULL,
  `expected_version` integer NOT NULL,
  `resulting_version` integer NOT NULL,
  `reason` text NOT NULL,
  `withdrawn_enrolments` integer NOT NULL,
  `created_at` text NOT NULL,
  `request_hash` text NOT NULL,
  `attempt_id` text NOT NULL,
  CONSTRAINT `student_status_events_action` CHECK (`action` IN ('deactivate', 'reactivate')),
  CONSTRAINT `student_status_events_number` CHECK (typeof(`expected_version`) = 'integer' AND typeof(`resulting_version`) = 'integer' AND `expected_version` BETWEEN 0 AND 999999 AND `resulting_version` = `expected_version` + 1),
  CONSTRAINT `student_status_events_reason` CHECK (length(`reason`) BETWEEN 10 AND 500),
  CONSTRAINT `student_status_events_withdrawn` CHECK (typeof(`withdrawn_enrolments`) = 'integer' AND `withdrawn_enrolments` BETWEEN 0 AND 100000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_status_events_revision` ON `student_status_events` (`student_id`, `resulting_version`);
--> statement-breakpoint
CREATE INDEX `student_status_events_school_time` ON `student_status_events` (`school_id`, `created_at`);
--> statement-breakpoint
CREATE TRIGGER `student_status_events_no_update` BEFORE UPDATE ON `student_status_events` BEGIN SELECT RAISE(ABORT, 'Student status events are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `student_status_events_no_delete` BEFORE DELETE ON `student_status_events` BEGIN SELECT RAISE(ABORT, 'Student status events are immutable'); END;
--> statement-breakpoint
CREATE TABLE `student_guardian_details` (
  `student_id` text NOT NULL REFERENCES `students`(`id`),
  `guardian_id` text NOT NULL REFERENCES `guardians`(`id`),
  `relationship` text NOT NULL,
  PRIMARY KEY (`student_id`, `guardian_id`),
  CONSTRAINT `student_guardian_details_relationship` CHECK (length(`relationship`) BETWEEN 1 AND 60 AND `relationship` = trim(`relationship`))
);
--> statement-breakpoint
CREATE TABLE `student_guardian_events` (
  `id` text PRIMARY KEY NOT NULL,
  `school_id` text NOT NULL REFERENCES `schools`(`id`),
  `student_id` text NOT NULL REFERENCES `students`(`id`),
  `guardian_id` text NOT NULL REFERENCES `guardians`(`id`),
  `actor_id` text NOT NULL REFERENCES `users`(`id`),
  `action` text NOT NULL,
  `expected_version` integer NOT NULL,
  `resulting_version` integer NOT NULL,
  `relationship_before` text,
  `relationship_after` text,
  `primary_before` integer,
  `primary_after` integer,
  `reason` text NOT NULL,
  `created_at` text NOT NULL,
  `request_hash` text NOT NULL,
  `attempt_id` text NOT NULL,
  CONSTRAINT `student_guardian_events_action` CHECK (`action` IN ('link', 'update', 'unlink')),
  CONSTRAINT `student_guardian_events_number` CHECK (typeof(`expected_version`) = 'integer' AND typeof(`resulting_version`) = 'integer' AND `expected_version` BETWEEN 0 AND 999999 AND `resulting_version` = `expected_version` + 1),
  CONSTRAINT `student_guardian_events_reason` CHECK (length(`reason`) BETWEEN 10 AND 500)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_guardian_events_revision` ON `student_guardian_events` (`student_id`, `guardian_id`, `resulting_version`);
--> statement-breakpoint
CREATE INDEX `student_guardian_events_student_time` ON `student_guardian_events` (`student_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `student_guardian_events_school_time` ON `student_guardian_events` (`school_id`, `created_at`);
--> statement-breakpoint
CREATE TRIGGER `student_guardian_events_no_update` BEFORE UPDATE ON `student_guardian_events` BEGIN SELECT RAISE(ABORT, 'Guardian link events are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `student_guardian_events_no_delete` BEFORE DELETE ON `student_guardian_events` BEGIN SELECT RAISE(ABORT, 'Guardian link events are immutable'); END;
