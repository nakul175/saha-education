// Actual migrated SQLite + opaque sessions and the production Drizzle D1
// prepared driver. These synthetic checks exercise recording completeness,
// unchanged family scope and one bounded, coherent dashboard read.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { drizzle as sqliteDrizzle } from 'drizzle-orm/sqlite-proxy';
import { freshDatabase, seedSecurityData, load, stamp } from '../support/security-db.mjs';

const dashboard = await load('lib/education/dashboard.ts');
const sessions = await load('lib/education/session.ts');
const assessmentService = await load('lib/education/assessments.ts');
const data = freshDatabase();
await seedSecurityData(data.db, data.schema);
const { sqlite, db, schema } = data;
const actors = {};
for (const [id, role] of [['admin-a', 'admin'], ['teacher-a', 'teacher'], ['guardian-a', 'guardian'], ['student-user-a', 'student']]) {
  const cookie = (await sessions.createSession(id)).split(';')[0];
  const principal = await sessions.principalForToken(cookie.slice(cookie.indexOf('=') + 1));
  assert.equal(principal.role, role);
  actors[role] = principal;
}
let checks = 0;
function check(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
async function snapshot(role) { return dashboard.getRoleDashboard(actors[role]); }
function coverage(view) { return view.assessments.items.find(row => row.id === 'assessment-a').coverage; }
async function isolated(action) {
  sqlite.exec('SAVEPOINT dashboard_case');
  try { await action(); }
  finally { globalThis.__sahaTestDb = db; sqlite.exec('ROLLBACK TO dashboard_case; RELEASE dashboard_case'); }
}
const studentInsert = sqlite.prepare(`INSERT INTO students
  (id,school_id,first_name,last_name,date_of_birth,admission_number,grade_level,created_at,updated_at)
  VALUES (?,? ,?,'Synthetic','2012-01-01',?,'8',?,?)`);
const enrolmentInsert = sqlite.prepare(`INSERT INTO enrolments
  (id,student_id,class_id,status,enrolled_at,created_at,updated_at) VALUES (?,?,?,'active',?,?,?)`);
const resultInsert = sqlite.prepare(`INSERT INTO assessment_results
  (id,assessment_id,student_id,score,grade,feedback,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`);
const attendanceInsert = sqlite.prepare(`INSERT INTO attendance
  (id,class_id,student_id,date,status,note,recorded_by,created_at,updated_at) VALUES (?,?,?,?,?,'Private note','teacher-a',?,?)`);
function addResult(id, studentId, score, assessmentId = 'assessment-a') {
  resultInsert.run(id, assessmentId, studentId, score, 'Private supplied grade', 'Private feedback', stamp, stamp);
}
const originalFetch = globalThis.fetch;
let externalCalls = 0;
globalThis.fetch = async () => { externalCalls++; throw new Error('Dashboard verification is local synthetic only'); };
let legacy;
try {
  check(dashboard.DASHBOARD_LIMITS, { classes: 100, assessments: 100, profiles: 50, reports: 20 }, 'Displayed bounds are explicit');
  let view = await snapshot('admin');
  check(view.counts, { students: 2, courses: 1, classes: 2, enabledMappedTeachers: 2 }, 'Administrator counts only own-school records');
  check(view.school, { id: 'a', name: 'Synthetic school a' }, 'Administrator identifies the current school');
  check(Object.keys(view).sort(), ['asOf', 'counts', 'role', 'school', 'schoolId'], 'Administrator receives only dashboard projection');
  check(new Date(view.asOf).toISOString(), view.asOf, 'Read cutoff is canonical SQL UTC time');
  await isolated(async () => {
    sqlite.exec("UPDATE users SET identity_subject=NULL WHERE id='teacher-other'");
    check((await snapshot('admin')).counts.enabledMappedTeachers, 1, 'Unmapped enabled teacher is excluded from eligible account count');
    sqlite.exec("UPDATE users SET disabled_at='synthetic' WHERE id='teacher-a'");
    check((await snapshot('admin')).counts.enabledMappedTeachers, 0, 'Disabled teacher is excluded');
  });

  view = await snapshot('teacher');
  check(view.classes.items.map(row => row.id), ['class-a'], 'Teacher sees assigned classes only');
  check(view.classes.items[0].courseTitle, 'Synthetic math', 'Current same-school course title is projected');
  check(view.classes.items[0].activeStudents, 1, 'Class counts distinct active current-school learners');
  check(coverage(view), { state: 'missing-results', activeStudents: 1, recordedStudents: 0, missingStudents: 1,
    ambiguousEnrolmentStudents: 0, ambiguousResultStudents: 0, invalidResultStudents: 0, invalidMaximum: false }, 'An actually missing result is described as missing');
  // The existing result service owns an atomic batch transaction, so invoke it
  // outside the per-case savepoint rather than nesting that test adapter batch.
  await assessmentService.recordResults(actors.teacher, 'assessment-a', [{ studentId: 'student-a', score: 0 }]);
  await isolated(async () => {
    check(coverage(await snapshot('teacher')).state, 'recorded-for-current-roster', 'A saved zero is recorded, not missing');
    check(coverage(await snapshot('teacher')).recordedStudents, 1, 'Unique valid zero counts exactly once');
    sqlite.exec("UPDATE assessments SET max_score=0 WHERE id='assessment-a'");
    view = await snapshot('teacher');
    check(view.assessments.items[0].maxScore, 0, 'Existing zero maximum is preserved');
    check(coverage(view).state, 'recorded-for-current-roster', 'Zero against zero maximum remains valid existing behavior');
  });
  sqlite.exec("DELETE FROM assessment_results WHERE assessment_id='assessment-a' AND student_id='student-a'");
  await isolated(async () => {
    enrolmentInsert.run('other-in-class-a', 'student-other', 'class-a', stamp, stamp, stamp);
    addResult('saved-a', 'student-a', 20);
    view = await snapshot('teacher');
    check(coverage(view).activeStudents, 2, 'An additional current learner expands the expected roster');
    check(coverage(view).recordedStudents, 1, 'Partial recording is measured from saved unique result pairs');
    check(coverage(view).missingStudents, 1, 'Only missing learner pair is counted');
    check(coverage(view).state, 'missing-results', 'Partial coverage remains visibly incomplete');
    addResult('saved-other', 'student-other', 0);
    check(coverage(await snapshot('teacher')).state, 'recorded-for-current-roster', 'All expected valid pairs are explicitly recorded');
  });
  await isolated(async () => {
    sqlite.exec("UPDATE enrolments SET status='withdrawn' WHERE id='student-a-enrolment'");
    addResult('historical-a', 'student-a', 20);
    view = await snapshot('teacher');
    check(coverage(view).state, 'no-current-roster', 'Historical scores do not imply a current roster');
    check(coverage(view).activeStudents, 0, 'Withdrawn learner is absent from expected active roster');
    check(coverage(view).recordedStudents, 0, 'Historical result does not inflate current coverage');
    check(sqlite.prepare("SELECT score FROM assessment_results WHERE id='historical-a'").get().score, 20, 'Historical evidence remains unchanged');
  });
  for (const score of [-1, 21, 1.5, 'legacy invalid score']) await isolated(async () => {
    addResult('invalid-a', 'student-a', score);
    const result = coverage(await snapshot('teacher'));
    check(result.state, 'needs-review', `Invalid legacy score ${score} cannot claim completion`);
    check(result.invalidResultStudents, 1, 'Invalid saved pair is explicit');
    check(result.recordedStudents, 0, 'Invalid result is never counted as valid recorded coverage');
    check(result.missingStudents, 0, 'Existing invalid evidence is not falsely labelled absent');
  });
  for (const maximum of [-1, 20.5, 'legacy invalid maximum', 9007199254740992]) await isolated(async () => {
    sqlite.prepare("UPDATE assessments SET max_score=? WHERE id='assessment-a'").run(maximum);
    addResult('invalid-max-a', 'student-a', 0);
    view = await snapshot('teacher');
    check(coverage(view).invalidMaximum, true, 'Invalid/unrepresentable stored maximum is explicit');
    check(coverage(view).state, 'needs-review', 'Invalid maximum prevents a coverage-complete claim');
    check(view.assessments.items[0].maxScore, null, 'Invalid maximum is unavailable, not a fabricated numeric value');
    check(coverage(view).recordedStudents, 0, 'No valid score basis is invented for invalid maximum');
  });
  await isolated(async () => {
    addResult('unrelated-school', 'student-b', 20);
    addResult('unrelated-class', 'student-other', 20);
    check(coverage(await snapshot('teacher')).recordedStudents, 0, 'Foreign and out-of-roster result rows never inflate coverage');
    check(coverage(await snapshot('teacher')).missingStudents, 1, 'Current expected learner remains missing');
  });
  await isolated(async () => {
    sqlite.exec("UPDATE courses SET school_id='b' WHERE id='course-a'");
    check((await snapshot('teacher')).classes.items[0].courseTitle, null, 'Moved course name is not disclosed through stale class reference');
  });

  for (const role of ['guardian', 'student']) {
    view = await snapshot(role);
    check(view.profiles.items.map(row => row.id), ['student-a'], `${role} sees only current explicit linked profile`);
    const profile = view.profiles.items[0];
    check(profile.attendance, { recordedRows: 0, counts: { present: 0, absent: 0, late: 0, excused: 0, other: 0 },
      firstDate: null, lastDate: null, invalidDateRows: 0 }, 'Absent attendance has zero observed rows and no date range');
    check(profile.reports.total, 1, 'Only published report counts are exposed');
    check(profile.reports.items.map(report => report.id), ['published-a'], 'Draft and foreign reports remain absent');
    check(Object.keys(profile).sort(), ['admissionNumber', 'attendance', 'firstName', 'id', 'lastName', 'reports'], 'Profile excludes birth date/account binding');
    check(Object.keys(profile.reports.items[0]).sort(), ['id', 'overallGrade', 'publishedAt', 'term'], 'Published summary excludes private summary and unrelated fields');
    check(Object.hasOwn(profile.attendance, 'percentage'), false, 'No attendance percentage or denominator policy is invented');
  }
  await isolated(async () => {
    const rows = [['2026-10-01', 'present'], ['2026-10-02', 'absent'], ['2026-10-03', 'late'], ['2026-10-04', 'excused'],
      ['2026-10-05', 'legacy unknown'], ['2026-02-30', 'present'], ['not a date', 'excused']];
    for (const [index, [date, status]] of rows.entries()) attendanceInsert.run('attendance-'+index, 'class-a', 'student-a', date, status, stamp, stamp);
    enrolmentInsert.run('a-other-class', 'student-a', 'class-other', stamp, stamp, stamp);
    attendanceInsert.run('same-date-second-class', 'class-other', 'student-a', '2026-10-01', 'present', stamp, stamp);
    attendanceInsert.run('foreign-class', 'class-b', 'student-a', '2026-10-01', 'present', stamp, stamp);
    const stats = (await snapshot('guardian')).profiles.items[0].attendance;
    check(stats.recordedRows, 8, 'Attendance counts observed class sessions, not inferred calendar days; foreign class denied');
    check(stats.counts, { present: 3, absent: 1, late: 1, excused: 2, other: 1 }, 'Every stored status contributes honestly including unrecognized status');
    check(stats.firstDate, '2026-10-01', 'Date coverage starts at first real calendar date');
    check(stats.lastDate, '2026-10-05', 'Invalid lexical dates cannot distort observed date range');
    check(stats.invalidDateRows, 2, 'Malformed and noncalendar dates are explicitly counted');
    check(JSON.stringify(stats).includes('Private note'), false, 'Attendance notes remain private');
    sqlite.exec("UPDATE enrolments SET status='withdrawn' WHERE student_id='student-a'");
    check((await snapshot('guardian')).profiles.items[0].attendance.recordedRows, 0, 'Existing family class eligibility remains enforced after complete withdrawal');
    check((await snapshot('guardian')).profiles.items[0].reports.total, 1, 'Profile-linked publication policy remains separate from active class attendance');
  });
  await isolated(async () => {
    attendanceInsert.run('excused-only', 'class-a', 'student-a', '2026-10-05', 'excused', stamp, stamp);
    check((await snapshot('guardian')).profiles.items[0].attendance.counts.excused, 1, 'Excused-only observations remain visible as their actual status');
  });
  await isolated(async () => {
    sqlite.exec("DELETE FROM student_guardians WHERE student_id='student-a' AND guardian_id='guardian-profile-a'");
    check((await snapshot('guardian')).profiles, { items: [], total: 0, limit: 50, truncated: false }, 'Missing explicit relationship produces an honest empty linked-profile view');
    sqlite.exec("UPDATE students SET user_id=NULL WHERE id='student-a'");
    check((await snapshot('student')).profiles.total, 0, 'Unlinked student does not acquire fabricated profile or published reports');
  });

  // Each cap applies only to the displayed set; exact total is never capped.
  await isolated(async () => {
    const classInsert = sqlite.prepare(`INSERT INTO classes(id,school_id,course_id,teacher_id,name,term,created_at,updated_at)
      VALUES (?,'a','course-a','teacher-a',?,'Synthetic T1',?,?)`);
    const assessmentInsert = sqlite.prepare(`INSERT INTO assessments(id,class_id,title,kind,max_score,date,created_at,updated_at)
      VALUES (?,'class-a',?,'quiz',20,'2026-10-05',?,?)`);
    for (let i = 0; i < 100; i++) {
      const suffix = String(i).padStart(3, '0');
      classInsert.run('synthetic-class-'+suffix, 'Synthetic '+suffix, stamp, stamp);
      assessmentInsert.run('synthetic-assessment-'+suffix, 'Synthetic '+suffix, stamp, stamp);
    }
    view = await snapshot('teacher');
    for (const key of ['classes', 'assessments']) {
      check(view[key].total, 101, `${key} exact total includes rows beyond cap`);
      check(view[key].items.length, 100, `${key} displayed list remains bounded`);
      check(view[key].truncated, true, `${key} displays truncation honestly`);
      check(new Set(view[key].items.map(row => row.id)).size, 100, `${key} includes no multiplied duplicate cards`);
    }
    check((await snapshot('admin')).counts.classes, 102, 'Admin class total is exact, not the teacher display length');
    check((await snapshot('teacher')).classes.items.map(row => row.id), view.classes.items.map(row => row.id), 'Bounded class ordering is deterministic');
    sqlite.exec("DELETE FROM assessments WHERE id='synthetic-assessment-099'; DELETE FROM classes WHERE id='synthetic-class-099'");
    view = await snapshot('teacher');
    check(view.classes.truncated, false, 'Exactly at cap is not falsely truncated');
    check(view.assessments.truncated, false, 'Assessment cap boundary is precise');
  });
  await isolated(async () => {
    const linkInsert = sqlite.prepare("INSERT INTO student_guardians(student_id,guardian_id,is_primary) VALUES (?,'guardian-profile-a',1)");
    for (let i = 0; i < 50; i++) {
      const id = 'synthetic-profile-'+String(i).padStart(3, '0');
      studentInsert.run(id, 'a', id, id, stamp, stamp); linkInsert.run(id);
    }
    const reportInsert = sqlite.prepare(`INSERT INTO report_cards(id,student_id,term,summary,overall_grade,published_at,created_at,updated_at)
      VALUES (?,'student-a',?,'Private summary',?,?,?,?)`);
    const literal = 'Synthetic "quoted" \\ text <script> Ω 😊';
    sqlite.prepare("UPDATE students SET last_name=? WHERE id='student-a'").run(literal);
    for (let i = 0; i < 20; i++) reportInsert.run('synthetic-report-'+String(i).padStart(3, '0'), literal, literal, stamp, stamp, stamp);
    view = await snapshot('guardian');
    check(view.profiles.total, 51, 'Guardian profile total remains exact beyond cap');
    check(view.profiles.items.length, 50, 'Guardian profile display is bounded');
    check(view.profiles.truncated, true, 'Profile truncation is explicit');
    const profile = view.profiles.items.find(row => row.id === 'student-a');
    check(profile.lastName, literal, 'JSON retains quoted, backslash, Unicode and HTML as literal text');
    check(profile.reports.total, 21, 'Published total remains exact beyond per-profile cap');
    check(profile.reports.items.length, 20, 'Per-profile reports remain bounded');
    check(profile.reports.truncated, true, 'Report truncation is explicit');
    check(profile.reports.items[0].id, 'synthetic-report-019', 'Same publication timestamp uses deterministic ID tie-break');
    check(profile.reports.items[0].overallGrade, literal, 'Stored grade remains literal, without calculated/normalized grading');
    check(JSON.stringify(view).includes('Private summary'), false, 'Draft/private report summary never enters the dashboard');
    check((await snapshot('student')).profiles.total, 1, 'Student cannot inherit guardian profile inventory');
  });

  // Real pre-0009 duplicate evidence, followed by every remaining migration.
  // No guard is removed from the current database to manufacture this state.
  const legacySqlite = new DatabaseSync(':memory:');
  legacySqlite.exec('PRAGMA foreign_keys=ON');
  const migrations = readdirSync(new URL('../../drizzle/', import.meta.url)).filter(file => /^\d.*\.sql$/.test(file)).sort();
  const apply = file => legacySqlite.exec(readFileSync(new URL('../../drizzle/'+file, import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', ''));
  for (const file of migrations.filter(file => Number(file.slice(0, 4)) < 9)) apply(file);
  const legacyDb = sqliteDrizzle(async (query, parameters, method) => {
    const statement = legacySqlite.prepare(query);
    if (method === 'run') { statement.run(...parameters); return { rows: [] }; }
    statement.setReturnArrays(true);
    return { rows: method === 'get' ? statement.get(...parameters) : statement.all(...parameters) };
  }, { schema });
  legacy = { sqlite: legacySqlite, db: legacyDb };
  globalThis.__sahaTestDb = legacyDb;
  await seedSecurityData(legacyDb, schema);
  legacySqlite.prepare(`INSERT INTO enrolments(id,student_id,class_id,status,enrolled_at,created_at,updated_at)
    VALUES ('legacy-enrolment','student-a','class-a','withdrawn',?,?,?)`).run(stamp, stamp, stamp);
  legacySqlite.prepare(`INSERT INTO assessment_results(id,assessment_id,student_id,score,grade,created_at,updated_at)
    VALUES (?,'assessment-a','student-a',?,'Legacy supplied',?,?)`).run('legacy-result-one', 0, stamp, stamp);
  legacySqlite.prepare(`INSERT INTO assessment_results(id,assessment_id,student_id,score,grade,created_at,updated_at)
    VALUES (?,'assessment-a','student-a',?,'Legacy supplied',?,?)`).run('legacy-result-two', 20, stamp, stamp);
  const legacyRows = ['enrolments', 'assessment_results'].map(table => legacySqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
  for (const file of migrations.filter(file => Number(file.slice(0, 4)) >= 9)) apply(file);
  check(await snapshot('teacher'), null, 'A principal resolved in the original database cannot authorize a separate legacy fixture without its exact session');
  const legacyCookie = (await sessions.createSession('teacher-a')).split(';')[0];
  const legacyTeacher = await sessions.principalForToken(legacyCookie.slice(legacyCookie.indexOf('=') + 1));
  check(legacyTeacher?.id, 'teacher-a', 'The separate migrated legacy fixture resolves its own real current teacher session');
  view = await dashboard.getRoleDashboard(legacyTeacher);
  check(coverage(view).activeStudents, 1, 'Legacy enrolments never multiply distinct active pupils');
  check(coverage(view).ambiguousEnrolmentStudents, 1, 'Active+withdrawn duplicate pair remains review evidence');
  check(coverage(view).ambiguousResultStudents, 1, 'Duplicate result pair is explicitly ambiguous');
  check(coverage(view).recordedStudents, 0, 'Neither duplicate score is arbitrarily chosen');
  check(coverage(view).missingStudents, 0, 'Duplicate existing results are not falsely absent');
  check(coverage(view).state, 'needs-review', 'Ambiguous historical records never claim completion');
  check(['enrolments', 'assessment_results'].map(table => legacySqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all()), legacyRows,
    'Migration and dashboard reads preserve every confirmed legacy field and row');
  assert.throws(() => legacySqlite.prepare(`INSERT INTO assessment_results(id,assessment_id,student_id,score,created_at,updated_at)
    VALUES ('denied-new-duplicate','assessment-a','student-a',0,?,?)`).run(stamp, stamp), /saha_result_pair_conflict/); checks++;
  globalThis.__sahaTestDb = db;

  // Production Drizzle D1 mapping, bind limits and actual awaited SQL cutoff.
  const { drizzle: d1Drizzle } = await import('drizzle-orm/d1');
  let executed = 0; let bindingCount = 0; let changeBeforeExecution;
  function prepared(query, parameters = []) {
    return {
      bind(...values) { bindingCount = Math.max(bindingCount, values.length); return prepared(query, values); },
      async raw() {
        executed++; const change = changeBeforeExecution; changeBeforeExecution = undefined; change?.();
        const statement = sqlite.prepare(query); statement.setReturnArrays(true); return statement.all(...parameters);
      },
      async all() { executed++; return { success: true, results: sqlite.prepare(query).all(...parameters), meta: {} }; },
    };
  }
  const d1Db = d1Drizzle({ prepare: prepared }, { schema });
  globalThis.__sahaTestDb = d1Db;
  for (const role of ['admin', 'teacher', 'guardian', 'student']) {
    const before = executed; view = await snapshot(role);
    check(executed - before, 1, `${role} dashboard executes exactly one actual D1 prepared SELECT`);
    check(view.role, role, `${role} D1 response maps role correctly`);
    const list = role === 'teacher' ? view.assessments : role === 'admin' ? null : view.profiles;
    if (list) check(typeof list.items[0], 'object', 'Nested JSON remains objects rather than serialized strings on D1 driver');
  }
  check(bindingCount <= 100, true, 'Every snapshot remains below D1 maximum bound-parameter count');
  changeBeforeExecution = () => sqlite.exec("UPDATE users SET disabled_at='synthetic' WHERE id='admin-a'");
  check(await snapshot('admin'), null, 'Actor revoked immediately before actual SELECT yields denial, not zero aggregate row');
  sqlite.exec("UPDATE users SET disabled_at=NULL WHERE id='admin-a'");
  changeBeforeExecution = () => sqlite.exec("UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'");
  view = await snapshot('teacher');
  check(view.classes.total, 0, 'Actual SQL cutoff observes current class assignment');
  check(view.assessments.total, 0, 'Class and assessment data disappear together in one snapshot');
  check(JSON.stringify(view).includes('class-a'), false, 'No cached former class name or ID survives the cutoff');
  sqlite.exec("UPDATE classes SET teacher_id='teacher-a' WHERE id='class-a'");
  globalThis.__sahaTestDb = db;
  for (const principal of [{ id: 'admin-a', role: 'admin' }, { id: '', role: 'admin', schoolId: 'a' }, { id: 'admin-a', role: 'unknown', schoolId: 'a' }]) {
    await assert.rejects(dashboard.getRoleDashboard(principal), /School access required/); checks++;
  }
  check(externalCalls, 0, 'All checks remain local synthetic without provider calls or recipients');
  console.log(`Dashboard contract: ${checks} checks passed (actual sessions/SQLite, legacy preservation, bounded coherent views and production D1 prepared driver; synthetic only).`);
  console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0 }));
} finally { globalThis.__sahaTestDb = db; globalThis.fetch = originalFetch; legacy?.sqlite.close(); sqlite.close(); }
