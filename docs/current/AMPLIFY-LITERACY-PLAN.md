# Saha literacy product and external-app plan

Draft for product review, 5 October 2026. This plan accompanies the `feat/education-literacy-apps` implementation candidate. It separates verified Amplify product features, the repository's current capabilities, and proposed Saha work. It does not approve a provider, connect an external account, or establish learning outcomes.

## Product identification remains open

The user referred to “Amplify U.” Official Amplify Education pages reviewed did not establish a literacy product with that exact name. The comparison below assumes the intended reference is the mCLASS / Boost Reading literacy suite; confirm the product link before finalizing scope. This assumption does not authorize an Amplify integration.

## Verified reference features and Saha coverage

| Reference | Verified feature | Current Saha coverage | Proposed original capability |
|---|---|---|---|
| [mCLASS overview](https://amplify.com/programs/mclass/) | K–8 assessment, screening, progress monitoring, goals and instructional recommendations; assessment data informs its intervention/practice products. | Scoped schools, students, classes, assessment results and reports; no literacy-specific measures, norms or skill model. | Teacher-reviewed literacy observations, dated measure history and explicit skill evidence. |
| [mCLASS measure details](https://amplify.com/programs/mclass/mclass-program-details/) | Oral Reading Fluency measures connected-text reading; English grades 1–8, Spanish grades 1–6. Reports include student/class views and assessment transcripts. | A configured external ORF launch foundation; no numeric ORF tracker or automatic result synchronization. | Separate ORF engine, reviewed numeric observations, provenance and comparable-reading trends. |
| [Boost Reading](https://amplify.com/programs/boost-reading/) | K–5 independent adaptive practice; assessment-informed placement, skill trouble spots, teacher growth reports and CKLA alignment. Its Spanish partner Boost Lectura serves K–2. | Academic records and role access; no adaptive literacy practice. | Original practice activities and transparent skill progression; reuse an existing suitable practice app where confirmed. |
| [mCLASS Intervention](https://amplify.com/programs/mclass-intervention/) | Staff-led K–6 intervention; groups of 4–6, progress review every 10 days and targeted two-week lesson sequences. | Teacher class assignments and student records; no intervention grouping/lesson workflow. | Teacher-approved groups, original activity assignments and configurable review cycles. |
| [mCLASS Lectura](https://amplify.com/programs/mclass-lectura/) | Spanish K–6 assessment, language-specific measures and English/Spanish reporting. The assessment is designed for Spanish literacy rather than translated from English. | No verified language-specific assessment validation. | Independently designed language evidence and reporting for the chosen pilot languages. |

These are published product capabilities, not verification of their implementation internals. Amplify efficacy statements, screening validation, proprietary passages, lesson banks, benchmarks and scoring norms do not transfer to Saha. An ORF observation alone does not establish decoding, comprehension or dyslexia risk. Saha must use original or appropriately licensed content and describe its own evidence accurately.

## Proposed workflow: measure → review → teach → practice → recheck

1. **Measure:** Staff launch the separate ORF app and conduct the approved passage/task. Record its language, passage/version, duration and scoring method. Keep missing or interrupted measures distinct from a zero score.
2. **Review:** The teacher checks the numeric result and any available errors/audio, corrects it with attribution, and confirms whether it is usable. Automated scoring remains provisional until reviewed.
3. **Teach:** Use explicit evidence to identify a teaching focus. A teacher approves groups and original lessons, can override suggestions, and records the rationale.
4. **Practice:** Students receive short activities aligned to that focus and the chosen curriculum. Begin with deterministic, documented progression rules and teacher overrides; AI is not required for the first practice engine.
5. **Recheck:** Schedule another comparable measure, review it, and decide whether to continue, change instruction or collect more evidence. Practice attempts and screening/monitoring assessments remain distinguishable.

Rate and accuracy should be displayed separately. Any per-minute calculation must state the duration and denominator used. Only compare results when task, language, passage difficulty and administration conditions make that comparison defensible. Do not infer grade-level risk from an unvalidated cutoff or combine language scores into a single ranking.

## Integration model and authority

**Saha owns roster mappings, access policy and accepted result records.** Its school/teacher/guardian/student relationships determine which records may be viewed or changed. An external application cannot choose a school, grant a role or overwrite an approved result merely by returning an ID.

**The separate app owns the assessment/practice engine.** The current external-app foundation is launch-only, staff-only and configured by a trusted operator using `SAHA_ORF_APP_URL`. It returns a fixed HTTPS destination, adds no student or session information to the URL, uses separate sign-in and reports `resultSync: false`. No existing result API, shared authentication or live external integration has been verified. The actual ORF app repository, URL, owner and capabilities still need confirmation.

For phase one, staff can enter reviewed numeric observations in Saha. Preserve source, assessor, date, language, passage/version, duration, attempted/correct words where available, derived metrics and review history. Mark externally supplied summary scores as summaries; do not invent missing raw counts.

Later, inspect the actual app's documented contract before adding result import or SSO. An import should use explicit school-scoped external-ID mappings, unique event IDs, authenticated transport, schema validation and repeat-safe writes. Reject unmapped students and unknown measures. Preserve original submissions separately from teacher-approved revisions. Add launch handoff/roster sharing only when both systems support it; use short-lived scoped handoffs rather than shared Saha cookies or personal information in URLs. Audio storage and retention require a separately agreed policy.

**Language Studio is a candidate for reuse.** If the user confirms it as the existing English/Hindi practice application, inspect its content model, authentication, student mapping and result/export support. Reuse its practice engine where suitable instead of creating another practice platform. Its language support, grade suitability and validation are not established by this plan; do not enable or imply synchronization until confirmed.

## Amplify integration availability

Official documentation describes [Clever roster/SSO onboarding](https://service.amplify.com/article/6319244-clever-enrollment-signing-up-with-clever), [class roster sources including ClassLink and GG4L](https://service.amplify.com/article/9168688-manage-classes-overview), and an [Amplify OneRoster CSV class format](https://my.amplify.com/resources/wp-content/uploads/OR_AE_classes_csv_DD.pdf). Enrollment exchange does not establish access to assessment results.

The reviewed official sources did not verify a public mCLASS assessment-results API, authorization scopes or developer onboarding contract. If the user wants a licensed Amplify connection, confirm available integrations and permissions with Amplify through an approved customer/partner process. No endpoint, scraping method, embedded product or automatic data exchange is assumed here.

## Phased build and exit evidence

| Phase | Scope | Exit evidence |
|---|---|---|
| 1: External launch and reviewed ORF tracker | Confirm the external destination; launch with separate sign-in; record teacher-reviewed numeric observations and provenance in Saha. | Scoped launch/entry/read/correction tests; unrelated-school and unassigned-teacher denial; metric validation; no personal data in launch URLs; reload persistence. |
| 2: Evidence and teaching | Educator-defined skill profiles, teacher-approved groups, original activities and review schedules. | Educators approve skill rules/content; explanations cite actual observations; overrides and revisions are attributable. |
| 3: Practice integration | Prefer confirmed Language Studio reuse; otherwise build a small original practice engine with deterministic progression. Add an external result adapter only after a contract is verified. | Activity-to-skill mapping, idempotent authenticated import where supported, teacher override and transparent progression tests. |
| 4: Language and learning validation | Evaluate language-specific passages, scoring reliability, accessibility and learning outcomes for the selected grades and curriculum. Consider adaptive complexity only after evidence supports it. | Documented educator review and pilot evidence; separate language reports; no unsupported benchmark or diagnostic labels. |

## Decisions needed

- Confirm the intended Amplify product/link and whether the goal is a reference-inspired Saha product or a licensed Amplify integration.
- Identify the actual ORF app and Language Studio repository/URL, owner, supported tasks/languages and available integration contracts.
- Supply the existing sign-in provider's tenant/issuer and registered application details; provider configuration remains pending.
- Select pilot grades, school context, local curriculum and initial language(s).
- Approve ORF scoring/administration rules, teacher review, comparable-passage policy and the initial original content library.
- Agree result/audio retention, correction history, family visibility and what counts as pilot success.

The next concrete product slice is the confirmed external launch plus a teacher-reviewed numeric ORF tracker. Broader literacy placement and practice should follow the educator-approved evidence model.
