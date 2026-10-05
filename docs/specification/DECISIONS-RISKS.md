# Saha decisions assumptions and risks

Draft decision register, 5 October 2026. Role owners below are proposed responsibilities; no named owner or deadline has been approved. Confirmed decisions come from the sponsor’s messages, not inferred source code.

## Decisions

| ID | Topic | State / current decision | Proposed owner | Effect while open |
|---|---|---|---|---|
| D-01 | Product reference | Confirmed: AmplifiU teacher tools, original Saha implementation | Sponsor | Do not reuse the former conditional Amplify Reading comparison |
| D-02 | Sign-in provider/tenant | Open: existing provider desired; name/configuration not supplied | Sponsor + operator | Live sign-in remains unavailable; synthetic sessions test code only |
| D-03 | ORF application | Open: Language Studio is strongest repository candidate, not confirmed | Sponsor + integration owner | Keep launch URL blank and no result sync |
| D-04 | Pilot curriculum/grades/subjects | Open; neutral manual templates current | School educator lead | No certified alignment or assumed CBSE approval |
| D-05 | Pilot languages/content | Open; language tags supported, content review not established | Educator lead | No cross-language ranking or validated scoring norms |
| D-06 | Resource reviewer policy | Open; explicit author self-review currently permitted | School leadership | Approval means attributed confirmation, not independent certification |
| D-07 | Family resource/result publication | Open; reports published, raw assessments/ORF and assignments remain restricted | School leadership | Do not expand guardian visibility implicitly |
| D-08 | Academic dates, grades and corrections | Open; candidate validations are incomplete | Academic administrator | Block real academic usage until policy and correction evidence agreed |
| D-09 | Historical enrolment visibility | Open; live assignment/active enrolment scopes current | School leadership | Withdrawal/reassignment may hide prior teacher access |
| D-10 | Retention, deletion, audio and export | Open; no audio/transcripts currently collected | Data owner | No legal compliance certification; approve appropriate policy before real data |
| D-11 | Hosting/environment and recovery objectives | Open; source publication does not verify deployment wiring | Operator | No real migration/deployment or RPO/RTO claim |
| D-12 | AI provider, credentials and budget | Open; no generation service enabled | Sponsor + operator + educator | Templates remain manually authored |
| D-13 | External Classroom/result contract | Open; no verified API/authorization contract | Integration owner | No assumed API, scraping, SSO or external roster sharing |
| D-14 | Pilot success and nonfunctional targets | Open: baseline, sample, workload, accessibility/browser matrix and targets | Sponsor + QA + operator | Performance/recovery/learning-outcome gates cannot be claimed met |

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

Severity, likelihood, named owners and due dates require pilot review; this register does not fabricate them. Update resolution evidence through [change control](CHANGE-CONTROL.md).
