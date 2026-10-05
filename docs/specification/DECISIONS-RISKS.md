# Saha decisions assumptions and risks

Draft decision register, 5 October 2026. Role owners below are proposed responsibilities; no named owner or deadline has been approved. Confirmed decisions come from the sponsor’s messages, not inferred source code.

The v2.3 implementation candidate was prepared on `feat/specification-delivery`. `source_commit` records `82f20ce9ae023bdb78d53aecc229331b57bce5eb`, the parent of this documented second batch, rather than the commit containing its changes. The changes were uncommitted when this specification was assembled; dated publication and execution records are maintained separately. The v2.0 application baseline remains `5488bc0d20412a3d4be0c031c99c259c56834d5e`; v2.1 evidence and the published v2.2 batch at `82f20ce` remain historical. Every requirement is unapproved and every designed case is `not-run-for-this-specification`.

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
| D-16 | Account administration policy | Working choice: current-school reviewed provisioning/status, immutable existing role/pair/school, self/final-admin protection | School leadership + operator | Reviewed profile login binding current; wider account role/identity/school remapping and guardian verification remain deferred |
| D-17 | Manual curriculum rights and review | Working choice: mandatory declared rights/source statements, exact self-review permitted, unapproved durable source copies | Educator/data owner | Actual source permission, pilot framework and independent review not verified |
| D-18 | Text attempts/formative feedback | Working choice: append-only text and reviewed feedback; due dates informational | Educator lead | Reviewed local submission windows current; educator deadline/late, grading, attachments, guardian publication and retention remain open |
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
| R-12 | Informational due date or window mistaken for grade/late policy | Label due date separately from reviewed open/closed/timed new-attempt access; agree educator grade/late/publication policy |
| R-13 | Bounded account/review list mistaken for total inventory/audit archive | Explicit caps in UI/API; use actual SQL teacher count and agree pagination/export before larger pilot |
| R-14 | Downstream read/retry after authority change reveals preserved private evidence | Guard final SQL selections for current account/class/school, and exercise stale-principal/fault/race paths independently |

Severity, likelihood, named owners and due dates require pilot review; this register does not fabricate them. Update resolution evidence through [change control](CHANGE-CONTROL.md).

## v2.2 working choices and unresolved risks

| ID | Working choice / open boundary | Proposed owner | Required review |
|---|---|---|---|
| D-21 | Exact reviewed student/guardian login ownership with current version, reason, immutable event and affected-session revocation; reviewer session excluded | School administrator + operator | Verify exact account/profile ownership and malformed legacy repair; family relationship/consent and account role/identity/school remapping remain open |
| D-22 | Non-destructive academic pair guards preserve legacy duplicates; ambiguous result pair conflicts whole batch | Academic administrator | Approve reconciliation/correction history and calendar/grade policy; no silent deletion/merging |
| D-23 | Local normalized JSON reading drafts require manual all-item review, active membership and source receipts; source labels exact/user declared | Educator + integration owner | Stable source namespace/reference discipline, item suitability and retention; no verified vendor/auto-sync claim |
| D-24 | Reviewed immutable open/closed/timed windows govern NEW text attempts separately from due date; committed UUID replay/feedback preserved | Educator lead | Accept real-use deadline/timezone/late/grade/guardian policy explicitly |

| ID | Risk | Treatment / evidence needed |
|---|---|---|
| R-15 | Wrong exact profile/account selection changes access | Display exact IDs/prior-current binding; required reason/confirmation/CAS; affected-session revocation; independent ownership/policy review |
| R-16 | Historical duplicate pairs silently merged or hidden | Preserve migration rows; new-pair guards, ambiguous full-batch denial and separately approved reconciliation |
| R-17 | Local source label appears to verify a vendor or duplicate result namespace changes evade dedup | Explicit user-declared wording; exact school/namespace/result receipt key, stable-reference guidance and atomic conflict/reject tests; no authenticity claim |
| R-18 | Withdrawal/reassignment or late receipt failure creates partial imported readings | Actual all-member scope, one trigger transaction, late-failure rollback and current child/retry query tests |
| R-19 | Window closure deletes work or old retry reapplies stale policy | Actual latest-policy/database-clock attempt guard; original review/current-window replay; preserve current-authorized committed UUID/feedback |
| R-20 | Local encrypted recovery evidence mistaken for hosted readiness | Related recovery suite covers disposable local roundtrip only; require separate hosted export/cutover, key custody, backup schedule and owner/RPO/RTO evidence |

None of these working choices is a sponsor/educator/vendor approval. The [batch record](../current/DEVELOPMENT-BATCH-1.md) carries observed checks separately from unrun designed cases.

## v2.3 working choices and residual risks

| Item | Current choice / remaining decision |
|---|---|
| Statement-time authority | Live enabled mapped actor/current school/role in actual SQL; no cached-principal override. Nonempty identity pair replacement remains unavailable policy, not a snapshot comparison guarantee. |
| New publication | One immutable private winner receipt and atomic current eligible guardian notices; zero recipients allowed. No legacy receipt backfill or notice replay. |
| Uncertain draft creation | No client creation UUID/unique student-term guarantee. UI retains text, blocks repeat and requires reload/check; broader exactly-once draft creation remains absent. |
| Historical notice ownership | Personal notice remains after relationship unlink; current pupil/report access denied independently. School privacy/retention owner must approve real-use retention/deletion. |
| Review and grades | Admin UI requires saved-report review; API remains publish:true without reason/UUID. No complete report correction log or accepted grade engine. |
| Structure administration | Verified-school admin controls, scoped nonadmin lists and disabled school bootstrap; no transfer/repair/deletion capability added. |
| Readiness | Provider/ORF/pilot policies, representative performance, hosted recovery/key custody/scheduling and intentional educator/accessibility UAT still open; race fixes do not certify all source. |

A subsequent dashboard inspection reproduced cached actor/profile/class exposure across assembled reads and misleading result/attendance labels. FR-03 is partial while a coherent live-scoped dashboard snapshot is pending. Those diagnostic assertions are not passing execution evidence; the current structure/publication batch does not claim to resolve dashboard pages.
