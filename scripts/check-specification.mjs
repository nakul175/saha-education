// Offline specification consistency, never runtime or business acceptance.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join, relative } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const root = fileURLToPath(new URL('..', import.meta.url));
const folder = join(root, 'docs/specification');
const read = name => readFileSync(join(folder, name), 'utf8');
const register = JSON.parse(read('requirements.json'));
const pack = JSON.parse(read('TEST-CASES.json'));
const ids = new Set(register.requirements.map(row => row.id));
const business = new Set(register.business_requirements);
assert.equal(ids.size, register.requirements.length, 'Duplicate requirement IDs');
assert.equal(business.size, register.business_requirements.length, 'Duplicate business IDs');
assert.equal(pack.source_commit, register.source_commit, 'Source snapshot differs');
assert.equal(register.approved, false, 'This draft pack cannot imply acceptance');
for (const row of register.requirements) {
  assert.ok(business.has(row.business), 'Unknown business link: ' + row.id);
  assert.ok(existsSync(join(root, row.source)), 'Missing requirement source: ' + row.source);
  assert.equal(row.approved, false, 'Requirement acceptance needs a separately recorded review');
  for (const doc of ['FSD.md', 'HLD.md', 'LLD.md']) assert.ok(read(doc).includes(row.id), doc + ' lacks ' + row.id);
}
for (const id of business) assert.ok(read('BRD.md').includes(id), 'BRD lacks ' + id);
function csv(text) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(field); field = ''; }
    else if (char === '\n' && !quoted) { row.push(field.replace(/\r$/, '')); if (row.some(Boolean)) rows.push(row); row = []; field = ''; }
    else field += char;
  }
  assert.equal(quoted, false, 'Unclosed CSV quote');
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  const header = rows.shift(); assert.ok(header?.length, 'CSV header required');
  return rows.map(values => { assert.equal(values.length, header.length, 'CSV width mismatch'); return Object.fromEntries(header.map((key, i) => [key, values[i]])); });
}
const exported = csv(read('TEST-CASES.csv'));
const caseIds = new Set(pack.cases.map(row => row.id));
assert.equal(caseIds.size, pack.cases.length, 'Duplicate case IDs');
assert.equal(exported.length, pack.cases.length, 'Case CSV count drift');
const coverage = new Map([...ids].map(id => [id, []]));
for (const row of pack.cases) {
  assert.ok(/^TC-\d+$/.test(row.id));
  assert.ok(read('TEST-SCENARIOS.md').includes(row.scenario), 'Unknown scenario ' + row.scenario);
  assert.ok(['unit', 'integration', 'smoke', 'regression', 'security', 'performance', 'accessibility', 'recovery', 'uat'].includes(row.layer));
  assert.ok(['P0', 'P1', 'P2'].includes(row.priority));
  assert.ok(['existing', 'planned', 'manual'].includes(row.automation));
  assert.equal(row.execution_status, 'not-run-for-this-specification', 'Case design cannot inherit a suite pass');
  for (const field of ['title', 'preconditions', 'data']) assert.ok(typeof row[field] === 'string' && row[field].trim(), row.id + ' lacks ' + field);
  for (const field of ['requirements', 'steps', 'expected']) assert.ok(Array.isArray(row[field]) && row[field].length, row.id + ' lacks ' + field);
  for (const id of row.requirements) { assert.ok(ids.has(id), 'Unknown requirement ' + id); coverage.get(id).push(row.id); }
  for (const file of row.evidenceFiles) assert.ok(existsSync(join(root, file)), 'Missing candidate evidence ' + file);
  const record = exported.find(item => item.id === row.id); assert.ok(record, 'Case CSV lacks ' + row.id);
  for (const [field, value] of Object.entries(row)) {
    const expected = Array.isArray(value) ? value.join(['steps', 'expected'].includes(field) ? ' | ' : ';') : String(value);
    assert.equal(record[field], expected, row.id + ' CSV differs at ' + field);
  }
}
const trace = csv(read('TRACEABILITY.csv'));
assert.equal(trace.length, ids.size, 'Traceability row count drift');
assert.equal(new Set(trace.map(row => row.id)).size, ids.size, 'Duplicate trace rows');
for (const req of register.requirements) {
  const row = trace.find(item => item.id === req.id); assert.ok(row, 'Traceability lacks ' + req.id);
  assert.equal(row.business, req.business); assert.equal(row.title, req.title); assert.equal(row.implementation_status, req.implementation_status);
  assert.equal(row.acceptance_status, 'draft-not-accepted');
  assert.ok(coverage.get(req.id).length, 'No designed case for ' + req.id);
  assert.deepEqual(row.case_ids.split(';').sort(), coverage.get(req.id).sort(), 'Case trace drift for ' + req.id);
  const expectedEvidence = [...new Set([req.source, ...pack.cases.filter(item => item.requirements.includes(req.id)).flatMap(item => item.evidenceFiles)])].sort();
  assert.deepEqual(row.evidence_files ? row.evidence_files.split(';').sort() : [], expectedEvidence, 'Evidence trace drift for ' + req.id);
}
const database = new DatabaseSync(':memory:'); database.exec('PRAGMA foreign_keys=ON');
try {
  for (const file of readdirSync(join(root, 'drizzle')).filter(name => /^\d.*\.sql$/.test(name)).sort()) database.exec(readFileSync(join(root, 'drizzle', file), 'utf8').replaceAll('--> statement-breakpoint', ''));
  const tables = database.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row => row.name);
  const columns = new Map(tables.flatMap(table => database.prepare(`PRAGMA table_info("${table}")`).all().map(column => [table + '.' + column.name, column])));
  const dictionary = csv(read('DATA-DICTIONARY.csv'));
  assert.equal(dictionary.length, columns.size, 'Dictionary column count drift');
  assert.equal(new Set(dictionary.map(row => row.table + '.' + row.column)).size, columns.size, 'Duplicate dictionary fields');
  for (const row of dictionary) {
    const column = columns.get(row.table + '.' + row.column); assert.ok(column, 'Unknown dictionary field');
    assert.equal(row.type.toUpperCase(), column.type.toUpperCase(), 'Field type drift');
    assert.equal(row.nullable, column.notnull ? 'no' : 'yes', 'Field nullable drift');
    assert.equal(row.default, column.dflt_value ?? 'none', 'Field default drift');
    for (const field of ['constraints', 'meaning', 'sensitivity', 'source']) assert.ok(row[field]?.trim(), 'Incomplete dictionary field');
  }
  console.log(`Data dictionary checked: ${tables.length} tables, ${columns.size} fields.`);
} finally { database.close(); }
function files(dir) { return readdirSync(dir, {withFileTypes: true}).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]); }
const routes = files(join(root, 'app/api')).filter(file => file.endsWith('/route.ts'));
const api = read('API-CONTRACTS.md');
const inventory = api.split('\n').filter(line => /^\| `\/api\//.test(line));
assert.equal(inventory.length, routes.length, 'API inventory route count drift');
for (const route of routes) {
  const url = '/' + relative(join(root, 'app'), route).replaceAll('\\', '/').replace(/\/route\.ts$/, '');
  const row = inventory.find(line => line.startsWith('| `' + url + '` |')); assert.ok(row, 'API inventory lacks ' + url);
  const methods = [...readFileSync(route, 'utf8').matchAll(/export async function (GET|POST|PATCH|PUT|DELETE|OPTIONS|HEAD)\b/g)].map(match => match[1]).sort();
  const documented = [...new Set(row.split('|')[2].match(/\b(GET|POST|PATCH|PUT|DELETE|OPTIONS|HEAD)\b/g) ?? [])].sort();
  assert.deepEqual(documented, methods, 'API method drift for ' + url);
}
for (const file of files(folder).filter(file => file.endsWith('.md'))) {
  const content = readFileSync(file, 'utf8'); assert.ok(content.startsWith('# '), 'Missing title');
  assert.equal((content.match(/```/g) ?? []).length % 2, 0, 'Unbalanced code fence');
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const link = match[1]; if (/^[a-zA-Z][a-zA-Z0-9+.-]*:|^#/.test(link)) continue;
    const path = resolve(file, '..', link.split('#')[0]); assert.ok(path.startsWith(root) && existsSync(path), 'Broken link ' + link);
  }
}
console.log(`Specification checked: ${business.size} business requirements, ${ids.size} functional/nonfunctional requirements, ${caseIds.size} designed cases, ${routes.length} route files. No execution or acceptance inferred.`);
