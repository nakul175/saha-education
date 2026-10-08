// Synthetic-only fixture for the isolated local Worker used by the school/student/guardian records check.
// Same shape as write-worker-fixture.mjs, with human-looking fictional names, extra students for paging and
// filtering, and spare unlinked guardians. No provider, real person or real school is represented.
import { writeFileSync } from 'node:fs';
import { freshDatabase, seedSecurityData, load, stamp } from './security-db.mjs';

const output = process.argv[2];
const credentials = process.argv[3];
const manifestPath = process.argv[4];
if (!output || !credentials) throw new Error('Supply SQL and session fixture output paths.');
const { db, schema, sqlite } = freshDatabase();
await seedSecurityData(db, schema);

const rename = (table, id, column, value) =>
  sqlite.prepare(`UPDATE ${table} SET ${column}=? WHERE id=?`).run(value, id);
rename('schools', 'a', 'name', 'Riverside Primary (synthetic)');
rename('schools', 'b', 'name', 'Hillcrest Primary (synthetic)');
for (const [id, name] of [
  ['admin-a', 'Anita Admin'],
  ['admin-b', 'Bruno Admin'],
  ['teacher-a', 'Tara Teacher'],
  ['teacher-other', 'Omar Teacher'],
  ['guardian-a', 'Meera Verma'],
  ['guardian-other', 'Imran Khan'],
  ['student-user-a', 'Asha Verma'],
])
  rename('users', id, 'name', name);
const people = {
  'student-a': ['Asha', 'Verma', '8', 'RV-001'],
  'student-other': ['Bilal', 'Khan', '8', 'RV-002'],
  'student-b': ['Chitra', 'Nair', '8', 'HC-001'],
};
for (const [id, [first, last, grade, admission]] of Object.entries(people))
  sqlite
    .prepare('UPDATE students SET first_name=?, last_name=?, grade_level=?, admission_number=? WHERE id=?')
    .run(first, last, grade, admission, id);
for (const [id, name, relationship] of [
  ['guardian-profile-a', 'Meera Verma', 'Mother'],
  ['guardian-profile-other', 'Imran Khan', 'Father'],
  ['guardian-profile-b', 'Lata Nair', 'Mother'],
])
  sqlite.prepare('UPDATE guardians SET name=?, relationship=? WHERE id=?').run(name, relationship, id);
sqlite
  .prepare(
    "UPDATE guardians SET phone='+91 98765 43210', email='meera.verma@example.invalid' WHERE id='guardian-profile-a'",
  )
  .run();

// Extra students in school a for paging and grade/status filters (no login, no guardian).
const firsts = [
  'Dev',
  'Esha',
  'Farhan',
  'Gita',
  'Hari',
  'Isha',
  'Jai',
  'Kavya',
  'Laksh',
  'Mira',
  'Neel',
  'Om',
  'Pari',
  'Quasim',
  'Riya',
  'Sana',
  'Tej',
  'Uma',
  'Veer',
  'Zoya',
  'Arjun',
  'Bela',
  'Chirag',
  'Diya',
  'Eshan',
  'Fiza',
];
firsts.forEach((first, index) => {
  const grade = ['6', '7', '8', '9'][index % 4];
  sqlite
    .prepare(
      'INSERT INTO students (id,school_id,user_id,first_name,last_name,date_of_birth,admission_number,grade_level,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    )
    .run(
      'extra-student-' + index,
      'a',
      null,
      first,
      'Demo',
      '2013-05-0' + (1 + (index % 9)),
      'RV-' + String(100 + index),
      grade,
      stamp,
      stamp,
    );
});
// Spare, unlinked guardians in school a (one with no sign-in) and one in school b.
for (const [id, school, name, relationship, phone] of [
  ['guardian-spare-1', 'a', 'Farah Spare', 'Aunt', '+91 90000 11111'],
  ['guardian-spare-2', 'a', 'Gopal Spare', 'Uncle', null],
  ['guardian-spare-b', 'b', 'Hema Other', 'Aunt', null],
])
  sqlite
    .prepare(
      'INSERT INTO guardians (id,school_id,user_id,name,phone,email,relationship,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
    )
    .run(id, school, null, name, phone, null, relationship, stamp, stamp);

const session = await load('lib/education/session.ts');
const tokens = {};
for (const id of [
  'admin-a',
  'admin-b',
  'teacher-a',
  'teacher-other',
  'guardian-a',
  'guardian-other',
  'student-user-a',
  'student-user-other',
])
  tokens[id] = (await session.createSession(id)).split(';')[0];

const statements = [];
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
  'auth_sessions',
  'auth_rate_limits',
]) {
  for (const row of sqlite.prepare(`SELECT * FROM "${name}"`).all())
    statements.push(
      `INSERT INTO "${name}" (${Object.keys(row)
        .map((k) => '"' + k + '"')
        .join(',')}) VALUES (${Object.values(row).map(quote).join(',')});`,
    );
}
writeFileSync(output, statements.join('\n'), { mode: 0o600 });
writeFileSync(credentials, JSON.stringify(tokens), { mode: 0o600 });
if (manifestPath)
  writeFileSync(
    manifestPath,
    JSON.stringify({
      schoolA: 'a',
      schoolB: 'b',
      extraStudents: firsts.length,
      note: 'synthetic records fixture',
    }),
    { mode: 0o600 },
  );
sqlite.close();
console.log('Synthetic records fixture created; no database or provider changed.');
