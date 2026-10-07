-- Additive reviewed role and sign-in identity changes. Existing identity_admin_events,
-- identity_admin_user_versions, users and profile rows are untouched.
CREATE TABLE `identity_admin_changes` (
  `id` text PRIMARY KEY NOT NULL,
  `school_id` text NOT NULL REFERENCES `schools`(`id`),
  `actor_id` text NOT NULL REFERENCES `users`(`id`),
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `action` text NOT NULL,
  `reason` text NOT NULL,
  `reviewed_at` text NOT NULL,
  `previous_role` text NOT NULL,
  `next_role` text NOT NULL,
  `previous_issuer` text,
  `previous_subject` text,
  `next_issuer` text,
  `next_subject` text,
  `expected_version` integer NOT NULL,
  `resulting_version` integer NOT NULL,
  `request_hash` text NOT NULL,
  `attempt_id` text NOT NULL,
  CONSTRAINT `identity_admin_changes_action` CHECK (action IN ('change_role', 'link_identity', 'unlink_identity')),
  CONSTRAINT `identity_admin_changes_roles` CHECK (previous_role IN ('admin', 'teacher', 'guardian', 'student') AND next_role IN ('admin', 'teacher', 'guardian', 'student')),
  CONSTRAINT `identity_admin_changes_versions` CHECK (typeof(expected_version) = 'integer' AND typeof(resulting_version) = 'integer' AND expected_version >= 0 AND resulting_version = expected_version + 1),
  CONSTRAINT `identity_admin_changes_reason` CHECK (length(reason) BETWEEN 10 AND 500)
);
--> statement-breakpoint
CREATE INDEX `identity_admin_changes_school_reviewed` ON `identity_admin_changes` (`school_id`, `reviewed_at`);
--> statement-breakpoint
CREATE INDEX `identity_admin_changes_user` ON `identity_admin_changes` (`user_id`);
--> statement-breakpoint
CREATE TRIGGER `identity_admin_changes_no_update` BEFORE UPDATE ON `identity_admin_changes`
BEGIN SELECT RAISE(ABORT, 'Identity administration changes are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `identity_admin_changes_no_delete` BEFORE DELETE ON `identity_admin_changes`
BEGIN SELECT RAISE(ABORT, 'Identity administration changes are immutable'); END;
