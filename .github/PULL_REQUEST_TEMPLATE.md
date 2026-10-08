<!-- Branch from current origin/main. Open a draft PR into main. Never push to or merge main without the sponsor's say-so. -->

## What and why

## Checks run (paste the exact commands and numbers; say plainly what was not run)

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm run build`
- [ ] `node scripts/test.mjs static unit integration smoke --fast --guard`
- [ ] `python3 scripts/check-documentation.py`
- [ ] `node scripts/audit-requirements.mjs --check`
- [ ] `node scripts/check-specification.mjs`

## Safety checklist (see docs/RELEASE-CHECKLIST.md)

- [ ] Synthetic data only; no secrets, real records, databases or build output committed
- [ ] No original or applied migration edited, renamed or deleted (new work is a new additive migration)
- [ ] Authorisation stays on the server; no new reliance on public identity headers
- [ ] No provider, paid AI or real recipient switched on
- [ ] Personal-data impact noted (new fields, new reads, new logs): none / described below
- [ ] Docs updated together: implementation boundary, requirements, evidence (`VALIDATION.md` if code changed)

## Not verified / open items
