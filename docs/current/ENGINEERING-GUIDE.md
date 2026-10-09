# Saha Education engineering guide

The practical manual for working in this repository: where things are, how to name and write them, how to check them, and what never to do. Written for a new engineer, human or AI, who has not seen this repository before. Current state is in [HANDOVER.md](../../HANDOVER.md).

## 0. The Products standard (identical in every Products repository)

This section is the same in all six repositories (saha-health, saha-education, saha-agriculture, aplyd-academy, impact-platform, sheet-happens-officer). The rest of this guide is specific to this repository. If the two ever disagree, this repository's own safety rules in AGENTS.md win.

### 0.1 Principles

1. **A human must be able to take over.** Anyone who can read English and knows the language of the repository should be productive on day one using only README.md, AGENTS.md, HANDOVER.md and this guide. If a fact is only in someone's head or a chat, it is missing; write it down.
2. **One place per fact.** Version, hosting state, test counts and open items are stated once, in the status block at the top of HANDOVER.md. Everything else links to it. Never copy a number into a second document.
3. **Small, reviewable, reversible.** One purpose per branch and pull request. Prefer deleting code to adding it. Nothing is merged without a green `verify` check and the owner's approval.
4. **Truth over polish.** Say what was and was not run. Never write "done", "passing" or "verified" for something that was not executed. Synthetic data is never described as real; a demo is never described as production.
5. **Server is the authority.** Permission, ownership and validation are decided on the server. The client only displays.
6. **Never destroy history.** Applied migrations, evidence, receipts and audit records are append-only. Corrections add a new record; they do not rewrite the old one.

### 0.2 Root of the repository

Exactly these markdown files may sit at the root: `README.md`, `AGENTS.md`, `CLAUDE.md`, `HANDOVER.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, `LICENSE` (some repositories omit one or two). Every other document lives under `docs/`. `CLAUDE.md` is a short pointer to AGENTS.md and HANDOVER.md. `AGENTS.md` holds the rules, commands and safety limits. `HANDOVER.md` starts with the status block.

```
docs/
  DOCUMENTATION-INDEX.md   generated; lists every document; never edit by hand
  current/                 live documents (this guide, architecture, contracts)
  history/                 superseded documents and old receipts; read-only
  governance/              policy bundle where the repository has one
```

A document that replaces another moves the old one to `docs/history/` in the same pull request. A new document is added to the index in the same pull request (`pnpm run docs:index`; CI runs `docs:index:check`).

### 0.3 Naming

| Thing | Rule | Example |
|---|---|---|
| Source files and folders | `kebab-case`, lower case, no spaces, no version suffix | `reading-review.ts`, `lib/education/` |
| React components | file `kebab-case.tsx`, component `PascalCase` | `reading-review-panel.tsx` exports `ReadingReviewPanel` |
| Functions and variables | `camelCase`, verbs for functions, nouns for values | `loadStudent`, `studentCount` |
| Types, classes | `PascalCase` | `StudentRecord` |
| Constants | `UPPER_SNAKE_CASE` only for true constants | `MAX_UPLOAD_BYTES` |
| Python | `snake_case` modules and functions, `PascalCase` classes | `audit_export.py` |
| Database tables and columns | `snake_case`, plural table names, no abbreviations | `reading_checks.student_id` |
| Migrations | next number, then topic, never edited once applied | `0041_add_reading_review.sql` |
| API routes | nouns, plural, kebab-case; HTTP verb carries the action | `POST /api/reading-checks` |
| Environment variables | `UPPER_SNAKE_CASE`, one prefix per app; listed in README | `EDUCATION_DEMO_LOGIN` |
| Branches | `<type>/<topic>-<yyyy-mm-dd>` with type one of `feat fix docs chore refactor deploy release qa ops handover` | `fix/reading-nonce-2026-10-09` |
| Commits | `type: imperative sentence` (72 characters or fewer), body explains why | `fix: reject a replayed nonce` |
| Pull requests | title like a commit; body states what changed, what was run, what was not run | |
| Documents | `UPPER-CASE.md` for governance and handover files; `Title-Case.md` or `kebab-case.md` as the repository already does, never both in one folder | |
| Dates | ISO `2026-10-09` in file names; "9 October 2026" in prose; never `October2026` | |

Never put a version, date or "final" in a source file name (`index-v2.ts`, `new-api-final.ts`). Version control is the version.

### 0.4 Writing code

1. **Format is not a discussion.** Prettier (config in `.prettierrc.json`, print width 110, single quotes, trailing commas, semicolons) formats everything; `pnpm run format` fixes it, `pnpm run format:check` is a CI gate. Python uses ruff format. Never hand-align, never reformat a file you are not otherwise changing.
2. **Lines under 110 characters; functions under about 40 lines; files under about 400 lines.** If a file grows past that, split it by responsibility, not alphabetically.
3. **Types are real.** TypeScript is `strict`. No `any`; use `unknown` and narrow, or a named type. No `@ts-ignore`; if unavoidable use `@ts-expect-error` with a reason. Python functions that cross a module boundary carry annotations.
4. **One definition per helper.** Before writing `json()`, `sameOrigin()`, `sha256()`, `now()`, `uniqueFailure()` or similar, search the repository (`rg "function name"`); if it exists, import it. A second copy is a defect. Shared helpers live in one place named in section 3 of this guide.
5. **Imports go one way.** Pages and routes import from `lib/`; `lib/` never imports from `app/`. No import cycles. Use the `@/` alias, not `../../..`.
6. **Names say what a thing is.** No `data`, `info`, `tmp`, `util`, `helper`, `manager`, `handle2`. A boolean reads as a question: `isExpired`, `hasConsent`.
7. **Comments explain why, never what.** No commented-out code; delete it (git remembers). A `TODO` carries an owner and a date or does not exist.
8. **Errors are handled or raised, never swallowed.** No empty `catch`. A user-visible error is plain language and says what to do next. A server error never leaks stack traces, SQL or secrets.
9. **Validate at the boundary.** Every request body, query and header is parsed by a schema before use; unknown fields are rejected.
10. **Dependencies are a liability.** Add one only with a reason in the pull request; pin exact versions; prefer the standard library.
11. **Secrets, real personal data, databases, build output and logs never enter git.** Use synthetic fixtures. `.env*` files stay local.
12. **Tests prove behaviour.** A bug fix lands with the test that fails without it. A test names the behaviour (`rejects a replayed nonce`), not the function. Do not edit a test to make it pass; fix the code or explain why the test was wrong.
13. **Lint is a ratchet.** The committed baseline (`.lint-baseline.json`) may only go down. A pull request that raises it is red. Fix warnings in files you touch.

### 0.5 Every change, start to finish

1. Start from current `origin/main`: `git fetch origin main && git switch -c <type>/<topic>-<date> origin/main`.
2. Read the files you will touch and the tests beside them. Search for an existing helper before writing one.
3. Make the smallest change that does the job. Update the documents it affects in the same pull request.
4. Run the gate (section 6 of this guide). Run it again after the last edit.
5. Commit with a clear subject. Push. Open a **draft** pull request that states what was changed, what was run (with results) and what was not run.
6. Wait for CI. Fix every red check, or say plainly why it is unrelated.
7. A person (or a reviewing agent with the full diff) approves and merges. Agents do not merge on their own authority.
8. After a merge to `main`, check the status block in HANDOVER.md still tells the truth; update it if not.

### 0.6 Do and don't (all repositories)

Do:
- Search before writing. Reuse before adding.
- Keep a change to one purpose; split unrelated fixes.
- State what you did not test.
- Use synthetic data; mark demo behaviour as demo.
- Put new documents under `docs/` and in the index.
- Update HANDOVER.md's status block when hosting, version, gates or open items change.

Don't:
- Don't force-push `main`; don't push to `main` at all in repositories that deploy from it.
- Don't merge without a green `verify` and the owner's approval; don't deploy, change hosting, send messages to real people or spend money without being told to.
- Don't add a root-level document, a second status statement, or a count copied from elsewhere.
- Don't commit screenshots, logs, audio, zips, dumps, generated mirrors or test output. Evidence is kept as manifests and hashes; the files live outside git.
- Don't edit an applied migration, a retained evidence file, a receipt or anything under `docs/history/` (except to move a document there).
- Don't weaken a check, raise the lint baseline, add `eslint-disable` or `any` to get a green build.
- Don't retry an uncertain mutation (a payment, a message, a deploy) blindly; find out what happened first.
- Don't claim "production", "accepted", "verified" or "passing" for anything that was not run and observed.

### 0.7 Handing over (when your session ends)

Before you stop: everything is committed and pushed on a branch with a draft pull request; the status block in HANDOVER.md is current; "Open items" lists what is unfinished and why, with the exact next command or file; no uncommitted work remains in the checkout. The next person, human or agent, should be able to continue from HANDOVER.md alone.

### 0.8 Exceptions in this repository

Section 0 is written for all Products repositories. Here it differs as follows.

- **Package manager and scripts:** pnpm 11.25.0 (pinned in `packageManager`), Node `>=22.13.0` in `engines`. CI runs Node 24 on purpose (see section 7).
- **Test layers:** `node scripts/test.mjs <layer>` is the single runner. `pnpm test` runs the `pr` alias (static, unit, integration, resilience, smoke).
- **Lint:** zero errors and 11 warnings is the committed baseline (`.lint-baseline.json`). This is the cleanest of the Products repositories; keep it that way.
- **Documents:** `VALIDATION.md` at the root is the dated record of real test results and is allowed; it is the one root document beyond the standard list. Legacy upper-case documents in `docs/current/` are slice records and stay as written.
- **Migrations** are `drizzle/NNNN_topic.sql` (generated by `pnpm db:generate`), not hand-numbered.
- **Component files:** `components/ui/` is vendored shadcn code and is excluded from Prettier and from lint rules; do not edit it for style.
- **Everything under `docs/history/`, any `sources/` reference folder (not present in the current tree) and applied `drizzle/` files is read-only.**

## 1. What this repository is, and where it runs

Saha Education is a school administration and learning workspace: classes, students, guardians, attendance, assessments, report cards, notices, reading practice and reviewed records. Staff, learners and guardians sign in through a trusted identity provider (or a synthetic demo sign-in). It is a Next.js 16 app (vinext) running on Cloudflare Workers with D1 (SQLite) through Drizzle. It is a synthetic, private demonstration: no real student data, no real providers, nothing accepted for production.

Current version, hosting, CI and open items are stated once, in the status block at the top of [HANDOVER.md](../../HANDOVER.md). Do not copy them here.

## 2. First hour for a newcomer

```
git clone https://github.com/nakul175/saha-education.git && cd saha-education
corepack enable                      # uses the pinned pnpm 11.25.0
pnpm install --frozen-lockfile
pnpm run build                       # creates dist/
pnpm demo                            # local demo with synthetic data (scripts/demo.mjs; see docs/DEMO.md)
pnpm run typecheck                   # tsc --noEmit
pnpm run lint:baseline               # must report 0 errors, 11 warnings
pnpm run format:check
node scripts/test.mjs static unit --fast
```

You should see the typecheck and format checks pass silently. `node scripts/test.mjs static unit --fast` takes about 15 seconds. The full pull-request gate (`pnpm test`) takes several minutes (the integration layer alone is about 3 minutes on a laptop). I did not run `pnpm demo` for this guide, so its timing and output are unverified.

Then read, in order: [AGENTS.md](../../AGENTS.md), the status block of [HANDOVER.md](../../HANDOVER.md), [docs/ARCHITECTURE.md](../ARCHITECTURE.md), [docs/DEMO.md](../DEMO.md), [docs/TESTING.md](../TESTING.md).

## 3. Map of the repository

| Path | What lives there | Never put here |
|---|---|---|
| `app/` | Next.js App Router. Pages (`page.tsx`), layouts and API routes (`app/api/<resource>/route.ts`). One folder per feature (`attendance`, `assessments`, `classes`, `reading-review`, ...). | Business rules, SQL, validation schemas. |
| `app/api/` | HTTP surface. A route is thin: authenticate, parse, call one `lib/education` function, return JSON. | Direct database access. |
| `lib/education/` | All application logic (78 modules): access control (`access.ts`), auth and identity (`auth.ts`, `identity.ts`, `oidc.ts`, `session.ts`), one module per feature, shared helpers (`http.ts`, `client-api.ts`, `db-errors.ts`, `validation.ts`). | React components, `Request`/`Response` handling beyond `http.ts`. |
| `lib/utils.ts` | Tiny generic helpers. | Domain logic. |
| `db/` | Drizzle schema, split by feature (`schema.ts` plus `*-schema.ts`) and `index.ts` (`getDb`). | Queries. |
| `drizzle/` | Generated SQL migrations `0000`..`0025` and `meta/`. Applied files are immutable. | Hand edits. |
| `components/` | Feature components (`app-shell.tsx`, `role-guide.tsx`, `records/`) and `ui/` (vendored shadcn). | Data fetching logic beyond `lib/education/client-api.ts`. |
| `hooks/`, `styles/` | React hooks, global styles. | |
| `worker/`, `vite.config.ts`, `next.config.ts` | Cloudflare Worker entry and framework configuration. | |
| `tests/` | `unit/`, `integration/`, `smoke/`, `support/` (shared harness), `fixtures/`, `reports/` (generated, ignored), `regression-baseline.json`, plus `worker-*-check.mjs` Worker checks. | Evidence output committed by hand. |
| `scripts/` | `test.mjs` (the runner), `test-catalogue.mjs`, `test-guard.mjs`, `lint-baseline.mjs`, `doc-index.mjs`, `demo.mjs`, install and runtime helpers. | Product code. |
| `deploy/` | Droplet kit: `provision.sh`, `update.sh`, systemd units, `Caddyfile`, `add-user.sh`, `README.md`. | Secrets. |
| `docs/` | `ARCHITECTURE.md`, `DATA-MODEL.md`, `DEMO.md`, `TESTING.md`, `DEPLOY-CLOUDFLARE.md`, `RELEASE-CHECKLIST.md`; `current/` (live records and this guide), `governance/` (policy bundle), `specification/` (designed requirements and cases), `design/`, `education/`, `history/` (superseded, read-only), `DOCUMENTATION-INDEX.md` (generated). | New root-level documents. |
| `vendor/`, `build/` | `vendor/` holds the vendored shadcn Tailwind CSS (with its licence); `build/` holds the Sites Vite plugin used by the framework build. | Edits. |
| Root files | `README.md AGENTS.md CLAUDE.md HANDOVER.md CONTRIBUTING.md SECURITY.md CHANGELOG.md LICENSE VALIDATION.md` and config (`package.json`, `tsconfig.json`, `eslint.config.mjs`, `.prettierrc.json`, `.lint-baseline.json`). | Any other markdown. |

Layer rule: `app/` imports `lib/` and `components/`; `components/` imports `lib/education/client-api.ts` and types; `lib/` never imports `app/` or `components/`. Server-only code (database, secrets) never reaches a client component.

## 4. Nomenclature for this repository

| Thing | Standard here | Real examples |
|---|---|---|
| Logic modules | `lib/education/<feature>.ts`, singular or plural noun of the feature; client-side wrappers `<feature>-client.ts` | `attendance.ts`, `attendance-client.ts`, `reading-review.ts` |
| Schema files | `db/<feature>-schema.ts` | `notices-schema.ts`, `profile-links-schema.ts` |
| API routes | `app/api/<plural-resource>/route.ts`, nested `[id]/route.ts` | `app/api/classes/route.ts` |
| Pages | `app/<feature>/page.tsx` | `app/attendance/page.tsx` |
| Test suites | `tests/<layer>/<topic>-contract.mjs` (integration, unit) or `<topic>-smoke.mjs` | `auth-contract.mjs`, `security-hardening-contract.mjs` |
| Worker checks | `tests/worker-<topic>-check.mjs` or `-ui-check.mjs` | `worker-attendance-check.mjs` |
| Errors | `AccessError` (status-bearing) and `AuthError` from `access.ts` / `auth.ts` | |
| Env variables | `SAHA_` prefix | `SAHA_DEMO_ENABLED`, `SAHA_DEMO_INSTALLATION_ID`, `SAHA_OIDC_*` |
| Branches | `<type>/<topic>-<date>` | `docs/engineering-guide-2026-10-09` |

Older slice records in `docs/current/` use upper-case names with `DEMO-` and `-EXECUTION.json` suffixes; they are history. New documents use the standard in section 0.3.

## 5. How to write code here

### 5.1 An API route (thin)

```ts
// app/api/classes/route.ts (abridged)
import { authenticated, body, query } from '@/lib/education/http';
import { listClasses, createClass } from '@/lib/education/classes';
import { classSchema } from '@/lib/education/validation';
import { assertAdmin } from '@/lib/education/access';

export async function POST(request: Request) {
  return authenticated(request, true, async (principal) => {
    assertAdmin(principal);
    return Response.json(await createClass(principal, await body(request, classSchema)), { status: 201 });
  });
}
```

`authenticated(request, mutation, action)` resolves the principal, enforces same origin on writes, sets `Cache-Control: no-store`, and maps errors to a fixed set of status codes and messages. Do not hand-roll a 401 redirect or a JSON responder; use `http.ts` on the server and `client-api.ts` on the client.

### 5.2 A logic module

A `lib/education` module takes a `Principal` first, scopes every query to that principal's school with the helpers in `access.ts` (`classScope`, `studentScope`, `livePrincipalScope`), and re-checks references inside the mutation itself, because an earlier lookup does not keep a transferred course or revoked teacher valid. Owner or admin authority never overrides student scope.

### 5.3 Database access

Use Drizzle through `getDb()`. Idempotent writes compare a stored request hash and treat a unique-constraint failure as a replay, using `uniqueFailure` from `lib/education/db-errors.ts` (do not define another). Conflicts surface as a stable lifecycle code, never record contents.

### 5.4 Client code

Fetch through `client-api.ts` (`requestJson` handles the 401 redirect and `no-store`). Components display what the server returns; hiding a button is never an access control.

### 5.5 Rules that bite

- **Server authority.** Identity comes only from the trusted provider path in `lib/education/identity.ts`. Never trust a public identity header.
- **Same-origin writes.** `requireSameOrigin` accepts a write only when `Origin` matches the configured public origin. A wrong public origin makes every browser write return 403 (this happened on the droplet on 8 October 2026; see `deploy/README.md`).
- **Append, never rewrite.** Confirmed records, revisions, audit entries, receipts and applied migrations are append-only. A correction adds evidence.
- **Uncertain mutations.** Never retry blindly; read the current state first.
- **Synthetic data only.** Real providers, paid AI and real recipients stay off. The demo sign-in is enabled only by `SAHA_DEMO_ENABLED` plus `SAHA_DEMO_INSTALLATION_ID` and is switched off when any `SAHA_OIDC_*` setting is present.
- **Test-loader quirk.** The test loader (`tests/support/security-db.mjs`) parses every `.ts` file as TSX, so write generics as `function f<T>(x: T)`, never `const f = <T>(x: T) =>`. Prettier turns `<T,>` into `<T>`, which then breaks the loader.

## 6. How to find things

| I need to... | Look in / run |
|---|---|
| find the route for a URL | `app/api/<resource>/route.ts`; list all: `ls app/api` |
| find the logic behind a route | the `lib/education/*` import at the top of the route |
| see who may do what | `lib/education/access.ts`, `roles.ts`, `principal-authority.ts` |
| find a table's definition | `rg "pgTable|sqliteTable.*'<table>'" db` or `rg -l "<table>" db` |
| find a migration | `ls drizzle`; latest is the highest number |
| see how sign-in works | `lib/education/auth.ts`, `identity.ts`, `oidc.ts`, `session.ts`, `demo-policy.ts` |
| find the validation schema | `lib/education/validation.ts` and feature-specific `*-schema` files |
| find an existing helper before writing one | `rg "export (async )?function <name>" lib` |
| find tests for a feature | `rg -l "<feature>" tests` |
| find which layer a suite belongs to | `node scripts/test.mjs --list` |
| find where an error message comes from | `rg "<message text>" lib app components` |
| find a document | `docs/DOCUMENTATION-INDEX.md` (generated list of every document) |
| see designed test cases | `docs/specification/TEST-CASES.csv` |
| see what is deployed and how | `deploy/README.md` and the status block of `HANDOVER.md` |
| find lint debt in a file | `pnpm run lint -- <file>` |

## 7. Commands and gates

| Command | What it proves | What it does not prove |
|---|---|---|
| `pnpm run typecheck` | Types compile under `strict`. | Behaviour. |
| `pnpm run lint:baseline` | Lint errors did not exceed the committed baseline (0 errors, 11 warnings). | That warnings are fine. |
| `pnpm run format:check` | Prettier style everywhere not ignored. | |
| `pnpm run docs:index:check` | The documentation index lists every document. | That documents are correct. |
| `pnpm test` (`node scripts/test.mjs pr`) | Static, unit, integration, resilience and smoke suites pass. | UI, non-functional and acceptance layers. |
| `node scripts/test.mjs <layer>` | One layer: `static unit integration resilience smoke ui nfr uat`; aliases `pr`, `full`, `regression`. | |
| `... --guard` | The regression guard: no baselined suite lost assertions (`tests/regression-baseline.json`). | |
| `node scripts/test.mjs --check-catalogue` | Every test file is classified. | |
| `python3 scripts/check-documentation.py` | Documentation consistency checks. | Product behaviour. |
| `pnpm run build` | The Worker bundle builds. | Runtime behaviour. |

Sequence before a pull request: `typecheck`, `lint:baseline`, `format:check`, `docs:index:check`, then `pnpm test` (add `--guard` for the guarded run CI uses) and, when documents changed, `python3 scripts/check-documentation.py`.

Known caveats:
- **CI uses Node 24.** On Node 22.22, `node:sqlite` truncates a bound string at the first NUL, so `security-hardening-contract` fails locally on Node 22. This is environmental, not a regression.
- **`integration/demo-login-ui-contract` is intermittently flaky** (it failed 2 of 3 local runs on `main`). Rerun before treating it as a regression.
- Tests write `tests/*-result.json`; `scripts/test.mjs` restores them. Use `node scripts/test.mjs --clean` if stray result files remain, because they break the documentation check.

## 8. Common tasks, step by step

**Add an API route.** Create `app/api/<resource>/route.ts` using `authenticated`; add the logic to `lib/education/<feature>.ts`; add the zod schema to `validation.ts`; add a client wrapper to `client-api.ts` if a page needs it; add an integration suite in `tests/integration/<feature>-contract.mjs` covering unauthenticated, wrong role, wrong school, wrong origin and the happy path.

**Add a table or column.** Edit the right `db/*-schema.ts`; run `pnpm db:generate`; commit the new `drizzle/NNNN_*.sql` and `meta/` changes untouched afterwards; update `docs/DATA-MODEL.md`; add a test. Never edit an applied migration.

**Add a page.** `app/<feature>/page.tsx`, use `components/app-shell.tsx`, fetch through `client-api.ts`; add the navigation entry in `lib/education/navigation.ts`.

**Add a test suite.** Put it in `tests/<layer>/`; run `node scripts/test.mjs --check-catalogue`; after a deliberate change run the guarded run and, only with a reason, `--update-baseline`.

**Change a document.** Edit it, run `pnpm run docs:index` if you added or moved one, then `pnpm run docs:index:check`, `pnpm run format:check` and `python3 scripts/check-documentation.py`. Superseded documents move to `docs/history/`.

**Update the status block.** Edit only the table at the top of `HANDOVER.md`.

**Add a dependency.** State the reason in the pull request, pin the exact version, run `pnpm install`, commit `pnpm-lock.yaml`.

## 9. Do and don't for this repository

Do:
- Check access on the server in `lib/education`, scoped to the principal's school.
- Write the failing test first for a bug fix.
- Record real results with dates and limits in `VALIDATION.md` when code changes.
- Use `uniqueFailure`, `authenticated`, `body`, `query`, `requestJson` instead of new copies.
- Keep demo behaviour behind the demo switches.

Don't:
- Don't edit applied `drizzle/` migrations, `docs/history/`, reference sources or retained records.
- Don't turn on providers, paid AI or messages to real recipients.
- Don't trust identity headers, cookies or client-supplied ids for authority.
- Don't promote an acceptance case to passed because a related unit check passes; the v2.12 designs hold unrun cases and executable checks do not imply business acceptance.
- Don't run local synthetic fixtures against the hosted URL.
- Don't commit `tests/reports/`, result JSON, screenshots or logs.
- Don't merge without a green `verify`; merging `main` deploys to the droplet within about three minutes.
- Don't write `const f = <T>(x: T) =>` in `.ts` files (see 5.5).

## 10. Keeping it clean

| Rule | Enforced by |
|---|---|
| Lint ratchet | `pnpm run lint:baseline` in `verify` |
| Formatting | `pnpm run format:check` in `verify` |
| Types | `pnpm run typecheck` in `verify` |
| Every document in the index | `pnpm run docs:index:check` in `verify` |
| No test loses assertions | `--guard` |
| Root markdown set | review (no automatic check): do not add root documents |
| One status statement | review: never restate counts or dates outside the status block |

Monthly 10-minute checklist: (1) `pnpm run lint:baseline` and try to fix 10 warnings; (2) `rg -n "TODO|FIXME" app lib` and resolve or delete; (3) `git ls-files | rg "\.(log|png|zip|tap)$"` should be empty outside fixtures; (4) `ls` the root, only the standard files; (5) read the status block and correct anything stale; (6) check open pull requests older than 14 days.

## 11. Glossary

| Term | Meaning |
|---|---|
| Principal | The authenticated person making a request: id, role, school. |
| Scope | The set of records a principal may see; built by `classScope`, `studentScope`, `livePrincipalScope`. |
| Demo sign-in | Synthetic role picker, enabled by `SAHA_DEMO_ENABLED`; off when real OIDC is configured. |
| Droplet | The shared DigitalOcean server (`saha-apps`) that runs this app behind Caddy. |
| Caddy password wall | The basic-auth gate in front of the demo; separate from application sign-in. |
| Slice | A bounded delivery with its own record in `docs/current/`. |
| Guard | The regression check that no baselined suite loses assertions. |
| Baseline | A committed ceiling (lint errors, test assertions) that may only improve. |
| Status block | The table at the top of `HANDOVER.md`. |
| Reviewed record | A change that needs a second person's decision and is stored as evidence. |

## 12. Where things stand and what is next

Read the status block at the top of [HANDOVER.md](../../HANDOVER.md). It is the single statement of version, hosting, CI and open items. Do not duplicate it here.
