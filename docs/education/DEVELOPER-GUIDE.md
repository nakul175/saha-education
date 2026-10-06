# Developer setup and contribution guide

> Documentation version 1.0 · 5 October 2026 · Draft for sponsor review.
> Describes the Next.js rebuild at `b4cbfc5f6855479ed523b5bf4c0aed0d2b6f6e3d`, not the legacy application on `main`.
> Requirements are proposed targets; code presence does not establish acceptance or production readiness.

## Select the correct application branch

These commands apply to rebuild/nextjs, not the legacy main application:

```sh
git clone https://github.com/nakul175/saha-education.git
cd saha-education
git switch rebuild/nextjs
```

The reviewed manifest declares Node >=22.13 and pnpm 11.25.0. Use the repository's package manager version and lockfile. Compatibility of that complete toolchain was not tested for this documentation change.

```sh
pnpm install
pnpm dev
```

Inspect .env.example and create an ignored local environment file only as needed. db/index.ts reads env.DB from Cloudflare Workers; DB_URL is not its connection source. SAHA_IDENTITY_PROVIDER and notification placeholders do not implement those integrations. The development build config provisions a local DB binding; actual runtime behavior still requires verification.

## Commands available on the rebuild

| Command | Purpose / qualification |
|---|---|
| pnpm dev | Framework wrapper development server |
| pnpm build | Framework wrapper production build |
| pnpm start | Local Wrangler against generated dist/server/wrangler.json; build first |
| pnpm exec tsc --noEmit | Type checking |
| pnpm lint | ESLint |
| pnpm db:generate | Generate migration SQL; does not apply it |
| pnpm test | PR alias: static/unit/integration/resilience/smoke, subject to catalogue health |
| pnpm test:full | Requested layers include UI/NFR/UAT; not proof those suites exist |
| pnpm test:catalogue | Validate suite classification |

Generated local D1 migrations must be applied with the verified project configuration. For a built local Worker, inspect its generated configuration and database name before running the appropriate Wrangler D1 migration command. Do not use a remote flag or production database during setup. No seed/bootstrap routine for valid teacher/user relationships was verified.

## Source map

app/ contains UI and HTTP routes; lib/education/ contains domain and auth helpers; db/schema.ts defines tables; drizzle/ contains SQL; worker/index.ts exports fetch; vite.config.ts defines local bindings and build plugins. Tests and scripts include inherited health tooling; inspect before use.

## Contribution process

Read the branch's HANDOVER.md and AGENTS.md. The rebuild instructions require branches from main, pull requests into main and sponsor authorization for merge. Because main is legacy, explicitly identify which application baseline a change targets and avoid unintentionally including a full rebuild migration. Commit and push completed batches, preserve concurrent remote changes and never force-push shared work.

For documentation run the two check commands in docs/education/README.md. For application changes run affected meaningful checks and record real evidence; do not claim a passing placeholder smoke test establishes acceptance. Keep secrets, databases, node_modules and generated build outputs untracked. Retain existing hosting configuration.

## Troubleshooting

Missing DB binding: check the Worker environment and configured binding name, not DB_URL. Repeated 401 with a valid demo cookie: inspect whether the handler passed request to getPrincipal; do not weaken auth to bypass it. Missing teacher options or enrolment update: compare UI URL with API.md. Test catalogue failure: inspect tests and classifier before interpreting an empty test run as success.
