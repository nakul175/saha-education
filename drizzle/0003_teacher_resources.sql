CREATE TABLE `resource_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`resource_id` text NOT NULL,
	`version_id` text NOT NULL,
	`class_id` text NOT NULL,
	`assigned_by` text NOT NULL,
	`created_at` text NOT NULL,
	`due_date` text,
	FOREIGN KEY (`resource_id`) REFERENCES `teaching_resources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `resource_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resource_assignments_version_class` ON `resource_assignments` (`version_id`,`class_id`);--> statement-breakpoint
CREATE INDEX `resource_assignments_class` ON `resource_assignments` (`class_id`);--> statement-breakpoint
CREATE TABLE `resource_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`resource_id` text NOT NULL,
	`version` integer NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`curriculum` text NOT NULL,
	`grade_level` text NOT NULL,
	`subject` text NOT NULL,
	`language` text NOT NULL,
	`objectives` text NOT NULL,
	`body` text NOT NULL,
	`teacher_notes` text NOT NULL,
	`answer_key` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`approved_by` text,
	`approved_at` text,
	FOREIGN KEY (`resource_id`) REFERENCES `teaching_resources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "resource_versions_positive" CHECK(typeof("resource_versions"."version") = 'integer' AND "resource_versions"."version" >= 1),
	CONSTRAINT "resource_versions_type" CHECK("resource_versions"."type" IN ('lesson', 'worksheet', 'quiz', 'activity')),
	CONSTRAINT "resource_versions_approval_pair" CHECK(("resource_versions"."approved_by" IS NULL AND "resource_versions"."approved_at" IS NULL) OR ("resource_versions"."approved_by" IS NOT NULL AND "resource_versions"."approved_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resource_versions_resource_number` ON `resource_versions` (`resource_id`,`version`);--> statement-breakpoint
CREATE TABLE `teaching_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`author_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `teaching_resources_school_author` ON `teaching_resources` (`school_id`,`author_id`);