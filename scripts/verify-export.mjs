#!/usr/bin/env node
// Slice 6m: offline check of a Saha organisation export (saha-organisation-export-v1).
// Usage: node scripts/verify-export.mjs <export.tar | extracted directory>
// Needs only Node. Checks the manifest and SHA256SUMS, every file's size and SHA-256, row counts,
// relationships between tables, media content against its recorded SHA-256, FHIR documents, and
// recomputes the audit chain (and the genesis seal over earlier events when they are all present).
// Prints a JSON report; exits 0 when every check passes and 1 otherwise.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const sha = b => createHash('sha256').update(b).digest('hex');
const CHAIN = 'saha-audit-chain-v1', ZERO = '0'.repeat(64), PRIOR_PAGE = 500;

export function readTar(buf) {
  const files = new Map();
  for (let at = 0; at + 512 <= buf.length;) {
    const h = buf.subarray(at, at + 512);
    if (h.every(b => b === 0)) break;
    const str = (o, n) => { const s = h.subarray(o, o + n); const z = s.indexOf(0); return Buffer.from(z < 0 ? s : s.subarray(0, z)).toString('utf8'); };
    const stored = parseInt(str(148, 8).trim(), 8); const copy = Buffer.from(h); copy.fill(0x20, 148, 156);
    if (copy.reduce((n, b) => n + b, 0) !== stored) throw new Error(`Tar header checksum mismatch at byte ${at}.`);
    const prefix = str(345, 155), name = (prefix ? prefix + '/' : '') + str(0, 100), size = parseInt(str(124, 12).trim() || '0', 8), type = str(156, 1) || '0';
    at += 512;
    if (type === '0') files.set(name, Buffer.from(buf.subarray(at, at + size)));
    at += Math.ceil(size / 512) * 512;
  }
  return files;
}
function readDir(dir) {
  const files = new Map();
  const walk = d => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else files.set(relative(dir, p).split('\\').join('/'), readFileSync(p)); } };
  walk(dir); return files;
}
const lines = b => b.toString('utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const content = e => sha(JSON.stringify([e.org_id, e.id, e.person_id ?? null, e.actor_id, e.actor_name, e.role, e.action, e.subject, e.detail, e.at]));

export function verifyFiles(files) {
  const report = { format: null, exportId: null, ok: true, checks: [], failures: [] };
  const pass = (name, detail) => report.checks.push({ name, ok: true, ...(detail !== undefined ? { detail } : {}) });
  const bad = (name, detail) => { report.ok = false; report.checks.push({ name, ok: false, detail }); report.failures.push(`${name}: ${detail}`); };
  const m = files.get('manifest.json');
  if (!m) { bad('manifest', 'manifest.json is missing.'); return report; }
  let manifest; try { manifest = JSON.parse(m.toString('utf8')); } catch { bad('manifest', 'manifest.json is not JSON.'); return report; }
  report.format = manifest.format; report.exportId = manifest.exportId;
  if (manifest.format !== 'saha-organisation-export-v1') bad('format', `Unknown format ${manifest.format}.`); else pass('format', manifest.format);
  // SHA256SUMS covers every other file.
  const sums = files.get('SHA256SUMS');
  if (!sums) bad('sha256sums', 'SHA256SUMS is missing.');
  else {
    const listed = sums.toString('utf8').split('\n').filter(Boolean).map(l => { const [h, ...p] = l.split('  '); return [p.join('  '), h]; });
    const wrong = listed.filter(([p, h]) => !files.has(p) || sha(files.get(p)) !== h).map(([p]) => p);
    const unlisted = [...files.keys()].filter(p => p !== 'SHA256SUMS' && !listed.some(([q]) => q === p));
    if (wrong.length || unlisted.length) bad('sha256sums', `Mismatched: ${wrong.join(', ') || 'none'}; not listed: ${unlisted.join(', ') || 'none'}.`); else pass('sha256sums', `${listed.length} files`);
  }
  // Manifest entries: size, checksum, and row counts for JSONL files.
  const described = new Map((manifest.files ?? []).map(f => [f.path, f]));
  let fileProblems = [];
  for (const f of manifest.files ?? []) {
    const b = files.get(f.path);
    if (!b) { fileProblems.push(`${f.path} missing`); continue; }
    if (b.length !== f.bytes) fileProblems.push(`${f.path} has ${b.length} bytes, manifest says ${f.bytes}`);
    if (sha(b) !== f.sha256) fileProblems.push(`${f.path} SHA-256 differs`);
    if (f.rows !== undefined) { try { const n = lines(b).length; if (n !== f.rows) fileProblems.push(`${f.path} has ${n} rows, manifest says ${f.rows}`); } catch { fileProblems.push(`${f.path} has a line that is not JSON`); } }
  }
  const extra = [...files.keys()].filter(p => !['manifest.json', 'SHA256SUMS', 'README.txt'].includes(p) && !described.has(p));
  if (extra.length) fileProblems.push(`not in manifest: ${extra.join(', ')}`);
  if (fileProblems.length) bad('manifest-files', fileProblems.slice(0, 20).join('; ')); else pass('manifest-files', `${described.size} files match size, SHA-256 and row count`);
  // Slice 6p: withheldEntries counts patient-linked entries left out of organisation documents (absent in earlier archives).
  const totals = (manifest.files ?? []).filter(f => f.table).reduce((t, f) => ({ rows: t.rows + f.rows, withheld: t.withheld + (f.withheld ?? 0), withheldEntries: t.withheldEntries + (f.withheldEntries ?? 0) }), { rows: 0, withheld: 0, withheldEntries: 0 });
  const complete = totals.withheld === 0 && totals.withheldEntries === 0;
  if (totals.rows !== manifest.totals?.rows || totals.withheld !== manifest.totals?.withheld || totals.withheldEntries !== (manifest.totals?.withheldEntries ?? 0) || described.size !== manifest.totals?.files || (manifest.scope?.complete !== undefined && manifest.scope.complete !== complete)) bad('totals', `Manifest totals do not add up (${JSON.stringify(totals)} vs ${JSON.stringify(manifest.totals)}).`); else pass('totals', totals);
  if (report.failures.some(f => f.startsWith('manifest-files'))) return report;

  const t = name => files.has(`tables/${name}.jsonl`) ? lines(files.get(`tables/${name}.jsonl`)) : [];
  const orgId = manifest.organisation?.id;
  // Every row belongs to the exported organisation.
  const foreign = (manifest.files ?? []).filter(f => f.table && !['accounts', 'organisations'].includes(f.table)).flatMap(f => t(f.table).filter(r => r.org_id !== orgId).map(() => f.table));
  if (foreign.length || t('organisations').some(o => o.id !== orgId)) bad('organisation', `Rows from another organisation in ${[...new Set(foreign)].join(', ')}.`); else pass('organisation', orgId);
  // Relationships: each reference resolves inside the export (withheld audit rows carry no reference).
  const ids = (name, key = 'id') => new Set(t(name).map(r => r[key]));
  const patients = ids('patients'), visits = ids('visits'), teams = ids('teams'), accounts = ids('accounts', 'user_id');
  const rel = [
    ['visits', 'person_id', patients], ['submissions', 'person_id', patients], ['submissions', 'visit_id', visits], ['referrals', 'person_id', patients],
    ['record_revisions', 'person_id', patients], ['media', 'person_id', patients], ['media', 'visit_id', visits], ['plans', 'visit_id', visits], ['ai_results', 'visit_id', visits],
    ['rights_requests', 'person_id', patients], ['patients', 'team_id', teams], ['team_members', 'team_id', teams], ['team_members', 'user_id', accounts],
    ['memberships', 'user_id', accounts], ['households', 'team_id', teams], ['caseload_transfers', 'team_id', teams],
    ['identity_cases', 'survivor_id', patients], ['identity_cases', 'duplicate_id', patients],
  ];
  const dangling = [];
  let references = 0;
  for (const [name, col, target] of rel) for (const r of t(name)) { if (r[col] == null) continue; references++; if (!target.has(r[col])) dangling.push(`${name}.${col}=${r[col]}`); }
  for (const r of t('audit_events')) if (!r.withheld && r.person_id != null) { references++; if (!patients.has(r.person_id)) dangling.push(`audit_events.person_id=${r.person_id}`); }
  for (const r of t('command_receipts')) if (r.person_id != null) { references++; if (!patients.has(r.person_id)) dangling.push(`command_receipts.person_id=${r.person_id}`); }
  // Slice 6p: every personId inside an organisation document (governance, outreach, retention, ...) is an exported patient.
  const personIds = (x, out = []) => { if (Array.isArray(x)) x.forEach(e => personIds(e, out)); else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { if (k === 'personId' && v != null) out.push(v); else personIds(v, out); } return out; };
  for (const f of (manifest.files ?? []).filter(f => f.table && ['integrations', 'operations', 'pilot', 'outreach', 'expansions', 'governance', 'retention'].includes(f.table))) for (const r of t(f.table)) { let doc = null; try { doc = typeof r.data === 'string' ? JSON.parse(r.data) : null; } catch { doc = null; } for (const id of personIds(doc)) { references++; if (!patients.has(id)) dangling.push(`${f.table}.data personId=${id}`); } }
  // Slice 6u: team-scoped rows too: household members, caseload transfer patients (personIds, moved, skipped,
  // assignments keys) must be exported patients.
  const caseloadIds = d => [...(d?.personIds ?? []), ...(d?.applied?.moved ?? []), ...Object.keys(d?.applied?.assignments ?? {})];
  for (const name of ['households', 'caseload_transfers']) for (const r of t(name)) { let doc = null; try { doc = typeof r.data === 'string' ? JSON.parse(r.data) : null; } catch { doc = null; } for (const id of [...personIds(doc), ...(name === 'caseload_transfers' ? caseloadIds(doc) : [])]) { references++; if (!patients.has(id)) dangling.push(`${name}.data personId=${id}`); } }
  if (dangling.length) bad('relationships', `${dangling.length} references do not resolve: ${dangling.slice(0, 10).join(', ')}`); else pass('relationships', `${references} references resolve`);
  // Slice 6w: the indicator differencing ledger is server-side protection state and is never exported.
  const ledgerRows = t('operations').filter(r => { try { return typeof r.data === 'string' && 'indicatorReleases' in (JSON.parse(r.data) ?? {}); } catch { return false; } });
  if (ledgerRows.length) bad('protection-state', 'operations.data carries the indicator differencing ledger, which an export must leave out'); else pass('protection-state', 'no indicator differencing ledger in the operations document');
  // Media content matches the recorded SHA-256 and size.
  const mediaProblems = [];
  let mediaFiles = 0;
  for (const r of t('media')) {
    const path = [...files.keys()].find(p => p.startsWith(`media/${r.id}.`));
    if (!path) { if (!r.deleted_at) mediaProblems.push(`${r.id} content missing`); continue; }
    mediaFiles++;
    const b = files.get(path);
    // The media row stores the SHA-256 in base64, as the application computed it at upload.
    if (createHash('sha256').update(b).digest('base64') !== r.sha256 || b.length !== r.size) mediaProblems.push(`${r.id} content differs from its row`);
  }
  if (mediaProblems.length) bad('media', mediaProblems.join('; ')); else pass('media', `${mediaFiles} files match their rows`);
  // FHIR documents: a document Bundle for a confirmed visit in the export.
  const fhirProblems = [];
  const fhir = [...files.keys()].filter(p => p.startsWith('fhir/'));
  for (const p of fhir) {
    try { const b = JSON.parse(files.get(p).toString('utf8')), id = p.slice(5, -5), v = t('visits').find(x => x.id === id); if (b.resourceType !== 'Bundle' || b.type !== 'document' || !b.identifier?.value || b.entry?.[0]?.resource?.resourceType !== 'Composition') fhirProblems.push(`${p} is not a FHIR document Bundle`); if (!v || v.state !== 'confirmed') fhirProblems.push(`${p} has no confirmed visit in the export`); } catch { fhirProblems.push(`${p} is not JSON`); }
  }
  if (fhirProblems.length) bad('fhir', fhirProblems.join('; ')); else pass('fhir', `${fhir.length} documents`);
  // Audit chain: contiguous sequence from 0, every link and hash recomputed.
  const audit = t('audit_events'), chained = audit.filter(r => r.seq != null).sort((a, b) => a.seq - b.seq), prior = audit.filter(r => r.seq == null);
  let chainProblem = null, prev = ZERO;
  for (let i = 0; i < chained.length && !chainProblem; i++) {
    const e = chained[i];
    if (e.seq !== i) { chainProblem = `event ${i} is missing`; break; }
    if (e.prev_hash !== prev) { chainProblem = `event ${i}: link to the previous event does not match`; break; }
    const c = e.withheld ? e.content : content(e);
    if (e.withheld && !/^[0-9a-f]{64}$/.test(c ?? '')) { chainProblem = `event ${i}: withheld without a digest`; break; }
    if (sha(JSON.stringify([CHAIN, e.seq, prev, c])) !== e.hash) { chainProblem = `event ${i}: content or hash altered`; break; }
    prev = e.hash;
  }
  // The archive's chain must end at the head recorded when it was read (exportedHead; earlier archives: verification.head).
  const head = chained.at(-1), expected = manifest.auditChain?.exportedHead !== undefined ? manifest.auditChain.exportedHead : manifest.auditChain?.verification?.head;
  if (!chainProblem && expected && (!head || head.seq !== expected.seq || head.hash !== expected.hash)) chainProblem = 'the exported chain does not end at the head recorded in the manifest';
  if (chainProblem) bad('audit-chain', chainProblem); else pass('audit-chain', chained.length ? `${chained.length} events, head ${head.seq} ${head.hash.slice(0, 12)}` : 'not started');
  // Genesis seal over events written before the chain: recomputable only when none is withheld.
  const genesis = chained[0];
  if (genesis && !genesis.withheld) {
    const g = /count=(\d+); last=([^|;]*)\|([^;]*); digest=([0-9a-f]{64}); page=(\d+)\./.exec(genesis.detail ?? '');
    if (!g) bad('genesis-seal', 'The genesis marker cannot be read.');
    else if (Number(g[1]) !== prior.length) bad('genesis-seal', `Genesis sealed ${g[1]} earlier events; the export has ${prior.length}.`);
    else if (prior.some(r => r.withheld)) pass('genesis-seal', `${prior.length} earlier events; ${prior.filter(r => r.withheld).length} withheld, so the seal digest cannot be recomputed from this export`);
    else {
      const ordered = [...prior].sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      let digest = sha(JSON.stringify([CHAIN, 'prior', orgId]));
      for (let i = 0; i < ordered.length; i += PRIOR_PAGE) digest = sha(JSON.stringify([digest, ordered.slice(i, i + PRIOR_PAGE).map(e => [e.org_id, e.id, e.person_id ?? null, e.actor_id, e.actor_name, e.role, e.action, e.subject, e.detail, e.at])]));
      if (digest !== g[4]) bad('genesis-seal', 'An event sealed by the genesis marker differs from the export.'); else pass('genesis-seal', `${prior.length} earlier events reproduce the genesis digest`);
    }
  }
  report.summary = { organisation: orgId, generatedAt: manifest.generatedAt, exporter: manifest.exporter?.name, tables: (manifest.files ?? []).filter(f => f.table).length, rows: totals.rows, withheld: totals.withheld, complete: manifest.scope?.complete, fhir: fhir.length, handoverItems: (manifest.files ?? []).find(f => f.path === 'handover/open-items.jsonl')?.rows ?? 0 };
  return report;
}
export function verifyExport(path) {
  const files = statSync(path).isDirectory() ? readDir(path) : readTar(readFileSync(path));
  return verifyFiles(files);
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const path = process.argv[2];
  if (!path) { console.error('Usage: node scripts/verify-export.mjs <export.tar | directory>'); process.exit(2); }
  let report; try { report = verifyExport(path); } catch (e) { report = { ok: false, failures: [String(e.message ?? e)] }; }
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}
