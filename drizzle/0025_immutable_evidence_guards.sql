-- Additive defence in depth: DB-level immutability for append-only evidence the API contract already calls immutable.
-- Approval columns of resource_versions and curriculum_reference_versions stay updatable (explicit review, FR-14/FR-22);
-- every content column is frozen. One trigger per statement piece (hosted runner splits on the breakpoint marker).
CREATE TRIGGER submission_attempts_no_update BEFORE UPDATE ON submission_attempts BEGIN SELECT RAISE(ABORT,'Submission attempts are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER submission_attempts_no_delete BEFORE DELETE ON submission_attempts BEGIN SELECT RAISE(ABORT,'Submission attempts are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER submission_feedback_no_update BEFORE UPDATE ON submission_feedback BEGIN SELECT RAISE(ABORT,'Submission feedback is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER submission_feedback_no_delete BEFORE DELETE ON submission_feedback BEGIN SELECT RAISE(ABORT,'Submission feedback is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER identity_admin_events_no_update BEFORE UPDATE ON identity_admin_events BEGIN SELECT RAISE(ABORT,'Account administration events are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER identity_admin_events_no_delete BEFORE DELETE ON identity_admin_events BEGIN SELECT RAISE(ABORT,'Account administration events are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER reading_checks_no_update BEFORE UPDATE ON reading_checks BEGIN SELECT RAISE(ABORT,'Reading checks are immutable; corrections are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER reading_checks_no_delete BEFORE DELETE ON reading_checks BEGIN SELECT RAISE(ABORT,'Reading checks are immutable; corrections are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER resource_assignments_no_update BEFORE UPDATE ON resource_assignments BEGIN SELECT RAISE(ABORT,'Resource assignments are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER resource_assignments_no_delete BEFORE DELETE ON resource_assignments BEGIN SELECT RAISE(ABORT,'Resource assignments are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER resource_reference_bindings_no_update BEFORE UPDATE ON resource_reference_bindings BEGIN SELECT RAISE(ABORT,'Resource reference bindings are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER resource_reference_bindings_no_delete BEFORE DELETE ON resource_reference_bindings BEGIN SELECT RAISE(ABORT,'Resource reference bindings are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER resource_versions_content_immutable BEFORE UPDATE OF id, resource_id, version, title, type, curriculum, grade_level, subject, language, objectives, body, teacher_notes, answer_key, created_by, created_at ON resource_versions BEGIN SELECT RAISE(ABORT,'Resource version content is immutable; save a new version'); END;
--> statement-breakpoint
CREATE TRIGGER resource_versions_no_delete BEFORE DELETE ON resource_versions BEGIN SELECT RAISE(ABORT,'Resource versions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER curriculum_reference_versions_content_immutable BEFORE UPDATE OF id, reference_id, version, title, curriculum, grade_level, subject, language, objectives, body, rights_statement, source_reference, source_url, created_by, created_at ON curriculum_reference_versions BEGIN SELECT RAISE(ABORT,'Curriculum version content is immutable; save a new version'); END;
--> statement-breakpoint
CREATE TRIGGER curriculum_reference_versions_no_delete BEFORE DELETE ON curriculum_reference_versions BEGIN SELECT RAISE(ABORT,'Curriculum versions are immutable'); END;
