# API contract

Owner: Nakul Jain · Last reviewed: 2026-10-08 · Update trigger: any added, removed or changed file under `app/api/`.

## Canonical contract

There is **no OpenAPI document that is maintained as the contract**. The canonical contract is [docs/specification/API-CONTRACTS.md](../specification/API-CONTRACTS.md) with its machine-readable [API-CONTRACTS.csv](../specification/API-CONTRACTS.csv): per route, methods, roles, request shapes, status codes and error behaviour. Cross-system boundaries (OIDC provider, reading app, email/SMS) are in [INTEGRATION-CONTRACTS.md](../specification/INTEGRATION-CONTRACTS.md). The older [docs/education/API.md](../education/API.md) describes the pre-fix rebuild and is superseded.

## Derived skeleton

[openapi.derived.yaml](openapi.derived.yaml) is **derived and incomplete**. It was generated on 2026-10-08 by reading the exported handler names in every `app/api/**/route.ts`: 103 route files, 150 method and path pairs. It carries paths, path parameters and methods only. It has no request or response schemas, no status codes and no per-route authentication, and it was not tested against a running Worker. The server URL is a placeholder: the private demo host (`https://education.aplyd.org`, behind a password wall) was not used to generate or test it.

Drift to know about: the route inventory table and CSV of API-CONTRACTS.md cover all 103 route files and 150 handlers (`node scripts/check-specification.mjs` fails on any route without a matching row and method set), and `tests/support/authorization-matrix-spec.mjs` transcribes all 103 routes for `tests/integration/authorization-matrix-contract.mjs`. The prose sections of API-CONTRACTS.md, however, were written while the inventory stood at 60 route files and 96 handlers and do not describe the routes added by the demo workstreams (#11 to #22) beyond their inventory rows. Writing those sections is a documentation task (TBD, owner: Nakul Jain).

## Common behaviour (verified in [API-CONTRACTS.md](../specification/API-CONTRACTS.md))

- Authentication: opaque `__Host-saha_session` cookie, server-side lookup per request. Mutations also require `Origin` to match the URL and be listed in `SAHA_ALLOWED_ORIGINS`.
- Bodies: JSON only, bounded at 128 KiB by the shared reader. Errors are `{ "error": "..." }` with 400, 401, 403, 404, 409, 500 or 503. There is no API version, pagination envelope or documented rate limit (only sign-in is throttled).
- Responses are `no-store`.

## To regenerate the skeleton

Re-run a script that walks `app/api/**/route.ts` for `export function GET|POST|PATCH|PUT|DELETE`. The 2026-10-08 generator was a throwaway script and is not committed; a committed generator and a CI drift check are listed as gaps in [README.md](README.md).
