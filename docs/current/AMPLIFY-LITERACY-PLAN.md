# AmplifiU-inspired teacher workspace and reading integration

Draft for product review, 5 October 2026. The sponsor confirmed **AmplifiU** as the intended reference. This replaces the earlier conditional mCLASS/Boost Reading comparison. The existing filename is retained to preserve links. No hosted deployment, external account connection or AI generation service has been enabled.

## Confirmed reference and proposed Saha capability

[AmplifiU’s official product page](https://amplifiu.com/) describes teacher-controlled creation of curriculum-aligned resources, including lesson plans, activities, quizzes and worksheets. It lists Indian and Australian curriculum support, Google Classroom/system integration, and Word, Google Docs, PowerPoint and PDF exports. These are vendor-published capabilities, not independently tested integration contracts.

| Teacher workflow | Current Saha coverage | Proposed original Saha capability |
|---|---|---|
| Curriculum and lesson planning | Courses, classes, assessments; no curriculum authoring workspace | Select curriculum, grade, subject, language and learning objectives; create lesson/unit drafts |
| Resource creation | Assessment records; no reviewed resource library | Lesson plans, worksheets, quizzes and classroom activities from original templates |
| Teacher editing and review | Staff access controls; no resource revision workflow | Editable drafts, version history, teacher approval before publication |
| Differentiated practice | Manually reviewed external ORF records | Teacher chooses a support focus and assigns reviewed practice; ORF informs fluency support, not unrelated subject mastery |
| Assignment and reuse | Authorized class rosters | Assign approved resource versions to authorized classes; reuse school-approved templates |
| Exports and external systems | Separate ORF app launch; no external result sync | Begin with print/export; add platform adapters only after verifying their supported contracts |

Saha should implement an original workflow and content library. No AmplifiU prompts, proprietary resources, user accounts or efficacy claims are imported. The reviewed sources do not establish a public AmplifiU API or SSO contract. A similar Saha product does not require a direct AmplifiU integration.

## Proposed workflow: choose → draft → review → assign → reflect

1. **Choose:** Teacher selects the curriculum/version, grade, subject, language and objectives. The school defines allowed curricula and original/licensed reference materials.
2. **Draft:** Start from structured templates for lessons, worksheets, activities and quizzes. A future AI assistant may suggest content with explicit references and assumptions; generation remains a draft.
3. **Review:** Teacher edits facts, language, difficulty, questions, answer keys and accommodations. Approval records the reviewer and exact version. Missing references and unsupported claims are visible.
4. **Assign:** Publish a reviewed version to authorized classes. Students receive only assigned, published resources. Guardian access follows an explicit publication policy.
5. **Reflect:** Teacher reviews completion and assessment evidence, revises future resources, and chooses further teaching or practice. Preserve the assigned version when a later draft changes.

The workspace belongs inside Saha and uses its existing school, teacher and class authorization. For the first delivery, templates and manual editing make the workflow useful without enabling an AI provider.

## Oral reading remains a separate integration

The implemented `/external-apps` screen supports staff-only launch to a trusted configured HTTPS destination and manual entry of reviewed reading counts. It sends no student identifiers or Saha credentials, uses separate sign-in and has no automatic result synchronization. Records preserve immutable source/recorder/date/count provenance; matching retry keys are safe and conflicting reuse is rejected. These are manually entered observations, not authenticated external exports.

Language Studio is the strongest repository candidate: inspected code supports adult-guided English/Hindi activities and reviewed oral reading. The sponsor has not yet confirmed it as the intended ORF app. Its documented address could not be verified live; inspected authentication uses its own Sites dispatcher and no supported external launch/result API was found. Keep `SAHA_ORF_APP_URL` blank until the actual destination is confirmed.

Reading rate and accuracy can inform a teacher’s choice of fluency practice. They cannot establish comprehension, subject knowledge, diagnostic risk or grade-level norms by themselves. Comparable-reading trends require compatible language, passage difficulty and administration. No audio or transcript is collected in the current Saha tracker. Correction history, family visibility and retention need an agreed policy.

## Proposed resource model and access rules

| Entity | Proposed fields and rules |
|---|---|
| Curriculum reference | School, framework/version, grade/subject/language, objectives, source/license references |
| Resource | School, author, type, title, curriculum reference; stable identity |
| Resource version | Immutable version number, structured content, reference sources, creation method, author/reviewer and draft/approved state |
| Assignment | Class, approved resource version, assigning teacher, due date and publication state |
| Review/generation event | Attributed edits/approval; if AI is added, provider/model/prompt-template version and source references without exposing credentials |

Every service must derive school/author from the verified session and check teacher class assignment. Clients cannot approve on behalf of another reviewer or assign resources to unrelated classes. Students cannot read drafts. Content renders as text or sanitized structured blocks. Concurrent edits need version checks; publishing and assignment require repeat-safe writes. AI outputs must pass schema/length checks and cannot execute instructions or change access policy.

## Phased delivery and exit evidence

| Phase | Scope | Exit evidence |
|---|---|---|
| A: Teacher workspace | Original resource templates, structured editor, school-scoped drafts and revision history | Draft CRUD/version checks, cross-school denial, useful teacher-reviewed examples |
| B: Review and class assignment | Approval, immutable assigned versions, teacher class checks, student published view and printable output | Unassigned-teacher/student-draft denial, safe publication retries, version-preservation tests and staff/student UAT |
| C: Optional AI drafting | Confirm provider/configuration, ground in approved curricula, draft suggestions and editable answer keys | Synthetic-only generation checks, source/assumption display, review gate, failure handling and cost limits |
| D: Reading-informed practice | Teacher-selected practice focus using reviewed ORF observations; reuse confirmed Language Studio where suitable | Explicit teacher approval, suitable original content, language-specific review and no automatic diagnostic labels |
| E: External adapters and evaluation | Verify Google Classroom/export/app contracts as required; curriculum and accessibility pilots | Contract-specific authorization tests, educator review, export fidelity and documented pilot evidence |

The [teacher workspace candidate](TEACHER-WORKSPACE.md) now implements structured manual drafts, revision history, exact-version review, class assignments, learner-safe content and browser printing. AI drafting and external adapters remain planned. Current scope also includes authentication/access, external launch configuration and manual reviewed ORF records.

## Remaining decisions

- Confirm the actual ORF application and destination; Language Studio remains a candidate.
- Supply the existing sign-in provider/tenant and registered application details.
- Choose the first curriculum, grades, subject and languages. CBSE/NCERT may be a reasonable proposed starting point, but is not yet approved.
- Select the first resource templates and nominate teacher reviewers.
- For AI drafting, choose the provider and authorized credentials, source material, budget and retention rules before service activation.
- Agree publication/correction policy and whether external Classroom integration or document export is needed first.

The next concrete step is educator validation of the teacher workspace and selection of the pilot curriculum/templates, before optional AI drafting or external adapters. ORF integration continues separately while its destination is confirmed.
