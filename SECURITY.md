# Security policy

Owner: Nakul Jain · Last reviewed: 2026-10-08 · Update trigger: any change to the reporting contact, hosting, or to what data the app holds.

## Reporting a vulnerability

Email **nakul.jain@aplyd.com** with the subject "Saha Education security". Include the route or file, the steps to reproduce, and the effect. Please do not open a public issue for a vulnerability, and do not attach real student, guardian or staff data: use synthetic data only.

Response and fix times: TBD (owner: Nakul Jain). No response-time commitment is made.

## Scope and current status

- This is a private repository for a school-administration application. It currently holds **synthetic data only**. It has not been accepted for production or for real learner data (see [HANDOVER.md](HANDOVER.md)).
- Real sign-in (OIDC), the reading-app (ORF) link, paid AI and delivery to real recipients are disabled and unconfigured.
- Known open security findings and their state are listed in [the security record](docs/current/DEMO-security-change-control.md) (findings F5 to F10) and in the [threat model](docs/governance/THREAT-MODEL.md).

## What to report

Authorisation bypass (reading or writing another school's, class's or student's records), session or cookie weaknesses, injection, leakage of personal data or secrets in responses or logs, and weaknesses in the deploy kit under `deploy/`.

## Handling secrets

Never commit credentials, keys, tokens, real records or local databases. The names of secrets and where they live are in [the secrets register](docs/governance/SECRETS-REGISTER.md) (names only, never values). If a secret was committed or shared, tell the owner at once so it can be rotated.

## Disclosure

Coordinated disclosure terms: TBD (owner: Nakul Jain).
