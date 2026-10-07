# Design proposal (RFC) template and process

Owner: Nakul Jain · Last reviewed: 2026-10-08 · Update trigger: change to how design changes are approved.

## Process

The existing canonical process is [docs/specification/CHANGE-CONTROL.md](../specification/CHANGE-CONTROL.md) (BRD, FSD, HLD, LLD sequence and a seven-step change path) with the decision register [DECISIONS-RISKS.md](../specification/DECISIONS-RISKS.md) (D-xx entries with owner and effect while open). For a change that is large, risky, or touches personal data, security, hosting or migrations, add a short RFC:

1. Copy this template to `docs/governance/rfc/NNNN-title.md` in a draft pull request.
2. Link it from the decision register if it records or changes a D-xx decision; record the outcome as an [ADR](adr/README.md).
3. The sponsor (Nakul Jain) approves in the pull request; merge is the sponsor's decision.

## Template

```
# RFC NNNN: <title>
Owner / author / date / status (draft, accepted, rejected, superseded)
## Problem and requirement IDs affected (FR-xx, NFR-xx, BR-xx, D-xx)
## Proposal
## Alternatives considered
## Data and privacy impact (new fields, readers, retention; update DPIA and record of processing)
## Security impact (roles, trust boundaries, secrets)
## Migration and rollback plan (additive migration number; how to undo behaviour forward-only)
## Testing and evidence plan (what will be run; what will not)
## Open questions (TBD with owner)
```
