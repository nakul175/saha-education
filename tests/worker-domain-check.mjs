// Manual built-Worker verification of current school structure and report publication.
// Requires disposable synthetic localhost records and privately stored test sessions.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const origin = process.env.SAHA_WORKER_TEST_URL, fixture = process.env.SAHA_WORKER_SESSION_FIXTURE;
if (!origin || !fixture) throw new Error('Supply a local Worker and synthetic session fixture.');
const base = new URL(origin);
if (!['localhost', '127.0.0.1'].includes(base.hostname) || !['http:', 'https:'].includes(base.protocol) || base.pathname !== '/' || base.username || base.password || base.search || base.hash) throw new Error('These checks require an exact localhost origin.');
const sessions = JSON.parse(readFileSync(fixture, 'utf8'));
for (const id of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'guardian-a', 'student-user-a']) if (typeof sessions[id] !== 'string') throw new Error('Missing a synthetic session.');
let passed = 0;
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); passed++; console.log('ok - ' + label); };
async function request(path, user, method = 'GET', input, suppliedOrigin = base.origin) {
  const response = await fetch(new URL(path, base), { method, redirect: 'manual', signal: AbortSignal.timeout(15000), headers: {
    ...(user ? { Cookie: sessions[user] } : {}), ...(method === 'GET' ? {} : { Origin: suppliedOrigin, 'Content-Type': 'application/json' }),
  }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  return new Response(await response.arrayBuffer(), { status: response.status, headers: response.headers });
}
async function json(path, user, method = 'GET', input, status = 200) {
  const response = await request(path, user, method, input);
  check(response.status, status, method + ' ' + path + ' status');
  check(response.headers.get('cache-control'), 'no-store', 'Protected domain response uncached');
  return response.json();
}
const suffix = crypto.randomUUID().slice(0, 8);
try {
  for (const path of ['/api/schools', '/api/courses', '/api/classes', '/api/users', '/api/report-cards', '/api/notifications']) check((await request(path)).status, 401, 'Anonymous domain access denied');
  for (const user of ['teacher-a', 'guardian-a', 'student-user-a']) check((await request('/api/users', user)).status, 403, 'School account list is admin-only');
  const accounts = await json('/api/users', 'admin-a');
  check(accounts.every(row => Object.keys(row).sort().join(',') === 'id,name,role'), true, 'Account picker exposes only identifiers, names and roles');
  check(accounts.some(row => row.id === 'admin-b' || row.id === 'guardian-b'), false, 'Foreign account identities excluded');
  for (const path of ['/api/courses', '/api/classes', '/api/report-cards', '/api/notifications']) check((await request(path, 'guardian-a', 'POST', {})).status, 403, 'Write role denied before malformed body');
  for (const path of ['/api/courses', '/api/classes', '/api/report-cards', '/api/notifications']) check((await request(path, 'admin-a', 'POST', {}, 'https://foreign.example.invalid')).status, 403, 'Foreign origin denied before write');

  const courseInput = { schoolId: 'a', code: 'DOMAIN-' + suffix, title: 'Synthetic domain course ' + suffix, description: 'Synthetic only', gradeLevel: '8' };
  const course = await json('/api/courses', 'admin-a', 'POST', courseInput, 201);
  check(course.schoolId, 'a', 'Course keeps authenticated school');
  const classInput = { schoolId: 'a', courseId: course.id, teacherId: 'teacher-a', name: 'Synthetic domain class ' + suffix, term: 'Synthetic term' };
  const classroom = await json('/api/classes', 'admin-a', 'POST', classInput, 201);
  check(classroom.courseId, course.id, 'Class stores selected school course');
  check(classroom.teacherId, 'teacher-a', 'Class stores eligible teacher');
  check((await request('/api/classes/' + classroom.id, 'admin-b')).status, 404, 'Foreign class hidden');
  check((await request('/api/classes/' + classroom.id, 'teacher-other')).status, 404, 'Unassigned teacher class hidden');
  check((await request('/api/classes', 'admin-a', 'POST', { ...classInput, courseId: 'course-b' })).status, 400, 'Foreign course cannot be assigned');
  check((await request('/api/classes', 'admin-a', 'POST', { ...classInput, teacherId: 'guardian-a' })).status, 400, 'Nonteacher account cannot be assigned');
  const changed = await json('/api/classes/' + classroom.id, 'admin-a', 'PATCH', { ...classInput, name: classInput.name + ' reviewed' });
  check(changed.name, classInput.name + ' reviewed', 'Valid same-school class update preserved');
  const rosterStudent = await json('/api/students', 'admin-a', 'POST', { schoolId: 'a', firstName: 'Synthetic domain ' + suffix, lastName: 'Roster', dateOfBirth: '2012-01-01', admissionNumber: 'DOMAIN-' + suffix, gradeLevel: '8' }, 201);
  await json('/api/enrolments', 'admin-a', 'POST', { studentId: rosterStudent.id, classId: classroom.id, status: 'active', enrolledAt: new Date().toISOString() }, 201);
  const roster = await json('/api/classes/' + classroom.id, 'teacher-a');
  check(roster.enrolledStudents.map(row => row.id), [rosterStudent.id], 'Current assigned class roster returned');
  const learnerRoster = await json('/api/classes/class-a', 'student-user-a');
  check(learnerRoster.enrolledStudents.map(row => row.id), ['student-a'], 'Learner class roster remains own profile only');
  const foreignCourse = await request('/api/courses/' + course.id, 'admin-b');
  check(foreignCourse.status, 404, 'Foreign course detail hidden');

  const draftInput = { studentId: 'student-a', term: 'Synthetic domain ' + suffix, summary: 'Synthetic saved report ' + suffix, overallGrade: 'School supplied B', publishedAt: '2000-01-01T00:00:00.000Z' };
  const draft = await json('/api/report-cards', 'admin-a', 'POST', draftInput, 201);
  check(draft.publishedAt, null, 'Draft cannot self-publish through submitted system field');
  for (const user of ['guardian-a', 'student-user-a', 'admin-b']) check((await request('/api/report-cards/' + draft.id, user)).status, 404, 'Draft hidden from family and other schools');
  const staffDraft = await json('/api/report-cards/' + draft.id, 'teacher-a');
  check(staffDraft.summary, draftInput.summary, 'Assigned staff can inspect stored draft');
  check((await request('/api/report-cards/' + draft.id, 'teacher-a', 'PATCH', {})).status, 403, 'Publication administrator role precedes body parsing');
  const noticeId = 'report-card-published:' + draft.id + ':guardian-a';
  const noticeCount = async () => (await json('/api/notifications', 'guardian-a')).filter(row => row.id === noticeId);
  check((await noticeCount()).length, 0, 'Draft creates no publication notice');
  const responses = await Promise.all([request('/api/report-cards/' + draft.id, 'admin-a', 'PATCH', { publish: true }), request('/api/report-cards/' + draft.id, 'admin-a', 'PATCH', { publish: true })]);
  for (const response of responses) check(response.status, 200, 'Concurrent legitimate publication converges');
  const published = await json('/api/report-cards/' + draft.id, 'guardian-a');
  check(typeof published.publishedAt, 'string', 'Published report visible to linked guardian');
  check(published.summary, draftInput.summary, 'Publication preserves original summary');
  check(JSON.stringify(published).includes('publishedBy'), false, 'Private publication receipt does not leak to family');
  const notices = await noticeCount();
  check(notices.length, 1, 'Concurrent publication produces one linked guardian notice');
  check(notices[0].userId, 'guardian-a', 'Notice goes to account rather than guardian profile ID');
  check(notices[0].channel, 'in_app', 'Publication uses in-app channel');
  check(notices[0].body.includes('student-a Synthetic'), true, 'Publication uses actual learner name');
  const replay = await json('/api/report-cards/' + draft.id, 'admin-a', 'PATCH', { publish: true });
  check(replay.publishedAt, published.publishedAt, 'Publication retry preserves first publication time');
  check((await noticeCount()).length, 1, 'Publication retry creates no duplicate notice');
  check((await request('/api/notifications?id=' + encodeURIComponent(noticeId), 'admin-a', 'PATCH')).status, 404, 'Another account cannot mark guardian notice read');
  await json('/api/notifications?id=' + encodeURIComponent(noticeId), 'guardian-a', 'PATCH');
  const readNotice = (await noticeCount())[0];
  check(typeof readNotice.readAt, 'string', 'Guardian can mark own notice read');
  await json('/api/notifications?id=' + encodeURIComponent(noticeId), 'guardian-a', 'PATCH');
  check((await noticeCount())[0].readAt, readNotice.readAt, 'Read retry retains first read timestamp');
  for (const user of ['admin-b', 'teacher-a', 'student-user-a']) check((await json('/api/notifications', user)).some(row => row.id === noticeId), false, 'Guardian notice excluded from other personal feeds');
  const legacy = await json('/api/report-cards/published-a', 'admin-a', 'PATCH', { publish: true });
  check(legacy.publishedAt, '2026-10-05T00:00:00.000Z', 'Legacy published timestamp retained without backfill');
  check((await json('/api/notifications', 'guardian-a')).some(row => row.id === 'report-card-published:published-a:guardian-a'), false, 'Legacy publication retry invents no old receipt/notice');
  console.log(JSON.stringify({ passed, failed: 0, skipped: 0, syntheticLocalOnly: true, externalProvider: false }));
} catch (error) {
  console.log(JSON.stringify({ passed, failed: 1, skipped: 0 }));
  throw error;
}
