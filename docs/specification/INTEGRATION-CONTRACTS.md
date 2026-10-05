# Integration contracts and activation boundaries

Version 2.2 draft, 5 October 2026. The current candidate is identified by its parent below; the earlier baseline is retained as history. The [BRD](BRD.md) defines business intent; [requirements.json](requirements.json) is canonical for FR/NFR IDs. An available code path, vendor comparison or documented URL does not prove a live supported integration.

The v2.2 implementation candidate was prepared on `feat/specification-delivery`. `source_commit` records `398df9c8bf57659a5fd97718f76fe962011cf7d2`, the parent of this documented batch, rather than the commit containing its changes. The changes were uncommitted when this specification was assembled; dated publication and execution records are maintained separately. The v2.0 application baseline remains `5488bc0d20412a3d4be0c031c99c259c56834d5e`, and v2.1 evidence remains historical. Every requirement is unapproved and every designed case is `not-run-for-this-specification`.

## Current boundary matrix

| Boundary | Current implementation | Activation / verification still needed | Requirements |
|---|---|---|---|
| School OIDC provider → Saha | Provider-neutral authorization-code/PKCE sign-in, verified ID token, preprovisioned identity mapping and opaque local session | Chosen provider/tenant, registered client/callback, trusted origins, synthetic live browser journey and operator approval | FR-01–FR-04, NFR-01 |
| Saha → external ORF app | Staff-authorized **launch-only** trusted HTTPS link; separate sign-in; no context forwarding or result sync | Sponsor-confirmed actual app and exact destination; config currently blank by design | FR-19, BR-06 |
| Teacher → Saha reviewed ORF evidence | Manual numeric entry, reviewed append-only corrections, effective/original metrics and exact-task descriptive history | Educator scoring/comparability/publication/retention policy | FR-20/FR-21, BR-07 |
| Language Studio → Saha | No supported adapter implemented; repository is a candidate reference | Sponsor confirmation plus documented provider-owned launch/result/identity contract | FR-25; currently deferred |
| AmplifiU → Saha | Product reference for original teacher workflows, not a connected service | No direct integration agreed; no verified public API/SSO contract assumed | FR-13–FR-18; optional future FR-23 |
| Manual curriculum → resource workspace | School-local manually declared source versions, exact review and unapproved source-bound draft copies | Actual pilot source permissions/suitability and languages; no vendor import | FR-22 partial |
| AI provider → resource workspace | None; current drafts/references remain manual text | Provider, authorized configuration, grounding, budgets, failure/privacy/review policy | FR-23 planned |
| Learner → Saha text/formative workflow | School-local immutable attempts/reviewed feedback against exact approved assignment | Reviewed local open/closed/timed windows current; grade/late/guardian policy pending; no external Classroom/file-upload adapter | FR-24 partial |
| Classroom/document-file export | Browser printing of exact reviewed versions only; no external adapter | Actual target/API/auth scopes, export requirements and validation | FR-18 current print; FR-25 planned |
| Email/SMS | Database notice records and disabled provider boundary | Actual provider/recipient/consent/delivery/error contract | FR-12 partial; not activated |

## Provider-neutral OIDC contract — implemented foundation

Sources: [oidc.ts](../../lib/education/oidc.ts), [identity.ts](../../lib/education/identity.ts), [session.ts](../../lib/education/session.ts), [login handler](../../app/api/auth/login/route.ts), [callback handler](../../app/api/auth/callback/route.ts), [.env.example](../../.env.example), and [authentication delivery](../current/AUTH-ACCESS.md).

### Configuration and authority

Server-only settings are `SAHA_OIDC_ISSUER`, `SAHA_OIDC_CLIENT_ID`, `SAHA_OIDC_CLIENT_SECRET`, `SAHA_OIDC_REDIRECT_URL`, optional `SAHA_OIDC_TOKEN_AUTH_METHOD`, and `SAHA_ALLOWED_ORIGINS`. No provider is enabled by the example file. Issuer/callback are HTTPS URLs without embedded credentials/fragments; issuer/callback query strings are rejected. Callback path is exactly `/api/auth/callback`, and its origin must be allowed. Secrets must not be public browser environment values or committed content.

Allowed token authentication methods are `client_secret_basic`, `client_secret_post`, and `none` for an explicitly registered public PKCE client. Default is basic when a secret exists, otherwise none; chosen method must match provider discovery. This configuration is not a claim that any particular tenant is compatible.

User authority comes from an explicitly provisioned `(identity_issuer,identity_subject)` mapping in `users`, followed by valid role/school and non-disabled state. Email matching, just-in-time registration and caller-selected roles are not implemented. The user's own linked student/guardian profile mapping is separately required for learner/family data scope.

### Request/response sequence

1. Browser POSTs `/api/auth/login` from a matching allowed origin. No existing session is required and no request body fields are consumed.
2. Server loads `issuer/.well-known/openid-configuration`; validates exact issuer, HTTPS authorization/token/JWKS URLs, supported signing algorithms and token authentication method. Discovery/token requests disable redirects and have ten-second deadlines; JSON bodies are bounded at 65,536 characters/content-length bytes.
3. Server creates random state, browser binding, PKCE verifier and nonce. Only state/browser digests are stored for binding; verifier/nonce remain restricted server transaction material. Transaction validity is five minutes. It returns 200 `{url}` and `__Host-saha_oidc` cookie. The authorization request asks for `response_type=code`, scope **openid**, the registered client/callback, state/nonce and S256 challenge.
4. Provider redirects browser to callback with state/code. Server requires one state, at most one code, correct 43-character state/cookie forms and a matching unexpired browser-bound transaction. Atomic DELETE RETURNING consumes it once before token exchange.
5. Server exchanges the code with the configured token authentication method and PKCE verifier. ID token has a 32,768-character bound. Remote JWKS validation permits only RS 256, PS 256, ES 256 or EdDSA supported by provider metadata. Required claims include issuer, audience, expiry, issued-at, subject and nonce; signature/issuer/audience/nonce/azp/issued-at checks apply with 30-second tolerance.
6. The mapped local account must already exist, have school/valid role and be enabled. Server revokes a supplied existing local session and creates an opaque eight-hour Saha session. It redirects 303 `/`, clears transaction/legacy role cookies and sets no-store/no-referrer.
7. Any callback failure redirects 303 `/login?error=signin_failed`, clears the transaction cookie and does not expose provider details. Start-login failures use safe JSON errors: origin 403, throttling 429, missing/unavailable configuration 503, as applicable.

Login rate limiting uses ten-minute edge-IP-digest buckets (a shared restrictive fallback when edge IP is absent), with attempts over 20 rejected. This is a login-specific implementation, not a complete abuse or operational-control policy.

### Session lifecycle and non-contracts

`__Host-saha_session` is a random opaque token with only its digest in D1. Cookie flags are Secure/HttpOnly/SameSite=Lax/Path=/. Current account/school/role/disabled and identity mapping are reread on each lookup; local DELETE `/api/session` revokes it and clears cookies. Duplicate cookie values confer no authority. Reviewed current-school provisioning/status now has an administration UI, with atomic all-session revocation on disablement. This local workflow does not activate/configure the provider or remap existing roles/identities/schools. Separate reviewed profile login ownership is current and does not verify family relationships. Provider access/refresh tokens are not persisted as an integration credential; background refresh/userinfo, automatic registration and provider single logout remain absent.

Real provider account linkage, callback/network configuration and browser journey remain pending. Synthetic tests establish local contract behavior; they do not establish provider activation or production sign-in readiness.

## ORF launch contract — current launch-only implementation

Sources: [external-apps service](../../lib/education/external-apps.ts), [launch route](../../app/api/external-apps/[id]/launch/route.ts), [staff UI](../../app/external-apps/page.tsx), [reading delivery](../current/EXTERNAL-READING.md).

`SAHA_ORF_APP_URL` is the only destination authority. Keep it **blank** until the sponsor confirms the actual application. A configured value must be absolute HTTPS without user/password, query, fragment, backslash or whitespace. Request parameters never choose a URL. Saha does not fetch this destination in the launch preparation endpoint.

Registry GET `/api/external-apps` returns the fixed `oral-reading-fluency` category, title, allowed staff roles and `capability:"launch-only"`, `signIn:"separate"`, `resultSync:false`. Registry does not expose the destination; availability is false when unconfigured/unsafe or when viewer is a family role.

Staff POST `/api/external-apps/oral-reading-fluency/launch` accepts an empty body, `{}`, or strict optional `{studentId}`. A supplied student is checked for **local** scope and never forwarded. Unknown category/inaccessible student is 404; family role is 403; unconfigured/unsafe destination is 503. On success, `{url,signIn:"separate",resultSync:false}` enables a separate-tab link with `noopener noreferrer` and `referrerPolicy="no-referrer"`.

No student name/ID, school/class ID, passage, results, audio, transcript, Saha session token, provider secret or caller-supplied return address is appended. The destination may use its own authentication; Saha does not reuse cookies, impersonate its users or represent the link as SSO. There is no accepted callback, external event ingestion, iframe/postMessage or server-result exchange endpoint.

## Language Studio candidate — inspected reference, not activated adapter

The sponsor's `nakul175/language-studio` repository was inspected as a candidate. Its documented hosted address has not been confirmed by the sponsor or verified live. No destination is adopted from that repository automatically; the configured Saha slot remains blank.

Observed source boundary in the candidate:

- Root application builds its reading interface into an internal `iframe.srcdoc`; reader state/result messages bind to its own parent-frame session. This is not a supported external launch or result callback contract.
- Its hosted authentication trusts its own Sites dispatcher identity headers and then independently checks workspace membership/learner access. These headers are not server-to-server credentials and must not be fabricated or forwarded by Saha.
- Mutations require its matching origin, JSON content type and application header. No supported Saha bearer credential, cross-application result import service, external SSO launch context or webhook was found in the inspected implementation.
- Adult-reviewed reading exports can contain numeric metrics/duration, but JSON backups may also contain learner metadata, passages and transcripts. Hosted CSV omits some raw scoring inputs. No vendor-native format is accepted automatically. Saha accepts only the explicitly normalized local manual JSON draft below, after staff supplies exact Saha IDs and reviews all original values.
- Its AI transcript estimates are provisional and have distinct unverified-device-model provenance; they must not be relabeled as reviewed manual assessments.

This is source-inspection evidence, not a guarantee about the currently deployed service or future provider interfaces. A future adapter needs an agreed supported contract and authority from the application's owner (FR-25). Internal source messages or undocumented endpoints are not enough.

## Manual reviewed ORF record contract — no external exchange

Teacher/admin selects an authorized class and active student **inside Saha** and enters reviewed counts/duration. The strict POST `/api/reading-checks` takes `clientCheckId?`, class/student IDs, language, passage reference, reading date, duration seconds, attempted words and correct words. API details and a synthetic example are in [API contracts](API-CONTRACTS.md).

School, recorder/time, `sourceAppId:"oral-reading-fluency"` and `provenance:"manual-reviewed-external"` are fixed server-side. Derived rate/accuracy are recomputed from normalized milliseconds/counts. The record asserts **manual teacher review**, not cryptographically authenticated external evidence. Original entry rechecks current class/active enrolment/school/live actor in the insertion statement. Optional UUID retries retain actor/normalized immutable payload; conflicting reuse is 409. There is no original edit/delete or verified provider ingestion; normalized local draft review is separate, and corrections use a separate reviewed append-only contract.

Current scope stores no audio, transcripts, full passage text, external learner identity mapping or raw vendor response. Local draft source/result references are user-declared labels only. Family access is 403 because reading publication has not been designed. Original-entry rules remain active-enrolment based. New correction/history reads preserve evidence for current original-class staff while the learner remains in school, including after withdrawal; reassignment/transfer removes that authority. This is a specific local policy choice, not a complete historical-entitlement model.

The new review endpoint groups effective points only by exact learner/class/language/passage/duration, while retaining original and every correction actor/time/reason. A correction remains manual external-session evidence with local review; neither the correction nor grouping establishes automatic external verification, standardized passage equivalence, scoring norms or diagnosis.

Educator decisions remain necessary for attempted/skipped/error administration, comparable passages/language/difficulty, recording duration, UTC-versus-school-date handling, corrections and interpretation. ORF rate/accuracy does not establish comprehension, subject mastery, diagnostic risk or grade-level norms. No automatic risk label or medical/standardized assessment claim is supplied (FR-21).

## AmplifiU reference boundary

The sponsor confirmed AmplifiU as the teacher-tool reference; [the existing product plan](../current/AMPLIFY-LITERACY-PLAN.md) records the comparison and its source. Current Saha implements original manual lesson/worksheet/quiz/activity drafts, revision history, explicit teacher review, class assignment, private staff fields and browser printing. There is no AmplifiU account connection, proprietary prompt/content import or API invocation.

Vendor-published integrations/export features are not verified Saha contracts. This release does not assume a public AmplifiU API, licensing permission, SSO capability or access to its curricula. Proposed AI/resource/classroom capabilities below require Saha-owned specifications and confirmation separately.

## Planned contracts — not implemented endpoints

These define questions/acceptance boundaries for later design, not existing HTTP paths or activated provider capabilities.

| Proposed boundary | Minimum contract to agree | Acceptance evidence before activation | Requirement |
|---|---|---|---|
| Verified curriculum permission/suitability | Actual permission lifecycle and pilot framework beyond the current manual declared source-version library | Educator/legal source review, selected languages/framework and permission/withdrawal validation | FR-22 remaining scope |
| Optional AI drafting | Authorized staff request, selected source versions, structured provisional response, provider/model/template provenance, budget, timeout/error and review gate | Synthetic-only output/schema/failure/redaction checks; no student PII needed for generic resource draft; explicit credentials/provider approval | FR-23 |
| External ORF result adapter | Confirmed provider auth/tenant, pseudonymous learner mapping, external event ID, raw count/duration semantics, review status, corrections and replay/conflict contract | Supported provider docs/owner authority, test tenant, cross-school negatives, payload integrity and educator interpretation | FR-25/FR-21 |
| Classroom adapter | Confirmed platform/application registration, least required scopes, roster/course ownership mapping, assignment/version pinning and synchronization conflicts | Synthetic class test, revoked-scope/member checks, replay/conflict and controlled export evidence | FR-25 |
| Wider learner submission policy | Grading, late penalties, attachments, external-classroom synchronization or guardian publication beyond current local text/formative/window workflow | Agreed policy, history/privacy and educator UAT | FR-24 remaining scope |
| Document-file export | Selected approved version/edition, private-field exclusion, target DOCX/PDF/PPTX/Docs fidelity and destination authority | Rendered output review, private-key exclusion and approved write/export destination | FR-18 extension / FR-25 |
| Email/SMS delivery | Provider credentials/recipient consent, allowed templates, idempotent delivery key, retry/bounce/status/webhook verification | Synthetic recipient validation and replay/failure checks; no silent real-recipient messaging | FR-12 |

No planned adapter may treat external content as authorization instructions or write directly across tenants. Future schemas, routes, audit/correction/retention controls and test cases must be added through the BRD → FSD → design → acceptance sequence. Their absence is tracked in [decisions and risks](DECISIONS-RISKS.md), not masked by a successful launch link or current manual-resource flow.

## Normalized local reading draft contract — manual, provider neutral

Sources: [reading imports](../../lib/education/reading-imports.ts), [migration 0010](../../drizzle/0010_reading_imports.sql), [staff screen](../../app/reading-imports/page.tsx) and [exact APIs](API-CONTRACTS.md). Trace: FR-20/FR-25/FR-26, NFR-01/NFR-02/NFR-03. This is local user-supplied data, not authenticated vendor ingestion or a Language Studio/AmplifiU connector.

Required envelope format is `saha.reading-results.v1`, one explicit Saha class, exact declared source namespace/batch reference and 1–25 rows of exact Saha learner ID, stable distinct externalReference, language/task/date/duration/counts. No vendor account, shared secret, name/email matching, raw export, arbitrary URL retrieval or external transport is accepted. Body bounded128KiB; strict schemas reject additional ownership, score, audio/transcript or provider-verification fields.

Stage persists immutable original preview and zero observations. Staff reviews all values, confirms explicitly with reason/UUID/expectedRevision 0, or rejects. Actual stage/confirm checks current enabled school staff/class, exact learner school and every active enrollment. Creator teachers must retain current class authority; current school administrators may review authorized drafts. Withdrawal prevents confirmation but may retain current-school preview/rejection; transfer/reassignment/revocation denies reads/retries.

Confirmation inserts all original manual-reviewed checks plus durable item->check/declared source/result/reviewer/time receipts in one atomic UPDATE/trigger transaction. Exact school+sourceLabel+externalReference consumed-result uniqueness applies across DIFFERENT draft UUIDs. A conflict rolls back the entire confirm and leaves staged. Pending duplicates coexist and can reject. Same UUID/payload/actor retry returns current evidence; collision/change cannot replace originals. No source verification, norms, diagnosis, efficacy, synchronization or family publication is established. Verified automatic adapters remain FR-25 planned.

The local control interface is an application-cookie/same-origin staff API. It must not be treated as a third-party bearer/webhook endpoint or activated provider contract. Future adapter work needs supported provider-owned authentication, permission, payload/learner mapping, source verification, correction and reconciliation contracts.
