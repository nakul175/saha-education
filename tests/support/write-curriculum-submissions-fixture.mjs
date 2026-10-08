// Synthetic fixture for the curriculum library and learner submission browser journey: the standard
// synthetic school plus a second enrolled learner (for cross-learner checks), exported with every
// migration (including the additive curriculum status table) and private session cookies.
import { writeFileSync } from 'node:fs';
import { freshDatabase, seedSecurityData, load, stamp } from './security-db.mjs';
const [sqlPath, sessionPath, manifestPath] = process.argv.slice(2);
if (!sqlPath || !sessionPath || !manifestPath)
  throw new Error('Supply private SQL, session and manifest output paths.');
const { db, schema, sqlite } = freshDatabase();
try {
  await seedSecurityData(db, schema);
  await db.insert(schema.users).values({
    id: 'student-user-peer',
    name: 'student-user-peer',
    email: 'student-user-peer@example.invalid',
    role: 'student',
    schoolId: 'a',
    identityIssuer: 'https://identity.example.invalid',
    identitySubject: 'sub-student-user-peer',
    createdAt: stamp,
    updatedAt: stamp,
  });
  await db.insert(schema.students).values({
    id: 'student-peer',
    schoolId: 'a',
    userId: 'student-user-peer',
    firstName: 'Peer',
    lastName: 'Learner',
    dateOfBirth: '2012-01-01',
    admissionNumber: 'student-peer',
    gradeLevel: '8',
    createdAt: stamp,
    updatedAt: stamp,
  });
  await db.insert(schema.enrolments).values({
    id: 'student-peer-enrolment',
    studentId: 'student-peer',
    classId: 'class-a',
    status: 'active',
    enrolledAt: stamp,
    createdAt: stamp,
    updatedAt: stamp,
  });
  const sessionService = await load('lib/education/session.ts');
  const actors = [
    'admin-a',
    'admin-b',
    'teacher-a',
    'teacher-other',
    'teacher-b',
    'guardian-a',
    'student-user-a',
    'student-user-peer',
  ];
  const sessions = {};
  for (const id of actors) sessions[id] = (await sessionService.createSession(id)).split(';')[0];
  if (sqlite.prepare('PRAGMA foreign_key_check').all().length)
    throw new Error('Synthetic fixture integrity failed');
  const objects = sqlite
    .prepare(
      "SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 WHEN 'trigger' THEN 3 ELSE 4 END,name",
    )
    .all();
  const statements = objects.filter((row) => row.type !== 'trigger').map((row) => row.sql + ';');
  const quote = (value) =>
    value === null
      ? 'NULL'
      : typeof value === 'bigint' || typeof value === 'number'
        ? String(value)
        : "'" + String(value).replaceAll("'", "''") + "'";
  const pending = objects.filter((row) => row.type === 'table'),
    ordered = [],
    inserted = new Set();
  while (pending.length) {
    const index = pending.findIndex((row) =>
      sqlite
        .prepare('PRAGMA foreign_key_list("' + row.name.replaceAll('"', '""') + '")')
        .all()
        .every((reference) => reference.table === row.name || inserted.has(reference.table)),
    );
    if (index < 0) throw new Error('Fixture tables contain an unresolved foreign-key dependency.');
    const [row] = pending.splice(index, 1);
    ordered.push(row);
    inserted.add(row.name);
  }
  for (const row of ordered)
    for (const record of sqlite.prepare('SELECT * FROM "' + row.name.replaceAll('"', '""') + '"').all())
      statements.push(
        'INSERT INTO "' +
          row.name.replaceAll('"', '""') +
          '" (' +
          Object.keys(record)
            .map((key) => '"' + key + '"')
            .join(',') +
          ') VALUES (' +
          Object.values(record).map(quote).join(',') +
          ');',
      );
  // Rows go in before the immutability triggers are restored.
  statements.push(...objects.filter((row) => row.type === 'trigger').map((row) => row.sql + ';'));
  writeFileSync(sqlPath, statements.join('\n') + '\n', { mode: 0o600 });
  writeFileSync(sessionPath, JSON.stringify(sessions), { mode: 0o600 });
  writeFileSync(
    manifestPath,
    JSON.stringify(
      { synthetic: true, actors, schoolId: 'a', classId: 'class-a', learners: ['student-a', 'student-peer'] },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
  console.log(
    'Synthetic curriculum and submission SQL, private sessions and manifest created; no database or provider changed.',
  );
} finally {
  sqlite.close();
}
