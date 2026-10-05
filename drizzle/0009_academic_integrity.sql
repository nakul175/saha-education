-- Nonunique lookups preserve unresolved legacy rows. They deliberately do not
-- impose a unique index that would fail migration or remove confirmed evidence.
CREATE INDEX `enrolments_pair_lookup` ON `enrolments` (`student_id`, `class_id`);
--> statement-breakpoint
CREATE INDEX `assessment_results_pair_lookup` ON `assessment_results` (`assessment_id`, `student_id`);
--> statement-breakpoint
CREATE TRIGGER `enrolments_pair_insert_guard` BEFORE INSERT ON `enrolments`
WHEN EXISTS (SELECT 1 FROM `enrolments` WHERE `student_id` = NEW.`student_id` AND `class_id` = NEW.`class_id`)
BEGIN SELECT RAISE(ABORT, 'saha_enrolment_pair_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER `enrolments_pair_update_guard` BEFORE UPDATE OF `student_id`, `class_id` ON `enrolments`
WHEN (NEW.`student_id` <> OLD.`student_id` OR NEW.`class_id` <> OLD.`class_id`)
  AND EXISTS (SELECT 1 FROM `enrolments` WHERE `id` <> OLD.`id` AND `student_id` = NEW.`student_id` AND `class_id` = NEW.`class_id`)
BEGIN SELECT RAISE(ABORT, 'saha_enrolment_pair_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER `assessment_results_pair_insert_guard` BEFORE INSERT ON `assessment_results`
WHEN EXISTS (SELECT 1 FROM `assessment_results` WHERE `assessment_id` = NEW.`assessment_id` AND `student_id` = NEW.`student_id`)
BEGIN SELECT RAISE(ABORT, 'saha_result_pair_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER `assessment_results_pair_update_guard` BEFORE UPDATE OF `assessment_id`, `student_id` ON `assessment_results`
WHEN (NEW.`assessment_id` <> OLD.`assessment_id` OR NEW.`student_id` <> OLD.`student_id`)
  AND EXISTS (SELECT 1 FROM `assessment_results` WHERE `id` <> OLD.`id` AND `assessment_id` = NEW.`assessment_id` AND `student_id` = NEW.`student_id`)
BEGIN SELECT RAISE(ABORT, 'saha_result_pair_conflict'); END;
