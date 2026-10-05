CREATE TABLE `submission_attempts` (
  `id` text PRIMARY KEY NOT NULL,
  `assignment_id` text NOT NULL REFERENCES `resource_assignments`(`id`),
  `version_id` text NOT NULL REFERENCES `resource_versions`(`id`),
  `student_id` text NOT NULL REFERENCES `students`(`id`),
  `submitted_by` text NOT NULL REFERENCES `users`(`id`),
  `attempt` integer NOT NULL,
  `response` text NOT NULL,
  `created_at` text NOT NULL,
  CONSTRAINT `submission_attempts_positive` CHECK (typeof(`attempt`) = 'integer' AND `attempt` BETWEEN 1 AND 1000001),
  CONSTRAINT `submission_attempts_response` CHECK (length(trim(`response`)) BETWEEN 1 AND 20000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submission_attempts_assignment_student_number` ON `submission_attempts` (`assignment_id`, `student_id`, `attempt`);
--> statement-breakpoint
CREATE INDEX `submission_attempts_assignment` ON `submission_attempts` (`assignment_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE `submission_feedback` (
  `id` text PRIMARY KEY NOT NULL,
  `submission_id` text NOT NULL REFERENCES `submission_attempts`(`id`),
  `revision` integer NOT NULL,
  `feedback` text NOT NULL,
  `reviewed_by` text NOT NULL REFERENCES `users`(`id`),
  `reviewed_at` text NOT NULL,
  CONSTRAINT `submission_feedback_positive` CHECK (typeof(`revision`) = 'integer' AND `revision` BETWEEN 1 AND 1000001),
  CONSTRAINT `submission_feedback_text` CHECK (length(trim(`feedback`)) BETWEEN 1 AND 8000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submission_feedback_submission_revision` ON `submission_feedback` (`submission_id`, `revision`);
--> statement-breakpoint
CREATE INDEX `submission_feedback_submission` ON `submission_feedback` (`submission_id`);
