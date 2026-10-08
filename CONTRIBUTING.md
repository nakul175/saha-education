# Contributing

Owner: Nakul Jain · Last reviewed: 2026-10-08 · Update trigger: change to branching, CI, or the check commands.

This is a private repository. Every coding agent and person starts with [HANDOVER.md](HANDOVER.md) and [AGENTS.md](AGENTS.md); Claude sessions also read [CLAUDE-HANDOVER.md](CLAUDE-HANDOVER.md). The rules below summarise them; where they differ, those files win.

## Workflow

1. Branch from current `origin/main` (not the stale default branch `rebuild/nextjs`).
2. Make one reviewable change. Commit it and push the branch; never force-push and never push to `main`.
3. Open a **draft** pull request into `main` using the template. Merging and deployment need the sponsor (Nakul Jain) to say so.
4. Report exact commands and numbers. A passing suite is not a passed designed case and not business acceptance.

## Setup and checks

Node 22.13 or newer and pnpm 11.25.0 (see `package.json`).

```sh
pnpm install --frozen-lockfile
pnpm run build
node scripts/test.mjs static unit integration smoke --fast --guard
python3 scripts/check-documentation.py
node scripts/audit-requirements.mjs --check
node scripts/check-specification.mjs
```

`.github/workflows/ci.yml` runs the same commands on pull requests and on pushes to `main`. Local demo: `pnpm demo` ([guide](docs/DEMO.md)).

## Hard rules

- Synthetic data only. No secrets, real student records, local databases, or build output in git.
- Keep authorisation on the server. Identity comes only from `lib/education/identity.ts`.
- Never edit, rename or delete an applied migration; add a new additive one ([migration rules](docs/RELEASE-CHECKLIST.md)).
- Preserve confirmed records, audit evidence and the `sources/` and historical `docs/current/*` records. Do not weaken or delete an existing test assertion.
- Do not switch on identity providers, paid AI, or messages to real people.

## Documentation

New governance documents live in [docs/governance/](docs/governance/README.md), which names the canonical document for each topic. Update the relevant doc in the same pull request as the change that makes it stale.
