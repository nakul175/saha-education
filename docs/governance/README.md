# Governance documents: map of the 27 standard documents

Owner: Nakul Jain · Last reviewed: 2026-10-08 · Update trigger: any document added, moved or retired; re-review at each release.
Status: **agent-drafted 2026-10-08. Threat model, privacy and compliance documents have not been reviewed by a person or counsel; no certification or compliance is claimed.** Anything not known is marked `TBD (owner: Nakul Jain)`. Application state: synthetic data only, not accepted for production ([HANDOVER.md](../../HANDOVER.md)).

Status key: **Present** (existed and is mapped), **Partial** (existed, gaps remain), **New** (added 2026-10-08; reviewed by no person), **Placeholder** (needs an owner decision).

| # | Item | Canonical path | Status | Last reviewed |
|---|---|---|---|---|
| 1 | README (purpose, status, run, links) | [README.md](../../README.md) (quick start added at top; the older text below it is historical) | Partial | 2026-10-08 |
| 2 | LICENSE, CODEOWNERS | [LICENSE](../../LICENSE) (proprietary placeholder), [.github/CODEOWNERS](../../.github/CODEOWNERS) | Placeholder | 2026-10-08 |
| 3 | Contributing, PR template | [CONTRIBUTING.md](../../CONTRIBUTING.md), [.github/PULL_REQUEST_TEMPLATE.md](../../.github/PULL_REQUEST_TEMPLATE.md) | New | 2026-10-08 |
| 4 | Env/config reference | [.env.example](../../.env.example) (names only); other names in [SECRETS-REGISTER.md](SECRETS-REGISTER.md) | Present | 2026-10-08 |
| 5 | Changelog | [CHANGELOG.md](../../CHANGELOG.md) (reconstructed from git log) | New | 2026-10-08 |
| 6 | Security policy | [SECURITY.md](../../SECURITY.md) | New | 2026-10-08 |
| 7 | Architecture overview | [docs/ARCHITECTURE.md](../ARCHITECTURE.md), [HLD](../specification/HLD.md), hosting: [ARCHITECTURE-HOSTING.md](ARCHITECTURE-HOSTING.md) | Present | 2026-10-08 |
| 8 | Design docs / RFC process | [CHANGE-CONTROL.md](../specification/CHANGE-CONTROL.md), [DECISIONS-RISKS.md](../specification/DECISIONS-RISKS.md), [RFC-TEMPLATE.md](RFC-TEMPLATE.md) | Present | 2026-10-08 |
| 9 | ADRs | [adr/README.md](adr/README.md) (5 retrospective ADRs) | Partial | 2026-10-08 |
| 10 | API contract | [API-CONTRACTS.md](../specification/API-CONTRACTS.md) + [API-CONTRACT.md](API-CONTRACT.md), [openapi.derived.yaml](openapi.derived.yaml) (derived, incomplete) | Partial | 2026-10-08 |
| 11 | Data dictionary, migration history | [DATA-DICTIONARY.md](../specification/DATA-DICTIONARY.md), [MIGRATIONS.md](MIGRATIONS.md) | Present | 2026-10-08 |
| 12 | Runbooks | [RUNBOOKS.md](RUNBOOKS.md), [deploy/README.md](../../deploy/README.md) | Partial | 2026-10-08 |
| 13 | SLOs, alert catalogue | [SLO-ALERTS.md](SLO-ALERTS.md) (proposed, not measured) | New | 2026-10-08 |
| 14 | Incident process, postmortem template | [INCIDENT-PROCESS.md](INCIDENT-PROCESS.md), [POSTMORTEM-TEMPLATE.md](POSTMORTEM-TEMPLATE.md) | Partial | 2026-10-08 |
| 15 | Backup/DR, RPO/RTO, restore-test log | [BACKUP-DR.md](BACKUP-DR.md) (targets TBD; zero restore tests) | New | 2026-10-08 |
| 16 | Test strategy | [TEST-STRATEGY.md](../specification/TEST-STRATEGY.md), [docs/TESTING.md](../TESTING.md) | Present | 2026-10-08 |
| 17 | Release/deploy process | [RELEASE-CHECKLIST.md](../RELEASE-CHECKLIST.md), [RELEASE-OPERATIONS.md](../specification/RELEASE-OPERATIONS.md) | Present | 2026-10-08 |
| 18 | User guide, admin guide | [GUIDES.md](GUIDES.md), [docs/DEMO.md](../DEMO.md) | Partial | 2026-10-08 |
| 19 | Third-party inventory / SBOM | [SBOM.md](SBOM.md), [sbom-2026-10-08.csv](sbom-2026-10-08.csv) | New | 2026-10-08 |
| 20 | Threat model | [THREAT-MODEL.md](THREAT-MODEL.md) | New | 2026-10-08 |
| 21 | Access-control model | [ACCESS-CONTROL.md](ACCESS-CONTROL.md), [AUTH-ACCESS.md](../current/AUTH-ACCESS.md) | Partial | 2026-10-08 |
| 22 | Secrets/key register | [SECRETS-REGISTER.md](SECRETS-REGISTER.md) | New | 2026-10-08 |
| 23 | Privacy: record of processing, DPIA, retention, data-subject requests | [RECORD-OF-PROCESSING.md](RECORD-OF-PROCESSING.md), [DPIA.md](DPIA.md), [RETENTION-SCHEDULE.md](RETENTION-SCHEDULE.md), [DATA-SUBJECT-REQUESTS.md](DATA-SUBJECT-REQUESTS.md) | Partial | 2026-10-08 |
| 24 | Secure-dev / supply-chain evidence | [SECURE-DEV-EVIDENCE.md](SECURE-DEV-EVIDENCE.md) | Partial | 2026-10-08 |
| 25 | Accessibility statement | [ACCESSIBILITY-STATEMENT.md](ACCESSIBILITY-STATEMENT.md) | New | 2026-10-08 |
| 26 | AI-feature docs | [AI-FEATURES.md](AI-FEATURES.md) (no AI runs) | New | 2026-10-08 |
| 27 | Compliance control mapping | [COMPLIANCE-MAPPING.md](COMPLIANCE-MAPPING.md) | New | 2026-10-08 |

## One canonical document per topic

| Topic | Canonical | Superseded or historical copies (kept, not deleted) |
|---|---|---|
| Requirements, design, test design | [docs/specification/](../specification/README.md) (v2.12, BRD to LLD) | [docs/education/](../education/README.md): the original rebuild baseline of 5 October 2026; its CURRENT-STATE, OPERATIONS, USER-GUIDE, API and SECURITY-PRIVACY describe the pre-fix rebuild |
| Architecture | [docs/ARCHITECTURE.md](../ARCHITECTURE.md) + [HLD](../specification/HLD.md) | [docs/education/ARCHITECTURE.md](../education/ARCHITECTURE.md) |
| Data | [DATA-DICTIONARY.csv](../specification/DATA-DICTIONARY.csv) + `db/schema.ts` | [docs/DATA-MODEL.md](../DATA-MODEL.md) (13-table overview), [docs/education/DATA-DICTIONARY.md](../education/DATA-DICTIONARY.md) |
| API | [API-CONTRACTS.md](../specification/API-CONTRACTS.md) | [docs/education/API.md](../education/API.md) |
| Testing | [specification/TEST-STRATEGY.md](../specification/TEST-STRATEGY.md); how to run: [docs/TESTING.md](../TESTING.md) | [docs/education/TESTING-UAT.md](../education/TESTING-UAT.md) |
| Release and operations | [RELEASE-CHECKLIST.md](../RELEASE-CHECKLIST.md), [RUNBOOKS.md](RUNBOOKS.md) | [docs/education/OPERATIONS.md](../education/OPERATIONS.md), [HOSTED-STAGING.md](../current/HOSTED-STAGING.md) (says no workflow exists; `ci.yml` now does) |
| Hosting | [deploy/README.md](../../deploy/README.md) (droplet) | [DEPLOY-CLOUDFLARE.md](../DEPLOY-CLOUDFLARE.md) (never run), [HOSTED-DEPLOYMENT-FAILURE.md](../current/HOSTED-DEPLOYMENT-FAILURE.md) |
| Handover and current state | [HANDOVER.md](../../HANDOVER.md) first | See below |
| Demo | [docs/DEMO.md](../DEMO.md), [DEMO-integration.md](../current/DEMO-integration.md) | `docs/SAHA-HEALTH-SURVEY.md` (reference survey of another app) |

### Four root handover files

[HANDOVER.md](../../HANDOVER.md) is the entry point. [AGENTS.md](../../AGENTS.md) holds the rules for all coding agents. [CLAUDE.md](../../CLAUDE.md) is a short pointer plus dated updates. [CLAUDE-HANDOVER.md](../../CLAUDE-HANDOVER.md) is the 6 October 2026 continuation record (with a 7 October overnight update): historical for the state it describes. Also at the root: `PLAN.md`, `PROGRESS.md`, `PROGRESS.md.new` are early rebuild planning and progress notes (5 October 2026) and are historical.

### `docs/current/` (69 files)

Dated batch and workstream records: `DEVELOPMENT-BATCH-1..7`, `EIGHT-HOUR-BATCH-1..4`, `FOUR-HOUR` and `EIGHT-HOUR-DEVELOPMENT`, `DEMO-*` (ten overnight workstreams) and the matching `*-EXECUTION.json` files. They are **evidence logs, not living documentation**: keep them as written. Current entry points: [DEMO-integration.md](../current/DEMO-integration.md) (latest overall), [EIGHT-HOUR-BATCH-4.md](../current/EIGHT-HOUR-BATCH-4.md) (last school/course batch), [AUTH-ACCESS.md](../current/AUTH-ACCESS.md), [RELEASE-READINESS.md](../current/RELEASE-READINESS.md), [HOSTED-DEPLOYMENT-FAILURE.md](../current/HOSTED-DEPLOYMENT-FAILURE.md). Where a batch file and a later `DEMO-*` file disagree, the later one and the specification win.

## Gaps this change lists but does not close

- Documentation bodies lag the tree in places: the API contract prose sections were written for 60 route files and 96 handlers and the data dictionary field tables cover 54 of the 63 tables; the tree has 103 route files, 150 method and path pairs and 63 tables through migration 0025. The route inventory table, both CSVs and the headers of both documents state the current counts.
- CI does not run `scripts/security-gate.mjs` (SBOM and `pnpm audit`), secret scanning or code scanning; no CI step checks these governance documents' links (the existing documentation check does not cover `docs/governance/`).
- No decision on license, retention, RPO/RTO, controller, identity provider, alert destination, incident contacts, branch protection settings.
- A committed generator for `openapi.derived.yaml` and the SBOM CSV does not exist.
- No human review of any document marked New.
