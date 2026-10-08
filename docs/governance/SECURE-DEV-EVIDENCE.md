# Secure development and supply-chain evidence

Owner: Nakul Jain · Last reviewed: 2026-10-08 · Update trigger: any change to CI, dependency policy, or a security tool being added or run.
Agent-drafted 2026-10-08, not reviewed by a person. Lists what exists with its source, and what does not. No certification claimed.

## In place (verified by reading the files)

| Control | Evidence |
|---|---|
| CI on every pull request into `main` and every push to `main`: frozen-lockfile install, original-migration-unmodified check, ESLint, build, guarded test run, documentation check, requirements audit, specification check; read-only token permissions; no secrets, provider settings or deploy step; test reports kept 14 days | [.github/workflows/ci.yml](../../.github/workflows/ci.yml) |
| Regression guard: suite counts compared with a baseline so assertions cannot silently shrink | `scripts/test-guard.mjs`, `tests/regression-baseline.json` |
| Applied migrations pinned by SHA-256 and replayed on an empty database | `tests/integration/migration-governance-contract.mjs` |
| Authorisation matrix over every documented handler and 11 credential states | `tests/integration/authorization-matrix-contract.mjs` |
| Hardening tests: headers, body limits, hostile input, cookie flags, throttle, error leakage | `tests/integration/security-hardening-contract.mjs` |
| Atomicity and concurrency fault injection | `tests/integration/atomicity-concurrency-contract.mjs` |
| Mounted browser security procedure | `tests/worker-security-demo-check.mjs` |
| Accessibility sampling (axe-core) | `tests/worker-accessibility-check.mjs` |
| Dependency hygiene: pinned `packageManager`, `minimumReleaseAge` 7 days, `strictDepBuilds` with allow-list, `trustLockfile: false` | `package.json`, `pnpm-workspace.yaml` |
| Human review rules: draft PR, sponsor merges; no force-push | [AGENTS.md](../../AGENTS.md), [CONTRIBUTING.md](../../CONTRIBUTING.md) |

Recorded results and their limits: [the security record](../current/DEMO-security-change-control.md), [VALIDATION.md](../../VALIDATION.md), [DEMO-integration.md](../current/DEMO-integration.md). Counts change with every merge; read them from those records, not from here.

## Not in place (gaps; none is added by this change)

- No dependency vulnerability scan in CI: `scripts/security-gate.mjs` (CycloneDX SBOM plus `pnpm audit`, fails on critical advisories) exists but CI does not call it, and it was not run for [SBOM.md](SBOM.md).
- No secret scanning, static security analysis (CodeQL or similar), container or image scanning, Dependabot or Renovate configuration.
- No SBOM published with releases; no artifact signing or provenance.
- No branch-protection or required-review settings are recorded in the repo; the real GitHub settings are unknown (TBD, owner: Nakul Jain).
- Several recorded review findings remain open (F5 field limits, F6 draft-report policy, F7 old unbounded body helper, F10 static-asset headers).
- No independent code review by a person has been recorded for the merged work in `HANDOVER.md`/`docs/history/CLAUDE-HANDOVER-2026-10-06.md`, which describe agent-run work merged at the sponsor's instruction.
- The droplet build runs `pnpm install` and the build as root on every new commit.

## Developer rules

Never commit secrets or real data; keep authorisation server-side; keep migrations additive; do not weaken tests. Details in [CONTRIBUTING.md](../../CONTRIBUTING.md).
