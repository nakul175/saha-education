// Synthetic security review fixture for an isolated local Worker + D1: the same two-school data the in-process
// authorization matrix uses (built through the real route handlers), dumped as schema, rows and final triggers, plus the
// private opaque session cookies of every actor. Nothing here is a real person, provider or recipient.
import { writeFileSync } from 'node:fs';
import { buildFixture } from './authorization-fixture.mjs';

const [sqlPath, sessionPath, manifestPath] = process.argv.slice(2);
if (!sqlPath || !sessionPath || !manifestPath) throw new Error('Supply private SQL, session and manifest output paths.');
const fixture = await buildFixture();
const { sqlite } = fixture;
try {
  const objects = sqlite.prepare("SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 WHEN 'trigger' THEN 3 ELSE 4 END,name").all();
  const statements = objects.filter(row => row.type !== 'trigger').map(row => row.sql + ';');
  const quote = value => value === null ? 'NULL' : typeof value === 'bigint' ? String(value)
    : typeof value === 'number' ? Number.isFinite(value) ? String(value) : value > 0 ? '9e999' : '-9e999'
      : "'" + String(value).replaceAll("'", "''") + "'";
  // D1 imports enforce foreign keys: parents before children.
  const pending = objects.filter(row => row.type === 'table');
  const ordered = [], inserted = new Set();
  while (pending.length) {
    const index = pending.findIndex(row => sqlite.prepare('PRAGMA foreign_key_list("' + row.name.replaceAll('"', '""') + '")').all()
      .every(reference => reference.table === row.name || inserted.has(reference.table)));
    if (index < 0) throw new Error('Fixture tables contain an unresolved foreign-key dependency.');
    const [row] = pending.splice(index, 1);
    ordered.push(row); inserted.add(row.name);
  }
  for (const row of ordered) {
    const statement = sqlite.prepare('SELECT * FROM "' + row.name.replaceAll('"', '""') + '"');
    statement.setReadBigInts(true);
    for (const record of statement.all()) {
      statements.push('INSERT INTO "' + row.name.replaceAll('"', '""') + '" (' + Object.keys(record).map(key => '"' + key.replaceAll('"', '""') + '"').join(',') + ') VALUES (' + Object.values(record).map(quote).join(',') + ');');
    }
  }
  // Rows first, then the exact final trigger definitions (so immutability guards do not interfere with loading).
  statements.push(...objects.filter(row => row.type === 'trigger').map(row => row.sql + ';'));
  writeFileSync(sqlPath, statements.join('\n') + '\n', { mode: 0o600 });
  writeFileSync(sessionPath, JSON.stringify(fixture.cookies), { mode: 0o600 });
  writeFileSync(manifestPath, JSON.stringify({ synthetic: true, ids: fixture.ids, actors: Object.keys(fixture.cookies) }, null, 2) + '\n', { mode: 0o600 });
  console.log('Synthetic security SQL, private sessions and manifest created.');
} finally { sqlite.close(); }
