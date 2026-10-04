PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`student_id` text NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	`note` text,
	`recorded_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_attendance`("id", "class_id", "student_id", "date", "status", "note", "recorded_by", "created_at", "updated_at") SELECT "id", "class_id", "student_id", "date", "status", "note", "recorded_by", "created_at", "updated_at" FROM `attendance`;--> statement-breakpoint
DROP TABLE `attendance`;--> statement-breakpoint
ALTER TABLE `__new_attendance` RENAME TO `attendance`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_unique` ON `attendance` (`class_id`,`student_id`,`date`);--> statement-breakpoint
DROP INDEX `assessment_results_assessment`;--> statement-breakpoint
DROP INDEX `assessment_results_student`;--> statement-breakpoint
DROP INDEX `assessment_results_unique`;--> statement-breakpoint
DROP INDEX `assessments_class`;--> statement-breakpoint
DROP INDEX `assessments_date`;--> statement-breakpoint
DROP INDEX `classes_school`;--> statement-breakpoint
DROP INDEX `classes_course`;--> statement-breakpoint
DROP INDEX `classes_teacher`;--> statement-breakpoint
DROP INDEX `courses_school`;--> statement-breakpoint
DROP INDEX `courses_code_school`;--> statement-breakpoint
CREATE UNIQUE INDEX `courses_code_unique` ON `courses` (`code`);--> statement-breakpoint
DROP INDEX `enrolments_student`;--> statement-breakpoint
DROP INDEX `enrolments_class`;--> statement-breakpoint
DROP INDEX `enrolments_student_class`;--> statement-breakpoint
DROP INDEX `guardians_user`;--> statement-breakpoint
DROP INDEX `notifications_user`;--> statement-breakpoint
DROP INDEX `notifications_read`;--> statement-breakpoint
CREATE TABLE `__new_report_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`term` text NOT NULL,
	`summary` text,
	`overall_grade` text NOT NULL,
	`published_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_report_cards`("id", "student_id", "term", "summary", "overall_grade", "published_at", "created_at", "updated_at") SELECT "id", "student_id", "term", "summary", "overall_grade", "published_at", "created_at", "updated_at" FROM `report_cards`;--> statement-breakpoint
DROP TABLE `report_cards`;--> statement-breakpoint
ALTER TABLE `__new_report_cards` RENAME TO `report_cards`;--> statement-breakpoint
DROP INDEX `students_school`;--> statement-breakpoint
DROP INDEX `students_admission`;--> statement-breakpoint
DROP INDEX `users_email`;--> statement-breakpoint
ALTER TABLE `student_guardians` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `student_guardians` DROP COLUMN `updated_at`;