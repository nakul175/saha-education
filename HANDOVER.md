# Saha Education handover

## Current delivery

The latest implementation candidate is on `feat/teacher-resource-workspace`, incorporating the authentication/access and external-reading candidates. It imports the existing Next.js rebuild onto a branch created from main, includes the education documentation baseline, and adds provider-based authentication plus record access control. The default remote rebuild previously used demo role selection. No branch was merged and no hosted service was deployed by this work.

Read [authentication/access delivery](docs/current/AUTH-ACCESS.md), [validation](VALIDATION.md), and the [requirements documentation](docs/education/README.md). The original architecture/data/API documents outside docs/education are historical and may contain unsupported statements.

## Implementation boundary

Verified OIDC issuer/subject mappings, browser-bound one-use sign-in transactions, opaque digest-stored D1 sessions, live role/school/disabled checks, matching-origin mutation checks, authenticated APIs/page layouts and scoped domain services are implemented. Role cookies/public identity headers confer no authority. Families see linked records and published reports; unpublished assessment results are staff-only. School bootstrap remains explicit operator provisioning.

Provider name/tenant/configuration remains pending. Login fails closed without it. No automatic user registration or real recipient/provider activation exists. Migration 0001 intentionally does not backfill legacy relationships; approve and map identities/profile ownership explicitly before usage.

## Verification commands

```sh
node scripts/run-framework.mjs build
node scripts/test.mjs static unit integration --fast
python3 scripts/check-documentation.py
node scripts/audit-requirements.mjs --check
```

Use the manifest's Node/pnpm toolchain; current check environment and actual results are in VALIDATION.md. Fast tests reuse a build; perform a fresh build after code changes. No empty/placeholder test layer is acceptance proof. Served checks are manual and synthetic; see tests/worker-access-check.mjs and its local-only environment requirements.

## Requirement assessment and next delivery

| Requirement | Assessment | Evidence / next boundary |
|---|---|---|
| EDU-F01 | Partial, unapproved | OIDC/session tests pass; real provider and browser callback pending |
| EDU-F02 | Partial, unapproved | Scoped DB/API/served checks pass; full role journey/UAT approval pending |
| EDU-F04/F06 | Partial, unapproved | Explicit identity/profile mapping and safe user listing; provisioning administration pending |
| EDU-F11/F12 | Partial, unapproved | Private drafts and retry-safe user-mapped publication notices; policy/UAT pending |
| EDU-N04 | Partial, unapproved | Atomic batch behavior/guard contracts checked; pair concurrency constraints remain |
| TCH-01–04 | Partial, unapproved | Structured drafts, immutable revisions, exact-version approval/assignment and learner-safe views; educator/UAT acceptance pending |
| Next delivery | Teacher workspace validation and provider setup | Choose pilot curriculum/templates, run educator review, confirm provider and verify live synthetic callback; submissions, AI drafting and external adapters follow |

## Remaining product gaps

Teacher/family UI journeys and controls need broader UAT. Academic dates/grade policy, result publication, historical enrolment eligibility, duplicate pair constraints, audit revisions, retention, performance/accessibility and recovery remain unapproved or incomplete. Email/SMS delivery remains disabled. A production database/hosting pipeline is not established by the local build.

## Git and release rules

Read AGENTS.md. Commit/push meaningful batches; preserve concurrent work; never force-push. Pull requests target main and require sponsor authority for merge. Main held the legacy Express app before this candidate, so the implementation PR includes the existing rebuild as well as the new stage. Preserve hosting config and historical commits. Confirm actual deployment wiring before merging. Keep secrets, records, fixtures with credentials, databases, caches and generated artifacts out of Git.

## Literacy extension candidate

External ORF launch and append-only manually reviewed reading checks are implemented on `feat/education-literacy-apps`, dependent on the authentication candidate. Destination remains blank pending sponsor confirmation; no external SSO/result sync is implemented. Staff UI is `/external-apps`. Migration0002 is additive. See [external reading](docs/current/EXTERNAL-READING.md) and [AmplifiU teacher workspace plan](docs/current/AMPLIFY-LITERACY-PLAN.md). The sponsor confirmed AmplifiU as the reference teacher AI product. Next: structured resource drafts/review and class assignments; confirm the ORF destination and identity provider separately. AI drafting and external result sync remain unimplemented.

## Teacher workspace candidate

Manual lesson/worksheet/quiz/activity drafts, immutable revisions, explicit exact-version review, class assignments and learner views are implemented. Teachers manage their own resources; school administrators manage school resources. Assignments recheck class authority at insertion, preserve the approved version and omit private notes/answer keys from all learner-facing API responses. Staff can print student or explicitly chosen teacher editions. See [teacher workspace](docs/current/TEACHER-WORKSPACE.md) for scope and draft requirements. No AI provider, curriculum import, online submission/grading or notification service is activated. Templates remain curriculum-neutral until a pilot curriculum is chosen.
