# Saha wireframes and navigation specification

Draft, 5 October 2026. Open the [interactive wireframes](wireframes/index.html) locally. They use fictional data and browser-memory interactions only: no application API, identity, school record or external service is called. Refresh resets the prototype. These are review artifacts, not generated screenshots of an implemented product.

## Screen inventory

| ID | Screen and role | Requirement links | Current or proposed | Important states |
|---|---|---|---|---|
| WF-01 | Teacher dashboard | FR-03, FR-13, FR-19 | Proposed consolidated layout for existing entries | Loading, empty resources, unavailable reading connection |
| WF-02 | Resource authoring, staff | FR-13, FR-22 | Current workflow illustrated; reference library future | Empty fields, template switch, validation, saving, uncertain response |
| WF-03 | Saved-version review and class assignment, staff | FR-14–16 | Current workflow illustrated | Draft/approved selection, unsaved edits, stale conflict, no authorized classes, matching/conflicting retry |
| WF-04 | Assigned learning, student | FR-17 | Current workflow illustrated | No assignments, pinned approved content, disabled/withdrawn relationship |
| WF-05 | External reading and reviewed entry, staff | FR-19–21 | Launch/entry current; correction/trend future | Unconfigured destination, separate sign-in, invalid counts, saved manual provenance |
| WF-06 | School roster, administrator | FR-04–08 | Simplified record view; complete identity administration future | Active/withdrawn enrolment, missing explicit account/family links, scope denial |
| WF-07 | Published family progress, guardian | FR-11–12 | Current publication rule illustrated | Published report, no published report, unrelated learner denied |
| WF-08 | School sign-in | FR-01–03 | Current configuration boundary | Provider pending/unavailable, provisioned account, failed/expired callback |
| WF-09 | AI draft assistant, staff | FR-22–23 | Proposed only | Missing source/provider, provisional draft, schema/error/refusal, teacher review |

## Review interactions

Navigate with the screen buttons. In authoring, edit and save a draft. In review, confirm the saved version, approve it, choose a class and assign. Open student learning to see that exact content. Create a later draft in review; the learner assignment remains pinned to its earlier approved body. The reading screen recalculates numeric rate/accuracy and disables an invalid entry. Proposed AI controls remain unavailable rather than showing a fabricated generated response.

The prototype simplifies routing and history for demonstration. Actual authorization, server validation, concurrent edits, persistence, live identity and publication are specified in FSD/API/LLD and verified separately. Browser printing in the implementation is described in FR-18; the prototype only explains the print action.

## Layout and content rules

Use a readable single primary column, grouped fields, explicit labels, visible required indicators, helpful empty states and status feedback. On small screens the navigation wraps and two-column forms become one column. Long tables use horizontal overflow rather than clipping. Keyboard focus is visible. Status messages use an announced live region; buttons state the operation instead of relying on icons/color.

Keep staff-only notes/answer keys grouped and labeled. Learner screens receive only safe student-edition fields. Teacher approval refers to a visible saved version. Reload actions must explain when unsaved edits are replaced; conflict text preserves the user’s work and discourages blind retries. External reading must state separate sign-in and manual provenance. Curriculum fields must not imply validated alignment from a free-text label.

## Design acceptance and limits

Educator/staff/student/guardian reviewers should walk through their relevant screens and mark unclear labels, excessive steps, missing states and content suitability. Validate keyboard, focus order, screen reader announcements, responsive layouts and print before pilot. Accessibility target, supported browsers, languages and formal usability criteria are pending decision; this artifact is not an accessibility certification.

Trace screens into [test cases](TEST-CASES.csv) and [functional specification](FSD.md). Keep prototype changes consistent with requirement state and [change control](CHANGE-CONTROL.md).
