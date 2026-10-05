# Reviewed attendance and raw summary design

Version 2.6 draft, 5 October 2026. Trace: BR-01, BR-02, BR-10–BR-12; FR-03, FR-08, FR-09, FR-26; NFR-01–NFR-05, NFR-07–NFR-09. Read [BRD](BRD.md), [FSD](FSD.md), [HLD](HLD.md) and [LLD](LLD.md) in sequence. All approvals remain false and [SC-29–SC-31 cases](TEST-CASES.json) remain not-run-for-this-specification.

The current v2.6 specification records parent `f31288162e1f55ec28ad710ab990ec56ac37ce3c` of this fifth assessment-review batch, not its containing commit. The attendance slice was published in v2.5 and its functionality is unchanged by this fifth assessment batch. Earlier dated execution remains separate; no educator/provider/operational acceptance is inferred.

## Scope and persisted evidence

The [review service](../../lib/education/attendance-reviews.ts) adds a staff-only current editor, reviewed dirty-only save and immutable history. The [summary service](../../lib/education/attendance-summary.ts) gives all currently scoped roles a compact named-pupil raw evidence view. The existing [legacy attendance service](../../lib/education/attendance.ts) stays mutable replacement behavior, including concurrent accepted 200 responses and clearing a note when it is omitted. Historical records are not backfilled with invented reviews.

Migration [0013](../../drizzle/0013_attendance_reviews.sql) adds `attendance_reviews` (9 fields) and `attendance_review_entries` (6 fields), with current-authority/CAS/commit and immutable-row triggers. Existing attendance retains its unique class/student/date tuple. The original published v2.5 inventory was 37 tables/309 fields and 54 API route files/88 handlers; current v2.6 is 39/325 and 56/91. No new external provider, school-calendar, grading, absence-rate or temporal entitlement policy is added. FR-09 and FR-26 remain partial and unapproved.

## Exact service and HTTP DTOs

SQL fields remain in the [dictionary](DATA-DICTIONARY.md); the following are derived camelCase interfaces.

| Type | Exact fields | Meaning |
|---|---|---|
| `AttendanceRecordSnapshot` | `id`, `status`, `note:string|null`, `recordedBy`, `createdAt`, `updatedAt` | Full saved evidence, including identity, attribution and both timestamps; existing saved status is literal text |
| `AttendanceEditorRow` | `student:{id,firstName,lastName,admissionNumber}`, `record:AttendanceRecordSnapshot|null`, `enrolmentRows`, `needsReview` | Current same-school active pupil; record=null means no saved tuple, never default present; whole pair count flags legacy ambiguity |
| `AttendanceEditorSnapshot` | `class:{id,name}`, `date`, `asOf`, `roster:{items,total,limit:100,truncated}`, `canReview` | One current-authority class/roster/mark snapshot with exact total and display cap |
| `AttendanceReviewInput` | `date`, `clientRequestId`, `reviewConfirmed:true`, `reason`, `entries:[{studentId,status,note,expectedRecord}]` | Strict deliberate dirty-only request, exact full expected record or explicit null |
| `AttendanceReview` | `id`, `classId`, `date`, `reviewedBy`, `reason`, `createdAt`, `changes:[{studentId,beforeRecord,afterRecord}]` | Immutable original attributable review; beforeRecord nullable, afterRecord full saved snapshot |
| `AttendanceReviewResult` | `review`, `replayed:boolean` | New decision or exact original replay; replay never reapplies marks |
| `AttendanceReviewHistory` | `items:AttendanceReview[]`, `total`, `limit:100`, `truncated` | Exact authorized review inventory with latest bounded display |
| `AttendanceEvidence` | `recordedRows`, `counts:{present,absent,late,excused,other}`, `firstDate:string|null`, `lastDate:string|null`, `invalidDateRows` | Raw stored rows/status and real-date coverage; no percentage/expected-day denominator |
| `AttendanceSummaryPupil` | `id`, `firstName`, `lastName`, `admissionNumber`, `currentActive:boolean`, `attendance:AttendanceEvidence` | Minimal currently visible pupil identity plus raw observations; no notes/account mapping |
| `AttendanceSummary` | `role`, `class:{id,name}`, `asOf`, `pupils:{items,total,limit:100,truncated}` | One coherent class/pupil/count snapshot; role is current admin/teacher/guardian/student discriminator |

| Endpoint | Input / scope | Response |
|---|---|---|
| GET `/api/classes/{id}/attendance-editor` | Required exact `date`; current-school admin or currently assigned teacher | 200 snapshot; unavailable current class 404 |
| POST same endpoint | Strict `AttendanceReviewInput`; current staff and allowed same origin | 201 new `{review,replayed:false}`; 200 original exact replay; stale/new-write conflict 409 |
| GET `/api/classes/{id}/attendance-editor/history` | Required exact `date`, optional exact `studentId`; current staff and original batch scope | 200 history with exact total/latest 100/truncated; inaccessible class 404 |
| GET `/api/classes/{id}/attendance-summary` | Path fixes class; existing current class/student scope for all roles | 200 compact summary; unavailable scope 404 |

Authentication resolves real opaque sessions. Family roles are denied editor/review/history with 403 before body/date parsing. Missing session is 401. The shared JSON helper bounds the whole POST at 128 KiB; malformed/unknown/invalid strict fields are 400. Responses are no-store and safe error bodies contain only controlled text. Existing query helper takes the first query value; no strict unknown/duplicate-filter rejection is claimed.

## Validation and note semantics

- IDs are nonempty text up to 120 UTF-16 units; clientRequestId must be UUID. Submitted status is present, absent, late or excused. Entries are 1–100 distinct pupil IDs; every entry must differ from its expected status or note. A no-op entry rejects the entire request as 400.
- Date must be exactly real `YYYY-MM-DD`, confirmed by parse/roundtrip in the service and a real-calendar CHECK in the receipt. Past/future dates are permitted; no term/weekday/future restriction is invented. The recorder initially chooses the device-local calendar date and sends it literally, without UTC conversion.
- Reason is trimmed 10–500 Unicode code points with control characters rejected. This matches SQL `length`; a short emoji reason is 400 instead of a SQL CHECK server error. New/replacement notes are at most 2,000 Unicode code points.
- Note and expectedRecord are mandatory explicit fields. API null and empty string are distinct. Desired note and prior note have a 100000 UTF-16-unit transport/schema bound; an exactly unchanged longer legacy note may be retained even beyond the new-note limit, only when exact full prior CAS matches. The total request must still fit 128 KiB. A changed oversized note cannot use that exception.
- Existing expectedRecord is strict: ID up to 120, saved status nonempty up to 100, nullable note up to 100000, recordedBy ID, createdAt/updatedAt nonempty up to 100. No omitted field or caller-selected attribution/time is accepted. Null expectedRecord requires an absent saved tuple.

The native form preserves unchanged saved null/empty/long notes when another field changes. Clearing an edited note produces null. Its blank unrecorded status requires a deliberate choice; it does not automatically record every visible pupil.

## Current reads and roster limits

`getAttendanceEditor` runs one guarded SELECT on the exact class with `academicClassWrite`. Distinct pupils come from current same-school active enrolments. Every whole enrolment pair, including inactive duplicate rows, contributes to the pair ambiguity count. Saved attendance joins by exact class/pupil/date. Roster orders firstName/lastName/ID ascending and displays at most 100 with exact total; `canReview` requires total 1–100 and no ambiguous pair anywhere in the current roster. Empty/truncated/ambiguous roster blocks new review even when the dirty subset is otherwise valid.

`getAttendanceSummary` runs one guarded class SELECT using existing class/student/reference scope. Visible pupils are current eligible active roster or eligible stored attendance records. A family class entitlement does not grant the entire roster. Current pupil names/admission, currentActive and raw row/status/date aggregates share the same SQL snapshot. Aggregate inputs do not multiply when enrolment pairs are duplicated. No notes, recorder/identity fields, individual raw row list, calculated percentage or grade appears.

Summary orders firstName/lastName/ID ascending, displays 100, and reports exact uncapped authorized total and truncation. Every stored row contributes to present/absent/late/excused/other. Only exact real dates form first/last coverage; malformed/noncalendar rows remain counted and flagged. Zero rows means null endpoints/zero evidence. `currentActive=false` describes accessible saved records without a current active membership, not a new historical entitlement.

`asOf` is canonical SQL UTC read time. A compact Principal has no session hash: actual actor enabled/role/school/nonempty trusted mapping and current relationships are rechecked, but session-only revocation after Principal resolution is outside the statement contract. Different nonempty identity remapping is not detected from this compact snapshot. Later changes require refresh and cannot retract delivered content.

## Atomic save, full prior evidence and exact replay

1. Parse strict input, sort changed entries by binary student-ID string comparison and hash exact actor/school/class/date/trimmed reason/full sorted entries.
2. Read current editor, then live-scoped original UUID receipt. Same actor/hash returns original evidence before new-roster eligibility denial, allowing same-school withdrawal replay. Changed actor/payload is 409.
3. For a new decision require canReview. Generate server time and new attendance ID only for absent tuple; existing ID/creation time remain stable. Insert receipt with actual live `academicClassWrite` and ON CONFLICT DO NOTHING.
4. BEFORE INSERT checks current enabled mapped staff/class, whole-roster cap/ambiguity, distinct changed members, each active same-school enrolment, status/note shape and exact full before/absence. A changed note, actor, creation/update time or identity prevents CAS, even when status is unchanged.
5. AFTER INSERT upserts all dirty tuples and derives every before/after entry from actual saved rows. Row-count mismatch or audit failure aborts the whole statement: marks, receipt and entries all roll back. Reviewer/update time are authenticated/server-derived; old creation time/ID persist.
6. Final receipt SELECT repeats current actor/class and every original pupil's current-school scope. New committed outcome is 201/replayed=false; exact existing outcome 200/replayed=true. Conflict with no saved outcome is safe 409. If commit succeeded but evidence readback loses scope, safe 404 discloses nothing while committed rows persist.

Two different reviewed UUIDs based on the same prior evidence have one 201 winner and one 409. Identical concurrent same actor/UUID/payload yield one 201 and one 200 original replay. Reordered equivalent entries are canonical. Exact replay after later legacy replacement never reapplies original values or rewrites later attribution.

## Immutable history and access cutoff

Receipt and entry UPDATE/DELETE are blocked by database immutable-row triggers. The full review payload includes original before/after snapshots, reviewer/reason/time, omitting private hash/envelope/school storage columns. History uses one current-class guarded SELECT with exact date and optional pupil membership predicate, latest 100 by createdAt/ID descending and exact visible total/truncation.

Every original pupil in a receipt must still exist in the actor school, and current original-class staff authority must still hold. Withdrawal alone retains history/replay. If one pupil transfers out, the entire original review disappears from items/total/replay; filtering another pupil cannot recover a partial batch. Evidence remains durable in storage rather than being deleted. This limited contract does not establish an approved temporal access or retention model.

## UI recovery and privacy

The recorder clears confirmation on any mark/note/reason/date or loaded-evidence change. Date changes cancel obsolete loads and clear old edits/reason/receipt/history. A 409 retains intended dirty values but requires loading/comparing current saved evidence and reviewing again. A pending uncertain original request freezes UUID/payload/date/edit controls. Network/500 and denied/unavailable acknowledgements may follow a durable commit; exact retry is the recovery path, not a fresh blind request.

A 401/403/404 acknowledgement clears private visible snapshot/history/confirmed evidence and disables retry until current access is verified. Sign-in recovery can use a separate tab while the pending request stays in memory. A confirmed original receipt remains visible if the subsequent current/history refresh fails; messages distinguish save success from refresh failure and further changes stay blocked until current reload. A browser refresh/navigation can lose in-memory intent; no persisted client request queue is claimed.

The viewer clears old content before class selection/reload, cancels obsolete responses and uses current snapshot role for staff review links. Native labels/controls/full-page anchors, announced focus/status/error and wrapping cards support mobile/keyboard procedures. Stored dates display literal calendar strings, avoiding timezone shifts; attribution/history uses escaped text with current roster name or stable pupil-ID fallback. Intentional assistive/language/educator acceptance remains unrun.

## Verification context and remaining gates

Related runnable files: [primary reviewed contract](../../tests/integration/attendance-review-contract.mjs), [independent current-access contract](../../tests/integration/attendance-review-access-contract.mjs), [summary contract](../../tests/integration/attendance-summary-contract.mjs), [independent summary access](../../tests/integration/attendance-summary-access-contract.mjs) and [legacy academic regression](../../tests/integration/academic-integrity-contract.mjs). Actual migrated SQLite/session routes, prepared D1 driver checks and actual local Worker execution are distinct layers. Root maintains actual count/time/source/build/recovery/browser records separately; related links do not execute TC procedures or approve school policy.

Calendar/absence meaning, correction governance, family/history entitlement, legacy replacement/result audit, unified export/retention, representative performance, hosted recovery/key custody/scheduling, support ownership, selected provider/ORF and intentional educator/accessibility UAT remain open. No real record, vendor or learning-efficacy promise is added.
