# Current academic selections, private actions and recovery

Version 2.12 draft, 6 October 2026. Candidate parent `23c2d8f3e8bc3d6e9154f138992a66ce456c0b77`; actual frozen source/build/runs/publication/release are coordinator-maintained separately. Read [BRD](BRD.md) → [FSD](FSD.md) → [HLD](HLD.md) → [LLD](LLD.md). Trace: BR-01, BR-02, BR-10–BR-12; FR-02, FR-03, FR-06–FR-08, FR-11, FR-12, FR-26; NFR-01–NFR-03, NFR-05–NFR-09. SC-42 adds TC-286–TC-293. All approvals remain false and all cases remain `not-run-for-this-specification`.

## Scope and unchanged contracts

[Enrolment screen](../../app/enrolments/page.tsx) and [report screen](../../app/report-cards/page.tsx) add current session/selection/generation/abort guards, server-correlated acknowledgements, synchronous locks and private pending-action recovery. No table, field, API handler or new UUID/CAS/educational policy is added. Current total stays 41 tables/338 fields and 60 route files/96 handlers. Existing legacy enrolment/status/draft-create/publication services retain their accepted contracts, server scope and immutable publication winner/eligible notices.

The distinction matters: enrolment creation/status and report draft creation do not have a reviewed UUID original receipt contract. Their uncertain delivery requires human comparison. Publishing an existing saved report already preserves one atomic winner receipt/time/guardian notice; its explicit retry can repeat the original endpoint/body. Neither workflow is [reviewed registry creation](REGISTRY-DESIGN.md), and neither invents new enrolment historical entitlement or grade/calendar/retention policy.

## Reload and selected record authority

Enrolment reload clears former actor/students/classes/roster/choices/readiness before reading current session, concurrent settled student/class requests, selected authorized class roster and final session. Both settled responses are consumed; every row must match the selected class. A requested unavailable class becomes blank, not a disguised first-class view; an initial blank selection may choose the first currently permitted class. Exact initial/final actor ID/role/school must agree before ready controls/rows appear.

Reports reload clears former actor/profile choices/reports/draft fields/review before current session → authorized students → exact selected student's reports → final session. It validates every report student ID and rejects a family result containing an unpublished draft. An unavailable/blank selected student remains blank. Same current administrator and selected student may restore their in-page typed draft; another actor/role cannot inherit it. Changing learner selection starts a separate blank draft. These are separate HTTP reads, not a database snapshot or continuous client authorization monitor.

Both pages accept only latest mounted generation, with abort and current selection refs. Selection change clears old private records/actions immediately. Late old class/learner replies cannot overwrite a newer selection, and captured former-row/form callbacks must check current refs/readiness/actor rather than stale render state. Unmount aborts/invalidates; late inventory cannot apply private state. Server SQL-time original session/account/record authority remains final.

## Role controls and acknowledgements

Only a freshly verified current administrator sees enrol/create/status or report create/review/publish controls. Teachers/family retain their existing scoped read views: report drafts remain staff-only, family reports published-only. Controls require ready current actor/selection plus synchronous in-flight lock; fresh session preflight must match original scope. Two same-frame callbacks send one mutation. Rapid term/grade/summary callbacks preserve exact original draft fields.

Enrol acknowledgement must correlate201 create or200 status with nonempty ID, original class/student/status, original status-update row ID and valid updatedAt. Report acknowledgement must correlate201 unpublished created draft exact fields/student/ID, or200 original published report ID/student/valid publishedAt. Mismatched success is uncertain even after actual commit. Confirmed save is announced separately from current reload failure; refresh never silently repeats a write.

Known failed/no-send/400409 hides obsolete choices/records/control authority and requires reload/review. A sent401/403/404, unexpected/malformed success, 5xx or network failure may follow commit; keep private original action while hiding protected current view. No automatic retry/new selection/mutation is sent. Focusable status/error regions announce failures; native labels/anchors/fieldset/wrapping support keyboard/mobile review, with named acceptance still separate.

## Pending actions and original-account recovery

| Pending kind | Captured original | Current recovery |
|---|---|---|
| Enrol or withdraw/complete | ActorKey, class/student IDs/names, kind/status, row ID where relevant, serialized body | Fresh original administrator/class reload reveals comparison details; explicit comparison checkbox and Finish comparing sends no request; new action reviewed separately |
| Create private report draft | ActorKey, student ID/name, exact term/grade/summary/body | Fresh original administrator/student reload permits comparing saved reports; finishing clears pending/typed draft to blank and sends no POST |
| Publish saved report | ActorKey, student ID/name, original report ID and exact `{publish:true}` body | Fresh original administrator/student reload exposes Retry original report publication; preflight again then same original endpoint/body; one established publication/notice retained |

Other administrator/family scope cannot see submitted private names/draft/report identity or release/retry old action. Restoration of the original current account requires a fresh session and explicit reload before details/actions appear. If a late revoked request did not publish, an explicit restored-account original publication retry may become the one current-authorized winner; if it already committed, retry preserves winner. Neither case sends duplicate notices or publishes a different newly selected report.

All pending actions/typed draft reminders remain page memory. Hard reload/navigation/tab loss discards them; no durable client queue, automatic matching, exact enrolment/draft UUID replay or cross-device recovery is promised. Manual comparison establishes a deliberate human decision, not proof of no commit or unique term-report policy. Existing duplicate prevention prevents new duplicate enrolment pairs while preserving older evidence; report term duplication remains a separate policy.

## Evidence and review boundary

[Academic callback contracts](../../tests/integration/academic-ui-contract.mjs) exercise unchanged transpiled callbacks with substituted React/hooks/components/native events and actual synthetic opaque sessions/routes/production Drizzle D1 over fully migrated SQLite. They deliberately hold replies/change actual authority, inspect request bytes and confirmed records/receipts/notices. They are not mounted React/form/focus/assistive/hosted evidence. [Publication contract](../../tests/integration/report-publication-contract.mjs) covers underlying atomic winner/current recipient/rollback boundaries separately.

TC-286–TC-293 remain unrun. Intentional mounted keyboard/mobile/assistive/educator/operator review, current-provider callback, temporal/family/grade/calendar/correction/retention policy and representative hosted capacity/recovery remain independent gates. Actual observations are dated coordinator evidence, not these draft case statuses or business approvals.
