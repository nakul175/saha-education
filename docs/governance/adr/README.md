# Architecture decision records

Owner: Nakul Jain · Last reviewed: 2026-10-08 · Update trigger: any architectural decision (hosting, identity, data, deploy, security) made or reversed.

The repo's running decision log is [DECISIONS-RISKS.md](../../specification/DECISIONS-RISKS.md) (D-01 to D-26 and per-version choices). ADRs here are short, one decision each. The first five are **retrospective**: written 2026-10-08 from existing documents and code, recording decisions already in force. Their dates are not the decision dates, and none was reviewed by a person.

| No. | Decision | Status |
|---|---|---|
| [0001](0001-server-side-authorization-fail-closed-identity.md) | Server-side authorisation; identity only from the trusted provider; fail closed | In force |
| [0002](0002-additive-forward-only-migrations.md) | Additive, forward-only migrations | In force |
| [0003](0003-synthetic-data-and-providers-off.md) | Synthetic data only; providers, paid AI and real recipients off | In force |
| [0004](0004-droplet-hosting-with-password-wall.md) | Droplet hosting with `wrangler dev --local`, Caddy password wall, pull-based deploy | In force for the demo; not for production |
| [0005](0005-append-only-evidence-and-corrections.md) | Append-only evidence; corrections append | In force |

Template for a new ADR: title, status, date, context, decision, consequences, links.
