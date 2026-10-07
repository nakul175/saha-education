# ADR 0003: Synthetic data only; providers, paid AI and real recipients off

Status: in force (retrospective, written 2026-10-08) · Owner: Nakul Jain

Context: the application is not accepted for production, and holds children's data in its intended use.
Decision: only synthetic data is used in code, tests, demos and hosted copies; real identity provider, reading-app destination, paid AI, email and SMS stay unconfigured and disabled; demo mode switches off when any OIDC setting is present; the deploy script refuses real-provider settings.
Consequences: no real school can use it; every enablement needs separate sponsor authorisation and updates to the DPIA and record of processing.
Links: [CLAUDE.md](../../../CLAUDE.md), [AGENTS.md](../../../AGENTS.md), [DEPLOY-CLOUDFLARE.md](../../DEPLOY-CLOUDFLARE.md), [DPIA.md](../DPIA.md).
