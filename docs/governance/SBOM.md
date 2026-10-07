# Third-party inventory and SBOM

Owner: Nakul Jain · Last reviewed: 2026-10-08 · Update trigger: any change to `package.json` or `pnpm-lock.yaml`; regenerate the CSV at the same time.
Generated 2026-10-08 from `pnpm-lock.yaml` (lockfile version 9.0) at the head of `origin/main` (`81b1cf0`).

## Files

- [sbom-2026-10-08.csv](sbom-2026-10-08.csv): one row per unique name@version reachable from the root package, with scope, whether the lockfile records an integrity hash, and the licence read from the locally installed package ("not installed locally" where the package was not unpacked on the machine that generated it).
- Counts: 837 unique package versions; 245 reachable from runtime dependencies, the rest from dev/build dependencies only. 204 rows show "not installed locally" (mostly optional platform binaries and packages not unpacked on this machine), so **their licences are unknown** (TBD).

## Method and limits

1. First attempt: `npx @cyclonedx/cyclonedx-npm --omit dev`. It ran against `node_modules` with npm (not the pnpm lockfile), reported missing optional packages, wrote a 1,788-component JSON file and then crashed with a segmentation fault. Because that output is npm-derived, ignores the lockfile and came from a crashing tool, it was **not committed**.
2. Fallback used: a one-off script that parsed `pnpm-lock.yaml` (importers, snapshots, packages) and walked the dependency graph. It is not a CycloneDX or SPDX document and has no purl, hashes, or vendor information. The script is not committed.
3. The repository also has `scripts/security-gate.mjs`, which is written to emit a CycloneDX 1.5 SBOM and run `pnpm audit`. It needs registry access and was **not run** for this document; CI does not run it. Running it is the better route to a standards-format SBOM and a vulnerability result: no vulnerability scan has been recorded here.

## Direct dependencies (from `package.json`)

Runtime: next 16.3.6, react and react-dom 19.2.6, drizzle-orm 0.45.2, jose 6.2.12 (token verification), zod ^3.25.76, react-hook-form, radix-ui, @base-ui/react, @shadcn/react, cmdk, date-fns, lucide-react, recharts, sonner, vaul, embla-carousel-react, input-otp, react-day-picker, react-resizable-panels, next-themes, class-variance-authority, clsx, tailwind-merge, @hookform/resolvers.

Dev/build: vinext 1.0.0-beta.5, vite 8.0.13, wrangler 4.92.0, @cloudflare/vite-plugin, @cloudflare/workers-types, typescript 5.9.3, eslint 9.39.4 and eslint-config-next, tailwindcss 4.2.1, drizzle-kit 0.31.10, @playwright/test and playwright-core 1.56.1, @axe-core/playwright 4.13.0, @vitejs/plugin-react and plugin-rsc, react-server-dom-webpack, type packages.

## Licences worth a person's review

From the CSV: `@img/sharp-libvips-linux-x64` (LGPL-3.0-or-later, reached through the sharp image library), `caniuse-lite` (CC-BY-4.0), `argparse` (Python-2.0), `@axe-core/playwright` (MPL-2.0, test-only). No legal review has been done. The copied shadcn Tailwind stylesheet keeps its licence in `vendor/shadcn-tailwind-4.13.0.LICENSE.md` and is untouched.

## Non-npm components

Caddy (apt repository, version not pinned), Node.js 22 from NodeSource, pnpm 11.25.0, Ubuntu 24.04, systemd, cloud hosting: Cloudflare (not in use) and DigitalOcean (kit only). Versions and licences: TBD.

## Supply-chain controls in the repo

`pnpm-workspace.yaml` sets `minimumReleaseAge: 10080` (a package version must be 7 days old), `strictDepBuilds: true` with an allow-list of build scripts (esbuild, fsevents, sharp, unrs-resolver, workerd), and CI installs with `--frozen-lockfile`. See [SECURE-DEV-EVIDENCE.md](SECURE-DEV-EVIDENCE.md).
