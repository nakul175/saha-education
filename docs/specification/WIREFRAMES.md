# Saha wireframes and navigation specification

Draft, 5 October 2026. Open the [interactive wireframes](wireframes/index.html) locally. They use fictional data and browser-memory interactions only: no application API, identity, school record or external service is called. Refresh resets the prototype. These are review artifacts, not generated screenshots of an implemented product.

The v2.2 implementation candidate was prepared on `feat/specification-delivery`. `source_commit` records `398df9c8bf57659a5fd97718f76fe962011cf7d2`, the parent of this documented batch, rather than the commit containing its changes. The changes were uncommitted when this specification was assembled; dated publication and execution records are maintained separately. The v2.0 application baseline remains `5488bc0d20412a3d4be0c031c99c259c56834d5e`, and v2.1 evidence remains historical. Every requirement is unapproved and every designed case is `not-run-for-this-specification`.

## Screen inventory

| ID | Screen and role | Requirement links | Current or proposed | Important states |
|---|---|---|---|---|
| WF-01 | Teacher dashboard | FR-03, FR-13, FR-19 | Proposed consolidated layout for existing entries | Loading, empty resources, unavailable reading connection |
| WF-02 | Resource authoring, staff | FR-13, FR-22 | Original prototype illustrates manual authoring; current library has separate screens below | Empty fields, template switch, validation, saving, uncertain response |
| WF-03 | Saved-version review and class assignment, staff | FR-14–16 | Current workflow illustrated | Draft/approved selection, unsaved edits, stale conflict, no authorized classes, matching/conflicting retry |
| WF-04 | Assigned learning, student | FR-17 | Current workflow illustrated | No assignments, pinned approved content, disabled/withdrawn relationship |
| WF-05 | External reading and reviewed entry, staff | FR-19–21 | Original prototype illustrates launch/entry; correction/history implemented separately | Unconfigured destination, separate sign-in, invalid counts, saved manual provenance |
| WF-06 | School roster, administrator | FR-04–08 | Simplified profile view; reviewed account/status UI implemented separately | Active/withdrawn enrolment, missing explicit account/family links, scope denial |
| WF-07 | Published family progress, guardian | FR-11–12 | Current publication rule illustrated | Published report, no published report, unrelated learner denied |
| WF-08 | School sign-in | FR-01–03 | Current configuration boundary | Provider pending/unavailable, provisioned account, failed/expired callback |
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
