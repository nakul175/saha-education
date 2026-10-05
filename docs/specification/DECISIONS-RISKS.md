# Saha decisions assumptions and risks

Draft decision register, 5 October 2026. Role owners below are proposed responsibilities; no named owner or deadline has been approved. Confirmed decisions come from the sponsor’s messages, not inferred source code.

The v2.1 extensions describe the current working candidate on `feat/specification-delivery`, based on documentation commit `d53adcf`. The original v2.0 application baseline remains `5488bc0d20412a3d4be0c031c99c259c56834d5e`. New behavior is not attributed to that historical SHA; actual execution is recorded separately and all business acceptance remains unapproved.

## Decisions

| ID | Topic | State / current decision | Proposed owner | Effect while open |
|---|---|---|---|---|
| D-01 | Product reference | Confirmed: AmplifiU teacher tools, original Saha implementation | Sponsor | Do not reuse the former conditional Amplify Reading comparison |
| D-02 | Sign-in provider/tenant | Open: existing provider desired; name/configuration not supplied | Sponsor + operator | Live sign-in remains unavailable; synthetic sessions test code only |
| D-03 | ORF application | Open: Language Studio is strongest repository candidate, not confirmed | Sponsor + integration owner | Keep launch URL blank and no result sync |
| D-04 | Pilot curriculum/grades/subjects | Open; neutral manual templates and manually declared source library current | School educator lead | No verified licensing, certified alignment or assumed CBSE approval |
| D-05 | Pilot languages/content | Open; language tags supported, content review not established | Educator lead | No cross-language ranking or validated scoring norms |
| D-06 | Resource reviewer policy | Open; explicit author self-review currently permitted | School leadership | Approval means attributed confirmation, not independent certification |
| D-07 | Family resource/result publication | Open; reports published, raw assessments/ORF and assignments remain restricted | School leadership | Do not expand guardian visibility implicitly |
| D-08 | Academic dates, grades and corrections | Open; candidate validations are incomplete | Academic administrator | Block real academic usage until policy and correction evidence agreed |
| D-09 | Historical enrolment visibility | Open broadly; reading review and staff attempts retain current-class same-school history; learner assignment view remains active-only | School leadership | Current specific history rules need educator/pilot review; no temporal entitlement model |
| D-10 | Retention, deletion, audio and export | Open; no audio/transcripts currently collected | Data owner | No legal compliance certification; approve appropriate policy before real data |
| D-11 | Hosting/environment and recovery objectives | Open; source publication does not verify deployment wiring | Operator | No real migration/deployment or RPO/RTO claim |
| D-12 | AI provider, credentials and budget | Open; no generation service enabled | Sponsor + operator + educator | Templates remain manually authored |
| D-13 | External Classroom/result contract | Open; no verified API/authorization contract | Integration owner | No assumed API, scraping, SSO or external roster sharing |
| D-14 | Pilot success and nonfunctional targets | Open: baseline, sample, workload, accessibility/browser matrix and targets | Sponsor + QA + operator | Performance/recovery/learning-outcome gates cannot be claimed met |
| D-15 | Start specification implementation | Confirmed by sponsor: build from this pack with ten workstreams | Sponsor + engineering | Authorization to build does not approve pilot policies, live activation or deployment |
| D-16 | Account administration policy | Working choice: current-school reviewed provisioning/status, immutable existing role/pair/school, self/final-admin protection | School leadership + operator | Complete profile/identity remapping and guardian verification remain deferred |
| D-17 | Manual curriculum rights and review | Working choice: mandatory declared rights/source statements, exact self-review permitted, unapproved durable source copies | Educator/data owner | Actual source permission, pilot framework and independent review not verified |
| D-18 | Text attempts/formative feedback | Working choice: append-only text and reviewed feedback; due dates informational | Educator lead | Deadline, grading, attachments, guardian publication and retention remain open |
| D-19 | Reading correction/history | Working choice: retained originals, append-only reviewed metrics, exact task/language/duration series, current staff history after withdrawal | Educator lead | Task/scoring comparability and interpretation not validated; no norms/diagnoses |
| D-20 | Bounded administration display | Working choice: up to 500 users/200 latest events, no totals/full archive; request body parser 128 KiB | Engineering + QA | Volume/pagination/export/audit-reader and performance targets remain open |

## Assumptions to validate

The pilot is a web workflow using school, class and learner relationships; teachers prefer original editable resources; active enrolment is a workable initial visibility rule; the existing Workers/D1 target remains suitable. These are planning assumptions, not customer research or approved architecture capacity. The application must continue to work manually before optional AI services are activated.

## Risks and treatment

| ID | Risk | Treatment / evidence needed |
|---|---|---|
| R-01 | Unverified provider leaves product inaccessible to real provisioned users | Confirm D-02; execute live synthetic callback/expiry/logout/disabled-account journeys |
| R-02 | Cross-school or staff-field disclosure | Server scope and serialization checks; mandatory negative cases before release |
| R-03 | Concurrent/retried changes overwrite confirmed work | Immutable versions, unique revision guards, atomic/repeat-safe operations and conflict tests |
| R-04 | Resource or AI content inaccurate/inappropriate | Original/licensed references, explicit educator review, provisional drafts and exact-version approval |
| R-05 | ORF rate interpreted as diagnosis or normative grade result | Separate rate/accuracy, manual provenance, approved comparable-task policy and no unsupported labels |
| R-06 | Historical scope or corrections lose usable evidence | Resolve D-08/09; add attributable corrections without deleting original records |
| R-07 | Existing main/rebuild/deployment history causes accidental release | Preserve history; reviewed PRs; verify actual hosting wiring and sponsor merge authority |
| R-08 | Local tests mistaken for production acceptance | Keep source, case design, execution evidence and sign-off separate |
| R-09 | Incomplete recovery/retention harms real records | Agree D-10/11; perform isolated recovery/restore and operational review |
| R-10 | Prototype/manual template mistaken for AI integration | Label proposed features and empty provider states in UI/docs; verify actual contract before activation |
| R-11 | Manual rights statement mistaken for verified licensing | Educator/operator checks actual source permissions and selected pilot; software retains declarations only |
| R-12 | Informational due date mistaken for enforced deadline or grading | Label text/formative limits in UI/FSD; agree separate deadline/grade/publication policy |
| R-13 | Bounded account/review list mistaken for total inventory/audit archive | Explicit caps in UI/API; use actual SQL teacher count and agree pagination/export before larger pilot |
| R-14 | Downstream read/retry after authority change reveals preserved private evidence | Guard final SQL selections for current account/class/school, and exercise stale-principal/fault/race paths independently |

Severity, likelihood, named owners and due dates require pilot review; this register does not fabricate them. Update resolution evidence through [change control](CHANGE-CONTROL.md).
