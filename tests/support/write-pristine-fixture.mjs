// Writes only the migrated synthetic schema, with no rows and no sessions, for a pristine isolated local Worker.
// Used for the synthetic-demo procedures, which must start from an empty database (the Worker seeds its own fictional records).
import { writeFileSync } from 'node:fs';
import { freshDatabase } from './security-db.mjs';
const output = process.argv[2]; const credentials = process.argv[3]; const manifest = process.argv[4];
if (!output || !credentials) throw new Error('Supply SQL and session fixture output paths.');
const { sqlite } = freshDatabase();
const statements = [];
// Triggers reference existing tables; create them after tables and indexes.
for (const row of sqlite.prepare("SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 WHEN 'trigger' THEN 3 ELSE 4 END, name").all()) statements.push(row.sql + ';');
writeFileSync(output, statements.join('\n'), { mode: 0o600 });
writeFileSync(credentials, '{}', { mode: 0o600 });
if (manifest) writeFileSync(manifest, '{}', { mode: 0o600 });
sqlite.close();
console.log('Pristine synthetic Worker schema created; no rows, sessions, database or provider changed.');
