# User guide and administrator guide

Owner: Nakul Jain · Last reviewed: 2026-10-08 · Update trigger: any change to a page, role or sign-in method; screens win over this text.
Status: agent-drafted from [docs/DEMO.md](../DEMO.md), [AUTH-ACCESS.md](../current/AUTH-ACCESS.md) and [DEMO-identity.md](../current/DEMO-identity.md). Written for the **synthetic demo only**; nothing here is school-validated training material. [docs/education/USER-GUIDE.md](../education/USER-GUIDE.md) describes the old rebuild and is superseded.

## Before you start

- The demo school ("River School") is invented. Do not type real names, dates of birth or contact details.
- On the droplet the site first asks for a username and password (the password wall). Ask the owner (Nakul Jain) for one; passwords are never written in documents. Then the app's own demo login asks you to tick that the records are fictional and pick a role. Locally: `pnpm demo`, then open `http://127.0.0.1:8787/login` (use `127.0.0.1`, not `localhost`).
- The page `/account` shows who you are signed in as and lets you sign out. Real school sign-in (OIDC) is not set up; the login page says so.

## User guide by role

| Role | What you can do | Where |
|---|---|---|
| Guardian | See your linked children, their attendance, **published** report cards and notices; mark your own notices read | Home, Report cards, Notices |
| Student | See class resources, your own results and feedback, your own notices | Class resources, home |
| Teacher | Take attendance, enter results, read reading history, manage resources and notices for your own classes | Classes, Assessments, Reading history |
| Administrator | Everything in your own school: records, courses, classes, enrolment, publishing reports | Students, Courses, Classes, Report cards |

Five-minute walkthrough for each role: [docs/DEMO.md](../DEMO.md) ("Five-minute walkthrough"). Each role's home page also shows a "Try this" box in demo mode.

If a save fails: note the page, role, time and message, keep what you typed, and check the record before trying again, because a first attempt may have worked. Do not share session cookies or real student details when asking for help. Support contact: Nakul Jain (nakul.jain@aplyd.com); support hours TBD.

## Administrator guide

1. **Accounts** (`/admin/users`): search and filter accounts, provision a school account, review access, change a role, link or unlink the school sign-in identity, and read the history. The app refuses to disable the last administrator or your own account. Accounts are only created for people the school has approved; there is no public signup. Details: [AUTH-ACCESS.md](../current/AUTH-ACCESS.md), [DEMO-identity.md](../current/DEMO-identity.md).
2. **Profile links** (`/admin/profile-links`): connect a student or guardian record to an account. Links are explicit; nothing is matched by email.
3. **Audit and corrections** (`/admin/audit`): read the school's change history across areas, filter it, and add a reasoned note beside an entry without altering the original ([DEMO-notices-audit.md](../current/DEMO-notices-audit.md)).
4. **School setup, students, guardians, courses, classes, enrolment**: demonstrated in [DEMO.md](../DEMO.md); lifecycle rules are in [DEMO-school-records.md](../current/DEMO-school-records.md) and [DEMO-courses-enrolment.md](../current/DEMO-courses-enrolment.md).
5. **Droplet sign-ins:** add or reset a person with `saha-education-add-user <email>` ([RUNBOOKS.md](RUNBOOKS.md) 6).
6. **Synthetic test identities:** `node scripts/provision-synthetic-identities.mjs --synthetic ...` writes SQL for review; it never applies it and is not a production tool.
7. **Operations:** [RUNBOOKS.md](RUNBOOKS.md), [BACKUP-DR.md](BACKUP-DR.md), [INCIDENT-PROCESS.md](INCIDENT-PROCESS.md).

## Known limits

Interface text is English only; accessibility has automated checks but no human review ([ACCESSIBILITY-STATEMENT.md](ACCESSIBILITY-STATEMENT.md)); many school policies (grading, publication, correction, retention) await a named approver ([DECISIONS-RISKS.md](../specification/DECISIONS-RISKS.md)).
