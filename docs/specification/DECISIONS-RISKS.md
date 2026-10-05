# Saha decisions assumptions and risks

Draft decision register, 5 October 2026. Role owners below are proposed responsibilities; no named owner or deadline has been approved. Confirmed decisions come from the sponsor’s messages, not inferred source code.

The v2.10 candidate is prepared on `feat/specification-delivery` from published parent `a418ee4132bfc05d24748ad1d25c5fa5b91b7d69`. `source_commit` identifies that parent, not the containing implementation/documentation commit. The [eight-hour development record](../current/EIGHT-HOUR-DEVELOPMENT.md) and root-maintained dated execution/release evidence identify actual frozen source, publication, merge and deployment independently. The v2.0 baseline `5488bc0d20412a3d4be0c031c99c259c56834d5e` and published v2.1–v2.8 history remain retained. All requirements are unapproved and all designed cases are `not-run-for-this-specification`.

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
| D-08 | Academic dates, grades and corrections | Open; reviewed attendance real-date/CAS evidence current, broader calendar/grade/correction governance incomplete | Academic administrator | Block real academic usage until policy and correction evidence agreed |
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

The pre-v2.4 dashboard inspection reproduced cached actor/profile/class exposure across assembled reads and misleading result/attendance labels. The v2.4 service/pages address that identified gap with one current-scoped snapshot, actual recording states and observed attendance counts. FR-03 is implemented for its specified current authorization contract, with approval false; the original diagnostic assertions remain reproduced defects, never passing execution evidence.

## v2.4 dashboard choices and residual risks

- One SQL snapshot supplies each role view. Public Principal remains compact; v2.9 privately pins exact original token/expiry/identity at statement execution, including original session-only revocation after resolution. Later changes require a new refresh and cannot retract delivered content.
- Current roster recording is distinct from historical completeness or student learning. Duplicate enrolment/result evidence and invalid values remain review warnings, with no chosen score, repair or new educational policy.
- Raw attendance counts avoid an unapproved denominator or excused weighting. Current family class eligibility is retained; broader historical entitlement, approved dates/calendar and correction policy remain open.
- Caps 100 classes/100 assessments/50 profiles/20 published reports per profile constrain displayed output, not exact totals or representative SQL work. Related full lists remain subject to their existing pagination limits; no SLA/performance completion is inferred.
- Publication strings/grades remain legacy school-supplied data. Stored publication/date ordering does not identify an approved current term; invalid date evidence stays visible without normative interpretations.
- Full-page anchors match current runtime behavior. Broader assistive technology/browser/language/educator acceptance remains unrun; synthetic related automation is separate evidence.

## v2.5 attendance choices and residual risks

| Item | Current choice / remaining review |
|---|---|
| Reviewed evidence | Dirty-only exact full before fields, attributable reason/checkbox, one atomic receipt/mark/change statement and immutable new history; legacy replacements unchanged and no backfill. |
| Roster boundary | New reviewed saves require current active same-school pupils, nonempty distinct roster <=100 and no whole-pair legacy ambiguity anywhere; preserved duplicate reconciliation remains a separate policy. |
| Date/note semantics | Exact real YYYY-MM-DD, no future/term restriction; local UI date without timezone shift. Reason/new notes count code points; exact unchanged longer legacy notes can persist within transport. School calendar/absence/correction governance unapproved. |
| Recovery and permission loss | Uncertain/denied acknowledgement may follow durable commit. Keep original UUID/payload, clear private stale evidence after permission loss and verify current access before exact retry; no blind new-review success claim. |
| Original history scope | Current original-class staff may read same-school withdrawal history. One transferred original pupil hides the entire batch; current family historical entitlement is not expanded. |
| Raw summaries | Coherent names/status/date evidence with exact scoped total/cap 100, no notes/percentage/grade/expected days. Legacy invalid/unrecognized evidence is counted/flagged, never silently repaired. |
| Remaining audit/operations | Assessment correction, legacy replacement history, unified export/retention, hosted recovery, representative performance and intentional educator/accessibility acceptance remain pending. |

The short-emoji reason reproduction formerly reached a SQL CHECK and returned 500. Current validation aligns code-point bounds with SQL length and rejects invalid input as 400; diagnostic reproduction is not passing execution evidence. Scope fixes or new domain receipts do not certify every source, production readiness or compliance.

## v2.6 reviewed result decisions and residual risks

Choose a separate reviewed snapshot/save/history contract rather than changing accepted legacy replacement semantics. Preserve original rows/duplicates and no history backfill. Current editable active roster is bounded100, per-pupil original records 10 and history 100 with exact totals. Full metadata/result CAS and one receipt-trigger statement arbitrate conflict and rollback; original UUID receipt recovers lost replies without undoing later legacy work.

Raw unsafe INTEGER and nonfinite REAL use exact strings/type and block review; BLOB uses safe null/type. Safe serializable invalid single scores may be explicitly repaired without norms/grades. Date invalidity is a disclosed technical warning, not new school-day eligibility. Current original-class/same-school history retains withdrawal, hides transferred whole batches and does not approve a full temporal entitlement model.

Residual risks: legacy API bypass and last-writer behavior; ambiguous/opaque/unsafe evidence repair governance; in-memory pending intent lost on navigation; trusted internal unmarked-Principal compatibility and no continuing delivered-content monitoring; retained private full-text before/after; scoring/grade/family publication policies; representative accessibility/performance; unified export/retention and hosted recovery/provider setup. Owners must approve those boundaries before real records; FR-10/FR-26 remain partial and all approvals false.

## Learner recovery decisions and residual risks

Original page-memory requests are frozen rather than rebased to later records, and known denied responses hide protected material/actions. This reduces reproduced client duplicate/reclosure/privacy risks under the [documented contract](LEARNER-RECOVERY-DESIGN.md). Residual boundaries include page close/navigation losing local UUID/body, authority changing after an accepted read, unpaginated/per-item attempt/feedback histories, live provider reauthentication, mounted browser/accessibility/capacity and named educator/retention policy. Another actor cannot recover a pending request simply because it can read the assignment. No automatic historical entitlement, grade or external-sync policy is added.

## Historical v2.8 registry manual recovery decision

Keep non-idempotent profile creation unchanged. Any uncertain sent POST clears protected view and blocks repetition; the original current administrator must reload and manually compare before discarding the private reminder and starting blank. The tradeoff is page-memory loss and imperfect human reconciliation; guardian duplicates are still possible after deliberate new creation. No continuous authorization monitor, automatic record matching, durable receipt/outbox or date-policy remediation is claimed. [Registry design](REGISTRY-DESIGN.md).

## v2.9 current decisions and residual risks

| ID | Current choice / open boundary | Required review |
|---|---|---|
| D-25 | Verified original token/expiry/exact identity checked at SQL execution using private frozen-Principal evidence; trusted internal legacy service fixtures remain account-scoped | Preserve original resolved object in every route/service chain; do not authorize serialized DTOs or infer continuous provider/browser revocation |
| D-26 | Separate reviewed student/guardian UUID creation with immutable original snapshot and atomic unlinked profile; legacy POST remains compatible | Review broader creation governance/deprecation, family verification, date policy, duplicate entity handling and receipt retention/export |
| D-27 | Explicit exact original-actor client retry in page memory; durable server receipt is independent from later current profile | Decide durable cross-device/client UUID discovery/cross-tab new-draft policy; no automatic matching/reset |
| D-28 | Default-off private synthetic demo, valid installation UUID, pristine atomic bounded seed, fixed four accounts, normal scoped sessions and no reset | Verify actual isolated hosted database/audience/configuration, shared-account governance, rate/capacity and fictional-data-only practice |
| D-29 | Sponsor authorized eight-hour continuation and validated main merge/private demo during final hour | Record actual merge/deploy revision/status separately; no real provider/ORF/AI/pilot/educator acceptance implied |

| ID | Residual risk | Treatment / evidence needed |
|---|---|---|
| R-21 | Spreading/reconstructing verified public Principal loses private session evidence | Pass original server object; protect HTTP auth boundary; negative public-header/DTO tests and code review |
| R-22 | Client loses pending UUID/body on navigation despite durable server receipt | Explicit page-memory wording; preserve mounted exact retry; separately decide persistent secure recovery and UUID discovery |
| R-23 | Original receipt mistaken for current profile or deduplicated guardian | Separate original/current display, immutable snapshot, later-edit/link replay checks and deliberate duplicate policy review |
| R-24 | Synthetic switch/configuration reused in real-school environment | Default-off/provider exclusion/pristine/isolation checks and separate hosted database; do not convert seed to real onboarding |
| R-25 | Shared fictional admin edits affect other viewers or are mistaken for per-user sandbox | Label shared demo sample, no reset claim, scoped sessions and operator review; real records excluded |
| R-26 | Full generated snapshot mistaken for applied migration/upgrade guarantee | Preserve historical metadata; actual lexical schema parity checks, journal timestamp risk, explicit hosted migration/restore evidence |

Remaining provider/ORF/pilot/content/educational/retention/capacity/accessibility/operations decisions from prior versions stay open. Dated root release/execution evidence resolves only its stated environment/contract, not approval of all business requirements.

## Current family view choices and residual risks

Current choice: consume the existing coherent class/profile snapshot and verify the browser account around it; preserve current API scopes and all membership rows. Deduplicate visible profile IDs only, disclose repeats and label current availability rather than asserting a total roster. Family attendance navigation uses existing `/attendance`; staff recording remains separately scoped. Historical entitlement and correction/retention policy remain undecided.

Current choice: preserve owner-only idempotent notice markers and confirm valid saved readAt through fresh owned inbox. Exact original marker/actor/endpoint remains private in page memory during uncertainty; no automatic retry or local fabricated time. Same current original account alone can recover or dismiss an unavailable reminder, with no saved-read claim from dismissal. Hard reload/tab loss discards pending reminders; no cross-device queue or continuous cross-tab monitoring is added. Representative family/assistive/language/load and hosted incident/recovery decisions remain open. No stored channel label activates delivery.

## Manual reading-practice decisions and residual risk

The implemented planner is an educator-controlled source-copy handoff, not adaptive placement, personalized generation, screening or educational efficacy evidence. Private focus/observations are excluded from copied content; rights/language/suitability remain declarations. Historical reading scope does not establish current individual eligibility. Existing class assignment after saved-version review remains a separate operation.

Unknown copies retain private original UUID/bytes; recovery400/409 keeps uncertainty and blocks duplicate creation. Original version1/binding is distinct from current source/editor/approval metadata and is not a registry-style immutable receipt. Mounted-memory loss, real provider/ORF, actual pilot source rights, languages/educator review, representative capacity and hosted recovery remain risks/gates. Do not promote FR-23 or business/case acceptance from this manual composition.
