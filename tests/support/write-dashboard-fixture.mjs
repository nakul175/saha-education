// Synthetic dashboard fixtures: legacy evidence is inserted BEFORE new pair
// guards, then every remaining migration is applied before the Worker runs.
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
  const actors = [['dashboard-teacher', 'teacher'], ['dashboard-guardian', 'guardian'], ['dashboard-student', 'student']];
  await db.insert(schema.users).values(actors.map(([id, role]) => ({ id, role, schoolId: 'a', name: 'Synthetic ' + id,
    email: id + '@example.invalid', identityIssuer: 'https://identity.example.invalid', identitySubject: 'synthetic-' + id, createdAt: stamp, updatedAt: stamp })));
  const learners = ['zero', 'recorded', 'pending', 'ambiguous', 'invalid', 'none', 'excused', 'attendance'];
  await db.insert(schema.students).values(learners.map(kind => ({ id: 'dashboard-learner-' + kind, schoolId: 'a',
    userId: kind === 'zero' ? 'dashboard-student' : null, firstName: 'Synthetic dashboard', lastName: kind,
    dateOfBirth: '2012-01-01', admissionNumber: 'DASH-' + kind, gradeLevel: '8', createdAt: stamp, updatedAt: stamp })));
  await db.insert(schema.guardians).values({ id: 'dashboard-family-profile', schoolId: 'a', userId: 'dashboard-guardian',
    name: 'Synthetic dashboard family', relationship: 'parent', createdAt: stamp, updatedAt: stamp });
  await db.insert(schema.studentGuardians).values(['zero', 'none', 'excused', 'attendance'].map(kind => ({
    studentId: 'dashboard-learner-' + kind, guardianId: 'dashboard-family-profile', isPrimary: 1 })));
  const classes = ['complete', 'missing', 'ambiguous', 'invalid', 'no-roster', 'family'];
  await db.insert(schema.classes).values(classes.map(kind => ({ id: 'dashboard-class-' + kind, schoolId: 'a', courseId: 'course-a',
    teacherId: 'dashboard-teacher', name: 'Synthetic dashboard ' + kind, term: 'Synthetic dashboard term', createdAt: stamp, updatedAt: stamp })));
  const pairs = [['zero', 'complete'], ['recorded', 'complete'], ['zero', 'missing'], ['pending', 'missing'],
    ['ambiguous', 'ambiguous'], ['invalid', 'invalid'], ['none', 'family'], ['excused', 'family'], ['attendance', 'family']];
  await db.insert(schema.enrolments).values(pairs.map(([learner, classroom]) => ({ id: 'dashboard-enrolment-' + learner + '-' + classroom,
    studentId: 'dashboard-learner-' + learner, classId: 'dashboard-class-' + classroom, status: 'active', enrolledAt: stamp, createdAt: stamp, updatedAt: stamp })));
  await db.insert(schema.assessments).values(classes.filter(kind => kind !== 'family').map(kind => ({ id: 'dashboard-assessment-' + kind,
    classId: 'dashboard-class-' + kind, title: 'Synthetic dashboard ' + kind + ' assessment', kind: 'quiz', maxScore: 10, date: '2026-10-05', createdAt: stamp, updatedAt: stamp })));
  const scores = [['complete', 'zero', 0], ['complete', 'recorded', 7], ['missing', 'zero', 0], ['ambiguous', 'ambiguous', 3],
    ['ambiguous', 'ambiguous', 4], ['invalid', 'invalid', 15]];
  await db.insert(schema.assessmentResults).values(scores.map(([assessment, learner, score], index) => ({ id: 'dashboard-result-' + index,
    assessmentId: 'dashboard-assessment-' + assessment, studentId: 'dashboard-learner-' + learner, score,
    grade: 'School supplied', feedback: 'Synthetic legacy evidence', createdAt: stamp, updatedAt: stamp })));
  const attendance = [['excused', '2026-10-01', 'excused', 'family'], ['excused', '2026-10-02', 'excused', 'family'],
    ['attendance', '2026-10-01', 'present', 'family'], ['attendance', '2026-10-02', 'absent', 'family'],
    ['attendance', '2026-10-03', 'late', 'family'], ['attendance', '2026-10-04', 'excused', 'family'],
    ['attendance', '2026-02-30', 'present', 'family'], ['zero', '2026-10-01', 'present', 'complete']];
  await db.insert(schema.attendance).values(attendance.map(([learner, date, status, classroom], index) => ({ id: 'dashboard-attendance-' + index,
    studentId: 'dashboard-learner-' + learner, classId: 'dashboard-class-' + classroom, date, status, recordedBy: 'dashboard-teacher', createdAt: stamp, updatedAt: stamp })));
  await db.insert(schema.reportCards).values([
    { id: 'dashboard-report-published', studentId: 'dashboard-learner-zero', term: 'Synthetic published dashboard term', summary: 'Synthetic published dashboard report', overallGrade: 'School supplied', publishedAt: stamp, createdAt: stamp, updatedAt: stamp },
    { id: 'dashboard-report-draft', studentId: 'dashboard-learner-zero', term: 'PRIVATE dashboard term', summary: 'PRIVATE dashboard summary', overallGrade: 'PRIVATE staff grade', createdAt: stamp, updatedAt: stamp },
  ]);
  const migrations = readdirSync(join(root, 'drizzle')).filter(file => /^\d.*\.sql$/.test(file)).sort();
  for (const file of migrations.slice(migrations.indexOf(boundary))) sqlite.exec(readFileSync(join(root, 'drizzle', file), 'utf8').replaceAll('--> statement-breakpoint', ''));
  const pairCount = sqlite.prepare('SELECT count(*) n FROM assessment_results WHERE assessment_id=? AND student_id=?').get('dashboard-assessment-ambiguous', 'dashboard-learner-ambiguous').n;
  if (pairCount !== 2 || sqlite.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Synthetic legacy fixture integrity failed');
  const sessionService = await load('lib/education/session.ts');
  const sessions = {};
  for (const id of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'guardian-a', 'student-user-a', ...actors.map(([id]) => id)]) sessions[id] = (await sessionService.createSession(id)).split(';')[0];
  const objects = sqlite.prepare("SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 WHEN 'trigger' THEN 3 ELSE 4 END,name").all();
  const statements = objects.filter(row => row.type !== 'trigger').map(row => row.sql + ';');
  const quote = value => value === null ? 'NULL' : typeof value === 'number' ? String(value) : "'" + String(value).replaceAll("'", "''") + "'";
  // D1 imports enforce foreign keys: preserve parent-before-child row ordering.
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
  writeFileSync(manifestPath, JSON.stringify({ synthetic: true, actors: actors.map(([id]) => id), schoolId: 'a',
    classIds: classes.map(kind => 'dashboard-class-' + kind), learnerIds: learners.map(kind => 'dashboard-learner-' + kind),
    assessmentIds: classes.filter(kind => kind !== 'family').map(kind => 'dashboard-assessment-' + kind),
    familyKinds: ['zero', 'none', 'excused', 'attendance'], originalLegacyDuplicateCount: pairCount }, null, 2) + '\n', { mode: 0o600 });
  console.log('Synthetic dashboard SQL, private sessions and manifest created; all final migrations/guards applied before test use.');
} finally { sqlite.close(); }
