#!/usr/bin/env node
// Offline consistency check, not acceptance or source/runtime verification.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
if (process.argv.slice(2).some((arg) => arg !== '--check'))
  throw new Error('Usage: node scripts/audit-requirements.mjs --check');
const read = (name) => readFileSync(resolve(root, 'docs/education', name), 'utf8');
const register = JSON.parse(read('requirements.json'));
const srs = read('SRS.md');
const uat = read('TESTING-UAT.md');
const errors = [];
const seen = new Set();
const statuses = new Set(['Demo only', 'Gap', 'Partial', 'Unverified']);
for (const req of register.requirements) {
  if (!/^EDU-[FN]\d{2}$/.test(req.id) || seen.has(req.id)) errors.push(`Invalid or duplicate ID: ${req.id}`);
  seen.add(req.id);
  if (!statuses.has(req.status)) errors.push(`Unsupported assessment: ${req.id}`);
  if (!['P0', 'P1', 'P2'].includes(req.priority)) errors.push(`Unsupported priority: ${req.id}`);
  if (!req.source || !req.acceptance) errors.push(`Missing evidence/criterion: ${req.id}`);
  const expected =
    '| ' + [req.id, req.priority, req.title, req.acceptance, req.status, req.case].join(' | ') + ' |';
  if (!srs.includes(expected)) errors.push(`SRS row differs from register: ${req.id}`);
  if (!uat.includes(`| ${req.case} |`)) errors.push(`Missing acceptance case: ${req.id}`);
}
const srsIds = [...srs.matchAll(/^\| (EDU-[FN]\d{2}) \|/gm)].map((m) => m[1]);
if (srsIds.length !== seen.size || srsIds.some((id) => !seen.has(id)))
  errors.push('SRS/register ID sets differ');
if (register.approved !== false)
  errors.push('Draft baseline must remain unapproved until sponsor acceptance');
if (!/^[0-9a-f]{40}$/.test(register.baseline)) errors.push('Baseline must be an immutable commit');
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `Requirements audit passed: ${seen.size} draft requirements mapped to SRS rows and acceptance cases. No acceptance inferred.`,
  );
