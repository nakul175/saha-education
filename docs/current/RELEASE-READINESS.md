# Eight-hour release readiness

Read-only audit, 5 October 2026, 19:33 UTC. This records observed source and release boundaries; it does not certify a deployment, school acceptance or CI success. The coordinator maintains later execution, publication and release outcomes in [the eight-hour record](EIGHT-HOUR-DEVELOPMENT.md).

## Release authority and source consolidation

The sponsor authorized continued development from 19:18 UTC on 5 October to 03:18 UTC on 6 October, followed by merging the validated combined candidate to `main` during the eighth hour, 02:18–03:18 UTC. Private synthetic deployment preparation may proceed earlier. The coordinator owns source publication, deployment and the final merge. Unvalidated work must not become release evidence because the deadline is approaching.

The published starting candidate is `053ab13af9dcd6fbb81e436769aefa6e29f00a20`; `main` is `856f0927af711a7963ae96208ac40378fe3c0474`. GitHub metadata and local commit ancestry were checked against these exact revisions.

| Pull request | Queried head | Preservation in the published candidate |
|---|---|---|
| [PR 1](https://github.com/nakul175/saha-education/pull/1), original documentation | `8baba5d543482e309c460e3058b88bc9cb44abb4` | This commit is not an ancestor. Its documentation and validator additions are included by `0c4b492`; range comparison differs only in the README introduction adapted to the rebuild. Later historical requirement/index/validator updates are visible and retained. |
| [PR 2](https://github.com/nakul175/saha-education/pull/2), authentication/access | `48d40fd358e7e4e665be65826915dd62fe051086` | Head is an ancestor; no unique later commit on this head. |
| [PR 3](https://github.com/nakul175/saha-education/pull/3), literacy | `0aba24bb2893a6badf009a5bb0b17ede9b578a1d` | Head is an ancestor; no unique later commit on this head. |
| [PR 4](https://github.com/nakul175/saha-education/pull/4), teacher workspace | `5488bc0d20412a3d4be0c031c99c259c56834d5e` | Head is an ancestor; no unique later commit on this head. |
| [PR 5](https://github.com/nakul175/saha-education/pull/5), specification | `d53adcf684a818b9236de91fa64221c7041fa335` | Head is an ancestor; no unique later commit on this head. |
| [PR 6](https://github.com/nakul175/saha-education/pull/6), combined implementation | `053ab13af9dcd6fbb81e436769aefa6e29f00a20` | Current published candidate; new eight-hour changes are not yet represented by this head. |

All six were open, draft and unmerged at this audit. `main` is also an ancestor of the candidate. The combined release can preserve preceding application changes through PR 6 without sequentially merging superseded application branches. Recheck actual remote heads before the final merge; this audit does not cover subsequent branch changes. Preserve the original commits and documentation history.

The repository's queried default branch is `rebuild/nextjs`. Merging into the explicitly requested `main` does not change the default branch or publish a Sites version. A default-branch change is a separate repository decision.

## Deployment and CI findings

Neither the queried `main` tree nor the published candidate contains `.github` workflow files. GitHub's queried PR-triggered workflow-run and combined-status endpoints returned empty arrays for both revisions. The workflow query covers PR-triggered runs on its first page; empty results are not a passing CI report or proof that all external deployment systems are absent. Repository variables, webhook configuration and a working `SAHA_DEPLOY_FREEZE` control have not been verified.

The existing [Cloudflare staging helper](../../scripts/cloudflare-staging.mjs) is a legacy source artifact. It references an absent `deploy/cloudflare-staging.json`, health-specific bindings/routes and a scheduled job absent from this Education tree. [The current Worker entry](../../worker/index.ts) exports only `fetch`; its historical scheduled-handler comment does not establish a scheduled job. Do not use that helper or its sign-in checks as the current Education deployment procedure.

The coordinator registered private Site `appgprj_6ac3f931d31881918ffa33404d3b43a6` and retained it in [the hosting manifest](../../.openai/hosting.json). The planned origin is `https://saha-education-demo.nakul1729233.chatgpt.site`. Registration does not establish a live version or successful deployment. Follow the Sites workflow and retain its exact source commit, archive, version, deployment identifier and final status. [Hosted staging](HOSTED-STAGING.md) describes the evidence still required.

## Migration inventory and compatibility

The working candidate at this audit contains 17 SQL files, `0000`–`0016`, and 17 journal entries in exact filename order. A disposable in-memory SQLite run with foreign keys enabled applied every file, yielding 41 application tables and 338 columns, zero foreign-key violations and `integrity_check=ok`. This is a local packaging diagnostic, excluded from acceptance and guarded assertion counts. Additive `0015` and `0016` remain pending combined build, browser verification and source publication at this point.

The installed Drizzle reader can load all 17 journal entries. At the 19:33 audit, metadata snapshots existed only for `0000`–`0003`; that latest snapshot represented 20 tables and omitted 21 current tables. Automatic `db:generate` uses the latest available snapshot as its comparison baseline, so blind generation from that legacy baseline can propose existing additions again. The coordinator subsequently appended `0016_snapshot.json` as a reconstructed current generation baseline, preserving earlier SQL, journal entries and snapshots. Coordinator verification confirmed41 tables/338 fields and semantic agreement between the generated full schema and fresh migrated SQLite for columns, types, nullability, defaults, composite primary keys, foreign keys and named declared indexes; column order differences from ALTER were excluded. A disposable cloned-history generation returned no schema changes and produced no migration. Retain that verification in the coordinator's dated evidence. SQL-only triggers/guards require their independent checks; new metadata is not historical deployment evidence and does not fix the timestamp issue below.

There is also a separate timestamp issue: journal timestamps for `0002` and `0003` are below `0001`. The installed standard D1 migrator selects pending migrations using the last recorded `created_at` timestamp. A target recorded through `0001` can therefore skip those two lower-timestamp entries. Do not assume that migrator is a safe resume mechanism, and do not rewrite previously applied history to conceal the mismatch. Inspect the actual target's applied state and use a verified migration plan.

The bundled Sites packager copies the complete source `drizzle/` tree into `dist/.openai/drizzle/` in the deployment archive. The inspected local packaging helper does not validate a timestamp-based resume or establish the platform's applied migration history. Sites documentation describes individual migration application before Worker upload. Verify actual deployment results and target schema separately; a successful fresh local run and complete archive cannot prove a partially migrated remote target is complete.

## Gates for the coordinated release

| Gate | Required evidence | Audit status |
|---|---|---|
| Frozen source | Published remote revision, matching clean candidate, earlier PR preservation and final remote-head recheck | Starting candidate verified; new batch pending |
| Combined verification | Fresh build, affected checks, retained regression thresholds, actual role/browser/privacy journeys and dated failure records | New candidate pending; earlier local evidence is historical |
| Migration packaging | Matching archive SQL/journal inventory, explicit metadata treatment, target applied state, schema/constraints and safe retry boundary | Fresh local diagnostic passed; target state pending |
| Synthetic isolation | Separate demonstration data, explicit runtime enablement, actual server sessions/current authority and disabled real-provider paths | New implementation pending combined verification |
| Hosted version | Exact Site/version/deployment/source identity and final successful deployment status | Registration only |
| Hosted safety | Approved synthetic smoke, session/current-scope negatives, matching origin and provider/ORF/recipient disabled state | Not yet executed |
| Recovery | Preserved immutable evidence/applied schema, actual environment restore/rollback method and clear failure handling | Local recovery evidence exists; hosted method pending |
| Final merge and demo | Authorized eighth-hour merge, confirmed main revision, matching final hosted version and usable returned URL | Pending final hour |

Keep real records, recipients, live identity activation and paid AI outside this synthetic release without their required settings and authorization. The provider/tenant and oral-reading destination remain pending. Designed specification procedures remain unrun and requirements remain unapproved; none of the audit or deployment gates changes their status. See [release operations](../specification/RELEASE-OPERATIONS.md) for support and rollback boundaries.
