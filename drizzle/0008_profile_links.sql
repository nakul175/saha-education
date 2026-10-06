CREATE TABLE `profile_link_versions` (
  `profile_type` text NOT NULL,
  `profile_id` text NOT NULL,
  `student_id` text REFERENCES `students`(`id`),
  `guardian_id` text REFERENCES `guardians`(`id`),
  `version` integer NOT NULL,
  PRIMARY KEY (`profile_type`, `profile_id`),
  CONSTRAINT `profile_link_versions_target` CHECK (
    (profile_type = 'student' AND student_id IS NOT NULL AND student_id = profile_id AND guardian_id IS NULL) OR
    (profile_type = 'guardian' AND guardian_id IS NOT NULL AND guardian_id = profile_id AND student_id IS NULL)),
  CONSTRAINT `profile_link_versions_number` CHECK (typeof(version) = 'integer' AND version BETWEEN 1 AND 1000000)
);
--> statement-breakpoint
CREATE TABLE `profile_link_events` (
  `id` text PRIMARY KEY NOT NULL,
  `school_id` text NOT NULL REFERENCES `schools`(`id`),
  `actor_id` text NOT NULL REFERENCES `users`(`id`),
  `profile_type` text NOT NULL,
  `profile_id` text NOT NULL,
  `student_id` text REFERENCES `students`(`id`),
  `guardian_id` text REFERENCES `guardians`(`id`),
  `previous_user_id` text REFERENCES `users`(`id`),
  `next_user_id` text REFERENCES `users`(`id`),
  `expected_version` integer NOT NULL,
  `resulting_version` integer NOT NULL,
  `reason` text NOT NULL,
  `reviewed_at` text NOT NULL,
  `request_hash` text NOT NULL,
  `attempt_id` text NOT NULL,
  CONSTRAINT `profile_link_events_target` CHECK (
    (profile_type = 'student' AND student_id IS NOT NULL AND student_id = profile_id AND guardian_id IS NULL) OR
    (profile_type = 'guardian' AND guardian_id IS NOT NULL AND guardian_id = profile_id AND student_id IS NULL)),
  CONSTRAINT `profile_link_events_number` CHECK (typeof(expected_version) = 'integer' AND typeof(resulting_version) = 'integer' AND expected_version BETWEEN 0 AND 999999 AND resulting_version = expected_version + 1),
  CONSTRAINT `profile_link_events_changed` CHECK (previous_user_id IS NOT next_user_id),
  CONSTRAINT `profile_link_events_reason` CHECK (length(reason) BETWEEN 10 AND 500)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_link_events_revision` ON `profile_link_events` (`profile_type`, `profile_id`, `resulting_version`);
--> statement-breakpoint
CREATE INDEX `profile_link_events_school_time` ON `profile_link_events` (`school_id`, `reviewed_at`);
--> statement-breakpoint
CREATE TRIGGER `profile_link_events_no_update` BEFORE UPDATE ON `profile_link_events`
BEGIN SELECT RAISE(ABORT, 'Profile link events are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `profile_link_events_no_delete` BEFORE DELETE ON `profile_link_events`
BEGIN SELECT RAISE(ABORT, 'Profile link events are immutable'); END;
--> statement-breakpoint
-- Existing duplicate guardian bindings are preserved, but new or changed
-- bindings cannot introduce another profile for the same login account.
CREATE TRIGGER `guardians_unique_login_insert` BEFORE INSERT ON `guardians`
WHEN NEW.user_id IS NOT NULL AND EXISTS (SELECT 1 FROM guardians WHERE user_id = NEW.user_id)
BEGIN SELECT RAISE(ABORT, 'Guardian login already linked'); END;
--> statement-breakpoint
CREATE TRIGGER `guardians_unique_login_change` BEFORE UPDATE OF `user_id` ON `guardians`
WHEN NEW.user_id IS NOT NULL AND NEW.user_id IS NOT OLD.user_id AND EXISTS
  (SELECT 1 FROM guardians WHERE user_id = NEW.user_id AND id <> NEW.id)
BEGIN SELECT RAISE(ABORT, 'Guardian login already linked'); END;
