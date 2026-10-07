// Synthetic notices/audit fixture for the isolated mounted procedure. Every migration (including 0021)
// is applied, the shared synthetic security seed is added, and a few extra learners and guardians in
// class-a give class notices a realistic audience. Nothing here is real data.
import { writeFileSync } from 'node:fs';
import { freshDatabase, seedSecurityData, load, stamp } from './security-db.mjs';
const [sqlPath, sessionPath, manifestPath] = process.argv.slice(2);
if (!sqlPath || !sessionPath || !manifestPath) throw new Error('Supply private SQL, session and manifest output paths.');
const { db, schema, sqlite } = freshDatabase();
try {
  await seedSecurityData(db, schema);
  const extra = ['one', 'two'];
  await db.insert(schema.users).values(extra.flatMap(kind => [['student-user-extra-' + kind, 'student', 'Synthetic Learner ' + kind], ['guardian-extra-' + kind, 'guardian', 'Synthetic Guardian ' + kind]]
    .map(([id, role, name]) => ({ id, role, schoolId: 'a', name, email: id + '@example.invalid', identityIssuer: 'https://identity.example.invalid', identitySubject: 'sub-' + id, createdAt: stamp, updatedAt: stamp }))));
  await db.insert(schema.students).values(extra.map(kind => ({ id: 'student-extra-' + kind, schoolId: 'a', userId: 'student-user-extra-' + kind, firstName: 'Learner', lastName: kind,
    dateOfBirth: '2012-01-01', admissionNumber: 'NOTICE-' + kind, gradeLevel: '8', createdAt: stamp, updatedAt: stamp })));
  await db.insert(schema.guardians).values(extra.map(kind => ({ id: 'guardian-profile-extra-' + kind, schoolId: 'a', userId: 'guardian-extra-' + kind, name: 'Synthetic Guardian ' + kind,
    relationship: 'parent', createdAt: stamp, updatedAt: stamp })));
  await db.insert(schema.studentGuardians).values(extra.map(kind => ({ studentId: 'student-extra-' + kind, guardianId: 'guardian-profile-extra-' + kind, isPrimary: 1 })));
  await db.insert(schema.enrolments).values(extra.map(kind => ({ id: 'student-extra-' + kind + '-enrolment', studentId: 'student-extra-' + kind, classId: 'class-a', status: 'active', enrolledAt: stamp, createdAt: stamp, updatedAt: stamp })));
  const { createSession } = await load('lib/education/session.ts');
  const sessions = {};
  for (const id of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'guardian-a', 'guardian-other', 'student-user-a', 'student-user-other',
    ...extra.flatMap(kind => ['student-user-extra-' + kind, 'guardian-extra-' + kind])]) sessions[id] = (await createSession(id)).split(';')[0];
  const objects = sqlite.prepare("SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 WHEN 'trigger' THEN 3 ELSE 4 END,name").all();
  const statements = objects.filter(row => row.type !== 'trigger').map(row => row.sql + ';');
  const quote = value => value === null ? 'NULL' : typeof value === 'bigint' ? String(value) : typeof value === 'number' ? String(value) : "'" + String(value).replaceAll("'", "''") + "'";
  // D1 imports enforce foreign keys: insert parent tables before their children.
  const pending = objects.filter(row => row.type === 'table'), ordered = [], done = new Set();
  while (pending.length) {
    const index = pending.findIndex(row => sqlite.prepare('PRAGMA foreign_key_list("' + row.name.replaceAll('"', '""') + '")').all().every(reference => reference.table === row.name || done.has(reference.table)));
    if (index < 0) throw new Error('Fixture tables contain an unresolved foreign-key dependency.');
    const [row] = pending.splice(index, 1); ordered.push(row); done.add(row.name);
  }
  for (const row of ordered) {
    const statement = sqlite.prepare('SELECT * FROM "' + row.name.replaceAll('"', '""') + '"');
    statement.setReadBigInts(true);
    for (const record of statement.all()) statements.push('INSERT INTO "' + row.name.replaceAll('"', '""') + '" (' + Object.keys(record).map(key => '"' + key.replaceAll('"', '""') + '"').join(',') + ') VALUES (' + Object.values(record).map(quote).join(',') + ');');
  }
  statements.push(...objects.filter(row => row.type === 'trigger').map(row => row.sql + ';'));
  if (sqlite.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Synthetic notices fixture integrity failed');
  writeFileSync(sqlPath, statements.join('\n') + '\n', { mode: 0o600 });
  writeFileSync(sessionPath, JSON.stringify(sessions), { mode: 0o600 });
  writeFileSync(manifestPath, JSON.stringify({ synthetic: true, schoolId: 'a', classId: 'class-a', otherClassId: 'class-other', actors: Object.keys(sessions), classAudience: { guardians: 3, learners: 3, both: 6 } }, null, 2) + '\n', { mode: 0o600 });
  console.log('Synthetic notices/audit SQL, private sessions and manifest created.');
} finally { sqlite.close(); }
