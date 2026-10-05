# Saha Education handover

## Current delivery

The current documentation candidate is on `docs/platform-specification`, based on the application candidate `5488bc0` from `feat/teacher-resource-workspace`. The application incorporates the authentication/access and external-reading candidates and imports the existing Next.js rebuild onto a branch created from main. The default remote rebuild previously used demo role selection. No branch was merged and no hosted service was deployed by this work.

Start with the current [BRD](docs/specification/BRD.md), then [FSD](docs/specification/FSD.md), [HLD](docs/specification/HLD.md) and [LLD](docs/specification/LLD.md). The [specification index](docs/specification/README.md) links the parallel test pack, wireframes, data dictionary, API/integration contracts, risks and operations documents. Read [authentication/access delivery](docs/current/AUTH-ACCESS.md) and [validation](VALIDATION.md) for implementation evidence. The original [education requirements baseline](docs/education/README.md) remains historical; older architecture/data/API documents may contain unsupported statements.

## Implementation boundary

Verified OIDC issuer/subject mappings, browser-bound one-use sign-in transactions, opaque digest-stored D1 sessions, live role/school/disabled checks, matching-origin mutation checks, authenticated APIs/page layouts and scoped domain services are implemented. Role cookies/public identity headers confer no authority. Families see linked records and published reports; unpublished assessment results are staff-only. School bootstrap remains explicit operator provisioning.

Provider name/tenant/configuration remains pending. Login fails closed without it. No automatic user registration or real recipient/provider activation exists. Migration 0001 intentionally does not backfill legacy relationships; approve and map identities/profile ownership explicitly before usage.

## Verification commands

```sh
node scripts/run-framework.mjs build
node scripts/test.mjs static unit integration --fast
python3 scripts/check-documentation.py
node scripts/audit-requirements.mjs --check
node scripts/check-specification.mjs
node scripts/test.mjs static unit integration --fast --guard
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
| BR-01–12; FR-01–26; NFR-01–09 | Draft, unapproved | Current specification separates implemented, partial and planned behavior; 101 designed cases across 18 scenarios remain unrun for this specification |
| Next delivery | Review BRD, then FSD and designs before further feature work | Confirm business scope and open decisions; review wireframes and acceptance procedures; choose pilot curriculum/templates, confirm provider/ORF destination and verify a live synthetic callback |

## Remaining product gaps

Teacher/family UI journeys and controls need broader UAT. Academic dates/grade policy, result publication, historical enrolment eligibility, duplicate pair constraints, audit revisions, retention, performance/accessibility and recovery remain unapproved or incomplete. Email/SMS delivery remains disabled. A production database/hosting pipeline is not established by the local build.

## Git and release rules

Read AGENTS.md. Commit/push meaningful batches; preserve concurrent work; never force-push. Pull requests target main and require sponsor authority for merge. Main held the legacy Express app before this candidate, so the implementation PR includes the existing rebuild as well as the new stage. Preserve hosting config and historical commits. Confirm actual deployment wiring before merging. Keep secrets, records, fixtures with credentials, databases, caches and generated artifacts out of Git.

## Literacy extension candidate

External ORF launch and append-only manually reviewed reading checks are implemented on `feat/education-literacy-apps`, dependent on the authentication candidate and included in the current candidate. Destination remains blank pending sponsor confirmation; no external SSO/result sync is implemented. Staff UI is `/external-apps`. Migration0002 is additive. See [external reading](docs/current/EXTERNAL-READING.md) and [AmplifiU teacher workspace plan](docs/current/AMPLIFY-LITERACY-PLAN.md). The sponsor confirmed AmplifiU as the reference teacher AI product. Structured resource drafts/review and class assignments are implemented in the following candidate; confirm the ORF destination and identity provider separately. AI drafting and external result sync remain unimplemented.

## Teacher workspace candidate

Manual lesson/worksheet/quiz/activity drafts, immutable revisions, explicit exact-version review, class assignments and learner views are implemented. Teachers manage their own resources; school administrators manage school resources. Assignments recheck class authority at insertion, preserve the approved version and omit private notes/answer keys from all learner-facing API responses. Staff can print student or explicitly chosen teacher editions. See [teacher workspace](docs/current/TEACHER-WORKSPACE.md) for scope and draft requirements. No AI provider, curriculum import, online submission/grading or notification service is activated. Templates remain curriculum-neutral until a pilot curriculum is chosen.

## Specification and test pack

Version 2.0 was drafted in BRD → FSD → HLD → LLD order, with parallel QA and contract documentation. The shared register contains 12 business requirements and 35 functional/nonfunctional requirements. The pack includes 101 cases/18 scenarios, smoke/unit/integration/regression/security/nonfunctional/UAT plans, nine clickable wireframe screens, a 20-table/156-field dictionary and 31-route/55-handler API inventory. Planned features and unresolved policies are explicit proposals. No requirement or case has been accepted by document creation.

On 5 October 2026, existing executable suites passed 482 counted checks (75 unit, 407 integration) and three static steps. An actual-run baseline covers eleven meaningful unit/integration suites; its guarded recheck passed with zero quarantine exemptions. Twenty prototype checks passed with desktop/mobile inspection and zero network calls. All 101 newly specified cases remain unrun. See [execution record](docs/specification/TEST-EXECUTION.md) for dates, commands and limits. The placeholder smoke suite is not acceptance evidence.
