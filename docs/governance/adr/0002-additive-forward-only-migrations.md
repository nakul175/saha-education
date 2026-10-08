# ADR 0002: Additive, forward-only migrations

Status: in force (retrospective, written 2026-10-08) · Owner: Nakul Jain

Context: a hosted runner failed with `incomplete input: SQLITE_ERROR`; the failing file is unknown.
Decision: never edit, rename, reorder or delete an applied migration; new schema is a new additive file with one statement per breakpoint piece; no DROP/RENAME/DELETE/backfill; rollback is by redeploying compatible code or a new forward migration. A test pins the hashes of 0000 to 0016, and CI refuses changes to existing migration files in a pull request.
Consequences: schema only grows; mistakes are fixed forward; the droplet applies each file once via a ledger.
Links: [RELEASE-CHECKLIST.md](../../RELEASE-CHECKLIST.md), [MIGRATIONS.md](../MIGRATIONS.md), `.github/workflows/ci.yml`.
