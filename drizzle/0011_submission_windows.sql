CREATE TABLE `assignment_submission_windows` (
  `id` text PRIMARY KEY NOT NULL,
  `assignment_id` text NOT NULL REFERENCES `resource_assignments` (`id`),
  `revision` integer NOT NULL,
  `state` text NOT NULL,
  `closes_at` text,
  `reviewed_by` text NOT NULL REFERENCES `users` (`id`),
  `reviewed_at` text NOT NULL,
  `reason` text NOT NULL,
  `request_hash` text NOT NULL,
  CONSTRAINT `assignment_submission_windows_revision` CHECK (typeof(`revision`) = 'integer' AND `revision` BETWEEN 1 AND 1000000),
  CONSTRAINT `assignment_submission_windows_state` CHECK (`state` IN ('open', 'closed')),
  CONSTRAINT `assignment_submission_windows_reason` CHECK (length(trim(`reason`)) BETWEEN 10 AND 500),
  CONSTRAINT `assignment_submission_windows_closing` CHECK ((`state` = 'open' OR `closes_at` IS NULL) AND (`closes_at` IS NULL OR (length(`closes_at`) = 24 AND substr(`closes_at`, 24, 1) = 'Z' AND julianday(`closes_at`) IS NOT NULL)))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assignment_submission_windows_assignment_revision` ON `assignment_submission_windows` (`assignment_id`, `revision`);
--> statement-breakpoint
CREATE TRIGGER `assignment_submission_windows_no_update` BEFORE UPDATE ON `assignment_submission_windows`
BEGIN SELECT RAISE(ABORT, 'Submission-window reviews are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `assignment_submission_windows_no_delete` BEFORE DELETE ON `assignment_submission_windows`
BEGIN SELECT RAISE(ABORT, 'Submission-window reviews are immutable'); END;
