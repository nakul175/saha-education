# Deployment and operations runbook

> Documentation version 1.0 · 5 October 2026 · Draft for sponsor review.
> Describes the Next.js rebuild at `b4cbfc5f6855479ed523b5bf4c0aed0d2b6f6e3d`, not the legacy application on `main`.
> Requirements are proposed targets; code presence does not establish acceptance or production readiness.

## Operational status

The source targets Cloudflare Workers/D1 and retains Sites integration. A configured education deployment, CI release pipeline, service URL and recovery capability were not verified. main and rebuild/nextjs are different applications. Do not execute copied health deployment/recovery scripts without an education-specific review. This runbook defines a proposed process; it does not deploy anything.

## Staging prerequisites

Assign an operator and sponsor, select a synthetic staging environment, record the exact build revision, inspect hosting configuration and choose the approved hosting path. Preserve .openai/hosting.json on the rebuild. Resolve the placeholder D1 database ID and ensure the binding remains DB. Review runtime secrets, domain/origins and absence of real recipients. Build and inspect generated Worker configuration before using it.

## Proposed release procedure

1. Freeze the candidate revision and gather requirement/UAT evidence.
2. Back up the staging database and record applied migrations and integrity counts.
3. Review generated migration SQL; exercise migration and compatible app rollback in an isolated copy.
4. Build the candidate using the manifest's pinned tools and record actual output/errors.
5. Deploy through the approved hosting path with correct D1 binding and environment; this path needs confirmation before commands are prescribed.
6. Apply reviewed migrations using the verified environment configuration, in the tested order.
7. Run health/session checks, negative access tests and complete synthetic school workflows against the served Worker.
8. Record revision, configuration, migration state, evidence, decision and recovery location. Stop rollout on a failed gate.

The instructions on the rebuild mention automatic staging deployment on main merges, but the reviewed baseline does not establish a matching pipeline. Confirm actual deployment wiring before any merge. A documentation PR must not be merged merely to find out whether it deploys.

## Monitoring and support

Define service checks for route availability, authenticated workflow success, database errors, latency, failed mutations and notification creation. Logs should use correlation IDs and redact secrets and personal payloads. Agree alert destinations, severity definitions and an on-call owner before pilot. No working alerts, scheduled Worker handler or incident service is established by the inspected source.

## Incident response

Record start time, revision, affected environment and symptom. Contain unauthorized access by restricting service and invalidating real sessions once that capability exists. Preserve redacted diagnostics and confirmed records. For database/mutation failures, inspect persisted state before retrying a batch or publication. Notify the designated sponsor through the approved incident process; contacts and jurisdiction-specific breach rules remain to be agreed.

## Backup, restore and rollback

Define backup frequency/retention, access control, encryption, RPO/RTO and restoration ownership. Demonstrate an isolated restore with row counts, foreign-key integrity, published-report visibility and role-specific workflow checks. An inherited recovery script is not proof of compatibility. Never overwrite the live database merely to test restoration.

Rollback the application only to a revision compatible with applied migrations. Preserve confirmed records; use forward repair migrations for data/schema corrections rather than editing old migrations. Reconcile notices and partially saved attendance/results before retry. Document successful recovery with dates and measured limits.

## Launch checklist

All P0 acceptance evidence; approved school policies; production identity and object scope; no public draft/report leaks; valid teacher/user provisioning; reviewed migrations; successful isolated restore; explicit release/incident owners; confirmed hosting pipeline; provider/recipient boundaries. Real-school launch is outside this documentation change.
