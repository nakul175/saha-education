# Hosted deployment: local migration-splitting diagnostic (6 October 2026)

This is a read-only follow-up to [the hosted failure record](HOSTED-DEPLOYMENT-FAILURE.md). It does **not** repair anything, does not identify the hosted runner's failed file, and does not claim a deployment. No migration, snapshot or journal file was changed; `drizzle/` is untouched.

## Method

`node scripts/diagnose-migration-splitting.mjs` replays the 17 committed `drizzle/*.sql` files into a throwaway in-memory SQLite database under four plausible statement-splitting strategies and reports where each first meets SQLite's `incomplete input`, the error class the hosted deployment returned. Actual output is stored in [HOSTED-DEPLOYMENT-DIAGNOSTIC.json](HOSTED-DEPLOYMENT-DIAGNOSTIC.json), produced on Node 24.19.0.

## Results

| Strategy | Statements applied | Failures | First `incomplete input` |
| --- | --- | --- | --- |
| Drizzle breakpoint pieces, whole piece executed | 81 | 0 | none |
| One physical line per statement | 97 | 816 | `0000_youthful_jamie_braddock.sql`, piece 0 |
| Split at every semicolon | 90 | 114 | `0007_reading_corrections.sql`, piece 3 (first trigger) |
| Split at semicolon followed by newline | 128 | 47 | `0010_reading_imports.sql`, piece 9 (first trigger with `END;`) |

Other facts from the same run: 81 non-empty breakpoint pieces, 17 containing triggers; one comment-only piece (`0001_trusted_identity.sql#11`, a trailing newline after the last breakpoint); six pieces that hold several statements because those files were written without breakpoints (`0005`, `0010`, `0012`, `0013`, `0014`, `0015`; 7, 18, 9, 19, 21 and 14 statements).

## What this does and does not show

- [Certain] Executing each breakpoint piece whole applies all committed SQL cleanly, so the SQL is syntactically complete as a drizzle-style migration. The earlier local `wrangler d1 execute --file` load of the same fixture also succeeded.
- [Certain] Line-based and semicolon-based splitting truncate multi-line `CREATE TABLE` and trigger bodies and produce exactly the hosted error text. Which file fails first depends on the splitter: 0000, 0007 or 0010 here.
- [Likely] The hosted runner splits statements differently from drizzle. This fits the symptom (truncated input) and the empty database overview, but the empty overview is also what any early failure would show.
- [Guessing] Which strategy the runner uses, and therefore the failed file. A strict single-statement runner is a further candidate, which would reject the six multi-statement pieces and possibly the comment-only piece instead of reporting `incomplete input`.
- The first applied/unapplied boundary cannot be derived from this repository. The previously requested input is still needed: the failed migration filename and last applied migration from the hosting settings or support. Until then, do not rewrite any migration and do not retry the identical archive.

## Safe next steps once the boundary is known

1. If the runner is line- or semicolon-based, ask the provider for a runner that sends complete statements (with all 40 triggers and no unconsumed tail). That preserves every original file.
2. If a repository change is unavoidable, add a **new** migration or a deployment-specific packaging step that leaves the original and already-applied files byte-identical; never edit an applied file. Decide this only with the actual failed filename and applied list.
3. Deploy the exact verified source as an isolated private synthetic demo and verify the returned URL before any pass is recorded.
