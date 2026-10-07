# Accessibility statement (WCAG 2.2)

Owner: Nakul Jain · Last reviewed: 2026-10-08 · Update trigger: a human accessibility review, a significant UI change, or a pilot starting.
**Status: target only. No conformance is claimed.** Agent-drafted 2026-10-08; not reviewed by a person.

## Target

WCAG 2.2 level AA for all pages used by administrators, teachers, guardians and students. The product requirement is NFR-05 with BR-11 ("accessible learner/staff journeys"); the supported browser, assistive-technology and language matrix is not approved ([DECISIONS-RISKS.md](../specification/DECISIONS-RISKS.md) D-14).

## What has been checked (automated only)

From [DEMO-experience.md](../current/DEMO-experience.md) and `tests/worker-accessibility-check.mjs`:

- 114 page audits (31 routes, 57 role and route pairs, each at 375 px and 1280 px): page served, no horizontal scroll, named controls and links, one `main` landmark, a page language, no button inside a link, and axe-core serious or critical violations under the `wcag2a`, `wcag2aa`, `wcag21a` and `wcag21aa` rule tags. Result recorded: zero such findings on the audited pages.
- Skip link is the first Tab stop and the next control shows a focus indicator on each role's home page.
- A 100-page sample check passed, and its own output says it is not accessibility acceptance.

## Limits

- The rule tags used are WCAG 2.0 and 2.1; **no WCAG 2.2-specific criterion** (target size, focus not obscured, dragging alternatives, accessible authentication, consistent help) has been tested.
- No screen-reader, zoom or reflow, high-contrast, keyboard-only walkthrough, or print review by a person. The designed accessibility cases (for example TC-088, TC-089, TC-180) are blocked: they need a named human reviewer.
- Interface text is English only; Hindi content is stored and shown but labels are not translated. Locale review has not been done.
- Forms announce validation and conflict messages in ways not exercised by assistive technology.
- Printing of report cards, and the offline prototype wireframes, are not assessed.

## Feedback

Report an accessibility barrier to nakul.jain@aplyd.com. Response time: TBD.

## Next steps

Assign a human reviewer with a screen reader; add WCAG 2.2 checks (for example axe rules for 2.2 where available plus manual checks); record results here with dates.
