# Saha Education documentation

> Documentation version 1.0 · 5 October 2026 · Draft for sponsor review.
> Describes the Next.js rebuild at `b4cbfc5f6855479ed523b5bf4c0aed0d2b6f6e3d`, not the legacy application on `main`.
> Requirements are proposed targets; code presence does not establish acceptance or production readiness.

This set provides a product and engineering baseline for the school management rebuild. Start with the business requirements, then use the software requirements and acceptance plan to agree delivery scope. The current-state assessment records implementation limits discovered through source inspection.

For the subsequent implementation candidate, see [authentication/access delivery](../current/AUTH-ACCESS.md) and [current validation](../../VALIDATION.md). See also [external reading](../current/EXTERNAL-READING.md) and [literacy product plan](../current/AMPLIFY-LITERACY-PLAN.md). The subsequent [teacher workspace delivery](../current/TEACHER-WORKSPACE.md) records its implementation boundary. The source baseline below remains an immutable historical assessment.

## Document map

| Document | Purpose | Primary audience |
|---|---|---|
| [Business requirements](BRD.md) | Problem, scope, stakeholders, outcomes and decisions | Sponsor, school leadership |
| [Product requirements](PRD.md) | Personas, workflows, permissions and delivery priorities | Product, design, engineering |
| [Software requirements](SRS.md) | Identified functional and non-functional requirements | Engineering, QA |
| [Current state](CURRENT-STATE.md) | Evidence, gaps and implementation boundary | All contributors |
| [Architecture](ARCHITECTURE.md) | Components, request flow and design decisions | Engineering |
| [Data dictionary](DATA-DICTIONARY.md) | Tables, fields, constraints and business rules | Engineering, data owners |
| [API reference](API.md) | Existing handlers, payloads and defects | Engineering, integrators |
| [Security and privacy](SECURITY-PRIVACY.md) | Access model, threats and launch gates | Engineering, operations |
| [User guide](USER-GUIDE.md) | Role workflows and demo limitations | School staff, families |
| [Developer guide](DEVELOPER-GUIDE.md) | Setup, commands, contribution and troubleshooting | Contributors |
| [Testing and acceptance](TESTING-UAT.md) | Acceptance cases, evidence and release decision | QA, sponsor |
| [Deployment and operations](OPERATIONS.md) | Staging, release, recovery and incidents | Operators |
| [Roadmap and decisions](ROADMAP.md) | Sequencing, risks and open decisions | Sponsor, delivery team |
| [Glossary](GLOSSARY.md) | Shared domain terminology | All readers |
| [Validation](VALIDATION.md) | Checks actually run for this documentation change | Reviewers |

## Baselines and authority

`main` contains the older Express/Mongoose application. `rebuild/nextjs` is the repository default branch and contains the Next.js/Cloudflare rebuild. This documentation is proposed into `main` following the rebuild's contribution instructions; it does not migrate application code or assert that `main` runs the rebuild.

All source references below use an immutable rebuild commit. Existing branch documents such as HANDOVER.md and docs/ARCHITECTURE.md contain historical or unsupported statements; this set supersedes those statements only for the documented baseline. Sponsor approval of proposed requirements is still pending.

## Keeping documents accurate

For each behavior change update its requirement, affected workflow, API/data contract, current-state entry and acceptance evidence. Keep requirement IDs stable. Record dates, tested revision, environment and limitations. Require a served application test before marking a workflow accepted. Do not substitute an exported function, route file, test count or code comment for proof of user behavior.

Documentation checks are repository-local and offline: `python3 scripts/check-documentation.py` and `node scripts/audit-requirements.mjs --check`. No application deployment or merge is part of this change.
