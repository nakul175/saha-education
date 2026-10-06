// Synthetic reviewed-assessment, attendance and dashboard fixtures: legacy evidence is inserted BEFORE new pair
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
  // Reviewed attendance fixtures preserve pre-guard ambiguity and oversized rosters.
  await db.insert(schema.classes).values(['legacy', 'cap', 'long-note'].map(kind => ({
    id: 'attendance-review-' + kind + '-class', schoolId: 'a', courseId: 'course-a', teacherId: 'teacher-a',
    name: 'Synthetic reviewed attendance ' + kind, term: 'Synthetic term', createdAt: stamp, updatedAt: stamp,
  })));
  const reviewLearners = ['legacy', 'long-note', ...Array.from({ length: 101 }, (_, index) => 'cap-' + String(index).padStart(3, '0'))];
  await db.insert(schema.students).values(reviewLearners.map(kind => ({
    id: 'attendance-review-' + kind + '-student', schoolId: 'a', firstName: 'Synthetic reviewed attendance', lastName: kind,
    dateOfBirth: '2012-01-01', admissionNumber: 'AT-REVIEW-' + kind, gradeLevel: '8', createdAt: stamp, updatedAt: stamp,
  })));
  await db.insert(schema.enrolments).values(reviewLearners.map(kind => ({
    id: 'attendance-review-' + kind + '-enrolment', studentId: 'attendance-review-' + kind + '-student',
    classId: 'attendance-review-' + (kind.startsWith('cap-') ? 'cap' : kind) + '-class', status: 'active',
    enrolledAt: stamp, createdAt: stamp, updatedAt: stamp,
  })));
  await db.insert(schema.enrolments).values({ id: 'attendance-review-legacy-second-enrolment',
    studentId: 'attendance-review-legacy-student', classId: 'attendance-review-legacy-class', status: 'active',
    enrolledAt: stamp, createdAt: stamp, updatedAt: stamp });
  await db.insert(schema.attendance).values({ id: 'attendance-review-long-note-record',
    classId: 'attendance-review-long-note-class', studentId: 'attendance-review-long-note-student', date: '2026-10-05',
    status: 'absent', note: 'Synthetic preserved long note ' + 'x'.repeat(2200), recordedBy: 'teacher-a', createdAt: stamp, updatedAt: stamp });
  // Preserve synthetic legacy evidence before all final pair guards are installed.
  const assessmentKinds = ['legacy-result', 'historical-result', 'long-text'];
  await db.insert(schema.classes).values(assessmentKinds.map(kind => ({ id: 'assessment-review-' + kind + '-class',
    schoolId: 'a', courseId: 'course-a', teacherId: 'teacher-a', name: 'Synthetic reviewed assessment ' + kind,
    term: 'Synthetic term', createdAt: stamp, updatedAt: stamp })));
  const assessmentLearners = [['legacy-result', 'active'], ['legacy-other', 'active'], ['historical-result', 'withdrawn'], ['historical-active', 'active'], ['long-text', 'active']];
  await db.insert(schema.students).values(assessmentLearners.map(([kind]) => ({ id: 'assessment-review-' + kind + '-student',
    schoolId: 'a', firstName: 'Synthetic reviewed assessment', lastName: kind, dateOfBirth: '2012-01-01',
    admissionNumber: 'AS-REVIEW-' + kind, gradeLevel: '8', createdAt: stamp, updatedAt: stamp })));
  const assessmentClassKind = kind => kind === 'legacy-other' ? 'legacy-result' : kind === 'historical-active' ? 'historical-result' : kind;
  await db.insert(schema.enrolments).values(assessmentLearners.map(([kind, status]) => ({ id: 'assessment-review-' + kind + '-enrolment',
    studentId: 'assessment-review-' + kind + '-student', classId: 'assessment-review-' + assessmentClassKind(kind) + '-class',
    status, enrolledAt: stamp, createdAt: stamp, updatedAt: stamp })));
  const assessmentFixtureRows = [...assessmentKinds.map(kind => [kind, 'assessment-review-' + kind + '-class', '2026-10-05']),
    ['cap', 'attendance-review-cap-class', '2026-10-05'], ['legacy-enrolment', 'attendance-review-legacy-class', '2026-10-05'],
    ['invalid-max', 'class-a', '2026-10-05'], ['invalid-date', 'class-a', 'not-a-calendar-date'], ['impossible-date', 'class-a', '2026-02-30'],
    ['invalid-score', 'class-a', '2026-10-05'], ['real-score', 'class-a', '2026-10-05'],
    ['served-invalid-score', 'class-a', '2026-10-05'], ['served-real-score', 'class-a', '2026-10-05'],
    ['unsafe-score', 'class-a', '2026-10-05'], ['unsafe-max', 'class-a', '2026-10-05'],
    ['nonfinite-score', 'class-a', '2026-10-05'], ['nonfinite-max', 'class-a', '2026-10-05']];
  await db.insert(schema.assessments).values(assessmentFixtureRows.map(([kind, classId, date]) => ({ id: 'assessment-review-' + kind + '-assessment',
    classId, title: 'Synthetic reviewed assessment ' + kind, kind: 'quiz', maxScore: 20, date, createdAt: stamp, updatedAt: stamp })));
  const duplicateResults = [['legacy-result', 'legacy-result', 3], ['legacy-result', 'legacy-result', 4],
    ['historical-result', 'historical-result', 5], ['historical-result', 'historical-result', 6]];
  await db.insert(schema.assessmentResults).values(duplicateResults.map(([assessment, learner, score], index) => ({
    id: 'assessment-review-duplicate-' + index, assessmentId: 'assessment-review-' + assessment + '-assessment',
    studentId: 'assessment-review-' + learner + '-student', score, grade: 'Synthetic school supplied',
    feedback: 'Synthetic preserved legacy evidence', createdAt: stamp, updatedAt: stamp })));
  await db.insert(schema.assessmentResults).values({ id: 'assessment-review-long-text-record', assessmentId: 'assessment-review-long-text-assessment',
    studentId: 'assessment-review-long-text-student', score: 0, grade: 'Synthetic preserved school grade ' + 'g'.repeat(2200),
    feedback: 'Synthetic preserved educator feedback ' + 'f'.repeat(2200), createdAt: stamp, updatedAt: stamp });
  sqlite.prepare('UPDATE assessments SET max_score=? WHERE id=?').run('Synthetic malformed legacy maximum', 'assessment-review-invalid-max-assessment');
  await db.insert(schema.assessmentResults).values(['invalid-score', 'real-score', 'served-invalid-score', 'served-real-score'].map(kind => ({
    id: 'assessment-review-' + kind + '-record', assessmentId: 'assessment-review-' + kind + '-assessment',
    studentId: 'student-a', score: 0, grade: null, feedback: '', createdAt: stamp, updatedAt: stamp })));
  sqlite.prepare('UPDATE assessment_results SET score=? WHERE id=?').run('Synthetic malformed legacy score', 'assessment-review-invalid-score-record');
  sqlite.prepare('UPDATE assessment_results SET score=? WHERE id=?').run(1.5, 'assessment-review-real-score-record');
  sqlite.prepare('UPDATE assessment_results SET score=? WHERE id=?').run('Synthetic malformed served legacy score', 'assessment-review-served-invalid-score-record');
  sqlite.prepare('UPDATE assessment_results SET score=? WHERE id=?').run(1.5, 'assessment-review-served-real-score-record');
  await db.insert(schema.assessmentResults).values({ id: 'assessment-review-unsafe-score-record', assessmentId: 'assessment-review-unsafe-score-assessment',
    studentId: 'student-a', score: 0, grade: null, feedback: null, createdAt: stamp, updatedAt: stamp });
  sqlite.prepare('UPDATE assessment_results SET score=? WHERE id=?').run(9007199254740993n, 'assessment-review-unsafe-score-record');
  sqlite.prepare('UPDATE assessments SET max_score=? WHERE id=?').run(9007199254740993n, 'assessment-review-unsafe-max-assessment');
  await db.insert(schema.assessmentResults).values({ id: 'assessment-review-nonfinite-score-record', assessmentId: 'assessment-review-nonfinite-score-assessment',
    studentId: 'student-a', score: 0, grade: null, feedback: null, createdAt: stamp, updatedAt: stamp });
  sqlite.prepare('UPDATE assessment_results SET score=? WHERE id=?').run(Infinity, 'assessment-review-nonfinite-score-record');
  sqlite.prepare('UPDATE assessments SET max_score=? WHERE id=?').run(Infinity, 'assessment-review-nonfinite-max-assessment');
  const migrations = readdirSync(join(root, 'drizzle')).filter(file => /^\d.*\.sql$/.test(file)).sort();
  for (const file of migrations.slice(migrations.indexOf(boundary))) sqlite.exec(readFileSync(join(root, 'drizzle', file), 'utf8').replaceAll('--> statement-breakpoint', ''));
  const pairCount = sqlite.prepare('SELECT count(*) n FROM assessment_results WHERE assessment_id=? AND student_id=?').get('dashboard-assessment-ambiguous', 'dashboard-learner-ambiguous').n;
  if (pairCount !== 2 || sqlite.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Synthetic legacy fixture integrity failed');
  const sessionService = await load('lib/education/session.ts');
  const sessions = {};
  for (const id of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'guardian-a', 'student-user-a', ...actors.map(([id]) => id)]) sessions[id] = (await sessionService.createSession(id)).split(';')[0];
  const objects = sqlite.prepare("SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 WHEN 'trigger' THEN 3 ELSE 4 END,name").all();
  const statements = objects.filter(row => row.type !== 'trigger').map(row => row.sql + ';');
  const quote = value => value === null ? 'NULL' : typeof value === 'bigint' ? String(value)
    : typeof value === 'number' ? Number.isFinite(value) ? String(value) : value > 0 ? '9e999' : '-9e999'
      : "'" + String(value).replaceAll("'", "''") + "'";
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
  for (const row of orderedTables) {
    const statement = sqlite.prepare('SELECT * FROM "' + row.name.replaceAll('"', '""') + '"');
    statement.setReadBigInts(true);
    for (const record of statement.all()) {
      statements.push('INSERT INTO "' + row.name.replaceAll('"', '""') + '" (' + Object.keys(record).map(key => '"' + key.replaceAll('"', '""') + '"').join(',') + ') VALUES (' + Object.values(record).map(quote).join(',') + ');');
    }
  }
  // Import original rows before restoring the exact final trigger definitions.
  statements.push(...objects.filter(row => row.type === 'trigger').map(row => row.sql + ';'));
  writeFileSync(sqlPath, statements.join('\n') + '\n', { mode: 0o600 });
  writeFileSync(sessionPath, JSON.stringify(sessions), { mode: 0o600 });
  writeFileSync(manifestPath, JSON.stringify({ synthetic: true, actors: actors.map(([id]) => id), schoolId: 'a',
    classIds: classes.map(kind => 'dashboard-class-' + kind), learnerIds: learners.map(kind => 'dashboard-learner-' + kind),
    assessmentIds: classes.filter(kind => kind !== 'family').map(kind => 'dashboard-assessment-' + kind),
    familyKinds: ['zero', 'none', 'excused', 'attendance'], originalLegacyDuplicateCount: pairCount,
    assessmentReview: { assessmentIds: assessmentFixtureRows.map(([kind]) => 'assessment-review-' + kind + '-assessment'), capActivePupils: 101 },
    attendanceReview: { legacyClassId: 'attendance-review-legacy-class', capClassId: 'attendance-review-cap-class', longNoteClassId: 'attendance-review-long-note-class', capActivePupils: 101 } }, null, 2) + '\n', { mode: 0o600 });
  console.log('Synthetic assessment SQL, private sessions and manifest created; all final migrations/guards applied before test use.');
} finally { sqlite.close(); }
