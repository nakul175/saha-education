// Assessment lifecycle (create/edit with history, coverage overview, publish/unpublish with receipts) through the real route
// handlers, sessions, SQLite triggers and the production Drizzle statements. Synthetic data only; the network is forbidden.
import assert from 'node:assert/strict';
import { freshDatabase, seedSecurityData, load, bindings, stamp } from '../support/security-db.mjs';

const origin = 'https://education.example.invalid'; bindings.SAHA_ALLOWED_ORIGINS = origin;
const sessions = await load('lib/education/session.ts');
const routes = {
  list: await load('app/api/assessments/route.ts'),
  item: await load('app/api/assessments/[id]/route.ts'),
  overview: await load('app/api/assessments/overview/route.ts'),
  lifecycle: await load('app/api/assessments/[id]/lifecycle/route.ts'),
  legacy: await load('app/api/assessments/[id]/results/route.ts'),
  editor: await load('app/api/assessments/[id]/result-editor/route.ts'),
};
const parameters = id => ({ params: Promise.resolve({ id }) });
let passed = 0, scenarios = 0, networkCalls = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); passed++; };
const okay = (value, message) => { assert.ok(value, message); passed++; };
const oldFetch = globalThis.fetch;
globalThis.fetch = async () => { networkCalls++; throw new Error('Assessment lifecycle contracts are offline only.'); };

async function scenario(name, action) {
  const fixture = freshDatabase(); const { db, schema, sqlite } = fixture;
  await seedSecurityData(db, schema);
  // A second pupil in the assigned class gives partial/complete coverage a real difference.
  await db.insert(schema.students).values({ id: 'student-a2', schoolId: 'a', userId: null, firstName: 'student-a2', lastName: 'Synthetic', dateOfBirth: '2012-02-02', admissionNumber: 'student-a2', gradeLevel: '8', createdAt: stamp, updatedAt: stamp });
  await db.insert(schema.enrolments).values({ id: 'student-a2-enrolment', studentId: 'student-a2', classId: 'class-a', status: 'active', enrolledAt: stamp, createdAt: stamp, updatedAt: stamp });
  const cookies = {};
  for (const actor of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'guardian-a', 'guardian-other', 'student-user-a']) cookies[actor] = (await sessions.createSession(actor)).split(';')[0];
  const request = (actor, method = 'GET', data, path = '/api/assessments', selectedOrigin = origin) => new Request(origin + path, {
    method, headers: { ...(cookies[actor] ? { cookie: cookies[actor] } : {}), origin: selectedOrigin, ...(data === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(data === undefined ? {} : { body: typeof data === 'string' ? data : JSON.stringify(data) }) });
  const api = {
    create: (actor, data) => routes.list.POST(request(actor, 'POST', data)),
    overview: (actor, query = '') => routes.overview.GET(request(actor, 'GET', undefined, '/api/assessments/overview' + query)),
    detail: (actor, id) => routes.lifecycle.GET(request(actor, 'GET', undefined, '/api/assessments/' + id + '/lifecycle'), parameters(id)),
    revise: (actor, id, data) => routes.item.PATCH(request(actor, 'PATCH', data, '/api/assessments/' + id), parameters(id)),
    change: (actor, id, data) => routes.lifecycle.POST(request(actor, 'POST', data, '/api/assessments/' + id + '/lifecycle'), parameters(id)),
    legacy: (actor, id, results) => routes.legacy.POST(request(actor, 'POST', { results }, '/api/assessments/' + id + '/results'), parameters(id)),
    snapshot: (actor, id) => routes.editor.GET(request(actor, 'GET', undefined, '/api/assessments/' + id + '/result-editor'), parameters(id)),
    review: (actor, id, data) => routes.editor.POST(request(actor, 'POST', data, '/api/assessments/' + id + '/result-editor'), parameters(id)),
  };
  const count = table => sqlite.prepare(`SELECT count(*) n FROM ${table}`).get().n;
  const json = async response => response.json();
  const status = (response, expected, message) => { check(response.status, expected, message); check(response.headers.get('cache-control'), 'no-store', message + ': no-store'); };
  const body = async (response, expected, message) => { status(response, expected, message); return response.json(); };
  const sql = (text, ...values) => sqlite.prepare(text).run(...values);
  const row = (text, ...values) => ({ ...sqlite.prepare(text).get(...values) });
  const rows = (text, ...values) => sqlite.prepare(text).all(...values).map(item => ({ ...item }));
  const uuid = () => crypto.randomUUID();
  const reason = 'Synthetic explicit lifecycle reason.';
  try { await action({ ...fixture, request, api, count, json, status, body, sql, row, rows, uuid, reason }); scenarios++; }
  finally { globalThis.__sahaTestDb = undefined; sqlite.close(); }
}
const newAssessment = (overrides = {}) => ({ classId: 'class-a', title: 'Synthetic lifecycle quiz', kind: 'quiz', maxScore: 20, date: '2026-10-05', ...overrides });

try {
  await scenario('role, origin and body gates run before any record work', async ({ api, request, status, count }) => {
    const gates = [
      ['overview GET', actor => routes.overview.GET(request(actor, 'GET', undefined, '/api/assessments/overview'))],
      ['lifecycle GET', actor => routes.lifecycle.GET(request(actor, 'GET', undefined, '/api/assessments/assessment-a/lifecycle'), parameters('assessment-a'))],
      ['lifecycle POST', actor => routes.lifecycle.POST(request(actor, 'POST', '{', '/api/assessments/assessment-a/lifecycle'), parameters('assessment-a'))],
      ['assessment PATCH', actor => routes.item.PATCH(request(actor, 'PATCH', '{', '/api/assessments/assessment-a'), parameters('assessment-a'))],
      ['assessment POST', actor => routes.list.POST(request(actor, 'POST', '{'))],
    ];
    for (const [label, call] of gates) {
      status(await call(null), 401, label + ': anonymous is refused');
      for (const family of ['guardian-a', 'student-user-a']) status(await call(family), 403, label + ': family role is refused before the body is read');
    }
    for (const [label, call] of gates.filter(([label]) => /POST|PATCH/.test(label))) {
      const foreign = { POST: () => routes.lifecycle.POST(request('admin-a', 'POST', '{', '/api/assessments/assessment-a/lifecycle', 'https://foreign.example.invalid'), parameters('assessment-a')) };
      if (label === 'lifecycle POST') status(await foreign.POST(), 403, label + ': foreign origin is refused before the body');
      status(await call('teacher-a'), 400, label + ': an authorised staff member with malformed JSON gets a plain 400');
    }
    check([count('assessment_publications'), count('assessment_metadata_edits')], [0, 0], 'Refused calls wrote nothing');
    status(await api.detail('teacher-other', 'assessment-a'), 404, 'A teacher who is not assigned to the class cannot open its lifecycle');
    status(await api.detail('admin-b', 'assessment-a'), 404, 'An administrator of another school cannot open it either');
  });

  await scenario('creation validates a real calendar day, bounded title and whole maximum on the server', async ({ api, status, body, count, row }) => {
    const bad = [
      [{ date: '2026-02-30' }, 'impossible calendar day'], [{ date: '05/10/2026' }, 'non-ISO date'], [{ date: '2026-10-05T00:00:00Z' }, 'timestamp'],
      [{ title: '' }, 'empty title'], [{ title: '   ' }, 'blank title'], [{ title: 'x'.repeat(201) }, 'overlong title'], [{ title: 'bad\u0007title' }, 'control character'],
      [{ maxScore: -1 }, 'negative maximum'], [{ maxScore: 1.5 }, 'fractional maximum'], [{ maxScore: 1_000_001 }, 'maximum above the cap'], [{ maxScore: '20' }, 'text maximum'],
      [{ kind: 'homework' }, 'unknown type'],
    ];
    for (const [change, label] of bad) status(await api.create('teacher-a', newAssessment(change)), 400, 'Rejected: ' + label);
    check(count('assessments'), 2, 'Rejected creations wrote nothing');
    const created = await body(await api.create('teacher-a', newAssessment({ title: '  Trimmed quiz  ', maxScore: 0 })), 201, 'Assigned teacher creates an assessment');
    check([created.title, created.maxScore, created.kind, created.date, created.classId], ['Trimmed quiz', 0, 'quiz', '2026-10-05', 'class-a'], 'Zero maximum and trimmed title are stored exactly');
    check(row('SELECT typeof(max_score) t FROM assessments WHERE id=?', created.id).t, 'integer', 'Maximum is stored as an integer');
    status(await api.create('teacher-other', newAssessment()), 404, 'A teacher cannot create an assessment in another teacher class');
    status(await api.create('admin-b', newAssessment()), 404, 'An administrator cannot create an assessment in another school');
    status(await api.create('admin-a', newAssessment({ classId: 'class-other', title: 'Admin created' })), 201, 'An administrator can create in any school class');
    status(await api.create('admin-a', newAssessment({ classId: 'missing-class' })), 404, 'An unknown class is not found');
    check(count('assessments'), 4, 'Only the two permitted creations were stored');
  });
  await scenario('overview shows live coverage, review count and publication state for staff only', async ({ api, status, body, sql, row }) => {
    let view = await body(await api.overview('teacher-a'), 200, 'Teacher overview');
    check(view.items.map(item => item.id), ['assessment-a'], 'A teacher sees only assessments of assigned classes');
    check([view.total, view.limit, view.truncated], [1, 200, false], 'Overview carries exact totals');
    const first = view.items[0];
    check([first.expectedPupils, first.recordedResults, first.invalidResults, first.ambiguous, first.reviewCount, first.lastReviewedAt, first.state, first.stateAt], [2, 0, 0, false, 0, null, 'draft', null], 'Nothing recorded yet');
    check([first.maxScore, first.invalidMaximum, first.invalidDate, first.className], [20, false, false, 'class-a'], 'Metadata and flags');
    status(await api.legacy('teacher-a', 'assessment-a', [{ studentId: 'student-a', score: 0, grade: '', feedback: '' }]), 200, 'Saved zero with empty text');
    view = await body(await api.overview('admin-a'), 200, 'Admin overview');
    check(view.items.map(item => item.id).sort(), ['assessment-a', 'assessment-b'].filter(id => id === 'assessment-a'), 'Administrator sees own-school assessments only');
    check(view.items.find(item => item.id === 'assessment-a').recordedResults, 1, 'A saved zero counts as a recorded result');
    view = await body(await api.overview('admin-b'), 200, 'Other school overview');
    check(view.items.map(item => item.id), ['assessment-b'], 'Other school sees only its own assessment');
    view = await body(await api.overview('teacher-a', '?classId=class-other'), 200, 'Filtered overview');
    check(view.items, [], 'A class filter cannot widen a teacher scope');
    status(await api.overview('guardian-a'), 403, 'Guardian is refused');
    status(await api.overview('student-user-a'), 403, 'Student is refused');
    sql("UPDATE assessments SET date='2026-02-30' WHERE id='assessment-a'");
    view = await body(await api.overview('teacher-a'), 200, 'Legacy invalid date');
    check([view.items[0].invalidDate, view.items[0].date], [true, '2026-02-30'], 'Invalid legacy date is flagged and shown raw');
    check(row("SELECT date FROM assessments WHERE id='assessment-a'").date, '2026-02-30', 'Reading never repairs legacy data');
  });
  await scenario('editing is compare-and-set, keeps before/after history and replays exactly', async ({ api, status, body, count, row, rows, sql, uuid }) => {
    const base = await body(await api.detail('teacher-a', 'assessment-a'), 200, 'Lifecycle detail');
    const a = base.assessment;
    const expected = { title: a.title, kind: a.kind, maxScore: a.maxScore, date: a.date, updatedAt: a.updatedAt };
    const edit = (details, extra = {}) => ({ clientRequestId: uuid(), expected, details: { title: a.title, kind: a.kind, maxScore: a.maxScore, date: a.date, ...details }, ...extra });
    status(await api.revise('guardian-a', 'assessment-a', edit({})), 403, 'Family cannot edit');
    status(await api.revise('teacher-other', 'assessment-a', edit({ title: 'Other teacher' })), 404, 'Unassigned teacher cannot edit');
    status(await api.revise('admin-b', 'assessment-a', edit({ title: 'Other school' })), 404, 'Other school cannot edit');
    for (const [details, label] of [[{ date: '2026-02-30' }, 'impossible date'], [{ maxScore: -1 }, 'negative maximum'], [{ title: '' }, 'empty title'], [{ kind: 'x' }, 'unknown type']]) {
      status(await api.revise('teacher-a', 'assessment-a', edit(details)), 400, 'Rejected edit: ' + label);
    }
    status(await api.revise('teacher-a', 'assessment-a', { ...edit({}), unexpected: true }), 400, 'Unknown request field is rejected');
    status(await api.revise('teacher-a', 'assessment-a', { ...edit({ title: 'x' }), expected: { ...expected, updatedAt: 'stale' } }), 409, 'Stale expectation conflicts');
    check(count('assessment_metadata_edits'), 0, 'Refused edits left no history');
    const request = edit({ title: 'Renamed quiz', maxScore: 30, date: '2026-10-06', kind: 'exam' });
    const saved = await body(await api.revise('teacher-a', 'assessment-a', request), 201, 'Edit is saved');
    check([saved.assessment.title, saved.assessment.maxScore, saved.assessment.kind, saved.assessment.date, saved.replayed], ['Renamed quiz', 30, 'exam', '2026-10-06', false], 'Saved metadata');
    check(saved.assessment.updatedAt === a.updatedAt, false, 'Edit advances the stored update time');
    const history = rows('SELECT * FROM assessment_metadata_edits');
    check(history.length, 1, 'One immutable history row');
    check([JSON.parse(history[0].before_snapshot).title, JSON.parse(history[0].after_snapshot).title, history[0].actor_id, history[0].id], ['Synthetic quiz', 'Renamed quiz', 'teacher-a', request.clientRequestId], 'History keeps before, after, actor and request id');
    check(JSON.parse(history[0].before_snapshot).updatedAt, a.updatedAt, 'History keeps the original update time');
    const replay = await body(await api.revise('teacher-a', 'assessment-a', request), 200, 'Exact replay after a lost acknowledgement');
    check([replay.replayed, replay.assessment.title], [true, 'Renamed quiz'], 'Replay returns the original saved evidence');
    check(count('assessment_metadata_edits'), 1, 'Replay wrote nothing');
    status(await api.revise('teacher-a', 'assessment-a', { ...request, details: { ...request.details, title: 'Different body same id' } }), 409, 'Reusing a request id for another body conflicts');
    status(await api.revise('admin-a', 'assessment-a', request), 409, 'Another actor cannot replay the original request id');
    // The old expectation is now stale for any new edit.
    status(await api.revise('teacher-a', 'assessment-a', edit({ title: 'Late edit' })), 409, 'Edit based on the old page conflicts');
    const next = { title: saved.assessment.title, kind: saved.assessment.kind, maxScore: saved.assessment.maxScore, date: saved.assessment.date, updatedAt: saved.assessment.updatedAt };
    const second = (details, extra = {}) => ({ clientRequestId: uuid(), expected: next, details: { title: next.title, kind: next.kind, maxScore: next.maxScore, date: next.date, ...details }, ...extra });
    // A saved result protects both the maximum and (via a required reason) every later edit.
    status(await api.legacy('teacher-a', 'assessment-a', [{ studentId: 'student-a', score: 25 }]), 200, 'Result saved against the new maximum');
    const noReason = await body(await api.revise('teacher-a', 'assessment-a', second({ title: 'No reason' })), 409, 'Edit with saved results needs a reason');
    check(noReason, { error: 'Conflict', code: 'reason_required' }, 'Plain reason-required code');
    const below = await body(await api.revise('teacher-a', 'assessment-a', second({ maxScore: 20 }, { reason: 'Lower the maximum below a saved score.' })), 409, 'Maximum below a saved score');
    check(below, { error: 'Conflict', code: 'below_saved_scores' }, 'Maximum cannot drop below a saved score');
    check(row("SELECT max_score FROM assessments WHERE id='assessment-a'").max_score, 30, 'Rejected maximum change left the assessment unchanged');
    status(await api.revise('teacher-a', 'assessment-a', second({ maxScore: 25, title: 'Reasoned edit' }, { reason: 'Align the maximum with the marked paper.' })), 201, 'Reasoned edit with saved results');
    check(count('assessment_metadata_edits'), 2, 'Two history rows now');
    const detail = await body(await api.detail('admin-a', 'assessment-a'), 200, 'Detail shows history');
    check([detail.editTotal, detail.edits.length, detail.edits[0].before.title, detail.edits[0].after.title, detail.edits[0].reason], [2, 2, 'Renamed quiz', 'Reasoned edit', 'Align the maximum with the marked paper.'], 'History is listed newest first with reasons');
    for (const statement of ["UPDATE assessment_metadata_edits SET reason='Changed after the fact.'", 'DELETE FROM assessment_metadata_edits']) {
      let failure = null; try { sql(statement); } catch (error) { failure = String(error.message); }
      okay(/immutable/.test(failure ?? ''), 'History is immutable: ' + statement.slice(0, 30));
    }
    check(count('assessment_metadata_edits'), 2, 'Immutable rows remain');
  });
  await scenario('publication needs ready results, is replay safe and changes only through receipts', async ({ api, status, body, count, row, rows, sql, uuid, reason }) => {
    const publish = (extra = {}, actor = 'teacher-a', id = 'assessment-a') => api.change(actor, id, { clientRequestId: uuid(), action: 'publish', ...extra });
    check(await body(await publish(), 409, 'No results yet'), { error: 'Conflict', code: 'not_ready' }, 'Empty assessment is not ready');
    status(await api.legacy('teacher-a', 'assessment-a', [{ studentId: 'student-a', score: 0, grade: '', feedback: '' }]), 200, 'One saved zero');
    check(await body(await publish(), 409, 'Partial coverage without confirmation'), { error: 'Conflict', code: 'not_ready' }, 'Partial coverage needs explicit confirmation');
    const detail = await body(await api.detail('teacher-a', 'assessment-a'), 200, 'Readiness');
    check([detail.readiness.canPublish, detail.readiness.needsPartialConfirmation, detail.readiness.blockers], [true, true, []], 'Readiness reports partial coverage as a confirmation, not a blocker');
    status(await publish({}, 'guardian-a'), 403, 'Family cannot publish');
    status(await publish({}, 'teacher-other'), 404, 'Unassigned teacher cannot publish');
    status(await publish({}, 'admin-b'), 404, 'Other-school administrator cannot publish');
    status(await api.change('teacher-a', 'assessment-a', { clientRequestId: 'not-a-uuid', action: 'publish' }), 400, 'Request id must be a UUID');
    status(await api.change('teacher-a', 'assessment-a', { clientRequestId: uuid(), action: 'archive' }), 400, 'Unknown action');
    status(await api.change('teacher-a', 'assessment-a', { clientRequestId: uuid(), action: 'publish', extra: 1 }), 400, 'Unknown field');
    check(count('assessment_publications'), 0, 'Refusals wrote no receipt');
    const request = { clientRequestId: uuid(), action: 'publish', partialConfirmed: true };
    const done = await body(await api.change('teacher-a', 'assessment-a', request), 201, 'Confirmed partial publication');
    check([done.replayed, done.event.action, done.event.partialConfirmed, done.event.expectedPupils, done.event.recordedResults], [false, 'publish', true, 2, 1], 'Receipt records honest coverage and the confirmation');
    check(rows('SELECT action,actor_id,school_id,class_id,partial_confirmed,expected_pupils,recorded_results FROM assessment_publications'),
      [{ action: 'publish', actor_id: 'teacher-a', school_id: 'a', class_id: 'class-a', partial_confirmed: 1, expected_pupils: 2, recorded_results: 1 }], 'Stored receipt');
    const replay = await body(await api.change('teacher-a', 'assessment-a', request), 200, 'Lost acknowledgement replay');
    check([replay.replayed, replay.event.id], [true, request.clientRequestId], 'Replay returns the original receipt');
    check(count('assessment_publications'), 1, 'Replay wrote nothing');
    status(await api.change('admin-a', 'assessment-a', request), 409, 'Another actor cannot reuse the request id');
    status(await api.change('teacher-a', 'assessment-a', { ...request, partialConfirmed: false }), 409, 'The same id with a different body conflicts');
    check(await body(await publish(), 409, 'Already published'), { error: 'Conflict', code: 'changed' }, 'Publishing twice with a new id conflicts');
    const overview = await body(await api.overview('teacher-a'), 200, 'Overview after publish');
    check([overview.items[0].state, overview.items[0].stateAt], ['published', done.event.createdAt], 'Overview reflects the publication');
    // Locks: metadata, legacy writes and raw SQL cannot change published results.
    const a = (await body(await api.detail('teacher-a', 'assessment-a'), 200, 'Detail')).assessment;
    const edit = { clientRequestId: uuid(), expected: { title: a.title, kind: a.kind, maxScore: a.maxScore, date: a.date, updatedAt: a.updatedAt }, details: { title: 'Locked', kind: a.kind, maxScore: a.maxScore, date: a.date }, reason };
    check(await body(await api.revise('teacher-a', 'assessment-a', edit), 409, 'Edit while published'), { error: 'Conflict', code: 'published' }, 'Published metadata is locked');
    status(await api.legacy('teacher-a', 'assessment-a', [{ studentId: 'student-a', score: 7 }]), 409, 'Legacy bulk save of published results is refused');
    check(row("SELECT score,grade FROM assessment_results WHERE student_id='student-a'"), { score: 0, grade: '' }, 'Published result is unchanged');
    for (const statement of ["UPDATE assessments SET title='raw' WHERE id='assessment-a'", "UPDATE assessment_results SET score=5 WHERE student_id='student-a'",
      "INSERT INTO assessment_results(id,assessment_id,student_id,score,created_at,updated_at) VALUES('raw-result','assessment-a','student-a2',3,'2026-10-06T00:00:00.000Z','2026-10-06T00:00:00.000Z')"]) {
      let failure = null; try { sql(statement); } catch (error) { failure = String(error.message); }
      okay(/saha_assessment_published_lock/.test(failure ?? ''), 'Raw SQL cannot change published evidence: ' + statement.slice(0, 40));
    }
    // Reviewed correction stays available and keeps before/after evidence.
    const snapshot = await body(await api.snapshot('teacher-a', 'assessment-a'), 200, 'Editor snapshot');
    const entry = snapshot.roster.items.find(item => item.student.id === 'student-a');
    const review = await body(await api.review('teacher-a', 'assessment-a', { clientRequestId: uuid(), reviewConfirmed: true, reason: 'Correction of a mark after the paper was rechecked.', expectedAssessment: snapshot.assessment,
      entries: [{ studentId: 'student-a', score: 12, grade: 'B', feedback: null, expectedRecord: entry.record }] }), 201, 'Reviewed correction of published results');
    check([review.review.changes[0].beforeRecord.score, review.review.changes[0].afterRecord.score], [0, 12], 'Correction keeps before and after');
    check(row("SELECT score FROM assessment_results WHERE student_id='student-a'").score, 12, 'Corrected value is saved');
    // Unpublish.
    check(await body(await api.change('teacher-a', 'assessment-a', { clientRequestId: uuid(), action: 'unpublish' }), 409, 'Unpublish needs a reason'), { error: 'Conflict', code: 'reason_required' }, 'Reason required to unpublish');
    const off = await body(await api.change('teacher-a', 'assessment-a', { clientRequestId: uuid(), action: 'unpublish', reason }), 201, 'Unpublish');
    check([off.event.action, off.event.reason], ['unpublish', reason], 'Unpublish receipt keeps the reason');
    check(count('assessment_publications'), 2, 'History keeps both receipts');
    check(await body(await api.change('teacher-a', 'assessment-a', { clientRequestId: uuid(), action: 'unpublish', reason }), 409, 'Unpublish twice'), { error: 'Conflict', code: 'changed' }, 'Cannot unpublish twice');
    status(await api.legacy('teacher-a', 'assessment-a', [{ studentId: 'student-a', score: 11 }]), 200, 'Legacy save works again once unpublished');
    const fresh = (await body(await api.detail('teacher-a', 'assessment-a'), 200, 'Detail after unpublish')).assessment;
    status(await api.revise('teacher-a', 'assessment-a', { ...edit, clientRequestId: uuid(), expected: { title: fresh.title, kind: fresh.kind, maxScore: fresh.maxScore, date: fresh.date, updatedAt: fresh.updatedAt } }), 201, 'Metadata can be edited again once unpublished');
    const after = await body(await api.detail('teacher-a', 'assessment-a'), 200, 'History detail');
    check(after.events.map(event => event.action), ['unpublish', 'publish'], 'Events listed newest first');
    check(after.assessment.state, 'unpublished', 'Current state is unpublished');
    const again = await body(await api.change('teacher-a', 'assessment-a', { clientRequestId: uuid(), action: 'publish', partialConfirmed: true }), 201, 'Republish');
    check(again.event.recordedResults, 1, 'Republish records fresh coverage');
    for (const statement of ["UPDATE assessment_publications SET reason='x'", 'DELETE FROM assessment_publications']) {
      let failure = null; try { sql(statement); } catch (error) { failure = String(error.message); }
      okay(/immutable/.test(failure ?? ''), 'Receipts are immutable');
    }
  });
  console.log('part ok', passed);
} finally { globalThis.fetch = oldFetch; }
check(networkCalls, 0, 'No external request');
console.log(JSON.stringify({ passed, scenarios, networkCalls }));
