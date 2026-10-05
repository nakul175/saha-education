# Integration contracts and activation boundaries

Version 2.0 draft, 5 October 2026. Current Saha evidence is commit `5488bc0d20412a3d4be0c031c99c259c56834d5e`. The [BRD](BRD.md) defines business intent; [requirements.json](requirements.json) is canonical for FR/NFR IDs. An available code path, vendor comparison or documented URL does not prove a live supported integration.

## Current boundary matrix

| Boundary | Current implementation | Activation / verification still needed | Requirements |
|---|---|---|---|
| School OIDC provider → Saha | Provider-neutral authorization-code/PKCE sign-in, verified ID token, preprovisioned identity mapping and opaque local session | Chosen provider/tenant, registered client/callback, trusted origins, synthetic live browser journey and operator approval | FR-01–FR-04, NFR-01 |
| Saha → external ORF app | Staff-authorized **launch-only** trusted HTTPS link; separate sign-in; no context forwarding or result sync | Sponsor-confirmed actual app and exact destination; config currently blank by design | FR-19, BR-06 |
| Teacher → Saha reviewed ORF record | Manual numeric entry, derived metrics, attribution and safe retries | Educator scoring/comparability/publication/correction/retention policy | FR-20/FR-21, BR-07 |
| Language Studio → Saha | No supported adapter implemented; repository is a candidate reference | Sponsor confirmation plus documented provider-owned launch/result/identity contract | FR-25; currently deferred |
| AmplifiU → Saha | Product reference for original teacher workflows, not a connected service | No direct integration agreed; no verified public API/SSO contract assumed | FR-13–FR-18; optional future FR-23 |
| AI provider → resource workspace | None; current drafts are original/manual text | Provider, authorized configuration, grounded sources, budgets, failure/privacy/review policy | FR-22/FR-23; planned |
| Classroom/export/submissions | Browser printing of exact reviewed versions only; no Classroom or document-file adapter | Actual target/API/auth scopes, export/submission requirements and validation | FR-18 current print; FR-24/FR-25 planned |
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
5. Server exchanges the code with the configured token authentication method and PKCE verifier. ID token has a 32,768-character bound. Remote JWKS validation permits only RS256, PS256, ES256 or EdDSA supported by provider metadata. Required claims include issuer, audience, expiry, issued-at, subject and nonce; signature/issuer/audience/nonce/azp/issued-at checks apply with 30-second tolerance.
6. The mapped local account must already exist, have school/valid role and be enabled. Server revokes a supplied existing local session and creates an opaque eight-hour Saha session. It redirects 303 `/`, clears transaction/legacy role cookies and sets no-store/no-referrer.
7. Any callback failure redirects 303 `/login?error=signin_failed`, clears the transaction cookie and does not expose provider details. Start-login failures use safe JSON errors: origin 403, throttling 429, missing/unavailable configuration 503, as applicable.

Login rate limiting uses ten-minute edge-IP-digest buckets (a shared restrictive fallback when edge IP is absent), with attempts over 20 rejected. This is a login-specific implementation, not a complete abuse or operational-control policy.

### Session lifecycle and non-contracts

`__Host-saha_session` is a random opaque token with only its digest in D1. Cookie flags are Secure/HttpOnly/SameSite=Lax/Path=/. Current account/school/role/disabled and identity mapping are reread on each lookup; local DELETE `/api/session` revokes it and clears cookies. Duplicate cookie values confer no authority. Provider access/refresh tokens are not persisted as an integration credential, and there is no background refresh/userinfo contract, automatic provisioning, provider single logout or identity-administration UI in this release.

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
- Adult-reviewed reading exports can contain numeric metrics/duration, but JSON backups may also contain learner metadata, passages and transcripts. Hosted CSV omits some raw scoring inputs. No format is accepted by current Saha as an automatic import.
- Its AI transcript estimates are provisional and have distinct unverified-device-model provenance; they must not be relabeled as reviewed manual assessments.

This is source-inspection evidence, not a guarantee about the currently deployed service or future provider interfaces. A future adapter needs an agreed supported contract and authority from the application's owner (FR-25). Internal source messages or undocumented endpoints are not enough.

## Manual reviewed ORF record contract — no external exchange

Teacher/admin selects an authorized class and active student **inside Saha** and enters reviewed counts/duration. The strict POST `/api/reading-checks` takes `clientCheckId?`, class/student IDs, language, passage reference, reading date, duration seconds, attempted words and correct words. API details and a synthetic example are in [API contracts](API-CONTRACTS.md).

School, recorder/time, `sourceAppId:"oral-reading-fluency"` and `provenance:"manual-reviewed-external"` are fixed server-side. Derived rate/accuracy are recomputed from normalized milliseconds/counts. The record asserts **manual teacher review**, not that any external app cryptographically authenticated the observation. Optional UUID retries must retain actor and normalized immutable payload; conflicting reuse is 409. No edit/delete/import/correction API exists.

Current scope deliberately stores no audio, transcripts, full passage text, external learner identifiers or imported provider response. Family access is 403 because reading publication has not been designed. Teacher historical visibility follows current class assignment/active enrolment, not a completed-course access policy.

Educator decisions remain necessary for attempted/skipped/error administration, comparable passages/language/difficulty, recording duration, UTC-versus-school-date handling, corrections and interpretation. ORF rate/accuracy does not establish comprehension, subject mastery, diagnostic risk or grade-level norms. No automatic risk label or medical/standardized assessment claim is supplied (FR-21).

## AmplifiU reference boundary

The sponsor confirmed AmplifiU as the teacher-tool reference; [the existing product plan](../current/AMPLIFY-LITERACY-PLAN.md) records the comparison and its source. Current Saha implements original manual lesson/worksheet/quiz/activity drafts, revision history, explicit teacher review, class assignment, private staff fields and browser printing. There is no AmplifiU account connection, proprietary prompt/content import or API invocation.

Vendor-published integrations/export features are not verified Saha contracts. This release does not assume a public AmplifiU API, licensing permission, SSO capability or access to its curricula. Proposed AI/resource/classroom capabilities below require Saha-owned specifications and confirmation separately.

## Planned contracts — not implemented endpoints

These define questions/acceptance boundaries for later design, not existing HTTP paths or activated provider capabilities.

| Proposed boundary | Minimum contract to agree | Acceptance evidence before activation | Requirement |
|---|---|---|---|
| Approved curriculum library | Original/licensed source versions, curriculum/grade/subject/language mapping, reviewer and rights/provenance | Educator-approved sources, bounded references and version/rights validation | FR-22 |
| Optional AI drafting | Authorized staff request, selected source versions, structured provisional response, provider/model/template provenance, budget, timeout/error and review gate | Synthetic-only output/schema/failure/redaction checks; no student PII needed for generic resource draft; explicit credentials/provider approval | FR-23 |
| External ORF result adapter | Confirmed provider auth/tenant, pseudonymous learner mapping, external event ID, raw count/duration semantics, review status, corrections and replay/conflict contract | Supported provider docs/owner authority, test tenant, cross-school negatives, payload integrity and educator interpretation | FR-25/FR-21 |
| Classroom adapter | Confirmed platform/application registration, least required scopes, roster/course ownership mapping, assignment/version pinning and synchronization conflicts | Synthetic class test, revoked-scope/member checks, replay/conflict and controlled export evidence | FR-25 |
| Learner submission/feedback | Assignment-version/student binding, accepted formats, deadline/correction history, reviewer/publication and guardian policy | Student/family isolation, immutable assigned content, attributable corrections and educator UAT | FR-24 |
| Document-file export | Selected approved version/edition, private-field exclusion, target DOCX/PDF/PPTX/Docs fidelity and destination authority | Rendered output review, private-key exclusion and approved write/export destination | FR-18 extension / FR-25 |
| Email/SMS delivery | Provider credentials/recipient consent, allowed templates, idempotent delivery key, retry/bounce/status/webhook verification | Synthetic recipient validation and replay/failure checks; no silent real-recipient messaging | FR-12 |

No planned adapter may treat external content as authorization instructions or write directly across tenants. Future schemas, routes, audit/correction/retention controls and test cases must be added through the BRD → FSD → design → acceptance sequence. Their absence is tracked in [decisions and risks](DECISIONS-RISKS.md), not masked by a successful launch link or current manual-resource flow.
