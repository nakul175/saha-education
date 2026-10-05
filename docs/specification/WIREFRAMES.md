# Saha wireframes and navigation specification

Draft, 5 October 2026. Open the [interactive wireframes](wireframes/index.html) locally. They use fictional data and browser-memory interactions only: no application API, identity, school record or external service is called. Refresh resets the prototype. These are review artifacts, not generated screenshots of an implemented product.

The v2.1 extensions describe the current working candidate on `feat/specification-delivery`, based on documentation commit `d53adcf`. The original v2.0 application baseline remains `5488bc0d20412a3d4be0c031c99c259c56834d5e`. New behavior is not attributed to that historical SHA; actual execution is recorded separately and all business acceptance remains unapproved.

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

The original clickable prototype still contains nine illustrative screens; it does not call or recreate the five new working screens below. These additional wireframe specifications map the implemented route/form structure and expected states, rather than fabricating extra prototype interactions or screenshots.

| ID / route | Role and page structure | Controls / decision boundary | Required states |
|---|---|---|---|
| WF-10 `/admin/users` | Administrator; heading/provider hint → capped school-account cards → selected status review → new reviewed-account form → latest event list | Exact name/email/role/issuer/subject, reason and confirmation; status expected version; own-disable control absent; up to 500 accounts/200 events labelled | Initial loading/empty,401 redirect,403 permission,400 validation,409 refresh/reopen, uncertain same-payload retry, confirmed saved/refresh failed |
| WF-11 `/curriculum` | Staff; manual/source-rights hint → visible source list → new source form | Managers see drafts; peers see approved sources; manual text/context/source/right declaration, stable create reference | No sources, no approved peer source, invalid bounds/URL/rights, save uncertainty, duplicate/conflict |
| WF-12 `/curriculum/{id}` | Staff; exact source/version selection → content/declared rights → manager revision/review → copy-to-draft | Explicit exact review checkbox; new versions unapproved; choose lesson/worksheet/quiz/activity copy; copied draft never inherits source approval | Forbidden/hidden source, latest private draft versus peer approved view, stale edit, pending review, copied successfully/refresh failure |
| WF-13 `/assignments/{id}` | Student or current scoped staff; pinned student-edition material → chronological attempts → selected attempt feedback | Student plain-text append; staff exact-attempt formative feedback with explicit confirmation; due date informational; no guardian access/grades/uploads | No attempts, missing active relation, private-field exclusion, stale attempt/feedback sequence, retained text after uncertain save, confirmed save with refresh issue |
| WF-14 `/reading-review` | Staff; class/learner filters → original/effective observation → full correction chain → exact-task comparison table → correction form | Reviewed replacement metrics/reason/confirmation; edits clear confirmation; inactive learner evidence remains available to current staff; no normative chart/grade/diagnosis | Loading/empty, roster name unavailable but scoped observation ID retained, invalid counts/date,403/404 stale data cleared,409 reload, uncertainty, preserved confirmed correction |

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
