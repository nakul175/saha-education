// Synthetic assessment-lifecycle and published-report fixture for the mounted browser procedure.
// Legacy rows (malformed maximum, duplicate results) are inserted BEFORE the academic-integrity guards, then every remaining
// migration (including the lifecycle/report migration) is applied before the Worker runs. Synthetic data only.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { freshDatabase, seedSecurityData, load, stamp } from './security-db.mjs';
const [sqlPath, sessionPath, manifestPath] = process.argv.slice(2);
if (!sqlPath || !sessionPath || !manifestPath) throw new Error('Supply private SQL, session and manifest output paths.');
const root = resolve('.');
const boundary = '0009_academic_integrity.sql';
const { db, schema, sqlite } = freshDatabase({ beforeMigration: boundary });
try {
  await seedSecurityData(db, schema);
  await db.insert(schema.users).values([['lc-guardian', 'guardian'], ['lc-student', 'student']].map(([id, role]) => ({ id, role, schoolId: 'a', name: 'Synthetic ' + id,
    email: id + '@example.invalid', identityIssuer: 'https://identity.example.invalid', identitySubject: 'synthetic-' + id, createdAt: stamp, updatedAt: stamp })));
  const learners = [['ana', 'lc-student'], ['ben', null], ['cai', null]];
  await db.insert(schema.students).values(learners.map(([kind, userId]) => ({ id: 'lc-learner-' + kind, schoolId: 'a', userId,
    firstName: 'Synthetic ' + kind[0].toUpperCase() + kind.slice(1), lastName: 'Lifecycle', dateOfBirth: '2012-01-01', admissionNumber: 'LC-' + kind, gradeLevel: '8', createdAt: stamp, updatedAt: stamp })));
  await db.insert(schema.guardians).values({ id: 'lc-guardian-profile', schoolId: 'a', userId: 'lc-guardian', name: 'Synthetic lifecycle family', relationship: 'parent', createdAt: stamp, updatedAt: stamp });
  await db.insert(schema.studentGuardians).values({ studentId: 'lc-learner-ana', guardianId: 'lc-guardian-profile', isPrimary: 1 });
  await db.insert(schema.classes).values({ id: 'lc-class', schoolId: 'a', courseId: 'course-a', teacherId: 'teacher-a', name: 'Synthetic lifecycle class', term: 'Synthetic term', createdAt: stamp, updatedAt: stamp });
  await db.insert(schema.enrolments).values(learners.map(([kind]) => ({ id: 'lc-enrolment-' + kind, studentId: 'lc-learner-' + kind, classId: 'lc-class', status: 'active', enrolledAt: stamp, createdAt: stamp, updatedAt: stamp })));
  const assessments = [['partial', 'Seeded partial quiz', 'quiz', 20, '2026-10-05'], ['empty', 'Seeded empty test', 'exam', 40, '2026-10-06'],
    ['bad-max', 'Seeded legacy malformed maximum', 'quiz', 20, '2026-10-04'], ['dupes', 'Seeded legacy duplicate results', 'quiz', 20, '2026-10-03']];
  await db.insert(schema.assessments).values(assessments.map(([kind, title, type, maxScore, date]) => ({ id: 'lc-assessment-' + kind, classId: 'lc-class', title, kind: type, maxScore, date, createdAt: stamp, updatedAt: stamp })));
  // Ana's raw zero must stay a real zero; Cai has no row at all (not a zero).
  await db.insert(schema.assessmentResults).values([
    ['partial', 'ana', 0, 'Seeded grade'], ['partial', 'ben', 15, null], ['bad-max', 'ana', 5, null], ['dupes', 'ana', 3, null], ['dupes', 'ana', 4, null]].map(([kind, learner, score, grade], index) => ({
    id: 'lc-result-' + index, assessmentId: 'lc-assessment-' + kind, studentId: 'lc-learner-' + learner, score, grade, feedback: 'Synthetic private teacher note ' + index, createdAt: stamp, updatedAt: stamp })));
  sqlite.prepare('UPDATE assessments SET max_score=? WHERE id=?').run('Synthetic malformed legacy maximum', 'lc-assessment-bad-max');
  const migrations = readdirSync(join(root, 'drizzle')).filter(file => /^\d.*\.sql$/.test(file)).sort();
  for (const file of migrations.slice(migrations.indexOf(boundary))) sqlite.exec(readFileSync(join(root, 'drizzle', file), 'utf8').replaceAll('--> statement-breakpoint', ''));
  if (sqlite.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Synthetic lifecycle fixture integrity failed');
  const sessionService = await load('lib/education/session.ts');
  const sessions = {};
  for (const id of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'guardian-a', 'guardian-other', 'lc-guardian', 'lc-student']) sessions[id] = (await sessionService.createSession(id)).split(';')[0];
  const objects = sqlite.prepare("SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 WHEN 'trigger' THEN 3 ELSE 4 END,name").all();
  const statements = objects.filter(row => row.type !== 'trigger').map(row => row.sql + ';');
  const quote = value => value === null ? 'NULL' : typeof value === 'bigint' ? String(value)
    : typeof value === 'number' ? Number.isFinite(value) ? String(value) : value > 0 ? '9e999' : '-9e999'
      : "'" + String(value).replaceAll("'", "''") + "'";
  const pendingTables = objects.filter(row => row.type === 'table');
  const orderedTables = [], insertedTables = new Set();
  while (pendingTables.length) {
    const index = pendingTables.findIndex(row => sqlite.prepare('PRAGMA foreign_key_list("' + row.name.replaceAll('"', '""') + '")').all()
      .every(reference => reference.table === row.name || insertedTables.has(reference.table)));
    if (index < 0) throw new Error('Fixture tables contain an unresolved foreign-key dependency.');
    const [row] = pendingTables.splice(index, 1);
    orderedTables.push(row); insertedTables.add(row.name);
  }
  for (const row of orderedTables) {
    const statement = sqlite.prepare('SELECT * FROM "' + row.name.replaceAll('"', '""') + '"');
    statement.setReadBigInts(true);
    for (const record of statement.all()) {
      statements.push('INSERT INTO "' + row.name.replaceAll('"', '""') + '" (' + Object.keys(record).map(key => '"' + key.replaceAll('"', '""') + '"').join(',') + ') VALUES (' + Object.values(record).map(quote).join(',') + ');');
    }
  }
  statements.push(...objects.filter(row => row.type === 'trigger').map(row => row.sql + ';'));
  writeFileSync(sqlPath, statements.join('\n') + '\n', { mode: 0o600 });
  writeFileSync(sessionPath, JSON.stringify(sessions), { mode: 0o600 });
  writeFileSync(manifestPath, JSON.stringify({ synthetic: true, classId: 'lc-class', learners: learners.map(([kind]) => 'lc-learner-' + kind),
    assessments: assessments.map(([kind]) => 'lc-assessment-' + kind), linkedGuardian: 'lc-guardian', learnerUser: 'lc-student' }, null, 2) + '\n', { mode: 0o600 });
  console.log('Synthetic lifecycle SQL, private sessions and manifest created; all final migrations/guards applied before test use.');
} finally { sqlite.close(); }
