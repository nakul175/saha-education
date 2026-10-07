// Synthetic fixture for the courses/classes/enrolment mounted procedure: the shared security seed plus a few extra
// teachers and learners, with every final migration (including 0018) applied before the Worker runs.
import { writeFileSync } from 'node:fs';
import { freshDatabase, seedSecurityData, load, stamp } from './security-db.mjs';
const [sqlPath, sessionPath, manifestPath] = process.argv.slice(2);
if (!sqlPath || !sessionPath || !manifestPath) throw new Error('Supply private SQL, session and manifest output paths.');
const { db, schema, sqlite } = freshDatabase();
try {
  await seedSecurityData(db, schema);
  const extraUsers = [['teacher-new', 'teacher'], ['teacher-spare', 'teacher']];
  await db.insert(schema.users).values(extraUsers.map(([id, role]) => ({ id, role, schoolId: 'a', name: 'Synthetic ' + id.replace('-', ' '),
    email: id + '@example.invalid', identityIssuer: 'https://identity.example.invalid', identitySubject: 'synthetic-' + id, createdAt: stamp, updatedAt: stamp })));
  const learners = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'];
  await db.insert(schema.students).values(learners.map(kind => ({ id: 'ce-learner-' + kind, schoolId: 'a', firstName: 'Synthetic', lastName: kind[0].toUpperCase() + kind.slice(1),
    dateOfBirth: '2012-01-01', admissionNumber: 'CE-' + kind, gradeLevel: '8', createdAt: stamp, updatedAt: stamp })));
  const sessionService = await load('lib/education/session.ts');
  const sessions = {};
  for (const id of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'teacher-new', 'teacher-spare', 'guardian-a', 'guardian-other', 'student-user-a']) sessions[id] = (await sessionService.createSession(id)).split(';')[0];
  const objects = sqlite.prepare("SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 WHEN 'trigger' THEN 3 ELSE 4 END,name").all();
  const statements = objects.filter(row => row.type !== 'trigger').map(row => row.sql + ';');
  const quote = value => value === null ? 'NULL' : typeof value === 'number' ? String(value) : "'" + String(value).replaceAll("'", "''") + "'";
  // D1 imports enforce foreign keys: keep parent-before-child ordering.
  const pendingTables = objects.filter(row => row.type === 'table');
  const orderedTables = [], insertedTables = new Set();
  while (pendingTables.length) {
    const index = pendingTables.findIndex(row => sqlite.prepare('PRAGMA foreign_key_list("' + row.name.replaceAll('"', '""') + '")').all()
      .every(reference => reference.table === row.name || insertedTables.has(reference.table)));
    if (index < 0) throw new Error('Fixture tables contain an unresolved foreign-key dependency.');
    const [row] = pendingTables.splice(index, 1);
    orderedTables.push(row); insertedTables.add(row.name);
  }
  for (const row of orderedTables) for (const record of sqlite.prepare('SELECT * FROM "' + row.name.replaceAll('"', '""') + '"').all()) {
    statements.push('INSERT INTO "' + row.name.replaceAll('"', '""') + '" (' + Object.keys(record).map(key => '"' + key.replaceAll('"', '""') + '"').join(',') + ') VALUES (' + Object.values(record).map(quote).join(',') + ');');
  }
  // Import original rows before restoring the exact final trigger definitions.
  statements.push(...objects.filter(row => row.type === 'trigger').map(row => row.sql + ';'));
  writeFileSync(sqlPath, statements.join('\n') + '\n', { mode: 0o600 });
  writeFileSync(sessionPath, JSON.stringify(sessions), { mode: 0o600 });
  writeFileSync(manifestPath, JSON.stringify({ synthetic: true, schoolId: 'a', learners: learners.map(kind => 'ce-learner-' + kind), extraTeachers: extraUsers.map(([id]) => id) }), { mode: 0o600 });
  console.log('Synthetic courses/enrolment SQL, private sessions and manifest created; all final migrations and guards applied before test use.');
} finally { sqlite.close(); }
