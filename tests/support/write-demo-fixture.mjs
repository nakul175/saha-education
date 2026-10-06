// Fixture writer for mounted browser procedures against the rich synthetic school.
//   node tests/support/write-demo-fixture.mjs <sql> <sessions.json> <manifest.json>
// The SQL holds every migration, the seeded school and one signed-in session per role. Start the Worker with
// SAHA_DEMO_ENABLED=true and SAHA_DEMO_INSTALLATION_ID=<manifest.installationId>; demo sessions are only valid then.
// The anchor is fixed so that dates in assertions do not move from day to day.
import { writeFileSync } from 'node:fs';
import { demoSql } from '../../scripts/seed-demo.mjs';

export const FIXTURE_ANCHOR = '2026-10-06';
const [sqlPath, sessionPath, manifestPath] = process.argv.slice(2);
if (!sqlPath || !sessionPath || !manifestPath) throw new Error('Supply SQL, session and manifest output paths.');
const made = demoSql({ anchor: process.env.SAHA_DEMO_ANCHOR || FIXTURE_ANCHOR, withSchema: true, sessions: true });
writeFileSync(sqlPath, made.sql, { mode: 0o600 });
writeFileSync(sessionPath, JSON.stringify(made.cookies), { mode: 0o600 });
writeFileSync(manifestPath, JSON.stringify(made.manifest, null, 2) + '\n', { mode: 0o600 });
console.log('Synthetic demo school SQL, private sessions and manifest created; demo mode must be enabled on the Worker.');
