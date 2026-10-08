// Creates only synthetic schema/rows/session credentials for the isolated local reading review/ORF launch procedure.
// Adds readable fictional names and a five-learner class so overview, empty and uneven data can be shown honestly.
// Usage: node write-reading-fixture.mjs <sql-out> <sessions-out> [manifest-out]
import { writeFileSync } from 'node:fs';
import { freshDatabase, seedSecurityData, load, stamp } from './security-db.mjs';
const output = process.argv[2],
  credentials = process.argv[3],
  manifest = process.argv[4];
if (!output || !credentials) throw new Error('Supply SQL and session fixture output paths.');
const { db, schema, sqlite } = freshDatabase();
await seedSecurityData(db, schema);
const names = {
  'admin-a': 'Meera Iyer',
  'teacher-a': 'Asha Verma',
  'teacher-other': 'Kiran Patel',
  'guardian-a': 'Rahul Nair',
  'student-user-a': 'Anika Rao',
  'admin-b': 'Other School Admin',
};
for (const [id, name] of Object.entries(names))
  sqlite.prepare('UPDATE users SET name=? WHERE id=?').run(name, id);
sqlite.prepare("UPDATE students SET first_name='Anika', last_name='Rao' WHERE id='student-a'").run();
sqlite.prepare("UPDATE students SET first_name='Sunita', last_name='Das' WHERE id='student-other'").run();
sqlite.prepare("UPDATE classes SET name='Grade 4 Reading Circle' WHERE id='class-a'").run();
const learners = [
  ['learner-b', 'Bilal', 'Khan'],
  ['learner-c', 'Chitra', 'Menon'],
  ['learner-d', 'Dev', 'Sharma'],
  ['learner-e', 'Esha', 'Gupta'],
];
for (const [id, first, last] of learners) {
  sqlite
    .prepare(
      'INSERT INTO students (id,school_id,first_name,last_name,date_of_birth,admission_number,grade_level,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
    )
    .run(id, 'a', first, last, '2016-01-01', 'adm-' + id, '4', stamp, stamp);
  sqlite
    .prepare(
      'INSERT INTO enrolments (id,student_id,class_id,status,enrolled_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
    )
    .run(id + '-enrolment', id, 'class-a', 'active', stamp, stamp, stamp);
}
const session = await load('lib/education/session.ts');
const tokens = {};
for (const id of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'guardian-a', 'student-user-a'])
  tokens[id] = (await session.createSession(id)).split(';')[0];
const statements = [];
// Triggers reference existing tables; create them after tables and indexes.
for (const row of sqlite
  .prepare(
    "SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 WHEN 'trigger' THEN 3 ELSE 4 END, name",
  )
  .all())
  statements.push(row.sql + ';');
const quote = (value) =>
  value === null
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : "'" + String(value).replaceAll("'", "''") + "'";
for (const name of [
  'schools',
  'users',
  'students',
  'guardians',
  'student_guardians',
  'courses',
  'classes',
  'enrolments',
  'assessments',
  'attendance',
  'assessment_results',
  'report_cards',
  'notifications',
  'reading_checks',
  'auth_sessions',
  'oidc_transactions',
  'auth_rate_limits',
]) {
  for (const row of sqlite.prepare(`SELECT * FROM "${name}"`).all())
    statements.push(
      `INSERT INTO "${name}" (${Object.keys(row)
        .map((key) => '"' + key + '"')
        .join(',')}) VALUES (${Object.values(row).map(quote).join(',')});`,
    );
}
writeFileSync(output, statements.join('\n'), { mode: 0o600 });
writeFileSync(credentials, JSON.stringify(tokens), { mode: 0o600 });
if (manifest)
  writeFileSync(
    manifest,
    JSON.stringify({
      classId: 'class-a',
      className: 'Grade 4 Reading Circle',
      learners: [
        ['student-a', 'Anika Rao'],
        ...learners.map(([id, first, last]) => [id, first + ' ' + last]),
      ],
      staff: names,
    }),
    { mode: 0o600 },
  );
sqlite.close();
console.log('Synthetic local reading fixture created; no database or provider changed.');
