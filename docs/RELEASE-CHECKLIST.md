# Saha release checklist

Process document for changes that reach `main` or a hosted environment (NFR-09 change control). It adds no authority: merge and deployment stay with the sponsor, real providers and real recipients stay disabled, and only synthetic data is used. The checks named here are enforced where noted; everything else is a human step that this repository cannot prove.

## 1. Before a pull request

1. Branch from current `origin/main`. Merge `origin/main` into the branch before the final run (`git merge origin/main`; never rewrite pushed history).
2. Keep one concern per commit. Do not edit `sources/`, historical `docs/current/*` records, `tests/regression-baseline.json`, the specification case/trace exports or the original migrations. Weakening or deleting an existing assertion is a regression, not a fix.
3. Run, from a clean worktree:
   - `pnpm install --frozen-lockfile`
   - `pnpm run build` (a fresh build, not a cached one)
   - `node scripts/test.mjs static unit integration smoke --fast --guard` (the guarded run; the guard compares counts with `tests/regression-baseline.json`)
   - `python3 scripts/check-documentation.py`
   - `node scripts/audit-requirements.mjs --check`
   - `node scripts/check-specification.mjs`
4. Report the exact commands and numbers in the pull request. A suite citation is not a passed case, and no case or requirement is marked accepted by code, tests or a rendered prototype.

`.github/workflows/ci.yml` runs steps 3 on every pull request into `main` and on pushes to `main`. A green run proves those commands passed on a clean Linux runner; it does not prove a hosted deployment, a provider journey or business acceptance.

## 2. Migration rules

New schema is a **new, additive migration**. Applied history is never rewritten.

| Rule | Enforced by |
|---|---|
| Never edit, rename, reorder or delete an original or already-applied migration (0000-0016 and anything merged later). Fix forward with a new file. | `tests/integration/migration-governance-contract.mjs` pins the SHA-256 of 0000-0016 and of their journal entries |
| Number files `NNNN_snake_case.sql`; numbers are unique. Coordinate reservations before branching (one number per concurrent branch). | same test (unique, contiguous originals) |
| Add a `drizzle/meta/_journal.json` entry whose `idx` equals the file number, with `version` `"6"`, `breakpoints: true` and a unique `when` strictly greater than every earlier entry. Drizzle-style migrators skip entries whose `when` is not newer than the last applied one. Historical entries 0001/0002/0003 are already out of order; do not copy that. | same test |
| Put **exactly one statement in each `--> statement-breakpoint` piece** and exactly one trigger per piece (a trigger body ends with `END;` and nothing follows it). A hosted runner failed with `incomplete input: SQLITE_ERROR` on multi-statement pieces. | same test (additive statement kinds, one statement/trigger per piece) |
| Additive only: `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE ... ADD COLUMN`, triggers, seed `INSERT`. No `DROP`, `RENAME`, `DELETE FROM`, `PRAGMA`, `VACUUM`. No backfill or rewrite of existing rows, receipts or evidence. | same test |
| Original columns keep name, type, nullability and order; every earlier table, index and trigger survives an upgrade from 0016. | same test (upgrade from 0016 equals a fresh install) |
| Keep `db/schema.ts` and the generated snapshot in step with the SQL. The specification check compares the data dictionary with a freshly migrated database. | `node scripts/check-specification.mjs` |
| Append-only evidence is guarded in the database, not only in the API (trigger inventory is listed and attacked). A new trigger must be added to the documented inventory. | `tests/integration/atomicity-concurrency-contract.mjs` |
| Test the migration against the previous schema with representative synthetic rows before release. | author, recorded in the pull request |

## 3. Applying migrations to a hosted database

The private hosted deployment of the exact verified source failed at migration time with `incomplete input: SQLITE_ERROR` and returned no URL (`docs/current/HOSTED-DEPLOYMENT-FAILURE.md`). The failing file and the last applied boundary are **not known**. Until they are:

- **Never edit, delete or re-order** applied SQL or its metadata, and never retry the identical archive blindly. A blind retry can apply a migration twice or skip one.
- Obtain, from the hosting settings or support, the failed filename and the last applied migration. Record both in the release record before any repair.
- If the failed file is confirmed unapplied, repair only that precise unapplied delta, create a new verified version, and re-run section 1.
- If the boundary is uncertain, stop and inspect the authoritative database; do not infer success from packaging, from local workerd runs or from a version that exists but has no URL.
- Use `node scripts/diagnose-migration-splitting.mjs` to check how candidate splitters would cut the files. It narrows candidates; it does not identify the failing file.
- Take a recoverable snapshot (or an export) of the target before applying anything to a database that holds more than synthetic data. The restore method for the actual environment has to be defined and rehearsed by the operator; this repository does not provide it.

## 4. Release record

Record: release identifier; source commit and pull requests; migrations included (file names, hashes, `when` values); target environment; configuration **presence** only (never values); commands run with results; unresolved defects and policy decisions; snapshot/restore evidence; deployment steps; verification steps; reviewer and sponsor decision. Say plainly what was not verified.

## 5. Post-deployment verification (human, hosted)

After an authorized deployment: served version identity; sign-in through the configured provider (when configured); session and role negatives; headers on a real response (Content-Security-Policy, nosniff, frame, referrer, `Cache-Control: no-store` on APIs and pages); a smoke journey per role with synthetic data; applied migration list equals the expected list; foreign keys and integrity check clear. Capture timings and failures rather than claiming targets that were never set.

## 6. Rollback

Rollback is **forward-only** for data: confirmed receipts, evidence, revisions and applied schema are never deleted or "undone" to roll back.

- Application rollback: redeploy the previous verified source/version. This is safe only while the schema is additive-compatible, which section 2 requires; a previous Worker must keep working against the newer additive schema.
- Schema rollback: do not drop tables, columns, indexes or triggers. Ship a new forward migration that disables a behavior if needed. Remove a database guard only through a reviewed, recorded migration, never ad hoc.
- Data rollback: restore a snapshot only into an isolated copy first, verify schema, foreign keys and representative immutable evidence, then decide. Reconcile sessions (restoring can resurrect revoked sessions; invalidate or review them) and rerun the safety smoke tests.
- If the outcome of a write or migration is uncertain, read the authoritative record before retrying. Do not blindly retry mutations.

## 7. Escalation

Any security-critical failure, uncertain persistence or incomplete provider/environment setup is reported as such in the pull request and release record; none is hidden to obtain a green run. Merge, deployment, provider activation, paid AI and real recipients each require their own explicit authorization.
