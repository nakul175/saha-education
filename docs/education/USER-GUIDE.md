# User guide and demo walkthrough

> Documentation version 1.0 · 5 October 2026 · Draft for sponsor review.
> Describes the Next.js rebuild at `b4cbfc5f6855479ed523b5bf4c0aed0d2b6f6e3d`, not the legacy application on `main`.
> Requirements are proposed targets; code presence does not establish acceptance or production readiness.

## Before starting

This is a guide to the intended school workflows and the rebuild's demo routes. It is not a claim that each workflow is currently usable. Use synthetic names and records. The demo login chooses a role; it does not verify a person's identity. There is no confirmed hosted URL in this documentation.

## Sign in and sign out

Open /login and choose the available demonstration role. The session lasts up to an hour via the demo cookie. Sign out before choosing a different role; the session endpoint returns the existing principal if already signed in. A production account and password recovery flow are not implemented.

## Administrator

Open /dashboard/admin, then /schools and /students to inspect and maintain synthetic records. Add a guardian under /guardians and link them from a student's detail page. Define courses under /courses, create classes under /classes, then use /enrolments to build a roster. Do not assume saving succeeded: confirm the success result and reload the record.

Known blockers: student creation uses request-less authentication; teacher selection calls a missing user endpoint; the Manage Teachers link has no matching page; enrolment endpoints have authentication/payload/path mismatches. Report these as defects rather than entering real data or trying to bypass authorization.

## Teacher

Open /dashboard/teacher and an assigned class. Use /classes/:id/attendance, choose a date and mark the roster. The valid attendance labels are present, absent, late and excused. Review assessments under /assessments and their detail pages, enter scores and feedback, and review term reports under /report-cards.

Known blockers: attendance authentication is request-less; assessment collection routing is inconsistent; a dashboard results link points to a missing UI page. Current saves are not proven atomic and report grades are not automatically calculated from an approved scale.

## Guardian and student

Guardian dashboard route: /dashboard/guardian. Intended access is restricted to linked children and published reports. The current access model and student/user relationship are incomplete. There is no dedicated student dashboard. Do not interpret an accessible record as proof you are authorized to view it.

## Notifications and reports

/notifications is intended to show notices and let recipients mark them read. Its request-less authentication blocks intended access. Report publication stores a timestamp and attempts in-app notices, but recipient mapping is faulty. Email and SMS are stubs and no message delivery is established.

## Help and corrections

For a failed save, record the route, role, synthetic record ID, time and visible error; preserve entered values before retrying. An attendance or publication batch may have partially succeeded, so inspect persisted state before repeating it. Never send real student records or session cookies in a support report. Support contacts and correction approval rules must be set before rollout.
