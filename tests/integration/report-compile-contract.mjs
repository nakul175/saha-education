// Reports compiled from published results: eligibility, atomic compile, frozen lines, family privacy, atomic publication,
// stale-result refusal and the correction path. Real route handlers, sessions, triggers and production Drizzle statements.
import assert from 'node:assert/strict';
import { freshDatabase, seedSecurityData, load, bindings, stamp } from '../support/security-db.mjs';

const origin = 'https://education.example.invalid'; bindings.SAHA_ALLOWED_ORIGINS = origin;
const sessions = await load('lib/education/session.ts');
const routes = {
  reports: await load('app/api/report-cards/route.ts'),
  report: await load('app/api/report-cards/[id]/route.ts'),
  detail: await load('app/api/report-cards/[id]/detail/route.ts'),
  eligible: await load('app/api/report-cards/eligible/route.ts'),
  lifecycle: await load('app/api/assessments/[id]/lifecycle/route.ts'),
  legacy: await load('app/api/assessments/[id]/results/route.ts'),
  editor: await load('app/api/assessments/[id]/result-editor/route.ts'),
};
const parameters = id => ({ params: Promise.resolve({ id }) });
let passed = 0, scenarios = 0, networkCalls = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); passed++; };
const okay = (value, message) => { assert.ok(value, message); passed++; };
const oldFetch = globalThis.fetch;
globalThis.fetch = async () => { networkCalls++; throw new Error('Report compile contracts are offline only.'); };
const noteText = 'Synthetic school-typed summary.';

async function scenario(name, action) {
  const fixture = freshDatabase(); const { db, schema, sqlite } = fixture;
  await seedSecurityData(db, schema);
  const base = globalThis.__sahaTestDb;
  await db.insert(schema.students).values({ id: 'student-a2', schoolId: 'a', userId: null, firstName: 'student-a2', lastName: 'Synthetic', dateOfBirth: '2012-02-02', admissionNumber: 'student-a2', gradeLevel: '8', createdAt: stamp, updatedAt: stamp });
  await db.insert(schema.enrolments).values({ id: 'student-a2-enrolment', studentId: 'student-a2', classId: 'class-a', status: 'active', enrolledAt: stamp, createdAt: stamp, updatedAt: stamp });
  await db.insert(schema.assessments).values([
    { id: 'assessment-a2', classId: 'class-a', title: 'Synthetic project', kind: 'project', maxScore: 50, date: '2026-10-07', createdAt: stamp, updatedAt: stamp },
    { id: 'assessment-a3', classId: 'class-a', title: 'Synthetic draft quiz', kind: 'quiz', maxScore: 10, date: '2026-10-08', createdAt: stamp, updatedAt: stamp },
    { id: 'assessment-other', classId: 'class-other', title: 'Other class exam', kind: 'exam', maxScore: 100, date: '2026-10-05', createdAt: stamp, updatedAt: stamp },
  ]);
  const cookies = {};
  for (const actor of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'guardian-a', 'guardian-other', 'student-user-a']) cookies[actor] = (await sessions.createSession(actor)).split(';')[0];
  const request = (actor, method = 'GET', data, path = '/api/report-cards', selectedOrigin = origin) => new Request(origin + path, {
    method, headers: { ...(cookies[actor] ? { cookie: cookies[actor] } : {}), origin: selectedOrigin, ...(data === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(data === undefined ? {} : { body: typeof data === 'string' ? data : JSON.stringify(data) }) });
  const uuid = () => crypto.randomUUID();
  const api = {
    eligible: (actor, studentId = 'student-a') => routes.eligible.GET(request(actor, 'GET', undefined, '/api/report-cards/eligible?studentId=' + studentId)),
    compile: (actor, data) => routes.reports.POST(request(actor, 'POST', data)),
    list: (actor, studentId = 'student-a') => routes.reports.GET(request(actor, 'GET', undefined, '/api/report-cards?studentId=' + studentId)),
    publish: (actor, id) => routes.report.PATCH(request(actor, 'PATCH', { publish: true }, '/api/report-cards/' + id), parameters(id)),
    detail: (actor, id) => routes.detail.GET(request(actor, 'GET', undefined, '/api/report-cards/' + id + '/detail'), parameters(id)),
    card: (actor, id) => routes.report.GET(request(actor, 'GET', undefined, '/api/report-cards/' + id), parameters(id)),
    legacy: (actor, id, results) => routes.legacy.POST(request(actor, 'POST', { results }, '/api/assessments/' + id + '/results'), parameters(id)),
    lifecycle: (actor, id, data) => routes.lifecycle.POST(request(actor, 'POST', data, '/api/assessments/' + id + '/lifecycle'), parameters(id)),
    snapshot: (actor, id) => routes.editor.GET(request(actor, 'GET', undefined, '/api/assessments/' + id + '/result-editor'), parameters(id)),
    review: (actor, id, data) => routes.editor.POST(request(actor, 'POST', data, '/api/assessments/' + id + '/result-editor'), parameters(id)),
  };
  const status = (response, expected, message) => { check(response.status, expected, message); check(response.headers.get('cache-control'), 'no-store', message + ': no-store'); };
  const body = async (response, expected, message) => { status(response, expected, message); return response.json(); };
  const count = table => sqlite.prepare(`SELECT count(*) n FROM ${table}`).get().n;
  const sql = (text, ...values) => sqlite.prepare(text).run(...values);
  const row = (text, ...values) => ({ ...sqlite.prepare(text).get(...values) });
  const rows = (text, ...values) => sqlite.prepare(text).all(...values).map(item => ({ ...item }));
  const raises = (text, pattern, message, ...values) => { let failure = null; try { sqlite.prepare(text).run(...values); } catch (error) { failure = String(error.message); } okay(pattern.test(failure ?? ''), message + ' (' + failure + ')'); };
  // Record results and publish an assessment as its assigned teacher.
  const record = async (assessmentId, results, actor = 'teacher-a') => status(await api.legacy(actor, assessmentId, results), 200, 'Record results for ' + assessmentId);
  const publishResults = async (assessmentId, partial = true, actor = 'teacher-a') => body(await api.lifecycle(actor, assessmentId, { clientRequestId: uuid(), action: 'publish', partialConfirmed: partial }), 201, 'Publish results of ' + assessmentId);
  const draft = (extra = {}) => ({ studentId: 'student-a', term: 'Synthetic term 1', summary: noteText, overallGrade: 'Supplied grade', ...extra });
  const interrupt = (mutate) => {
    let done = false;
    globalThis.__sahaTestDb = new Proxy(base, { get(target, property) {
      if (property === 'batch') return (...args) => { if (!done) { done = true; globalThis.__sahaTestDb = base; mutate(); } return target.batch(...args); };
      const value = Reflect.get(target, property, target); return typeof value === 'function' ? value.bind(target) : value;
    } });
    return () => { globalThis.__sahaTestDb = base; check(done, true, 'The late change ran after pre-validation and before the compile batch'); };
  };
  try { await action({ ...fixture, request, api, status, body, count, sql, row, rows, raises, record, publishResults, draft, uuid, interrupt }); scenarios++; }
  finally { globalThis.__sahaTestDb = undefined; sqlite.close(); }
}

try {
  await scenario('eligibility lists only published, valid, single results for the learner and is administrator only', async ({ api, request, status, body, record, publishResults }) => {
    status(await api.eligible(null), 401, 'Anonymous is refused');
    for (const actor of ['teacher-a', 'guardian-a', 'student-user-a']) status(await api.eligible(actor), 403, 'Role ' + actor + ' is refused');
    status(await api.eligible('admin-b'), 404, 'Other school administrator cannot see the learner');
    status(await api.eligible('admin-a', 'missing'), 404, 'Unknown learner');
    status(await routes.eligible.GET(request('admin-a', 'GET', undefined, '/api/report-cards/eligible')), 400, 'A missing learner id is a plain 400');
    await record('assessment-a', [{ studentId: 'student-a', score: 0, grade: '', feedback: '' }]);
    await record('assessment-a2', [{ studentId: 'student-a', score: 40, grade: 'Merit' }]);
    await record('assessment-a3', [{ studentId: 'student-a', score: 7, grade: 'Draft only' }]);
    check(await body(await api.eligible('admin-a'), 200, 'Nothing is published yet'), [], 'Unpublished results are never eligible');
    await publishResults('assessment-a');
    await publishResults('assessment-a2');
    const list = await body(await api.eligible('admin-a'), 200, 'Eligible list');
    check(list.map(item => item.assessmentId), ['assessment-a', 'assessment-a2'], 'Only published assessments for this learner, in date order');
    check(list[0], { assessmentId: 'assessment-a', title: 'Synthetic quiz', kind: 'quiz', date: '2026-10-05', maxScore: 20, score: 0, grade: '', classId: 'class-a', className: 'class-a', publishedAt: list[0].publishedAt, inReports: 0 }, 'A saved zero with an empty grade is eligible and exact');
    check(list.some(item => item.assessmentId === 'assessment-a3' || item.assessmentId === 'assessment-other'), false, 'Unpublished and other-class assessments are absent');
    const second = await body(await api.eligible('admin-a', 'student-a2'), 200, 'A learner without results');
    check(second, [], 'A learner without saved results has no eligible rows');
  });
  await scenario('compile is atomic, validates every selection and freezes exact result lines', async ({ api, status, body, count, row, rows, record, publishResults, draft, sql, interrupt }) => {
    await record('assessment-a', [{ studentId: 'student-a', score: 0, grade: '', feedback: '' }]);
    await record('assessment-a2', [{ studentId: 'student-a', score: 40, grade: 'Merit' }]);
    await record('assessment-a3', [{ studentId: 'student-a', score: 7 }]);
    await record('assessment-other', [{ studentId: 'student-other', score: 55 }], 'teacher-other');
    await publishResults('assessment-other', false, 'teacher-other');
    await publishResults('assessment-a'); await publishResults('assessment-a2');
    status(await api.compile('teacher-a', draft({ assessmentIds: ['assessment-a'] })), 403, 'Teacher cannot compile');
    status(await api.compile('guardian-a', draft({ assessmentIds: ['assessment-a'] })), 403, 'Family cannot compile');
    status(await api.compile('admin-b', draft({ assessmentIds: ['assessment-a'] })), 404, 'Other-school administrator cannot compile for the learner');
    for (const [extra, label] of [[{ assessmentIds: 'assessment-a' }, 'non-array ids'], [{ assessmentIds: Array(51).fill('x') }, 'too many ids'], [{ term: '' }, 'empty term'], [{ term: 'x'.repeat(201), assessmentIds: ['assessment-a'] }, 'overlong term']]) {
      status(await api.compile('admin-a', draft(extra)), 400, 'Rejected: ' + label);
    }
    check(count('report_cards'), 3, 'Refusals created no report');
    check(await body(await api.compile('admin-a', draft({ assessmentIds: ['assessment-a3'] })), 409, 'Unpublished assessment'), { error: 'Conflict', code: 'result_unavailable' }, 'An unpublished assessment cannot be compiled');
    check(await body(await api.compile('admin-a', draft({ assessmentIds: ['assessment-other'] })), 409, "Another class' assessment"), { error: 'Conflict', code: 'result_unavailable' }, "Another learner's assessment cannot be compiled");
    check(await body(await api.compile('admin-a', draft({ assessmentIds: ['assessment-a', 'assessment-a'] })), 409, 'Duplicate'), { error: 'Conflict', code: 'duplicate_assessment' }, 'A duplicate selection is refused');
    check(count('report_cards'), 3, 'Conflicts created no report');
    check(count('report_card_lines'), 0, 'Conflicts created no lines');
    const created = await body(await api.compile('admin-a', draft({ assessmentIds: ['assessment-a2', 'assessment-a'] })), 201, 'Compile from published results');
    check([created.studentId, created.publishedAt, created.term, created.overallGrade, created.summary], ['student-a', null, 'Synthetic term 1', 'Supplied grade', noteText], 'Compiled report is a private draft with school-typed text');
    const lines = rows('SELECT * FROM report_card_lines WHERE report_id=? ORDER BY assessment_date', created.id);
    check(lines.map(line => [line.assessment_id, line.score, line.max_score, line.grade, line.assessment_title, line.assessment_kind]),
      [['assessment-a', 0, 20, '', 'Synthetic quiz', 'quiz'], ['assessment-a2', 40, 50, 'Merit', 'Synthetic project', 'project']], 'Lines freeze raw zero, empty grade, title, type and maximum');
    check(lines.every(line => line.publication_id && line.result_id && line.result_updated_at), true, 'Each line names its publication receipt and result');
    check(row('SELECT typeof(score) a, typeof(max_score) b FROM report_card_lines WHERE assessment_id=?', 'assessment-a'), { a: 'integer', b: 'integer' }, 'Scores are stored as integers');
    const eligible = await body(await api.eligible('admin-a'), 200, 'After compile');
    check(eligible.map(item => [item.assessmentId, item.inReports]), [['assessment-a', 1], ['assessment-a2', 1]], 'Eligibility counts how many reports already use each result');
    // The plain draft contract is unchanged and has no lines.
    const plain = await body(await api.compile('admin-a', draft({ term: 'Plain draft' })), 201, 'Plain draft');
    check([plain.publishedAt, count('report_card_lines')], [null, 2], 'A plain draft keeps the original contract and adds no lines');
    // A late change between validation and the batch rolls the whole compile back.
    const before = [count('report_cards'), count('report_card_lines')];
    const late = interrupt(() => sql("INSERT INTO assessment_publications(id,school_id,assessment_id,class_id,action,actor_id,reason,partial_confirmed,expected_pupils,recorded_results,request_hash,created_at) VALUES('late-off','a','assessment-a2','class-a','unpublish','teacher-a','Synthetic late unpublish.',0,2,1,'x','2026-10-07T00:00:00.000Z')"));
    const raced = await api.compile('admin-a', draft({ term: 'Raced', assessmentIds: ['assessment-a2'] }));
    late();
    check(raced.status, 409, 'A selection unpublished after validation conflicts');
    check((await raced.json()).code, 'result_changed', 'With the plain changed-results reason');
    check([count('report_cards'), count('report_card_lines')], before, 'The conflicting compile left no partial report or line');
  });
  await scenario('family and learner see only published reports for their own linked learner, with one receipt and one notice', async ({ api, status, body, count, rows, row, record, publishResults, draft }) => {
    await record('assessment-a', [{ studentId: 'student-a', score: 0, grade: '', feedback: '' }]);
    await record('assessment-a2', [{ studentId: 'student-a', score: 40, grade: 'Merit' }]);
    await publishResults('assessment-a'); await publishResults('assessment-a2');
    const created = await body(await api.compile('admin-a', draft({ assessmentIds: ['assessment-a', 'assessment-a2'] })), 201, 'Compile');
    const plain = await body(await api.compile('admin-a', draft({ term: 'Plain private draft' })), 201, 'Plain draft');
    for (const actor of ['guardian-a', 'student-user-a', 'guardian-other', 'admin-b', 'teacher-other']) {
      status(await api.detail(actor, created.id), 404, actor + ' cannot read the unpublished compiled report');
      status(await api.card(actor, created.id), 404, actor + ' cannot read the unpublished report record');
    }
    for (const actor of ['guardian-a', 'student-user-a']) {
      const visible = await body(await api.list(actor), 200, actor + ' report list');
      check(visible.map(item => item.id), ['published-a'], actor + ' list holds only the published legacy report, no draft');
    }
    status(await api.detail('guardian-a', plain.id), 404, 'A plain private draft is also private');
    const staff = await body(await api.detail('teacher-a', created.id), 200, 'The assigned teacher can read the draft');
    check([staff.studentName, staff.lines.map(line => [line.title, line.score, line.maxScore, line.grade, line.current]), staff.resultsChanged, staff.corrects, staff.supersededBy],
      ['student-a Synthetic', [['Synthetic quiz', 0, 20, '', true], ['Synthetic project', 40, 50, 'Merit', true]], false, null, null], 'Staff see lines, name and current flags');
    status(await api.publish('teacher-a', created.id), 403, 'Teacher cannot publish');
    status(await api.publish('guardian-a', created.id), 403, 'Family cannot publish');
    status(await api.publish('admin-b', created.id), 404, 'Other-school administrator cannot publish');
    const concurrent = await Promise.all([api.publish('admin-a', created.id), api.publish('admin-a', created.id)]);
    check(concurrent.map(item => item.status), [200, 200], 'Concurrent publishers converge');
    const published = await concurrent[0].json();
    check((await concurrent[1].json()).publishedAt, published.publishedAt, 'The loser reads the exact winning time');
    check(count('report_publication_receipts'), 1, 'Exactly one receipt');
    check(rows('SELECT * FROM notifications WHERE id LIKE ?', 'report-card-published:' + created.id + ':%').map(item => item.user_id), ['guardian-a'], 'Exactly one in-app notice for the linked guardian');
    check(row('SELECT published_at FROM report_cards WHERE id=?', created.id).published_at, published.publishedAt, 'Report time equals the receipt time');
    check((await api.publish('admin-a', created.id)).status, 200, 'Retry stays 200');
    check([count('report_publication_receipts'), count('notifications')], [1, 4], 'Retry adds no receipt and no notice');
    for (const actor of ['guardian-a', 'student-user-a']) {
      const view = await body(await api.detail(actor, created.id), 200, actor + ' reads the published report');
      check(view.lines.map(line => [line.title, line.score, line.maxScore, line.grade, line.current]), [['Synthetic quiz', 0, 20, '', null], ['Synthetic project', 40, 50, 'Merit', null]], actor + ' sees frozen lines; raw zero and empty grade exact; no staff flag');
      check([view.resultsChanged, Object.keys(view.lines[0]).sort()], [null, ['assessmentId', 'current', 'date', 'grade', 'kind', 'maxScore', 'score', 'title']], actor + ' view exposes no feedback or internal ids');
      check((await api.list(actor)).status, 200, 'List still works');
      check((await (await api.list(actor)).json()).map(item => item.id).sort(), ['published-a', created.id].sort(), actor + ' list now has the published report only');
    }
    status(await api.detail('guardian-other', created.id), 404, 'An unrelated guardian still cannot read it');
    status(await api.detail('admin-b', created.id), 404, 'Another school still cannot read it');
    status(await api.detail('guardian-a', plain.id), 404, 'Other drafts stay private after publication of a sibling');
    const legacy = await body(await api.detail('guardian-a', 'published-a'), 200, 'A legacy report without lines');
    check([legacy.lines, legacy.corrects, legacy.supersededBy], [[], null, null], 'Legacy reports without lines still open');
    status(await api.detail('guardian-a', 'published-b'), 404, 'A foreign learner report stays hidden');
  });
  await scenario('stale results block publication and a published report is corrected by a linked replacement with history kept', async ({ api, status, body, count, row, rows, record, publishResults, draft, uuid }) => {
    await record('assessment-a', [{ studentId: 'student-a', score: 0, grade: '', feedback: '' }]);
    await record('assessment-a2', [{ studentId: 'student-a', score: 40, grade: 'Merit' }]);
    await publishResults('assessment-a'); await publishResults('assessment-a2');
    const first = await body(await api.compile('admin-a', draft({ term: 'First report', assessmentIds: ['assessment-a', 'assessment-a2'] })), 201, 'First report');
    const staleDraft = await body(await api.compile('admin-a', draft({ term: 'Compiled before correction', assessmentIds: ['assessment-a', 'assessment-a2'] })), 201, 'Second draft');
    status(await api.publish('admin-a', first.id), 200, 'First report published');
    // A reviewed correction of a published result is allowed and keeps evidence.
    const snapshot = await body(await api.snapshot('teacher-a', 'assessment-a'), 200, 'Editor snapshot');
    const entry = snapshot.roster.items.find(item => item.student.id === 'student-a');
    await body(await api.review('teacher-a', 'assessment-a', { clientRequestId: uuid(), reviewConfirmed: true, reason: 'Correction after the paper was re-marked.', expectedAssessment: snapshot.assessment,
      entries: [{ studentId: 'student-a', score: 12, grade: 'B', feedback: null, expectedRecord: entry.record }] }), 201, 'Reviewed correction');
    const frozen = await body(await api.detail('guardian-a', first.id), 200, 'Family still sees the report as published');
    check(frozen.lines[0], { assessmentId: 'assessment-a', title: 'Synthetic quiz', kind: 'quiz', date: '2026-10-05', maxScore: 20, score: 0, grade: '', current: null }, 'A published report keeps its frozen lines');
    const flagged = await body(await api.detail('admin-a', first.id), 200, 'Staff view of the published report');
    check([flagged.resultsChanged, flagged.lines.map(line => line.current)], [true, [false, true]], 'Staff are told the results changed after compile');
    const refused = await body(await api.publish('admin-a', staleDraft.id), 409, 'Stale draft publication');
    check(refused, { error: 'Conflict', code: 'results_changed' }, 'A report compiled before the correction cannot be published');
    check([row('SELECT published_at FROM report_cards WHERE id=?', staleDraft.id).published_at, count('report_publication_receipts')], [null, 1], 'The stale draft stayed private and no receipt was written');
    // Correction path validation.
    const correction = (reportId, reason = 'Marks corrected after a recheck of the paper.') => ({ reportId, reason });
    check(await body(await api.compile('admin-a', draft({ term: 'Bad', assessmentIds: ['assessment-a'], correction: correction(staleDraft.id) })), 409, 'Correct a draft'), { error: 'Conflict', code: 'correction_invalid' }, 'Only a published report can be corrected');
    check(await body(await api.compile('admin-a', draft({ term: 'Bad', correction: correction('published-b') })), 409, 'Correct a foreign report'), { error: 'Conflict', code: 'correction_invalid' }, 'A report of another learner cannot be corrected');
    status(await api.compile('admin-a', draft({ term: 'Bad', correction: correction(first.id, 'short') })), 400, 'A correction needs a real reason');
    check(count('report_card_corrections'), 0, 'Refused corrections left no link');
    // Unpublish is blocked while a published report uses the result.
    check(await body(await api.lifecycle('teacher-a', 'assessment-a', { clientRequestId: uuid(), action: 'unpublish', reason: 'Withdraw the results for review.' }), 409, 'Unpublish in use'), { error: 'Conflict', code: 'in_published_report' }, 'Results in a published report cannot be unpublished');
    const replacement = await body(await api.compile('admin-a', draft({ term: 'Corrected first report', assessmentIds: ['assessment-a'], correction: correction(first.id) })), 201, 'Replacement draft');
    check(rows('SELECT original_report_id,replacement_report_id,student_id,school_id,created_by,reason FROM report_card_corrections'),
      [{ original_report_id: first.id, replacement_report_id: replacement.id, student_id: 'student-a', school_id: 'a', created_by: 'admin-a', reason: 'Marks corrected after a recheck of the paper.' }], 'Correction link keeps original, replacement, actor and reason');
    check(row('SELECT score,grade FROM report_card_lines WHERE report_id=?', replacement.id), { score: 12, grade: 'B' }, 'The replacement compiles the corrected value');
    const draftLinks = await body(await api.detail('admin-a', first.id), 200, 'Staff see the pending replacement');
    check([draftLinks.supersededBy?.id, draftLinks.supersededBy?.publishedAt], [replacement.id, null], 'Staff see an unpublished replacement');
    const familyBefore = await body(await api.detail('guardian-a', first.id), 200, 'Family before replacement publication');
    check(familyBefore.supersededBy, null, 'Family never see an unpublished replacement');
    status(await api.detail('guardian-a', replacement.id), 404, 'The replacement draft is private');
    status(await api.publish('admin-a', replacement.id), 200, 'Replacement published');
    check(count('report_publication_receipts'), 2, 'Two receipts after the replacement');
    const original = await body(await api.detail('guardian-a', first.id), 200, 'Original after replacement');
    check([original.supersededBy?.id, original.supersededBy?.term, typeof original.supersededBy?.publishedAt], [replacement.id, 'Corrected first report', 'string'], 'The original now points the family to the corrected report');
    check(original.lines.map(line => line.score), [0, 40], 'History is preserved: the original keeps its original values');
    const corrected = await body(await api.detail('student-user-a', replacement.id), 200, 'Learner reads the replacement');
    check([corrected.corrects?.id, corrected.corrects?.term, corrected.lines.map(line => line.score)], [first.id, 'First report', [12]], 'The replacement links back to the original and shows corrected values');
    check((await (await api.list('guardian-a')).json()).map(item => item.id).sort(), ['published-a', first.id, replacement.id].sort(), 'Both reports stay in the family list');
    check(await body(await api.compile('admin-a', draft({ term: 'Again', correction: correction(first.id) })), 409, 'Correct a superseded report'), { error: 'Conflict', code: 'correction_invalid' }, 'A superseded report cannot be corrected again');
    // Unpublish rules after the replacement.
    check(await body(await api.lifecycle('teacher-a', 'assessment-a', { clientRequestId: uuid(), action: 'unpublish', reason: 'Withdraw the results for review.' }), 409, 'Unpublish in replacement'), { error: 'Conflict', code: 'in_published_report' }, 'Results used by the live replacement stay locked');
    status(await api.lifecycle('teacher-a', 'assessment-a2', { clientRequestId: uuid(), action: 'unpublish', reason: 'Withdraw the results for review.' }), 201, 'Results only in a superseded report can be unpublished');
    check(await body(await api.publish('admin-a', staleDraft.id), 409, 'Stale draft again'), { error: 'Conflict', code: 'results_changed' }, 'The stale draft stays unpublishable');
    // Staff views of the correction chain.
    const chain = await body(await api.detail('admin-a', first.id), 200, 'Chain');
    check([chain.supersededBy.id, chain.resultsChanged], [replacement.id, true], 'Staff chain view');
  });
  await scenario('database triggers refuse forged lines, corrections and receipts and keep evidence immutable', async ({ api, status, body, count, rows, raises, record, publishResults, draft, sql }) => {
    await record('assessment-a', [{ studentId: 'student-a', score: 5, grade: 'C' }, { studentId: 'student-a2', score: 6 }]);
    await record('assessment-a3', [{ studentId: 'student-a', score: 7 }]);
    await publishResults('assessment-a', false);
    const report = await body(await api.compile('admin-a', draft({ assessmentIds: ['assessment-a'] })), 201, 'Compile');
    const line = rows('SELECT * FROM report_card_lines')[0];
    const result = rows("SELECT * FROM assessment_results WHERE assessment_id='assessment-a3'")[0];
    const insert = (overrides) => {
      const value = { id: 'forged', report_id: report.id, student_id: 'student-a', assessment_id: 'assessment-a', result_id: line.result_id, publication_id: line.publication_id, assessment_title: line.assessment_title,
        assessment_kind: line.assessment_kind, assessment_date: line.assessment_date, max_score: 20, score: 5, grade: 'C', result_updated_at: line.result_updated_at, created_at: stamp, ...overrides };
      return ['INSERT INTO report_card_lines VALUES (' + Object.keys(value).map(() => '?').join(',') + ')', ...Object.values(value)];
    };
    const forged = [
      [{ id: 'f1', assessment_id: 'assessment-a2', result_id: line.result_id }, 'a result of another assessment'],
      [{ id: 'f2', score: 6, grade: 'C' }, 'a changed score'], [{ id: 'f3', grade: 'A' }, 'a changed grade'], [{ id: 'f4', assessment_title: 'Renamed' }, 'a changed title'],
      [{ id: 'f5', assessment_id: 'assessment-a3', result_id: result.id, publication_id: line.publication_id, score: 7, grade: null, assessment_title: 'Synthetic draft quiz', assessment_kind: 'quiz', assessment_date: '2026-10-08', max_score: 10, result_updated_at: result.updated_at }, 'an unpublished assessment'],
      [{ id: 'f6', student_id: 'student-a2' }, 'a line whose learner differs from the report'],
      [{ id: 'f7', publication_id: 'not-the-current-receipt' }, 'a receipt that is not the current publication'],
    ];
    for (const [overrides, label] of forged) {
      const [text, ...values] = insert(overrides);
      let failure = null; try { sql(text, ...values); } catch (error) { failure = String(error.message); }
      okay(/saha_report_line_conflict|FOREIGN KEY|UNIQUE/.test(failure ?? ''), 'Forged line refused: ' + label + ' (' + failure + ')');
    }
    check(count('report_card_lines'), 1, 'No forged line was stored');
    status(await api.publish('admin-a', report.id), 200, 'Publish');
    for (const [statement, pattern, label] of [
      ["UPDATE report_card_lines SET score=1", /immutable/, 'Lines cannot be edited'], ['DELETE FROM report_card_lines', /immutable/, 'Lines cannot be deleted'],
    ]) raises(statement, pattern, label);
    // A line cannot be added to a report that is already published.
    const [lateText, ...lateValues] = insert({ id: 'late', assessment_id: 'assessment-a', result_id: line.result_id });
    raises(lateText, /saha_report_line_conflict|UNIQUE/, 'No line can be attached to a published report', ...lateValues);
    // Forged corrections.
    const other = await body(await api.compile('admin-a', draft({ term: 'Other draft' })), 201, 'Other draft');
    const correctionInsert = 'INSERT INTO report_card_corrections VALUES (?,?,?,?,?,?,?,?)';
    for (const [values, label] of [
      [['c1', 'a', 'student-a', report.id, report.id, 'Synthetic long enough reason.', 'admin-a', stamp], 'self correction'],
      [['c2', 'a', 'student-a', report.id, other.id, 'Synthetic long enough reason.', 'teacher-a', stamp], 'non-administrator actor'],
      [['c3', 'a', 'student-a', other.id, report.id, 'Synthetic long enough reason.', 'admin-a', stamp], 'draft as the original'],
      [['c4', 'b', 'student-a', report.id, other.id, 'Synthetic long enough reason.', 'admin-b', stamp], 'another school'],
    ]) raises(correctionInsert, /saha_report_correction_conflict|CHECK/, 'Forged correction refused: ' + label, ...values);
    raises(correctionInsert, /CHECK/, 'A correction needs a real reason at the database too', 'c5', 'a', 'student-a', report.id, other.id, 'short', 'admin-a', stamp);
    check(count('report_card_corrections'), 0, 'No forged correction stored');
    const replacement = await body(await api.compile('admin-a', draft({ term: 'Real correction', assessmentIds: ['assessment-a'], correction: { reportId: report.id, reason: 'Marks corrected after a recheck of the paper.' } })), 201, 'A genuine correction');
    check(count('report_card_corrections'), 1, 'The genuine correction is stored');
    raises("UPDATE report_card_corrections SET reason='Changed after the fact.'", /immutable/, 'Corrections are immutable');
    raises('DELETE FROM report_card_corrections', /immutable/, 'Corrections cannot be deleted');
    void replacement;
    // Raw publication events: only live staff of the class may write them.
    const pub = 'INSERT INTO assessment_publications(id,school_id,assessment_id,class_id,action,actor_id,reason,partial_confirmed,expected_pupils,recorded_results,request_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)';
    raises(pub, /saha_assessment_publication_conflict/, 'A guardian cannot write a publication event', 'p1', 'a', 'assessment-a3', 'class-a', 'publish', 'guardian-a', null, 0, 2, 1, 'x', stamp);
    raises(pub, /saha_assessment_publication_conflict/, 'An unassigned teacher cannot write a publication event', 'p2', 'a', 'assessment-a3', 'class-a', 'publish', 'teacher-other', null, 0, 2, 1, 'x', stamp);
    raises(pub, /saha_assessment_publication_conflict/, 'Coverage numbers must be the real current counts', 'p3', 'a', 'assessment-a3', 'class-a', 'publish', 'teacher-a', null, 1, 99, 99, 'x', stamp);
    raises(pub, /saha_assessment_publication_unready/, 'A partial publication needs its confirmation flag', 'p4', 'a', 'assessment-a3', 'class-a', 'publish', 'teacher-a', null, 0, 2, 1, 'x', stamp);
    raises(pub, /saha_assessment_publication_conflict/, 'Unpublishing a never-published assessment is refused', 'p5', 'a', 'assessment-a3', 'class-a', 'unpublish', 'teacher-a', 'Synthetic long enough reason.', 0, 2, 1, 'x', stamp);
    raises(pub, /saha_assessment_publication_in_use/, 'Unpublish while a published report uses the results is refused at the database', 'p6', 'a', 'assessment-a', 'class-a', 'unpublish', 'teacher-a', 'Synthetic long enough reason.', 0, 2, 2, 'x', stamp);
    check(count('assessment_publications'), 1, 'Only the genuine publication event exists');
  });
  console.log('part ok', passed);
} finally { globalThis.fetch = oldFetch; }
check(networkCalls, 0, 'No external request');
console.log(JSON.stringify({ passed, failed: 0, skipped: 0, scenarios, networkCalls }));
