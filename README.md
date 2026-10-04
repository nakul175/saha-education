# Saha Education workspace

Saha is a private synthetic engineering implementation of the Education AI Orchestration Platform: one student record workspace with reviewed assistance, programme/integration foundations, field continuity and accountable follow-through.

**Current application: R11 / v1.3-readiness. Documentation: edition 1.1, reconciled 5 October 2026.** Ready for continued development; real-student use and production acceptance remain pending.

## Start here

1. [Documentation index](docs/DOCUMENTATION-INDEX.md)
2. [Implemented behavior and limits](docs/IMPLEMENTATION.md)
3. [Next delivery and remaining releases](docs/NEXT-DELIVERY.md)
4. [Qualification evidence](docs/QUALIFICATION.md)
5. [Developer and Claude handover](CLAUDE.md) and [setup instructions](docs/current/DEVELOPMENT-AND-CI.md)

The current pack contains reconciled BRD/FSD/HLD/LLD, API/data/security/test/delivery/runbook/acceptance specifications, user/admin/support guides, source-derived inventories and exact requirement/test registers. Original Word/Excel/HTML documents and engineering archives are retained in [history](docs/history/README.md).

## Status

| Item | Current record |
| --- | --- |
| BRD requirements | 176; all formal acceptances pending |
| Implementation assessment | 14 implemented-local, 151 partial, 2 not-built, 9 unverified after slice 10g (R11: 134 partial, 19 not-built) |
| Saved R11 qualification | 902 HTTP/D1 + 361 contract/checkpoint + 21 restore assertions = 1,284 |
| Original acceptance catalogue | 364 preserved cases; no formal case passes inferred from engineering tests |
| Planned future batches | R12–R16, plus open R11 live-provider and clinical follow-through |
| Development slices since R11 | 0a student-partitioned storage, 0b delta responses and 0c identity layer with supply-chain gate, 1 households with proxy authority, 1b workforce lifecycle and caseload transfer, 1c controlled identity merge, 6a exceptional access, 6b rights requests, 0b-2 viewer-scoped reads, 6c retention schedules and holds, 6d indicators, 4a referral lifecycle and escalation, 2a reuse metering, 1d roster reconciliation, 7a ABDM mock workflows, 7b ABDM mock transfer, 2b visit media, 6e automated accessibility audit with contrast fixes, 3a offline media queue, 3b field storage warnings, 7c pinned outbound FHIR validation, 6f field, phone and keyboard accessibility, 6g computed operational alerts, 3c media queue hardening after independent review, 6h alert acknowledgement, 3d in-app voice-note recording, 3e on-device photo reduction, 3f workspace photo reduction, 3g offline registration with ordered sync, 2c source and time for each fact, 3h clinician action on field referral requests, 4b unified action plan with ownership, 6i item-level exception queue, 6k reconciled operational export, 6j tamper-evident audit chain, 5a AI cost budgets with stopping of unsent requests, 6l safe-logs check with free text moved out of request URLs, 5b provider self-service in a provider sandbox, 5c conflicting assistant values and inability to assess, 5d capability lifecycle with replacement and in-progress work, 6m organisation data export with offline verification, 6n declared environments with fixture, live-call and connector guards and an owner configuration check, 2d a dry-run-then-apply migration marking earlier seeded fixtures, 6o consent withdrawal with downstream dispositions and consent history, 1e time-limited delegation of team supervision and reporting, 4c worker activity evidence for supervisors, 0b-3 paged student lists with on-demand student detail for large team scopes, 3i an open field referral request queue, 3j field notebook capacity of 200 visit dra... (line truncated to 2000 chars)

The runtime uses Next.js 16 + React 19, a Cloudflare Worker and D1. The original PostgreSQL/RLS, native Android and broader REST design remains a target, not installed functionality. Live AI/MIS/EHR/ABDM, physical-device/offline, independent clinical/security/accessibility, representative scale, hosted recovery and field acceptance remain open.

GitHub main contains R11, development slices 0a–3f and the later slices and review fixes 3g–6r (#36–#70), merged on 30 September 2026, the overnight slices and review fixes 0b-4 to 6ae (#74–#99) and the demonstration slices 9a–9c (#101–#103), merged on 2 October 2026, all at the sponsor's instruction without independent human review. Branch from main after checking its history. Follow [AGENTS.md](AGENTS.md), preserve concurrent work and publish each completed batch through a branch/draft PR. GitHub publication does not deploy the running Site.

For documentation verification:

```sh
```

Detailed release history remains in [VALIDATION.md](VALIDATION.md), [RELEASE-11.md](RELEASE-11.md), [the remaining plan](REMAINING-RELEASES.md) and the preserved [pre-handover README](docs/history/README-R11-before-handover.md).

## Features

Saha Education is a school management system with the following key features:

- Student registration and profile management
- Guardian/guardian relationship tracking
- School information and management  
- Course catalog and class creation
- Class attendance tracking
- Assessment management and grading
- Report card generation and publishing
- Notification system for students, teachers, and guardians
- User roles: admin, teacher, guardian, student

## Roles

The application supports the following user roles:
- **Admin**: Full access to all features and system management
- **Teacher**: Access to classes they teach, student records, assessments, and attendance 
- **Guardian**: Access to their child's information and grades
- **Student**: Access to personal profile, classes, assessments, and report cards

## Stack

This project uses:
- Next.js 16 + TypeScript
- React 19
- Cloudflare Workers via vinext/vite/wrangler
- Drizzle ORM on Cloudflare D1 (sqlite)
- shadcn components in components/ui
- Tailwind 4
- pnpm as the package manager

## Setup

To get started with Saha Education:

```bash
# Install dependencies
pnpm install

# Run development server 
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test

# Generate database schema
pnpm db:generate
```

## Folder Layout

```
.
├── app/                # Next.js app directory with routes and pages
├── components/         # UI components (shadcn)
├── lib/education/      # Business logic and application layer
├── drizzle/            # Database migrations and schema
├── docs/               # Documentation files
├── scripts/            # Helper scripts for build, test etc.
├── tests/              # Test suite files
└── public/             # Static assets
```

## Deployment

The application deploys to Cloudflare Workers using the standard deployment process:
1. Build the application with `pnpm build`
2. Deploy via `wrangler deploy` or through CI/CD pipeline

Cloudflare D1 is used for database storage with Drizzle ORM managing migrations and queries.
