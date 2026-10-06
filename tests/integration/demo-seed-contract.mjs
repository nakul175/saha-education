// The rich synthetic demo school (scripts/seed-demo.mjs) applied to a database built from every real migration.
// Evidence: node:sqlite in memory with foreign keys on; no browser, no Worker, no network.
// Covers: determinism, counts against the manifest, foreign-key integrity, that the dump reloads and keeps the
// notices the report-publication trigger created, the demo identity rules the Worker enforces, fictional-only
// content, and that re-running the seed on a populated database is refused rather than duplicating rows.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { buildDemo, demoSql, migratedDatabase, sessionFixtures, DEMO_ISSUER, DEMO_SCHOOL_ID, DEMO_INSTALLATION_ID } from '../../scripts/seed-demo.mjs';

let passed = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); passed++; };
const okay = (value, message) => { assert.ok(value, message); passed++; };
const ANCHOR = '2026-10-06';
const one = (db, sql, ...args) => ({ ...db.prepare(sql).get(...args) });
const count = (db, table, where = '1=1', ...args) => one(db, `SELECT count(*) AS n FROM ${table} WHERE ${where}`, ...args).n;
const digest = text => createHash('sha256').update(text).digest('hex');

// 1. Determinism: the same anchor gives byte-identical output; another anchor moves the calendar.
const first = demoSql({ anchor: ANCHOR, withSchema: true });
const second = demoSql({ anchor: ANCHOR, withSchema: true });
check(digest(first.sql), digest(second.sql), 'Same anchor, same bytes');
check(first.manifest, second.manifest, 'Same anchor, same manifest');
const later = buildDemo({ anchor: '2026-11-03' }).manifest;
okay(later.window.first > first.manifest.window.first && later.window.last > first.manifest.window.last, 'A later anchor moves the calendar window forward');
check(later.counts.learners, first.manifest.counts.learners, 'The cast does not depend on the date');
for (const bad of ['2026-02-30', 'yesterday', '26-10-06']) assert.throws(() => buildDemo({ anchor: bad }), /anchor/i, `Rejects ${bad}`), passed++;
assert.throws(() => buildDemo({ anchor: ANCHOR, installationId: 'not-a-uuid' }), /version 4 UUID/), passed++;
check(buildDemo({ anchor: ANCHOR }).manifest.installationId, DEMO_INSTALLATION_ID, 'Default installation id is the documented one');

// 2. Load the dump into an empty database exactly as the launcher does (schema, rows in parent order, triggers last).
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
db.exec(first.sql);
check(db.prepare('PRAGMA foreign_key_check').all(), [], 'No foreign key problems after loading the dump');
check(one(db, 'PRAGMA integrity_check').integrity_check, 'ok', 'Database integrity check');
const m = first.manifest;
check(m.synthetic, true, 'Manifest says synthetic');
const expected = { students: m.counts.learners, guardians: m.counts.guardianProfiles, classes: m.counts.classes, courses: m.counts.courses, enrolments: m.counts.enrolments, attendance: m.counts.attendance,
  assessments: m.counts.assessments, assessment_results: m.counts.results, reading_checks: m.counts.readingChecks, teaching_resources: m.counts.resources, resource_versions: m.counts.resourceVersions,
  resource_assignments: m.counts.assignments, curriculum_references: m.counts.references, report_cards: m.counts.reports, report_publication_receipts: m.counts.publishedReports };
for (const [table, n] of Object.entries(expected)) check(count(db, table), n, `${table} count matches the manifest`);
check(m.counts, { learners: 40, guardianProfiles: 37, classes: 6, courses: 3, enrolments: 120, attendance: 2596, assessments: 19, results: 357, readingChecks: 256, resources: 5, resourceVersions: 6, assignments: 5, references: 3, reports: 40, publishedReports: 20, notices: 6 }, 'Documented cast and volumes (docs/DEMO.md)');
check(count(db, 'schools'), 1, 'One school');
check(count(db, 'users'), 7, 'One administrator, four teachers, one guardian and one student account');
okay(count(db, 'notifications') >= m.counts.notices, 'The seeded notices are present');

// 3. Rules the Worker enforces in demo mode (demoIdentityScope): every account is demo-issued, school-scoped, and the installation row exists.
check(count(db, 'users', 'identity_issuer IS NOT ? OR school_id IS NOT ?', DEMO_ISSUER, DEMO_SCHOOL_ID), 0, 'Every account carries the demo issuer and school');
check(db.prepare('SELECT role, count(*) AS n FROM users GROUP BY role ORDER BY role').all().map(r => [r.role, r.n]), [['admin', 1], ['guardian', 1], ['student', 1], ['teacher', 4]], 'Roles');
check(one(db, 'SELECT id, school_id FROM demo_installations'), { id: DEMO_INSTALLATION_ID, school_id: DEMO_SCHOOL_ID }, 'Installation row ties the demo to its school');
check(count(db, 'users', "id IN ('saha-demo-admin','saha-demo-teacher','saha-demo-guardian','saha-demo-student')"), 4, 'The four fixed demo accounts exist');
check(count(db, 'auth_sessions'), 0, 'The seed itself holds no sign-in sessions');

// 4. The story the guided walkthrough relies on.
const teacherClasses = db.prepare("SELECT id FROM classes WHERE teacher_id = 'saha-demo-teacher' ORDER BY id").all().map(r => r.id);
check(teacherClasses, ['saha-demo-class-eng-5a', 'saha-demo-class-eng-5b', 'saha-demo-class-sci-5a'], 'The demo teacher has three classes');
check(count(db, 'students', "id IN (SELECT student_id FROM student_guardians WHERE guardian_id IN (SELECT id FROM guardians WHERE user_id = 'saha-demo-guardian'))"), 2, 'The demo guardian has two children');
check(count(db, 'enrolments', "status = 'withdrawn'"), 1, 'One withdrawn enrolment shows history, not only current rows');
check(one(db, 'SELECT published_at IS NOT NULL AS p FROM report_cards WHERE id = ?', m.ids.publishedReport).p, 1, 'The first report is published');
check(one(db, 'SELECT published_at IS NULL AS p FROM report_cards WHERE id = ?', m.ids.draftReport).p, 1, 'The sibling report stays a draft the guardian cannot see');
check(count(db, 'assessment_results', 'assessment_id = ?', m.ids.unmarkedAssessment), 0, 'One assessment has no marks yet, so a teacher can enter them');
check(count(db, 'reading_checks', "language LIKE 'hi%'") > 0, true, 'Reading checks include Hindi');
check(count(db, 'notifications', "user_id = 'saha-demo-guardian'") , m.expect.guardianNoticesAfterSeed, 'The guardian sees the notices the manifest promises, including the one the publish trigger created');
check(m.expect.learnerNames.length, 3, 'The manifest names the first learners for the browser check');
okay(m.expect.learnerNames.every(name => /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(name)), 'Names are plain two-part names');
const weeks = one(db, 'SELECT count(DISTINCT strftime(\'%W\', date)) AS n FROM attendance').n;
okay(weeks >= 6, `Attendance spans at least six weeks (found ${weeks})`);
check(one(db, 'SELECT min(date) AS a, max(date) AS b FROM attendance'), { a: m.window.first, b: m.window.last }, 'Attendance covers exactly the manifest window');
okay(count(db, 'attendance', "status = 'absent'") > 0 && count(db, 'attendance', "status = 'late'") > 0, 'Attendance includes absences and lateness');

// 5. Fictional only: reserved example domains, no real-looking contact data.
const sql = first.sql;
const addresses = sql.match(/[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+/g) ?? [];
okay(addresses.length > 0, 'There are addresses to inspect');
check(addresses.filter(address => !/@example\.invalid$/.test(address)), [], 'Every email address uses the reserved example.invalid domain');
check(/\+\d[\d -]{8,}\d|\b\d{10,}\b|\(\d{3}\)\s?\d{3}-\d{4}/.test(buildDemo({ anchor: ANCHOR }).statements.join('\n')), false, 'No phone-number-like digits');
okay(!/https?:\/\/(?!saha-demo\.example\.invalid)[^'"\s]*/.test(sql.replace(/https?:\/\/[^'"\s]*example\.(invalid|org|com)[^'"\s]*/g, '')), 'No links to real sites other than reserved example domains');

// 6. Re-running the seed on a populated database is refused and leaves the data alone.
const statements = buildDemo({ anchor: ANCHOR }).statements.join('\n');
const before = { students: count(db, 'students'), users: count(db, 'users'), notifications: count(db, 'notifications') };
assert.throws(() => db.exec(statements), /UNIQUE|constraint/i); passed++;
check({ students: count(db, 'students'), users: count(db, 'users'), notifications: count(db, 'notifications') }, before, 'A refused second run changes nothing');

// 7. Two independent fresh databases end up identical, row for row.
const fingerprint = database => digest(database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({ name }) => name + JSON.stringify(database.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all())).join('\n'));
const other = new DatabaseSync(':memory:');
other.exec(second.sql);
check(fingerprint(other), fingerprint(db), 'Loading the dump twice gives identical tables');
// A seed applied to a migrated database (not the dump) reaches the same state as the dump, so the dump loses nothing.
const direct = migratedDatabase();
direct.exec(buildDemo({ anchor: ANCHOR }).statements.join('\n'));
check(fingerprint(direct), fingerprint(db), 'The dump equals the seed applied to a migrated database');

// 8. Session fixtures: only the SHA-256 of each cookie token is stored, and sessions expire.
const now = Date.UTC(2026, 9, 6, 8, 0, 0);
const made = sessionFixtures(['saha-demo-admin', 'saha-demo-guardian'], now);
check(Object.keys(made.cookies), ['saha-demo-admin', 'saha-demo-guardian'], 'One cookie per account');
for (const [id, cookie] of Object.entries(made.cookies)) {
  const token = cookie.replace(/^__Host-saha_session=/, '');
  okay(/^[A-Za-z0-9_-]{43}$/.test(token), `${id} token is 43 url-safe characters`);
  okay(made.sql.includes(createHash('sha256').update(token).digest('base64url')), `${id} stored value is the token hash`);
  okay(!made.sql.includes(token), `${id} raw token is not in the SQL`);
}
okay(made.sql.includes(String(now + 8 * 3600000)), 'Sessions expire after eight hours');
const withSessions = demoSql({ anchor: ANCHOR, withSchema: true, sessions: true });
const sessionDb = new DatabaseSync(':memory:');
sessionDb.exec('PRAGMA foreign_keys=ON');
sessionDb.exec(withSessions.sql);
check(count(sessionDb, 'auth_sessions'), 5, 'Five role sessions are loaded when asked for');
check(Object.keys(withSessions.cookies).filter(key => !key.startsWith('saha-demo-')).sort(), ['admin', 'guardian', 'student', 'teacher', 'teacher-2'], 'Role aliases for browser checks');

console.log(JSON.stringify({ passed, failed: 0, skipped: 0, tables: Object.keys(expected).length, scope: 'In-memory SQLite with every migration applied; seed determinism, integrity, demo identity rules, fictional-only content; no Worker, browser or network' }));
