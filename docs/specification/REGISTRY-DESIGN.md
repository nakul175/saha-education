# Reviewed registry creation, original receipts and client privacy

Version 2.11 draft, 6 October 2026. Candidate parent `8088b5f88213401ff900506362c227a55120f3c1`; actual frozen source, execution/publication/release are recorded separately by the coordinator. All approvals remain false and all cases remain `not-run-for-this-specification`. Read [BRD](BRD.md) → [FSD](FSD.md) → [HLD](HLD.md) → [LLD](LLD.md).

Trace: BR-01, BR-02, BR-10–BR-12; FR-02–FR-06, FR-26; NFR-01–NFR-09. SC-37 retains TC-246–TC-253 with current v2.9 procedures; SC-39–SC-40 add TC-262–TC-277. Historical v2.8 manual comparison recovery and seventh-batch outcomes remain dated history, not current reviewed-screen requirements.

## Scope and compatibility

[Student Registry](../../app/students/page.tsx) and [Guardian Registry](../../app/guardians/page.tsx) use the existing authorized GET lists and separate reviewed POST endpoints. [Service](../../lib/education/registry-create.ts), [schema](../../db/registry-create-schema.ts) and [additive 0015](../../drizzle/0015_registry_creation.sql) introduce one nine-field immutable receipt table. Additive 0016 is the independent demo marker, giving current 41 tables/338 fields and 60 API route files/96 handlers.

Legacy POST `/api/students` and `/api/guardians` keep their current non-idempotent contracts, field/date validators and guardian duplicate semantics. Existing records are never backfilled with invented receipt/review evidence, matched, merged, linked or deleted. Student admission numbers remain globally unique. New reviewed profiles start `userId:null`; [reviewed profile links](../../app/admin/profile-links/page.tsx) is the separate identity-ownership decision, not family verification.

## Reviewed envelope and output

| Route | Input and current scope | Success and recovery |
|---|---|---|
| POST `/api/registry/students` | Original current school administrator; strict `{clientRequestId,reviewConfirmed:true,reason,profile:{firstName,lastName,dateOfBirth,admissionNumber,gradeLevel}}` | 201 first /200 exact replay; `{receipt,replayed}` |
| POST `/api/registry/guardians` | Same scope; strict `{clientRequestId,reviewConfirmed:true,reason,profile:{name,relationship,phone?,email?}}` | 201 first /200 exact replay; `{receipt,replayed}` |
| GET `/api/registry/creations/{requestId}` | Current enabled same-school **original administrator**, exact UUID | 200 original receipt; unavailable/foreign/other actor404; unsupported role403 |

UUID input is validated and lowercased. Review reason is trimmed, 10–500 Unicode code points and no NUL; this slice does not inherit assessment reason's broader control-character policy. Nested profile schemas are strict and use accepted legacy picked-field validators. Unknown fields, caller school/actor/ID/timestamps/login binding, false review, malformed body or transport over128 KiB reject400 after role/origin checks. Authentication precedes body; administrator role precedes parsing; mutations require matching configured Origin.

Receipt DTO is `{id,kind,schoolId,createdBy,reason,createdAt,profile}`. `profile` contains the originally server-created complete student/guardian row, including server ID/school/time and `userId:null`. Response omits request hash/current identity/session evidence and never substitutes a later edited current profile. First POST has `replayed:false`;200 exact replay has `replayed:true`. GET returns the receipt directly. There is no receipt enumeration, patch or delete API.

## Canonical hash, persistence and arbitration

1. Parse UUID, trimmed reason and accepted profile. For guardians normalize omitted phone/email to null; explicit empty phone remains distinct from omission and an empty email is invalid. Picked legacy validators preserve accepted profile values; the service trims the review reason only. The guardian screen trims optional contacts and omits blanks before capturing its request.
2. SHA-256 the JSON encoding `{kind,reviewConfirmed:true,reason,profile}` in service-defined field order. The UUID identifies the operation; it is not part of the hash.
3. Read original receipt using current same-school actor plus SQL-time original session/identity scope. Exact kind/hash returns immutable original receipt. Changed kind/hash conflicts409.
4. Generate server profile UUID and ISO time. Insert receipt through actual current-authority `INSERT SELECT`, `ON CONFLICT(id) DO NOTHING RETURNING`. A database BEFORE trigger validates live administrator, receipt UUID/profile identity, fixed snapshot shape, null login ownership and timestamps. An AFTER trigger inserts exactly one profile in that same statement; all child/constraint failures roll back receipt and profile together.
5. Re-read through original current scope. A racing identical request returns200; changed request409. Another administrator/school cannot consume the global UUID or read its original evidence. No lookup exposes hash, foreign details or existence through a private result.
6. Map only known creation/admission/receipt uniqueness/guard failures to generic409. An unrelated database/transport failure stays a generic unexpected failure and may have committed; do not translate it into a certain rejection. A committed result whose final authorized read fails may return404: the client must retain original recovery rather than invent a non-commit.

`registry_creation_receipts.profile_id` is unique and has no student/guardian FK: receipts deliberately survive later valid profile edits/ownership changes rather than joining or being rewritten to current mutable state. Receipt school and actor do have FKs. UPDATE/DELETE triggers protect originals. Canonical hash is private server evidence, not a vendor signature or a client-verifiable proof. Equivalent parsed/canonical requests replay; arbitrary byte order/string variants are not a universal equivalence contract.

## Current read, list and search behavior

Each reload clears old rows/principal/current create authorization, then reads session → authorized list → session. Exact actor ID/role/school must agree; only the latest mounted generation is accepted. Abort/generation guards discard old replies even when transport ignores cancellation. Missing/disabled/changed account, failed list or mismatched final session cannot restore prior privileged content. Server's SQL-time token/identity/record scope remains final: separate browser reads are not a single transaction or a continuous access monitor.

Student search filters current loaded names/admission numbers locally. Query is at most200 UTF-16 code units; first200 matching profiles are shown, with separate shown/matching/loaded counts. This is not school-total pagination or server search. Student View uses a native full-page profile link. Guardian list retains its existing scoped set and keyboard-focusable scroll region labelled Guardian profiles; no invented student-style cap applies.

## Client state and exact recovery

| State | Private intent and rendered controls | Next permitted action |
|---|---|---|
| Fresh draft | Current administrator's fields/reason; review checkbox clear on edit | Confirm and submit one UUID after fresh same-actor session preflight |
| Sending | Synchronous ref lock; original endpoint/UUID/serialized body/actorKey/values/reason captured | No second same-frame/new action |
| Confirmed | Correlated201/200 with expected replay flag, actor/school/kind/UUID/reason/profile/timestamps; original receipt separate from list | Refresh current registry; failed refresh cannot change known commit into failed write |
| Sent but uncertain | Original captured bytes retained in page memory; protected rows/principal/forms/receipt details hidden; no automatic retry | Explicit reload with original current admin; session preflight again before exact Retry pending creation |
| Different/lost authority | Original intent remains private but comparison identifiers/receipt/create controls hidden | Sign in separately and reload original actor; no other account may rebase/recover it |
| Definitive400 | Pending request released; retained fields preserved, review clear | Correct fields and deliberately review a fresh request |
| Definitive409 | Pending request released; protected view hidden, retained fields held, conflict lock | Authorized reload, inspect current evidence and deliberately review fresh request; never automatic new UUID |
| First-send preflight failure | No POST sent; pending request released, private current view hidden | Authorized reload/review; no alleged committed result |

Client success correlation checks original request ID, actor/school/kind/reason, original values, nonempty server profile ID, null original userId and valid equal original created/updated timestamps.200 must say replayed:true;201 must say false. Malformed/mismatched success is uncertain even when the server committed. After known success, a failed list refresh is shown separately and cannot trigger another create. Original receipt visibility still requires fresh matching current scope; known success wording is not continuing access to private receipt details.

Pending endpoint/bytes/UUID are **in-page memory only**. Hard reload/navigation/tab loss discards them; receipt is durable but the app has no persisted cross-device retry queue or UUID discovery UI. Cross-tab new drafts with different UUIDs may deliberately create duplicate guardians; stable same-operation UUID retries do not promise entity deduplication. The legacy APIs still allow unreviewed replacement/create behavior under current authorization; review governance and deprecation remain policy decisions.

## Evidence and acceptance boundary

[Independent backend contracts](../../tests/integration/registry-create-contract.mjs) exercise actual synthetic sessions/routes and production Drizzle D1 over migrated SQLite, including original replay, constraints, current authority, race arbitration and rollback. [Client contract](../../tests/integration/registry-ui-contract.mjs) uses unchanged transpiled callbacks with substituted React/RHF/components and native event values; it is not mounted form/dialog/focus evidence. [Current reviewed browser procedures](../../tests/worker-reviewed-registry-ui-check.mjs) cover mounted behavior independently. The older [v2.8 browser file](../../tests/worker-registry-ui-check.mjs) retains historical comparison procedures and is not current recovery proof.

Actual execution counts/time/source/environment are coordinator-maintained. All design cases remain unrun; educator/operator approvals, provider/ORF activation, family relationship verification, birth-date/calendar policy, retention, representative accessibility/load and hosted recovery are separate gates.

## Current profile association boundary

Reviewed new registry creation and its immutable original UUID receipt are unchanged. [Current student profile association](PROFILE-ASSESSMENT-UI-DESIGN.md) is an existing composite student/guardian pair with generic acknowledgement and private mounted original retry, not a registry receipt or reviewed login-ownership event. Public linked-guardian projection omits primary; readback cannot certify it. Follow separate `/admin/profile-links` for reviewed sign-in ownership.
