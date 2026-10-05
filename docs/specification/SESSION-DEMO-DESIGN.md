# Original session execution authority and isolated synthetic demo

Version 2.10 draft, 6 October 2026. Candidate parent `a418ee4132bfc05d24748ad1d25c5fa5b91b7d69`; actual frozen source, execution/publication/release are recorded separately by the coordinator. All approvals remain false and all cases remain `not-run-for-this-specification`. Read [BRD](BRD.md) → [FSD](FSD.md) → [HLD](HLD.md) → [LLD](LLD.md).

Trace: BR-01, BR-02, BR-10–BR-12; FR-01–FR-06; NFR-01–NFR-09. SC-38 covers TC-254–TC-261; SC-41 covers TC-278–TC-285. The current trusted-provider path remains separate from optional default-off synthetic sign-in.

## Private verified Principal evidence

[Session resolution](../../lib/education/session.ts) validates opaque cookie shape, hashes its token and joins current account/session. Validity requires unexpired token, supported role, school, enabled account and nonempty trusted identity. It returns the original frozen `{id,role,schoolId}` object made by [principal-authority](../../lib/education/principal-authority.ts). A module WeakMap privately associates that object with frozen `{tokenHash,userId,identityIssuer,identitySubject}`. Neither raw token nor digest/identity snapshots appear as enumerable fields, JSON, public session DTO or browser props.

Common [livePrincipalScope](../../lib/education/access.ts) embeds `sessionExecutionScope` into actual protected SQL. For a verified request Principal it requires:

- The original token hash still names a session for the original user; another active same-user token cannot rescue it.
- `expires_at` is strictly greater than database UTC epoch milliseconds, calculated from `strftime('%s','now')` and millisecond fractional time. Request-resolution Date.now alone is insufficient for the later statement.
- Current account ID, role, school and null disabled_at match the original object, and exact issuer/subject equal its private verified snapshot.
- A synthetic issuer additionally satisfies current demo configuration/marker/isolation predicate.

Revocation, expiry, reassigned session owner or changed identity/account must affect the protected statement after prior awaits. Read collections retain existing empty scoped responses where appropriate; object/mutation paths retain safe unavailable/conflict/denied statuses. A later HTTP request with no usable token is401. Delivered content cannot be retracted; there is no continuous provider polling/browser revocation channel.

Trusted direct internal service callers without WeakMap evidence retain the earlier live account-scoped contract (`sessionExecutionScope` contributes SQL1). This compatibility is not an HTTP bypass: all routes/pages must obtain authority from trusted session resolution, and public headers/role cookies/body/serialized Principal confer no authentication. Spreading/serializing a verified Principal loses private object evidence; implementers must pass the original resolved object through services rather than reconstructing it. Runtime freezes prevent accidental mutation of verified objects, not external provider lifecycle validation.

## Demo runtime and availability

[Demo policy](../../lib/education/demo-policy.ts) allows synthetic entry only when `SAHA_DEMO_ENABLED` is exactly `true`, `SAHA_DEMO_INSTALLATION_ID` is a valid UUIDv4 and none of `SAHA_OIDC_ISSUER`, `SAHA_OIDC_CLIENT_ID`, `SAHA_OIDC_CLIENT_SECRET`, `SAHA_OIDC_REDIRECT_URL`, `SAHA_OIDC_TOKEN_AUTH_METHOD` is configured. Real school OIDC remains fail-closed until its separately approved setup. Merely guessing the synthetic issuer/profile IDs or supplying public role headers cannot create authority.

GET [demo route](../../app/api/demo/route.ts) returns200 `{available:boolean,synthetic:true}`, no-store, without account enumeration/cookie/seed. `available` reports runtime settings only: a contaminated/nonpristine database can still reject sign-in503/403. It is not an installation health assertion. POST requires matching configured request Origin, enabled runtime and strict `{role:"admin"|"teacher"|"guardian"|"student",syntheticAcknowledged:true}`. Unknown fields, false/missing acknowledgement and invalid role reject400. Disabled runtime404; wrong/missing origin403. Authentication is not required to choose one of the fixed fictional demonstration views in this separate private environment.

The [login screen](../../app/login/page.tsx) shows explicit fictional-data acknowledgement and four role choices only after metadata availability. All controls disable during sign-in; result must correlate `{destination:"/",synthetic:true}` before native navigation. Outside enabled demonstration it shows school sign-in, not a role switch. Neither metadata nor client state can override the server gate.

## Installation marker and seed batch

[0016](../../drizzle/0016_synthetic_demo.sql) adds only `demo_installations(id,school_id,seed_nonce,created_at)` with unique school_id. It adds no sample rows. `school_id` intentionally has no immediate FK because the marker claim is inserted before its school in the atomic seed batch; normal user/profile/academic FKs remain. Marker id/nonce/time are operational synthetic evidence, not provider identities or bearer credentials.

[Demo service](../../lib/education/demo.ts) first checks runtime and matching marker. If absent, it generates a nonce and issues one D1 batch: INSERT marker SELECT only when schools/users/auth_sessions/oidc_transactions/demo_installations are empty; all fixed-row INSERT SELECTs require that exact winning marker id/school/nonce. All fixture rows commit atomically or roll back. A competing first-use batch reads the winning committed marker rather than repairing/resetting. Existing school/account/session/identity transactions cannot be adopted as an isolated demo. Failure without a matching marker is503; there is no arbitrary record/SQL seed endpoint.

Fixture contains one River School labelled synthetic, four fixed role accounts using `https://saha-demo.example.invalid`, three fictional learner profiles, one guardian linked to two learners, one course/current teacher class, active enrolments, two raw attendance observations, a sample assessment/result, one published and one staff-only draft report, one recipient-owned in-app notice and an original manually authored approved worksheet/class assignment. Fictional address and `example.invalid` contacts cannot be real recipients. These source-defined sample records are not fabricated historical review/publication receipts or educator-approved curriculum. No external call/message is made.

Later sign-in returns existing installation without resetting edits or backfilling missing fixtures. Current account must retain exact fixed ID/role/school/issuer/subject and enabled status, plus isolation predicate; deletion/disablement or lost linkage is not silently repaired. Seed is not an operator restore or production bootstrap workflow.

## Synthetic session lifecycle and ongoing isolation

Before sign-in, current installed account read checks marker/current configuration and no other school/account issuer or null/foreign school. Rate bucket uses SHA-256 of edge client IP (or restrictive shared `unknown` fallback), one ten-minute window, cleanup of expired buckets and atomic count increment; count greater than 40 denies429. Rate limiting is sign-in mitigation, not representative load acceptance. Local caller-supplied edge headers do not prove production header integrity.

The service creates a candidate random token/hash and inserts an eight-hour session through `INSERT SELECT` rechecking the selected fixed account ID/role/school/issuer/subject/enabled state plus current marker/isolation. A final matching session/account read repeats that scope before cookie delivery; a failed final check deletes the candidate token and returns403. Only after a confirmed new session does it revoke the request's previous token and return Secure/HttpOnly/SameSite=Lax `__Host-saha_session`, Path=/, no-store/no-referrer and `{destination:"/",synthetic:true}`. These steps are not one atomic sign-in transaction; actual protected SQL still checks later changes. Late selected-role/configuration mutation cannot mint a wrong-role cookie or destroy the prior valid token before a new one is confirmed. The four demonstration accounts are shared samples rather than unique per-viewer identities; switching roles in one browser ends its current token, while unrelated viewers' sessions are not all revoked.

Synthetic session resolution performs an additional authorized SELECT. Actual protected statements also recheck runtime, exact installation marker/school and absence of foreign schools or accounts with null/foreign issuer/school. Turning off demo, changing installation ID, enabling any school-provider setting or introducing a foreign school/account denies previously resolved synthetic authority at SQL execution. An outer private-hosting login is distinct from these app-level checks. No public-role cookie, fake provider callback, real-school session bypass, identity remapping or privilege forwarding exists.

## Validation and open decisions

[Session contracts](../../tests/integration/session-revocation-contract.mjs) and [synthetic demo contracts](../../tests/integration/synthetic-demo-contract.mjs) exercise actual opaque sessions/routes/production-D1 SQLite, statement-time hooks and persistence/isolation. They are narrower than actual hosted D1, browser cookie/callback, platform audience, multi-viewer operations or named accessibility/educator acceptance. Root maintains dated actual checks separately; no designed-case status inherits a suite result.

Pending: confirmed real provider/tenant and ORF URL, approved pilot identity/family mappings, demo shared-account governance/rate/capacity and hosted isolation proof, educator/scoring/calendar/correction/retention decisions, representative accessibility/browser matrix, operational backup/restore ownership and RPO/RTO. The demo enables fictional exploration without resolving those school/pilot dependencies. Do not enter real learner data or activate paid AI/providers through this specification.
