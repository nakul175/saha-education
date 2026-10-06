// FR-06 student records: scoped directory/search, version-checked edit, deactivate/reactivate with history.
// Actual synthetic opaque sessions, route handlers and production Drizzle D1 over the final migrated SQLite (0017).
import { counters, recordScenario, stamp } from '../support/records-harness.mjs';
const state = counters();
const oldFetch = globalThis.fetch;
globalThis.fetch = async () => { state.externalRequests++; throw new Error('Student record contracts remain offline and synthetic'); };
const scenario = (name, action) => recordScenario(state, name, action);
const edit = (student, override = {}) => ({ firstName: student.firstName, lastName: student.lastName, dateOfBirth: student.dateOfBirth, admissionNumber: student.admissionNumber, gradeLevel: student.gradeLevel, expectedUpdatedAt: student.updatedAt, ...override });
const status = (action, expectedVersion = 0, override = {}) => ({ action, reason: 'Synthetic administrator review of this record', expectedVersion, clientRequestId: crypto.randomUUID(), ...override });
const addStudents = (sqlite, items) => { for (const [id, first, last, admission, grade, school = 'a'] of items) sqlite.prepare('INSERT INTO students (id,user_id,school_id,first_name,last_name,date_of_birth,admission_number,grade_level,created_at,updated_at) VALUES (?,NULL,?,?,?,?,?,?,?,?)').run(id, school, first, last, '2011-05-05', admission, grade, stamp, stamp); };
const names = body => body.items.map(item => item.id);

try {
  await scenario('directory is scoped per role, searchable, filterable and paged', async ({ get, check, okay, sqlite }) => {
    addStudents(sqlite, [['s-ana', 'Ana', 'Zed', 'ADM-001', '7'], ['s-bo', 'Bo', 'Yan', 'ADM-002', '7'], ['s-cy', 'Cy', 'Xu', 'ADM-003', '9'], ['s-foreign', 'Ana', 'Zed', 'ADM-900', '7', 'b']]);
    const all = await get('/api/records/students?status=all', 'admin-a');
    check(all.status, 200, 'Administrator reads the directory'); check(all.body.total, 5, 'Own school only: three added plus two seeded students'); check(names(all.body).includes('s-foreign'), false, 'Another school never appears');
    check(Object.keys(all.body).sort(), ['grades', 'items', 'limit', 'offset', 'total'], 'Directory DTO shape'); check(all.body.grades, ['7', '8', '9'], 'Grade choices come from the visible scope');
    check(Object.keys(all.body.items[0]).sort(), ['admissionNumber', 'createdAt', 'dateOfBirth', 'firstName', 'gradeLevel', 'id', 'lastName', 'schoolId', 'status', 'statusChangedAt', 'statusVersion', 'updatedAt', 'userId'], 'Record DTO shape');
    check(names(await get('/api/records/students?status=all&q=ana', 'admin-a').then(r => r.body)), ['s-ana'], 'Name search is case-insensitive and school-bound');
    check(names(await get('/api/records/students?status=all&q=ADM-002', 'admin-a').then(r => r.body)), ['s-bo'], 'Admission-number search');
    check(names(await get('/api/records/students?status=all&q=zed%20ana', 'admin-a').then(r => r.body)), ['s-ana'], 'Every search word must match');
    check((await get('/api/records/students?status=all&q=%25', 'admin-a')).body.total, 0, 'A percent sign is literal text, not a wildcard');
    check((await get('/api/records/students?status=all&q=_', 'admin-a')).body.total, 0, 'An underscore is literal text, not a wildcard');
    check(names((await get('/api/records/students?status=all&grade=9', 'admin-a')).body), ['s-cy'], 'Grade filter');
    const page = await get('/api/records/students?status=all&limit=2&offset=2', 'admin-a'); check([page.body.items.length, page.body.total, page.body.offset], [2, 5, 2], 'Paging reports an honest total');
    check((await get('/api/records/students?status=all&limit=2&offset=4', 'admin-a')).body.items.length, 1, 'Last page is short');
    check((await get('/api/records/students?status=all', 'admin-b')).body.items.map(item => item.id).sort(), ['s-foreign', 'student-b'], 'The other administrator sees only school B');
    check(names((await get('/api/records/students?status=all', 'teacher-a')).body), ['student-a'], 'Teacher sees only students of assigned classes');
    check(names((await get('/api/records/students?status=all', 'guardian-a')).body), ['student-a'], 'Guardian sees only linked children');
    check(names((await get('/api/records/students?status=all', 'student-user-a')).body), ['student-a'], 'Student sees only themself');
    check(names((await get('/api/records/students?status=all&q=other', 'student-user-a')).body), [], 'A student cannot search for other students');
    check((await get('/api/records/students', null)).status, 401, 'Anonymous denied');
    for (const bad of ['limit=0', 'limit=101', 'offset=-1', 'status=deleted', 'unknown=1', 'limit=abc']) check((await get('/api/records/students?' + bad, 'admin-a')).status, 400, 'Invalid directory query rejected: ' + bad);
    okay(!JSON.stringify(all.body).includes('Synthetic school b'), 'No foreign school data');
  });
  await scenario('record detail is administrator-only and current-school-only', async ({ get, check }) => {
    const own = await get('/api/records/students/student-a', 'admin-a'); check(own.status, 200, 'Administrator opens a record');
    check(Object.keys(own.body).sort(), ['activeEnrolments', 'history', 'student'], 'Detail shape'); check([own.body.activeEnrolments, own.body.history, own.body.student.status, own.body.student.statusVersion], [1, [], 'active', 0], 'Never-changed students are active at version zero');
    for (const actor of ['teacher-a', 'guardian-a', 'student-user-a']) check((await get('/api/records/students/student-a', actor)).status, 403, actor + ' cannot open the administration detail');
    check((await get('/api/records/students/student-b', 'admin-a')).status, 404, 'Foreign student is not found'); check((await get('/api/records/students/student-a', 'admin-b')).status, 404, 'Foreign administrator is not found');
    check((await get('/api/records/students/missing', 'admin-a')).status, 404, 'Unknown id is not found');
  });
  await scenario('edit is version-checked, validated, duplicate-safe and never changes the login binding', async ({ get, send, check, okay, snapshot, row, sqlite }) => {
    addStudents(sqlite, [['s-two', 'Two', 'Student', 'ADM-2', '8'], ['s-foreign', 'Fo', 'Reign', 'ADM-F', '8', 'b']]);
    const { student } = (await get('/api/records/students/student-a', 'admin-a')).body;
    const saved = await send('PATCH', '/api/records/students/student-a', 'admin-a', edit(student, { firstName: 'Renamed', gradeLevel: '9', admissionNumber: 'student-a-new', dateOfBirth: '2012-02-29' }));
    check(saved.status, 200, 'Edit saves'); check([saved.body.student.firstName, saved.body.student.gradeLevel, saved.body.student.admissionNumber, saved.body.student.dateOfBirth], ['Renamed', '9', 'student-a-new', '2012-02-29'], 'Fields saved (leap day is a real date)');
    okay(saved.body.student.updatedAt > student.updatedAt, 'Version token advances'); check(saved.body.student.userId, 'student-user-a', 'Login binding is retained'); check(row("SELECT user_id FROM students WHERE id='student-a'").user_id, 'student-user-a', 'Stored binding retained');
    check((await get('/api/students/student-a', 'student-user-a')).body.firstName, 'Renamed', 'The student sees their own corrected record through the existing API');
    const before = snapshot();
    const stale = await send('PATCH', '/api/records/students/student-a', 'admin-a', edit(student, { firstName: 'Stale overwrite' })); check([stale.status, stale.body.reason], [409, 'stale'], 'A stale form is a safe conflict'); check(snapshot(), before, 'Stale edit changed nothing');
    const fresh = saved.body.student;
    const same = await send('PATCH', '/api/records/students/student-a', 'admin-a', edit(fresh, { admissionNumber: 'ADM-2' })); check([same.status, same.body.reason], [409, 'admission-number'], 'Duplicate admission number in the school is refused');
    const foreign = await send('PATCH', '/api/records/students/student-a', 'admin-a', edit(fresh, { admissionNumber: 'ADM-F' })); check([foreign.status, foreign.body.reason], [409, 'admission-number'], 'A number held by another school gives the same answer (no existence leak)');
    check(JSON.stringify(foreign.body), JSON.stringify(same.body), 'Same-school and cross-school duplicates are indistinguishable'); check(snapshot(), before, 'Refused edits changed nothing');
    for (const [override, field] of [[{ firstName: '' }, 'firstName'], [{ lastName: ' ' }, 'lastName'], [{ dateOfBirth: '2012-02-30' }, 'dateOfBirth'], [{ dateOfBirth: '2999-01-01' }, 'dateOfBirth'], [{ dateOfBirth: '1800-01-01' }, 'dateOfBirth'],
      [{ dateOfBirth: '12/01/2012' }, 'dateOfBirth'], [{ admissionNumber: '' }, 'admissionNumber'], [{ gradeLevel: 'x'.repeat(21) }, 'gradeLevel'], [{ expectedUpdatedAt: 'now' }, 'expectedUpdatedAt'], [{ userId: 'student-user-other' }, ''], [{ schoolId: 'b' }, '']]) {
      const result = await send('PATCH', '/api/records/students/student-a', 'admin-a', edit(fresh, override)); check(result.status, 400, 'Rejected ' + JSON.stringify(override)); if (field) okay(result.body.fields.includes(field), 'Field named: ' + field);
    }
    check(snapshot(), before, 'Validation failures changed nothing');
    for (const actor of ['teacher-a', 'guardian-a', 'student-user-a']) check((await send('PATCH', '/api/records/students/student-a', actor, '{bad')).status, 403, actor + ' denied before parsing');
    check((await send('PATCH', '/api/records/students/student-b', 'admin-a', edit(fresh))).status, 404, 'Cannot edit another school'); check((await send('PATCH', '/api/records/students/student-a', 'admin-b', edit(fresh))).status, 404, 'Foreign administrator cannot edit');
    check((await send('PATCH', '/api/records/students/student-a', 'admin-a', edit(fresh), { origin: 'https://other.example.invalid' })).status, 403, 'Cross-origin denied'); check(snapshot(), before, 'Denied edits changed nothing');
    const legacy = await send('PATCH', '/api/students/student-a', 'admin-a', { schoolId: 'a', firstName: 'Legacy', lastName: 'Edit', dateOfBirth: '2012-01-01', admissionNumber: 'student-a-new', gradeLevel: '9' });
    check(legacy.status, 200, 'The original PATCH keeps working'); check((await send('PATCH', '/api/records/students/student-a', 'admin-a', edit(fresh, { firstName: 'After legacy' }))).body.reason, 'stale', 'A legacy edit invalidates older record tokens');
  });
  await scenario('deactivate and reactivate keep every record, withdraw enrolments atomically and append history', async ({ get, send, check, okay, count, row, rows, sqlite }) => {
    sqlite.prepare("INSERT INTO enrolments (id,student_id,class_id,status,enrolled_at,created_at,updated_at) VALUES ('student-a-second','student-a','class-other','completed',?,?,?)").run(stamp, stamp, stamp);
    const before = { students: count('students'), enrolments: count('enrolments'), guardians: count('student_guardians'), results: count('assessment_results') };
    const first = status('deactivate'); const off = await send('POST', '/api/records/students/student-a/status', 'admin-a', first);
    check(off.status, 201, 'Deactivation is recorded'); check(off.body.replayed, false, 'Fresh');
    check([off.body.detail.student.status, off.body.detail.student.statusVersion, off.body.detail.activeEnrolments], ['inactive', 1, 0], 'Inactive, version one, no active enrolments left');
    check(off.body.detail.history.map(item => [item.action, item.withdrawnEnrolments, item.resultingVersion]), [['deactivate', 1, 1]], 'History records how many enrolments were withdrawn');
    check(off.body.detail.history[0].actorName, 'admin-a', 'History names the administrator from the session');
    check(rows("SELECT id, status FROM enrolments WHERE student_id='student-a' ORDER BY id").map(item => item.status), ['withdrawn', 'completed'], 'Active enrolment withdrawn; a completed one is untouched'); check(count('enrolments'), before.enrolments, 'No enrolment row removed');
    check([count('students'), count('student_guardians')], [before.students, before.guardians], 'Student and family links retained (no hard delete)');
    check((await get('/api/records/students?status=active', 'admin-a')).body.items.some(item => item.id === 'student-a'), false, 'Active list hides the inactive student'); check((await get('/api/records/students?status=inactive', 'admin-a')).body.items.map(item => item.id), ['student-a'], 'Inactive filter shows only inactive');
    check((await get('/api/records/students?status=all', 'admin-a')).body.items.find(item => item.id === 'student-a').status, 'inactive', 'All list marks the status');
    check((await get('/api/records/students?status=all', 'teacher-a')).body.items.map(item => item.id), [], 'The assigned teacher no longer rosters a withdrawn student (existing active-class scope)');
    check((await get('/api/students/student-a', 'admin-a')).status, 200, 'The existing record API still returns the inactive student for administrators');
    const replay = await send('POST', '/api/records/students/student-a/status', 'admin-a', first); check([replay.status, replay.body.replayed], [200, true], 'Exact UUID retry returns the original outcome'); check(count('student_status_events'), 1, 'No second event from a retry');
    check((await send('POST', '/api/records/students/student-a/status', 'admin-a', { ...first, reason: 'A different reason entirely' })).body.reason, 'request-reused', 'A UUID cannot be reused for different content');
    check((await send('POST', '/api/records/students/student-a/status', 'admin-a', status('deactivate', 1))).body.reason, 'already-inactive', 'Deactivating twice is refused');
    check((await send('POST', '/api/records/students/student-a/status', 'admin-a', status('reactivate', 0))).body.reason, 'stale', 'A stale version cannot reactivate');
    const on = await send('POST', '/api/records/students/student-a/status', 'admin-a', status('reactivate', 1, { reason: 'Student returned to the school' }));
    check(on.status, 201, 'Reactivation recorded'); check([on.body.detail.student.status, on.body.detail.student.statusVersion, on.body.detail.activeEnrolments], ['active', 2, 0], 'Active again at version two; enrolments are not silently re-created');
    check(on.body.detail.history.map(item => item.action), ['reactivate', 'deactivate'], 'History is newest first and complete');
    check(row("SELECT status FROM enrolments WHERE id='student-a-enrolment'").status, 'withdrawn', 'Withdrawn enrolment is never auto-reinstated');
    check((await send('POST', '/api/records/students/student-a/status', 'admin-a', status('reactivate', 2))).body.reason, 'already-active', 'Reactivating an active student is refused');
    check([count('assessment_results'), count('students')], [before.results, before.students], 'Academic evidence is untouched');
    okay((await get('/api/records/students?status=active', 'admin-a')).body.items.some(item => item.id === 'student-a'), 'Back in the active list');
  });
  await scenario('status changes are denied to everyone but the school administrator and never hard delete', async ({ send, check, snapshot }) => {
    const before = snapshot();
    for (const actor of ['teacher-a', 'guardian-a', 'student-user-a']) check((await send('POST', '/api/records/students/student-a/status', actor, '{bad')).status, 403, actor + ' denied before parsing');
    check((await send('POST', '/api/records/students/student-a/status', null, status('deactivate'))).status, 401, 'Anonymous denied');
    check((await send('POST', '/api/records/students/student-b/status', 'admin-a', status('deactivate'))).status, 404, 'Foreign student is not found');
    check((await send('POST', '/api/records/students/student-a/status', 'admin-b', status('deactivate'))).status, 404, 'Foreign administrator is not found');
    check((await send('POST', '/api/records/students/student-a/status', 'admin-a', status('deactivate'), { origin: 'https://other.example.invalid' })).status, 403, 'Cross-origin denied');
    for (const [override, label] of [[{ reason: 'short' }, 'short reason'], [{ reason: 'x'.repeat(501) }, 'long reason'], [{ action: 'delete' }, 'unknown action'], [{ clientRequestId: 'nope' }, 'bad uuid'], [{ expectedVersion: -1 }, 'negative version'], [{ extra: true }, 'unknown field']])
      check((await send('POST', '/api/records/students/student-a/status', 'admin-a', status('deactivate', 0, override))).status, 400, 'Rejected: ' + label);
    check(snapshot(), before, 'Nothing persisted from any denied or invalid request');
    check((await send('DELETE', '/api/records/students/student-a', 'admin-a')).absent, true, 'No DELETE exists on the record'); check((await send('DELETE', '/api/records/students/student-a/status', 'admin-a')).absent, true, 'No DELETE exists on status');
  });
  await scenario('status history is immutable at the database', async ({ send, check, sqlite }) => {
    const input = status('deactivate'); await send('POST', '/api/records/students/student-a/status', 'admin-a', input);
    let updated = false, deleted = false; try { sqlite.prepare("UPDATE student_status_events SET reason='Changed afterwards in place' WHERE id=?").run(input.clientRequestId); updated = true; } catch { /* expected */ }
    try { sqlite.prepare('DELETE FROM student_status_events WHERE id=?').run(input.clientRequestId); deleted = true; } catch { /* expected */ }
    check([updated, deleted], [false, false], 'Event rows cannot be rewritten or removed');
  });
  await scenario('late authority loss and injected faults leave neither status nor enrolments half-changed', async ({ get, send, check, arm, revoke, snapshot, fired }) => {
    const before = snapshot();
    arm('before', query => query.startsWith('insert into "student_status_events"'), () => revoke('admin-a'));
    const denied = await send('POST', '/api/records/students/student-a/status', 'admin-a', status('deactivate')); check(fired(), true, 'Session lost immediately before the actual event INSERT');
    check(denied.status >= 400 && denied.status < 500, true, 'Revoked administrator is denied'); check(snapshot(), before, 'Nothing changed');
    const later = snapshot();
    arm('before', query => query.startsWith('update "enrolments"'), () => { throw new Error('Injected enrolment write fault'); });
    // Use another administrator session: the first one was revoked above.
    const failed = await send('POST', '/api/records/students/student-a/status', 'admin-second-a', status('deactivate')); check(fired(), true, 'Fault fired on the third statement'); check(failed.status, 500, 'Client sees an unconfirmed failure');
    check(snapshot(), later, 'Event, status row and enrolments all rolled back together');
    check((await get('/api/records/students/student-a', 'admin-second-a')).body.student.status, 'active', 'The student is still active and can be retried');
  });
  await scenario('competing status changes with one version have exactly one winner', async ({ send, check, count }) => {
    const results = await Promise.all([send('POST', '/api/records/students/student-a/status', 'admin-a', status('deactivate')), send('POST', '/api/records/students/student-a/status', 'admin-second-a', status('deactivate'))]);
    check(results.map(result => result.status).sort(), [201, 409], 'One deactivation wins, the other is a conflict'); check(count('student_status_events'), 1, 'One history row');
  });
  await scenario('legacy student list and profile DTOs keep their shape', async ({ get, check }) => {
    const list = await get('/api/students', 'admin-a'); check(list.status, 200, 'Legacy list works');
    check(Object.keys(list.body[0]).sort(), ['admissionNumber', 'createdAt', 'dateOfBirth', 'firstName', 'gradeLevel', 'id', 'lastName', 'schoolId', 'updatedAt', 'userId'], 'Legacy student DTO has no status fields');
    check((await get('/api/students/student-a', 'student-user-a')).status, 200, 'Student reads their own profile'); check((await get('/api/students/student-other', 'student-user-a')).status, 404, 'Student cannot read another student');
  });
  console.log(JSON.stringify({ passed: state.checks, failed: 0, skipped: 0, scenarios: state.scenarios, requests: state.requests, externalRequests: state.externalRequests, scope: 'actual sessions/routes/production Drizzle D1 over final migrated SQLite; SQL-time authority loss, injected fault rollback, immutable history and concurrent version arbitration; no browser/provider/UAT evidence' }));
  if (state.externalRequests !== 0) throw new Error('External request attempted');
} finally { globalThis.fetch = oldFetch; }
