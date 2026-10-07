# Backup and disaster recovery

Owner: Nakul Jain · Last reviewed: 2026-10-08 · Update trigger: any backup being enabled, any restore test, any change of host or database.
Status: agent-drafted 2026-10-08, not reviewed by a person. Objectives below are **TBD**; no backup schedule is shown to be running and no restore has been tested on a real host.

## Targets

| Item | Value |
|---|---|
| RPO (maximum tolerable data loss) | TBD (owner: Nakul Jain). `docs/specification/DECISIONS-RISKS.md` D-11 records that no RPO/RTO is approved. |
| RTO (time to restore service) | TBD (owner: Nakul Jain) |
| Data in scope | One SQLite (D1 local) file: students, guardians, accounts, attendance, assessments, report cards, notices, audit evidence. Synthetic only today. |

## What exists

- **Local snapshot tool:** `scripts/recovery.mjs` makes an encrypted snapshot of a local SQLite file (`saha-recovery-v1` envelope, PBKDF2 key derivation, passphrase of 16 to 1,024 characters, 64 MiB limit) and restores it into a new destination. It runs an integrity check, refuses to overwrite a destination, never opens a remote database and never does a live cutover. Usage is in the script header.
- **Droplet:** the database is one file under `/var/lib/saha-education/state`. `deploy/README.md` advises turning on DigitalOcean droplet backups (about 20% of droplet price); whether that is on is **unknown (TBD, owner: Nakul Jain)**. Backups of the file made from a running service may be inconsistent; use the snapshot tool or stop the service first.
- **Evidence guards:** migration 0025 and earlier triggers keep evidence tables append-only in the database ([security record](../current/DEMO-security-change-control.md)).

## What does not exist

- No scheduled backup job, off-host copy, retention of backups, or monitoring of backup age.
- No restore drill on a real host. [Release readiness](../current/RELEASE-READINESS.md) records "Local recovery evidence exists; hosted method pending".
- No decision on how erasure requests interact with backups ([DATA-SUBJECT-REQUESTS.md](DATA-SUBJECT-REQUESTS.md)).

## Restore procedure (proposed, untested)

1. Stop writes: `systemctl stop saha-education` (note the time).
2. Restore the chosen snapshot **into a new, separate directory** with `scripts/recovery.mjs restore`; do not overwrite the live file.
3. Verify: integrity check ok, foreign keys clean, row counts per table equal the snapshot's inventory, a published report card visible to a test guardian, an administrator workflow works (all synthetic).
4. Decide cutover (sponsor). Replace the state directory, set ownership `saha:saha`, start the service, check `deploy-status.json`.
5. Reconcile sessions (restored rows may include revoked sessions) and re-run the safety smoke tests.
6. Record the result in the log below.

## Restore-test log

Cadence: TBD (owner: Nakul Jain). **No restore test has been performed on a real host.**

| Date | Host | Snapshot used | Performed by | Result (row counts, integrity, duration) | Follow-ups |
|---|---|---|---|---|---|
| _no entries_ | | | | | |
