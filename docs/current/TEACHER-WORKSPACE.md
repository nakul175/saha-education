# Teacher resource workspace

Implementation candidate, 5 October 2026, on `feat/teacher-resource-workspace`. Depends on the authentication/access and external-reading candidates. No live provider, hosted deployment or AI service has been activated.

## User workflow

School administrators and teachers create lessons, worksheets, quizzes and activities at `/resources`. Original structured templates provide prompts for manual editing. Staff enter the curriculum/version, grade, subject, language, objectives, learner-facing content, private teacher notes and answer keys. Curriculum labels are user-entered references; the product does not claim independently verified curriculum alignment.

Saving creates an immutable numbered content version. Editing appends a new version using the expected latest version, so stale concurrent edits conflict instead of replacing newer work. Teachers explicitly review and approve an exact version. Self-review by the author is allowed in this initial workflow; approval is not an independent educator certification. A later version needs its own approval. Approved versions can be assigned to an authorized class, with an optional due date. Changes to a draft do not change content already assigned.

Students view their active-class assignments at `/learning`. Teacher notes and answer keys are removed by the server, not just hidden in the screen. Printable resources use the exact approved version; a staff-only teacher edition may include those private fields when explicitly requested. Guardians cannot view assignments in this stage.

## Authority and storage

Teachers manage their own resources; administrators manage resources within their school. Every service requires the verified principal. Author, school, version number, recorder/reviewer and timestamps are derived on the server. Clients cannot assign resources to unrelated classes, approve another school’s version, or retrieve staff drafts as a learner. Approval and matching assignment retries are safe; changed retry inputs conflict rather than modify established records.

Migration0003 adds teaching resources, resource versions and class assignments. Resource creation batches the stable resource record and first version atomically. Versions preserve content history; unique version numbers reject concurrent conflicting edits. Approval records a one-time reviewer and timestamp on the exact content version. Assignments retain that version ID. There are no deletion endpoints or automatic notifications.

All content renders as plain text. This is resource distribution, not a student submission/grading system. No online quiz scoring, AI generation, external curriculum import, Google Classroom adapter, Word/PDF file export, AI cost accounting or ORF-driven automatic assignment is implemented. Browser printing is available for reviewed resources.

## Draft requirements and acceptance boundary

| ID | Proposed requirement | Evidence / limits |
|---|---|---|
| TCH-01 | Staff create structured resource drafts with school/author scope | Resource service/API contract and synthetic served checks; teacher usability acceptance pending |
| TCH-02 | Edits append versions and reject stale changes | Version preservation and conflict scenarios; no deletion or rollback workflow |
| TCH-03 | Approve and assign exact reviewed versions only | Approval/assignment checks; self-review permitted, independent reviewer policy pending |
| TCH-04 | Learners see only active-class assignments without private notes or keys | Real-session and served access checks; guardian publication pending |
| TCH-05 | Print the selected approved version | Browser verification required; document-file exports planned later |

The original [AmplifiU-inspired plan](AMPLIFY-LITERACY-PLAN.md) remains the product reference. This stage implements the manual workspace and assignments before optional AI drafting. Identity provider, pilot curriculum/grades/languages, ORF destination, reviewer/publication policy and broader UAT remain open decisions.
