# Documentation validation

> Documentation version 1.0 · 5 October 2026 · Draft for sponsor review.
> Describes the Next.js rebuild at `b4cbfc5f6855479ed523b5bf4c0aed0d2b6f6e3d`, not the legacy application on `main`.
> Requirements are proposed targets; code presence does not establish acceptance or production readiness.

## Change scope

Documentation and offline documentation validators only. The legacy application source and hosted configuration are unchanged. The rebuild source was inspected at the immutable commit stated above.

## Evidence

Checks run on 5 October 2026:

| Check | Result | Limit |
|---|---|---|
| `python3 scripts/check-documentation.py` | Passed: 17 Markdown files | Local links, titles, baseline references and code fences only |
| `node scripts/audit-requirements.mjs --check` | Passed: 20 requirements | SRS/register consistency and acceptance-case references; no acceptance inferred |
| Source-reference inspection | Passed: 20 requirement source paths | Files exist in the immutable reviewed Git tree; not runtime behavior |
| `git diff --check` | Passed | Whitespace only |

The shell did not provide Node on PATH; the audit ran with the desktop bundled Node executable. No dependencies were installed. No application build, application test suite, live HTTP checks or deployment is claimed.

## Review focus

Confirm proposed business scope and permission policies; review branch separation; validate the implementation gap findings before scheduling fixes. Every UAT case remains pending, every requirement remains unapproved, and no release readiness is asserted.

## Maintaining the check tools

The rebuild instructions refer to absent documentation validators. This change adds small education-specific validators at the requested paths on the documentation branch. They check this set only and do not recreate inherited health checks, install tooling or validate the application. Both use standard runtime libraries and run offline.
