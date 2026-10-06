# Saha wireframes and navigation specification

Version 2.12 draft, 6 October 2026. Open the [interactive wireframes](wireframes/index.html) locally. They use fictional data and browser-memory interactions only: no application API, identity, school record or external service is called. Refresh resets the prototype. These are review artifacts, not generated screenshots of an implemented product.

The v2.12 candidate is prepared on `feat/specification-delivery` from recorded documentation-followup parent `23c2d8f3e8bc3d6e9154f138992a66ce456c0b77`. `source_commit` identifies that parent, not the containing implementation/documentation commit. The [eight-hour development record](../current/EIGHT-HOUR-DEVELOPMENT.md) and root-maintained dated execution/release evidence identify actual frozen source, publication, merge and deployment independently. The v2.0 baseline `5488bc0d20412a3d4be0c031c99c259c56834d5e` and published v2.1–v2.8 history remain retained. All requirements are unapproved and all designed cases are `not-run-for-this-specification`.

## Screen inventory

| ID | Screen and role | Requirement links | Current or proposed | Important states |
|---|---|---|---|---|
| WF-01 | Teacher dashboard | FR-03, FR-08, FR-10 | Current-roster recording panel; consolidated resource shortcuts remain proposed | No roster, partial/recorded/zero, ambiguous/invalid records, limits and scoped refresh |
| WF-02 | Resource authoring, staff | FR-13, FR-22 | Original prototype illustrates manual authoring; current library has separate screens below | Empty fields, template switch, validation, saving, uncertain response |
| WF-03 | Saved-version review and class assignment, staff | FR-14–16 | Current workflow illustrated | Draft/approved selection, unsaved edits, stale conflict, no authorized classes, matching/conflicting retry |
| WF-04 | Assigned learning, student | FR-17 | Current workflow illustrated | No assignments, pinned approved content, disabled/withdrawn relationship |
| WF-05 | External reading and reviewed entry, staff | FR-19–21 | Original prototype illustrates launch/entry; correction/history implemented separately | Unconfigured destination, separate sign-in, invalid counts, saved manual provenance |
| WF-06 | School roster, administrator | FR-02–FR-08, FR-26 | Simplified profile view plus reviewed original-receipt recovery illustration; actual forms mapped below | Reason/review, lost reply, same-actor reload/exact retry, original versus current, scope denial |
| WF-07 | Published family progress, guardian | FR-11–12 | Current publication rule illustrated | Published report, no published report, unrelated learner denied |
| WF-08 | School sign-in and separate synthetic demo | FR-01–FR-03 | Provider boundary plus explicitly fictional four-role illustration | Provider pending, default-off synthetic setup, fictional acknowledgement, role choice, no prototype authentication |
| WF-09 | AI draft assistant, staff | FR-22–23 | Proposed only | Missing source/provider, provisional draft, schema/error/refusal, teacher review |

## Working implementation screen designs

The clickable prototype now contains 12 illustrative screens: the original nine plus local profile-link, reading-import and submission-window review demonstrations. It does not connect to the application or reproduce all persisted workflows. The five v2.1 working-screen mappings and three v2.2 additions below distinguish source contracts from prototype simplifications. These additional wireframe specifications map the implemented route/form structure and expected states, rather than fabricating extra prototype interactions or screenshots.

| ID / route | Role and page structure | Controls / decision boundary | Required states |
|---|---|---|---|
| WF-10 `/admin/users` | Administrator; heading/provider hint → capped school-account cards → selected status review → new reviewed-account form → latest event list | Exact name/email/role/issuer/subject, reason and confirmation; status expected version; own-disable control absent; up to 500 accounts/200 events labelled | Initial loading/empty,401 redirect,403 permission,400 validation,409 refresh/reopen, uncertain same-payload retry, confirmed saved/refresh failed |
| WF-11 `/curriculum` | Staff; manual/source-rights hint → visible source list → new source form | Managers see drafts; peers see approved sources; manual text/context/source/right declaration, stable create reference | No sources, no approved peer source, invalid bounds/URL/rights, save uncertainty, duplicate/conflict |
| WF-12 `/curriculum/{id}` | Staff; exact source/version selection → content/declared rights → manager revision/review → copy-to-draft | Explicit exact review checkbox; new versions unapproved; choose lesson/worksheet/quiz/activity copy; copied draft never inherits source approval | Forbidden/hidden source, latest private draft versus peer approved view, stale edit, pending review, copied successfully/refresh failure |
| WF-13 `/assignments/{id}` | Student or current scoped staff; pinned student-edition material → chronological attempts → selected attempt feedback | Student plain-text append; staff exact-attempt formative feedback with explicit confirmation; due date informational; reviewed new-attempt windows current; no guardian access/grades/uploads | No attempts, missing active relation, private-field exclusion, stale attempt/feedback sequence, retained text after uncertain save, confirmed save with refresh issue |
| WF-14 `/reading-review` | Staff; class/learner filters → original/effective observation → full correction chain → exact-task comparison table → correction form | Reviewed replacement metrics/reason/confirmation; edits clear confirmation; inactive learner evidence remains available to current staff; no normative chart/grade/diagnosis | Loading/empty, roster name unavailable but scoped observation ID retained, invalid counts/date,403/404 stale data cleared,409 reload, uncertainty, preserved confirmed correction |

| WF-15 `/admin/profile-links` | Administrator; capped student/guardian profile cards and eligible account lookup → exact link/unlink review → original/current decision history | Explicit account ID or null unlink, expected profile version, reason and checkbox; any edit clears review; old request returns original event/current binding | Unlinked/occupied/legacy mapping, role/school denied, stale 409/reopen, uncertainty, preserved reviewer session and truthful acknowledged result |
| WF-16 `/reading-imports` | Staff; class/active-ID template help → local normalized JSON/error list → immutable staged original items → review reason/checkbox → attributable terminal result/receipts | 1–25 exact mapped rows, user-declared source namespace/stable references; no URL fetch; confirm all active or reject; no editable staged values | Empty/loading, unknown learner/strict validation, withdrawn eligibility, duplicate receipt 409 leaves staged, partial-failure rollback, exact retry, acknowledged result/refresh problem |
| WF-17 `/assignments/{id}` window component | Staff; safe current summary → open/closed/device-local optional cutoff form → reason/checkbox → latest 100 review history; student sees safe summary only | Separate from informational due date; immutable expected revision; edits/revision/refresh clear confirmation; committed attempt retry survives closure | Unrestricted default, future/elapsed/closed, stale policy 409, live authority denied, uncertain same-payload UUID, saved/history-refresh risk; no grade/late penalty |

The manual browser procedure in `tests/worker-specification-ui-check.mjs` exercises the actual implementation journeys, mobile labels/width, review confirmation, escaped content, role denial and selected uncertain-save behavior using synthetic sessions. Its source mapping does not record an execution or replace keyboard/screen-reader/educator acceptance.

Each screen uses native labelled controls, grouped fields, announced status/error feedback and full-page links. Source app layouts enforce signed-in role access; APIs/services still decide object authority. Cards/text wrap on small screens; comparison tables have explicit scrolling. Keyboard, screen-reader and pilot-language acceptance remain unrun until the selected matrix and intentional procedures are executed.

## Review interactions

Navigate with the screen buttons. In authoring, edit and save a draft. In review, confirm the saved version, approve it, choose a class and assign. Open student learning to see that exact content. Create a later draft in review; the learner assignment remains pinned to its earlier approved body. The reading screen recalculates numeric rate/accuracy and disables an invalid entry. Proposed AI controls remain unavailable rather than showing a fabricated generated response.

The prototype simplifies routing and history for demonstration. Actual authorization, server validation, concurrent edits, persistence, live identity and publication are specified in FSD/API/LLD and verified separately. Browser printing in the implementation is described in FR-18; the prototype only explains the print action.

## Layout and content rules

Use a readable single primary column, grouped fields, explicit labels, visible required indicators, helpful empty states and status feedback. On small screens the navigation wraps and two-column forms become one column. Long tables use horizontal overflow rather than clipping. Keyboard focus is visible. Status messages use an announced live region; buttons state the operation instead of relying on icons/color.

Keep staff-only notes/answer keys grouped and labeled. Learner screens receive only safe student-edition fields. Teacher approval refers to a visible saved version. Reload actions must explain when unsaved edits are replaced; conflict text preserves the user’s work and discourages blind retries. External reading must state separate sign-in and manual provenance. Curriculum fields must not imply validated alignment from a free-text label.

## Design acceptance and limits

Educator/staff/student/guardian reviewers should walk through their relevant screens and mark unclear labels, excessive steps, missing states and content suitability. Validate keyboard, focus order, screen reader announcements, responsive layouts and print before pilot. Accessibility target, supported browsers, languages and formal usability criteria are pending decision; this artifact is not an accessibility certification.

Trace screens into [test cases](TEST-CASES.csv) and [functional specification](FSD.md). Keep prototype changes consistent with requirement state and [change control](CHANGE-CONTROL.md).

## v2.2 prototype review path

Open the three new navigation buttons. Profile review links/unlinks a fictional exact account, appends browser-memory history and resets review on field edits. Reading JSON stages a bounded fictional preview, then requires a reason and checkbox to confirm/reject; every outcome says prototype and creates zero real records. Submission-window review shows default unrestricted access, a reviewed closed/open/elapsed state and local history, independently of due date. Native labels/buttons/status and focus remain accessible by keyboard; navigation focuses each selected screen heading. Mobile forms stack and tables scroll.

Prototype validation illustrates selected boundaries and is not the server schema, live scope, race/retry, database-clock or persistence implementation. No network, localStorage, credentials, vendor integration or school data exists in this artifact. Browser and educator acceptance remain unrun; [case register](TEST-CASES.json) contains intentional procedures.

The [offline wireframe checker](../../tests/worker-wireframes-check.mjs) provides reproducible synthetic checks for screen focus, labels, responsive width and selected review interactions. It exercises the local prototype separately from served application checks; it does not execute or accept the designed UAT cases.

## v2.3 existing structure, report and inbox mappings

The same 12-screen offline prototype remains labelled fictional and does not gain a new screen merely because publication receipts were added. Existing WF-07 family progress and WF-08 roster sketches carry clarified scope text; persisted admin/report/inbox journeys are described here from source, not simulated as verified API responses.

| Existing application page | Current role/control behavior | Required review/error states |
|---|---|---|
| `/schools`, `/courses`, `/classes` (WF-08 context) | Scoped role lists; only admin updates existing school/creates course/class in verified school. Teacher picker uses admin-safe account fields; no typed tenant switch or Create School control. | Loading/empty, unavailable school/teacher/course, invalid fields, permission/conflict, uncertain save and saved-row/reload failure; native labels, focus, mobile wrapping |
| `/report-cards` (WF-07 context) | Scoped learner selector/reports. Admin only: draft term/grade/summary, saved-report review checkbox and publish. Teacher/family read permitted reports; family drafts private. | Draft save uncertainty retains text and blocks another create until reload/check; publication uncertainty reloads persisted status/review; no new draft UUID guarantee; visible alerts/status/mobile labels |
| `/report-cards/{id}` | Scoped persisted report details and browser print | Loading, unavailable/denied/error; grade/summary remain school supplied, no inferred grading engine |
| `/notifications` (historical v2.3 WF-07 context; superseded by WF-18 below) | Personal recipient inbox and Mark as Read; retained historical notice does not grant current student/report access | Loading/empty/error; in-flight disabled action, failed/uncertain acknowledgement keeps inbox and offers same-notice retry; long text wraps |

API authorization remains independent of rendered controls. Publication receipt/reviewer metadata is private and no receipt/history UI is invented. Local prototype/source/automated browser evidence does not substitute for intentional screen-reader, language, publication/retention or educator acceptance.

Final structure source state rules: class selects current course/teacher choices, course uses verified school with no editable tenant ID, and existing-school name/address updates preserve an unchanged null address. Native required fields and synchronous save locks apply. Rejected requests retain text; 409 requires current inventory reload, and network/500 uncertainty blocks new create until explicit saved-list inspection. Confirmed-save refresh failure reports the save separately. School recovery loads saved values without replacing retained edits. Actual browser evidence remains separate from intentional UAT.

## v2.4 existing dashboard implementation mapping

| Existing screen | Current structure | Explicit states and limits |
|---|---|---|
| `/dashboard/admin` | Current-school name → exact student/course/class/eligible-teacher counts → scoped native links → SQL snapshot time | Lost actor redirects; enabled mapped teacher accounts; no global or capped fake totals |
| `/dashboard/teacher` | Assigned classes/course/term/current roster → actual assessment recording coverage → native attendance/results links → refresh/snapshot | Missing/recorded/no roster/needs review; saved zero counts; duplicate/invalid flags; 100 per collection with exact total/truncation |
| `/dashboard/guardian`, `/dashboard/student` | Current linked profiles → observed attendance status/date counts → published school-supplied report summaries/links → refresh/snapshot | No profile/no attendance/no reports distinct; excused-only/other/invalid dates; 50 profiles/20 reports each with exact total/truncation; private data excluded |

The existing offline teacher dashboard panel now illustrates recording states with fictional counts; no new screen is invented for the read service. Consolidated resource/reading buttons remain a labelled layout proposal separate from current role-dashboard behavior. Family report prototype includes a raw attendance/no-percentage explanation. The prototype remains 12 local screens with zero sign-in/API/persistence; it cannot prove live SQL scope, actual server redirects or production access. Intentional TC-180/TC-181 accessibility/educator review remains unrun.

## v2.5 attendance implementation mapping

The offline prototype remains 12 fictional screens; no new screen is invented merely for the new evidence tables. The existing role dashboard context carries the raw attendance/explicit review boundary; the following mappings describe actual source journeys independently of prototype interaction.

| Actual route | Current structure | Required state and decision boundary |
|---|---|---|
| `/attendance` | Native class selector + Refresh → current selected class/SQL snapshot time → named pupil/admission/currentActive cards → raw status/date evidence | Clear old content before selection; cancel obsolete loads; empty/denied/error separate; invalid dates/no data/other/excused and exact total/cap 100 visible; no notes/percentage; staff-only native review link |
| `/classes/{id}/attendance` | Staff/current class → local calendar date + Reload → current saved full evidence + deliberate status/note controls → dirty count/reason/review → confirmed original receipt/history | Blank unrecorded status, no default present; empty/cap/legacy ambiguity blocks saves; any change clears review; null/empty/unchanged long note retained; expected before fields submitted exactly |
| Same recorder recovery | Announced/focused failure/status → saved/current evidence comparison → original pending request action | 409 retains intended dirty entries until reload/review; uncertain request freezes UUID/payload/date/edits; access loss clears private stale evidence and verifies access before retry; acknowledged receipt persists after refresh failure |

History shows latest 100 exact-date original reviews with total/truncation and reviewer/reason/time plus full before/after records; name lookup uses current roster with stable pupil-ID fallback for withdrawn history. Date selection clears prior edits/reason/review/history and preserves literal calendar values. Native labels/fieldset/checkbox/status/focus and wrapping cards support keyboard/mobile review; [recorder browser procedure](../../tests/worker-attendance-ui-check.mjs) is related evidence, not screen-reader/educator acceptance. The source design is in [attendance design](ATTENDANCE-DESIGN.md), with intentional TC-203/TC-205 still unrun.

## v2.6 assessment review within existing staff flow

The production staff `/assessments/{id}` uses one coherent active-roster editor snapshot and reviewed history. Fields show literal date and stored maximum, raw warnings/caps/ambiguity, blank missing scores, legitimate 0 and school-supplied grade/feedback. Explicit reason/review controls clear confirmation after edits/evidence changes. The existing offline teacher-dashboard screen includes a fictional reviewed-result example; no new screen is invented for the two evidence tables.

Before/after/history shows original reviewer/reason/time with current name or stable pupil-ID fallback. Conflict reload compares saved values and retains only intended dirty fields; uncertainty locks the original UUID/payload, hides unavailable private evidence on access loss and requires authorized reload before exact retry. Confirmed receipt stays visible separately from failed refresh. Native labels/anchors, status/error/focus and wrapping plaintext support desktop/mobile review. [Browser procedure](../../tests/worker-assessment-review-ui-check.mjs) remains related environment coverage, not intentional educator/screen-reader acceptance. [Assessment design](ASSESSMENT-DESIGN.md) defines actual limits; the 12-screen offline prototype stays fictional and local.

## Sixth-batch recovery states in existing learner/staff screens

The implemented `/learning` and `/assignments/{id}` keep existing screen roles. Label the current approved material separately from pending original response/feedback/window recovery. While unresolved, freeze editable fields/selection/new saves and show the explicit exact-retry action; current Refresh never rebases the original request. Known access loss hides material/history/policy/reason and protected actions, with separate-tab sign-in and authorized same-actor reload where needed. Acknowledged save plus refresh failure has separate status. Native labels/full-page anchors and mobile wrapping are required.

The offline 12-screen prototype remains fictional and is not a sixth-batch mounted-app reproduction. [Focused recovery design](LEARNER-RECOVERY-DESIGN.md), TC-243–TC-244 and the local browser procedure specify those states; app/source links are not business or accessibility acceptance.

## Historical v2.8 registry interaction requirements

The implemented student screen has labelled local name/admission search, shown/matching/loaded counts, native full-page View links to existing student profiles, administrator-only create dialog, explicit Reload students and hidden uncertain form. Guardians use the existing administrator form and Reload guardians, with a keyboard-focusable scroll region labelled Guardian profiles. Both clear private records on failed/uncertain reads and expose original submitted comparison identifiers only to the freshly authorized original actor; comparison starts blank without a POST. The existing 12-screen offline prototype remains fictional and labelled; it is not a real Radix/RHF registry rendering. See [registry design](REGISTRY-DESIGN.md) and TC-253.

## v2.9 current registry and isolated demo screen mapping

| Existing screen | Current application structure | Important states |
|---|---|---|
| `/students` | Current session/list/session → local name/admission search and shown/matching/loaded counts → native View → administrator dialog with accepted profile fields, reason and confirmation → original receipt | Loading/denied clears stale rows; edits clear review; same-frame lock;201/200 correlation;400 correction;409 reload/review; uncertain exact pending action; receipt hidden under lost/different actor |
| `/guardians` | Current scoped list in labelled keyboard scroll region → administrator accepted profile form/reason/review → original receipt and current list | Blank contacts normalized for reviewed form; unlinked original; exact pending retry; original receipt independent of later edit/link; no implicit family/entity verification |
| Registry recovery | Frozen original UUID/body privately in mounted page; current authorized same-actor reload/preflight before explicit Retry pending creation | No automatic retry/new UUID; private values hidden from other actors; original receipt versus failed/current list; hard reload/navigation loses in-page request |
| `/login` with demo off | School sign-in button and provisioned-school account explanation | Unconfigured provider fails closed; public role selection cannot grant school access |
| `/login` with isolated demo enabled | Fictional-data explanation/acknowledgement → four labelled role buttons → opening status/error → native navigation after correlated result | Before acknowledgement disabled; loading disables; fixed role scope; rate/unavailable errors; shared fictional samples; separate provider/ORF/AI setup |

The offline prototype still has12 screens and makes zero network or persistent-storage calls. Existing roster/login screens now illustrate reviewed creation/original exact retry/current-profile separation and synthetic-role acknowledgement; their simplified display-name field is not the complete production student/guardian validator. Simulated changed actor hides original private receipt/request details. Buttons change fictional browser memory only and cannot sign in, seed the application or prove SQL/hosted authority. Root records offline rendering and mounted current-app browser outcomes independently. TC-253/TC-276/TC-284 named acceptance remains unrun.

## Current enrolment and report screen mapping

| Existing route | Current structure | Key states |
|---|---|---|
| `/enrolments` | Current session/student/class/selected roster/session → current class selector and scoped rows → administrator new-pair/status controls → announced save/error and reload | Immediate selection clear; abort/generation/old-control guard; read-only nonadmin; same-frame lock; denied hide; unknown original-account comparison, no exact legacy replay |
| `/report-cards` | Current session/students/exact selected reports/session → learner selector → administrator typed private draft/saved-review publication → scoped report cards/native links | Family published-only; same-admin draft restore; learner/actor changes blank; duplicate lock; denied private clearing; original-report exact publication retry separate from manual draft comparison |
| Academic recovery | Private original page-memory reminder; original same-actor/selected-record reload before disclosure | Other account hides details; explicit comparison sends no mutation; publication retries same endpoint/body only; hard reload loses memory; no newUUID/CAS/grade/history policy |

Existing 12-screen offline roster/family illustrations remain simplified fictional review aids, not mounted academic forms or a simulation of every captured-control race. [Academic UI design](ACADEMIC-UI-DESIGN.md) and TC-293 specify actual source states and intentional mounted acceptance; no screenshot/callback aggregate implies business approval.

## Current family source screen mapping

The offline prototype stays 12 fictional screens with zero application/network/storage calls. This table maps the new current source; earlier v2.3 inbox failure wording is historical and superseded by these hiding/confirmation states. No mocked prototype response proves a real server read timestamp or account boundary.

| Source screen | Current structure and controls | Required states |
|---|---|---|
| WF-18 `/notifications` | Current account → Reload my inbox → owned saved-notice articles → deliberate Mark as Read → saved server time | Verified empty versus unavailable; old private body/actions hide on reload/denial/uncertainty; first readAt preserved; original-account exact retry; unavailable reminder dismissal makes no save claim; raw invalid date warning |
| WF-19 `/classes/{id}` | Current coherent class/profile snapshot → Reload current class → metadata → available-profile table with caption/focusable region → role-appropriate attendance anchor | Route/account mismatch hides whole old snapshot/navigation; unavailable versus verified empty; repeated profile disclosure with no record repair; family chooses named class in existing attendance viewer, staff opens recorder |

Native headings/buttons/anchors, focused announced error/status, literal stored-date warnings, table region/caption and wrapping text support review. Intentional TC-305/TC-313 keyboard/assistive/mobile/language/family acceptance remains unrun; [family design](FAMILY-UI-DESIGN.md) and [callback contracts](../../tests/integration/family-ui-contract.mjs) preserve their narrower source/execution boundaries.

## Current manual reading-practice screen

WF-20 `/reading-practice` is a current source-screen specification; the local offline prototype remains12 fictional screens. Read [planner design](READING-PRACTICE-DESIGN.md) for exact algorithms. No prototype screenshot or source mapping proves a saved copy, server authority or suitability.

| Region | Current controls | Required states |
|---|---|---|
| Navigation/status | Dashboard, reading history, curriculum and teaching-resource anchors; Reload current planner; focused status/alert | Staff-only route; denied/current-account mismatch hides all protected evidence; loading/verified empty/current reload |
| Reading evidence | Class and observation selects; original/effective descriptive values/provenance/revision; private focus textarea | No permitted observations; original versus correction; no current enrolment/normative interpretation; class/observation change resets focus/review; disappeared unsent observation clears selection/focus without later automatic restoration; unavailable pending observation hides captured focus but preserves exact recovery |
| Exact source/review | Reference and approved version selects; exact body/context/objectives/rights/attribution; format select; explicit suitability/permission checkbox | No approved version; language mismatch warning; every edit/reload clears review; private focus/evidence excluded from copied body |
| Draft/recovery | Create provisional practice draft; private original pending summary and explicit Recover original draft | Synchronous lock; denied/unknown result hides source/reading/focus/receipt; fresh original scope enables exact bytes/UUID; recovery 400/409 stays pending; no automatic retry |
| Original receipt/editor handoff | Original source/version and copied version 1; existing resource-editor anchor | Original copy separate from later selected source/current resource/approval/assignment; editor adapts/reviews/assigns separately; hard reload loses page memory |

Native labels/focus/status/wrapping support review; TC-321 and TC-329 intentionally inspect mounted keyboard/assistive/mobile/language and named educator/operator understanding. Callback contracts remain narrower evidence, and all designed cases/approvals retain their unrun/false states.

Current family inbox/class source layouts can be inspected through the frozen [mounted family procedure](../../tests/worker-family-ui-check.mjs). Its sampled native focus/labels, actual class shell privacy and 390px screenshots require a matching localhost/private fictional fixture and remain separate from the unchanged 12-screen offline prototype, assistive certification and named acceptance. Its named malformed/legacy projections do not rewrite saved records. Designed cases remain unrun.

## Current student profile and family assessment index mapping

The offline prototype remains12 fictional screens; WF-21/WF-22 below are source-screen mappings, not additional prototype screens or mounted screenshots. [Focused design](PROFILE-ASSESSMENT-UI-DESIGN.md) defines current contracts.

| Source screen | Current structure | Required states |
|---|---|---|
| WF-21 `/students/{id}` | Verified shell → dashboard/Students/report anchors → Reload student profile → literal student details → current scoped linked guardian cards → admin native Guardian to link chooser | Loading/denied hides old shell/private values; current verified empty differs from failure; exact DOB/raw warning; separate reviewed-login link; linked options excluded |
| Same profile association | Link Guardian → exact acknowledged pair versus current list → private original pending reminder/Retry pending guardian link | Synchronous lock; known-save/failed-refresh distinct; different actor hides names/retry; fresh original-admin reload before exact bytes;400/409 rejects; no auto retry/durable receipt; hard reload loses memory |
| WF-22 `/assessments` | Verified shell → role-specific explanatory copy → dashboard/report anchors → Reload assessments → native Filter by Class → shown/loaded status → metadata cards | Staff title native editor link; family text titles/Published report cards only; no result fetch; exact date/raw warning/safe maximum; honest empty/filter totals; malformed/final-actor mismatch hides whole view |

[Standalone mounted 36 procedure](../../tests/worker-profile-assessment-ui-check.mjs) was UNRUN at the historical v2.11 design freeze; dated actual outcomes are recorded separately in the [batch3 execution record](../current/EIGHT-HOUR-BATCH-3-EXECUTION.json). Sample native labels/focus at 390px and real report destination do not prove screen-reader/language/business acceptance, report content/publication or public primary evidence. TC-335/TC-349 require intentional review and retain unrun/false states.

## WF-24 and WF-25 current school/course recovery mapping

These source mappings supersede the historical v2.3 school/course retention paragraph for current behavior; class editor/detail remain unchanged. The same 12 fictional offline prototype screens remain. No extra clickable prototype or generated screenshot is claimed.

| ID / native route | Current roles and structure | Decisions and required states |
|---|---|---|
| WF-24 `/schools` | Four-role current existing-school card; admin saved-details alongside native name/address edit; required-principal header and Dashboard | Hide former header/card/fields while session/one-school/session verifies; whole invalid/denied unavailable, fresh reload usable. Dirty fields retained only same actor/school while untouched refresh. Null omission/explicit empty/no CAS warning. Known original private ack separate current card; unknown original submitted/current comparison, stable fresh key required, finish sends zero PATCH; other actor cannot see/clear pending. |
| WF-25 `/courses` | Four-role authorized catalog/count/explicit empty; admin current-school/native code/title/description/grade form | Whole current read before display; school derived, synchronous one POST/fresh original admin, exact canonical ACK. Known generic save/private original returned reference separate current rows; rejected400/409 requires reload/correction. Unknown original fields/checkbox and Finish comparison starts blank with zero POST; global code/hidden-record/no receipt limits; other actor/stale controls cannot bypass pending. |

Use native labels, announced focused messages, wrapping saved/submitted content, separate-tab sign-in and 390px intentional keyboard/mobile review. Navigation/hard reload loses private bytes and a started write may persist. New 40 [mounted procedures](../../tests/worker-school-course-ui-check.mjs), retained 26 [structure handoff](../../tests/worker-structure-ui-check.mjs) and TC-360/TC-371 acceptance are separate/unrun at freeze. [Exact design](SCHOOL-COURSE-UI-DESIGN.md) records nullable-address restoration and source/projection limits; no screen-reader/language/hosted acceptance is fabricated.
