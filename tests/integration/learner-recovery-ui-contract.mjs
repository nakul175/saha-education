// Independent synthetic route/session/D1 contracts with unchanged production client callbacks.
// React hooks/elements are substituted: this is callback-state evidence, not mounted-browser coverage.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate as turn } from 'node:timers/promises';
import ts from 'typescript';
import { drizzle } from 'drizzle-orm/d1';
import { freshDatabase, seedSecurityData, load, bindings, root } from '../support/security-db.mjs';
import { serverWork, settleQuiet } from '../support/quiescence.mjs';

const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
const routes = {
  session: await load('app/api/session/route.ts'), assignments: await load('app/api/resource-assignments/route.ts'),
  attempts: await load('app/api/assignments/[id]/submissions/route.ts'), feedback: await load('app/api/assignments/[id]/submissions/[submissionId]/feedback/route.ts'),
  window: await load('app/api/assignments/[id]/submission-window/route.ts'), history: await load('app/api/assignments/[id]/submission-window/history/route.ts'),
  students: await load('app/api/students/[id]/route.ts'), classes: await load('app/api/classes/route.ts'),
  attendance: await load('app/api/classes/[id]/attendance-editor/route.ts'), attendanceHistory: await load('app/api/classes/[id]/attendance-editor/history/route.ts'),
};
const resources = await load('lib/education/resources.ts'), sessions = await load('lib/education/session.ts');
let checks = 0, scenarios = 0, requests = 0, externalRequests = 0, activeUI;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const okay = (actual, message) => { assert.ok(actual, message); checks++; };
const oldFetch = globalThis.fetch, oldWindow = globalThis.window;
const redirects = [];
globalThis.window = { location: { origin, assign(path) { redirects.push(path); } } };
function nodes(node) { return Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : []; }
function content(node) { return Array.isArray(node) ? node.map(content).join('') : node && typeof node === 'object' ? content(node.props?.children) : node == null || typeof node === 'boolean' ? '' : String(node); }
globalThis.__sahaRecoveryReact = {
  createElement(type, props, ...kids) { const values = { ...props, children: kids.length === 1 ? kids[0] : kids }; return typeof type === "function" ? type(values) : { type, props: values }; },
  use(value) { return value; },
  useState(initial) { const ui = activeUI, index = ui.index++; if (!ui.cells[index]) ui.cells[index] = { value: typeof initial === 'function' ? initial() : initial }; return [ui.cells[index].value, next => { ui.cells[index].value = typeof next === 'function' ? next(ui.cells[index].value) : next; }]; },
  useCallback(callback, deps) { const ui = activeUI, index = ui.index++, previous = ui.cells[index]; if (!previous || deps.some((value, i) => value !== previous.deps[i])) ui.cells[index] = { deps, value: callback }; return ui.cells[index].value; },
  useRef(initial) { const ui = activeUI, index = ui.index++; if (!ui.cells[index]) ui.cells[index] = { current: initial }; return ui.cells[index]; },
  useEffect(effect, deps) { const ui = activeUI, index = ui.index++, previous = ui.cells[index]; if (!previous || !deps || !previous.deps || deps.some((value, i) => value !== previous.deps[i])) { previous?.cleanup?.(); ui.cells[index] = { deps }; ui.effects.push(() => { ui.cells[index].cleanup = effect(); }); } },
};
async function client(path) {
  const compiled = ts.transpileModule(readFileSync(root + path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } }).outputText;
  const source = 'const React=globalThis.__sahaRecoveryReact;const {use,useState,useRef,useEffect,useCallback}=React;const Button="button";const AppShell="app-shell",Card="section",CardContent="div",CardHeader="header",CardTitle="h2",Input="input",Label="label";' + (path === 'components/assignment-submission-window.tsx' ? '' : 'const AssignmentSubmissionWindow="window-control";') + 'const getPrincipal=async()=>{const r=await fetch("/api/session");if(!r.ok){await r.arrayBuffer();throw new Error("Session unavailable");}return r.json();};\n' + compiled.replace(/^import[^\n]*;\n/gm, '') + '\n//# sourceURL=saha-recovery-client-' + path.replaceAll('/', '-') + '\n';
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}
const assignmentClient = await client('app/assignments/[id]/page.tsx');
const windowClient = await client('components/assignment-submission-window.tsx');
const learningClient = await client('app/learning/page.tsx');
const attendanceClient = await client('app/classes/[id]/attendance/page.tsx');
const settle = () => settleQuiet();
function driver(Component, props) {
  const ui = { cells: [], effects: [], index: 0, props, tree: null,
    render() { activeUI = ui; ui.index = 0; ui.effects = []; ui.tree = Component(ui.props); for (const effect of ui.effects) effect(); return ui.tree; },
    all(predicate) { return nodes(ui.tree).filter(predicate); },
    one(predicate) { const found = ui.all(predicate); assert.equal(found.length, 1, 'Expected exactly one source callback control'); return found[0]; },
    button(label) { return ui.one(item => item.type === 'button' && (typeof label === 'string' ? content(item).includes(label) : label.test(content(item)))); },
    async flush() { await settle(); ui.render(); await settle(); ui.render(); },
    async change(predicate, value) { ui.one(predicate).props.onChange({ target: { value, checked: value } }); await ui.flush(); },
    async click(label) { const button = ui.button(label); okay(!button.props.disabled, 'Requested native action is enabled'); await button.props.onClick(); await ui.flush(); },
    async submit() { await ui.one(item => item.type === 'form').props.onSubmit({ preventDefault() {} }); await ui.flush(); },
    dispose() { for (const cell of ui.cells) cell?.cleanup?.(); },
  }; ui.render(); return ui;
}
function hasText(ui, value) { return content(ui.tree).includes(value); }
function enabled(ui, label) { return ui.all(item => item.type === 'button' && content(item).includes(label)).some(item => !item.props.disabled); }
function allInputsLocked(ui) { return ui.all(item => ['textarea', 'select'].includes(item.type) || item.type === 'input' && item.props.type !== 'hidden').every(item => item.props.disabled || ui.all(parent => parent.type === 'fieldset' && parent.props.disabled && nodes(parent).includes(item)).length > 0); }
const attemptRetryLabel = /Retry pending (response|attempt)/i;
const feedbackRetryLabel = /Retry pending feedback/i;
const windowRetryLabel = /Retry pending window review/i;
const refreshAssignment = 'Refresh saved history';
const actors = ['student-user-a', 'student-user-other', 'teacher-a', 'teacher-other', 'admin-a', 'guardian-a'];

async function scenario(name, actor, action) {
  const fixture = freshDatabase(); await seedSecurityData(fixture.db, fixture.schema);
  const cookies = {};
  for (const id of actors) cookies[id] = (await sessions.createSession(id)).split(';')[0];
  const teacher = { id: 'teacher-a', role: 'teacher', schoolId: 'a' };
  const resource = await resources.createResource(teacher, { content: { title: 'SYNTHETIC_RECOVERY_MATERIAL', type: 'worksheet', curriculum: 'Synthetic', gradeLevel: '8', subject: 'Math', language: 'en-IN', objectives: 'Explain synthetic reasoning.', body: 'SYNTHETIC_LEARNER_BODY', teacherNotes: 'PRIVATE_STAFF_ONLY_RECOVERY', answerKey: 'PRIVATE_STAFF_KEY_RECOVERY' } });
  await resources.approveResource(teacher, resource.id, resource.latest.id);
  const assignment = await resources.assignResource(teacher, resource.id, { classId: 'class-a', versionId: resource.latest.id });
  const { sqlite, schema } = fixture;
  function prepare(query, values = []) {
    return { bind(...params) { return prepare(query, params); },
      async raw() { const statement = sqlite.prepare(query); statement.setReturnArrays(true); return statement.all(...values); },
      async all() { return { success: true, results: sqlite.prepare(query).all(...values), meta: {} }; },
      async run() { const statement = sqlite.prepare(query); if (statement.columns().length) return { success: true, results: statement.all(...values), meta: {} }; const result = statement.run(...values); return { success: true, results: [], meta: { changes: Number(result.changes) } }; },
    };
  }
  globalThis.__sahaTestDb = drizzle({ prepare, async batch(statements) { sqlite.exec('BEGIN'); try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec('COMMIT'); return result; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } }, { schema });
  const submissionsPath = '/api/assignments/' + assignment.id + '/submissions', windowPath = '/api/assignments/' + assignment.id + '/submission-window';
  let currentActor = actor, intercept;
  const trace = [], delivered = [], uis = [];
  function api(...args) { return serverWork(() => routeApi(...args)); }
  async function routeApi(path, method = 'GET', payload, user = currentActor) {
    const url = new URL(path, origin); if (url.origin !== origin) { externalRequests++; throw new Error('External requests are forbidden in synthetic recovery tests.'); }
    requests++;
    const headers = { origin }; if (user) headers.cookie = cookies[user];
    const request = new Request(url, { method, headers: { ...headers, ...(payload === undefined ? {} : { 'content-type': 'application/json' }) }, ...(payload === undefined ? {} : { body: typeof payload === 'string' ? payload : JSON.stringify(payload) }) });
    const context = { params: Promise.resolve({ id: assignment.id, submissionId: url.pathname.match(/\/submissions\/([^/]+)\/feedback/)?.[1] }) };
    if (url.pathname.endsWith('/attendance-editor/history')) return routes.attendanceHistory[method](request, { params: Promise.resolve({ id: 'class-a' }) });
    if (url.pathname.endsWith('/attendance-editor')) return routes.attendance[method](request, { params: Promise.resolve({ id: 'class-a' }) });
    if (url.pathname === '/api/session') return routes.session[method](request);
    if (url.pathname === '/api/resource-assignments') return routes.assignments[method](request);
    if (url.pathname === '/api/classes') return routes.classes[method](request);
    if (url.pathname.startsWith('/api/students/')) return routes.students[method](request, { params: Promise.resolve({ id: url.pathname.split('/').at(-1) }) });
    if (url.pathname.endsWith('/submission-window/history')) return routes.history[method](request, context);
    if (url.pathname.endsWith('/submission-window')) return routes.window[method](request, context);
    if (url.pathname.endsWith('/feedback')) return routes.feedback[method](request, context);
    if (url.pathname.endsWith('/submissions')) return routes.attempts[method](request, context);
    throw new Error('Unexpected recovery API path: ' + url.pathname);
  }
  globalThis.fetch = async (path, options = {}) => {
    const response = await api(String(path), options.method || 'GET', options.body);
    trace.push({ path: String(path), method: options.method || 'GET', status: response.status, body: options.body ?? null, ...(options.body ? { payload: JSON.parse(options.body) } : {}) });
    const value = intercept ? await intercept({ path: String(path), options, response }) : response;
    if (value) delivered.push(value);
    return value;
  };
  async function mount(Component = assignmentClient.default, props = { params: { id: assignment.id } }) { const ui = driver(Component, props); uis.push(ui); await ui.flush(); return ui; }
  async function post(path, payload, user = currentActor, status = 201) { const response = await api(path, 'POST', payload, user); check(response.status, status, name + ': actual mutation status'); return response.json(); }
  function count(table) { return sqlite.prepare('SELECT count(*) n FROM ' + table).get().n; }
  function writes(path) { return trace.filter(item => item.method === 'POST' && item.path === path); }
  function lose(path, kind = 'network') { let lost; intercept = async ({ path: selected, options, response }) => { if (selected === path && options.method === 'POST' && !lost) { check(response.status, 201, 'Uncertain delivery follows a real committed route mutation'); lost = JSON.parse(options.body); await response.arrayBuffer(); if (kind === 'network') throw new TypeError('Synthetic committed acknowledgement delivery failure'); if (kind === 'malformed') return new Response('{invalid', { status: 201, headers: { 'content-type': 'application/json' } }); if (kind === 'invalid-shape') return new Response('{}', { status: 201, headers: { 'content-type': 'application/json' } }); return new Response(JSON.stringify({ error: 'Synthetic acknowledgement unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } }); } return response; }; return { get payload() { return lost; }, stop() { intercept = undefined; } }; }
  function drained() { check(delivered.every(response => response.bodyUsed), true, 'Every delivered success/error body is consumed by the production callbacks'); }
  try { await action({ ...fixture, assignment, resource, api, post, mount, count, writes, trace, submissionsPath, windowPath, lose, drained, setActor(id) { currentActor = id; }, intercept(value) { intercept = value; } }); scenarios++; }
  finally { intercept = undefined; for (const ui of uis) ui.dispose(); await settle(); sqlite.close(); }
}

try {
  // These are regression contracts for the saved client recovery source.
  // The original pre-fix failure was recorded separately as diagnostic evidence.
  await scenario('Committed response uncertainty preserves exact request across newer attempt and closure', 'student-user-a', async ({ mount, lose, post, writes, count, submissionsPath, windowPath, drained }) => {
    const ui = await mount(); await ui.change(item => item.type === 'textarea', 'Original pending learner response.');
    const lost = lose(submissionsPath); await ui.submit(); lost.stop();
    check(count('submission_attempts'), 1, 'Lost acknowledgement still committed exactly one original attempt');
    okay(allInputsLocked(ui), 'Pending response freezes editable controls rather than silently rebasing');
    await post(submissionsPath, { clientSubmissionId: crypto.randomUUID(), expectedAttempt: 1, response: 'Later independently saved response.' });
    await post(windowPath, { clientPolicyId: crypto.randomUUID(), expectedRevision: 0, state: 'closed', closesAt: null, reviewConfirmed: true, reason: 'Synthetic later explicit closure.' }, 'teacher-a');
    await ui.click(refreshAssignment); okay(allInputsLocked(ui), 'Authorized refresh retains pending request lock');
    await ui.click(attemptRetryLabel);
    const posted = writes(submissionsPath); check(posted.at(-1).payload, lost.payload, 'Retry repeats original complete UUID/CAS/text payload'); check(posted.at(-1).body, posted[0].body, 'Pending response retry preserves exact original serialized body');
    check(count('submission_attempts'), 2, 'Original retry after a newer attempt/closure creates no third response');
    okay(hasText(ui, 'Original pending learner response.'), 'Original committed response acknowledgement remains attributable');
    okay(hasText(ui, 'Later independently saved response.'), 'Current latest response remains visible separately');
    check(ui.one(item => item.type === 'textarea').props.disabled, false, 'Resolved pending request permits editing after authorized acknowledgement');
    drained();
  });
  for (const kind of ['network', 'malformed', 'invalid-shape', 'unavailable']) await scenario('Response ' + kind + ' uncertainty permits only exact recovery', 'student-user-a', async ({ mount, lose, writes, count, submissionsPath, drained }) => {
    const ui = await mount(); await ui.change(item => item.type === 'textarea', 'Original ' + kind + ' uncertain response.');
    const lost = lose(submissionsPath, kind); await ui.submit(); lost.stop();
    check(count('submission_attempts'), 1, 'Uncertain result committed only original attempt'); okay(allInputsLocked(ui), 'Uncertain response locks all editable fields');
    await ui.click(refreshAssignment); await ui.click(attemptRetryLabel);
    check(writes(submissionsPath).at(-1).payload, lost.payload, 'Recovery after refresh preserves exact pending request'); check(count('submission_attempts'), 1, 'Recovery is an exact original receipt replay'); drained();
  });
  await scenario('Reviewed feedback uncertainty cannot publish duplicate after later revision', 'teacher-a', async ({ post, mount, submissionsPath, lose, count, writes, drained }) => {
    const attempt = await post(submissionsPath, { clientSubmissionId: crypto.randomUUID(), expectedAttempt: 0, response: 'Synthetic saved learner response.' }, 'student-user-a');
    const feedbackPath = submissionsPath + '/' + attempt.id + '/feedback';
    const ui = await mount(); await ui.change(item => item.type === 'textarea', 'Original pending reviewed feedback.'); await ui.change(item => item.type === 'input' && item.props.type === 'checkbox', true);
    const lost = lose(feedbackPath); await ui.submit(); lost.stop(); okay(allInputsLocked(ui), 'Pending feedback freezes response selection and reviewed fields');
    await post(feedbackPath, { clientFeedbackId: crypto.randomUUID(), expectedRevision: 1, feedback: 'Later independent reviewed feedback.', reviewed: true });
    await ui.click(refreshAssignment); await ui.click(feedbackRetryLabel);
    check(writes(feedbackPath).at(-1).payload, lost.payload, 'Feedback recovery uses original attempt UUID/revision/text'); check(writes(feedbackPath).at(-1).body, writes(feedbackPath)[0].body, 'Feedback recovery preserves exact serialized body'); check(count('submission_feedback'), 2, 'Recovery does not publish a duplicate feedback revision');
    okay(hasText(ui, 'Original pending reviewed feedback.'), 'Original reviewed feedback remains in immutable history'); okay(hasText(ui, 'Later independent reviewed feedback.'), 'Later reviewed feedback stays current'); drained();
  });
  await scenario('Window uncertainty returns original close alongside current reopened policy', 'teacher-a', async ({ api, mount, assignment, windowPath, lose, post, writes, count, drained }) => {
    const initial = await (await api(windowPath)).json(); let ui;
    const props = { assignmentId: assignment.id, actorId: 'teacher-a', window: initial, staff: true, onChanged(value) { ui.props.window = value; }, onAccessLost() {} };
    ui = await mount(windowClient.AssignmentSubmissionWindow, props);
    await ui.change(item => item.type === 'select', 'closed'); await ui.change(item => item.type === 'input' && item.props.minLength === 10, 'Original explicit closing review.'); await ui.change(item => item.type === 'input' && item.props.type === 'checkbox', true);
    const lost = lose(windowPath); await ui.submit(); lost.stop(); okay(allInputsLocked(ui), 'Pending window locks all review controls');
    await post(windowPath, { clientPolicyId: crypto.randomUUID(), expectedRevision: 1, state: 'open', closesAt: null, reviewConfirmed: true, reason: 'Later independently reviewed reopening.' });
    await ui.click('Refresh submission window'); okay(allInputsLocked(ui), 'Current-window refresh does not rebase the pending review'); await ui.click(windowRetryLabel);
    check(writes(windowPath).at(-1).payload, lost.payload, 'Window retry is the exact original immutable request'); check(writes(windowPath).at(-1).body, writes(windowPath)[0].body, 'Window recovery preserves exact serialized original body'); check(count('assignment_submission_windows'), 2, 'Window recovery does not create a third closing revision');
    check(ui.props.window.revision, 2, 'Recovered original receipt reports latest current revision'); check(ui.props.window.state, 'open', 'Later reopening remains current'); okay(hasText(ui, '1'), 'Original review revision acknowledgement is visible'); drained();
  });
  for (const status of [401, 403, 404]) await scenario('Assignment known ' + status + ' hides private evidence and requires same-actor reload', 'student-user-a', async ({ mount, post, submissionsPath, sqlite, setActor, lose, writes, count, drained }) => {
    await post(submissionsPath, { clientSubmissionId: crypto.randomUUID(), expectedAttempt: 0, response: 'PRIVATE_SAVED_RESPONSE_RECOVERY' });
    const ui = await mount(); await ui.change(item => item.type === 'textarea', 'Original private pending response.'); const lost = lose(submissionsPath); await ui.submit(); lost.stop();
    const redirectsBefore = redirects.length;
    if (status === 401) setActor(null);
    if (status === 403) sqlite.exec("UPDATE users SET role='guardian' WHERE id='student-user-a'");
    if (status === 404) sqlite.exec("UPDATE enrolments SET status='withdrawn' WHERE id='student-a-enrolment'");
    await ui.click(refreshAssignment);
    for (const secret of ['SYNTHETIC_RECOVERY_MATERIAL', 'SYNTHETIC_LEARNER_BODY', 'PRIVATE_SAVED_RESPONSE_RECOVERY']) check(hasText(ui, secret), false, 'Definitive access loss hides cached assignment and saved response evidence');
    if (status === 401) check(redirects.length, redirectsBefore, 'Pending unauthorized recovery keeps page memory and original UUID for another-tab sign-in');
    check(enabled(ui, 'Save response attempt'), false, 'Known denial does not leave a writable response form'); check(enabled(ui, 'Retry pending'), false, 'Pending retry waits for a valid same-actor authorized reload');
    if (status === 401) setActor('student-user-a');
    if (status === 403) sqlite.exec("UPDATE users SET role='student' WHERE id='student-user-a'");
    if (status === 404) sqlite.exec("UPDATE enrolments SET status='active' WHERE id='student-a-enrolment'");
    await ui.click(refreshAssignment); okay(hasText(ui, 'SYNTHETIC_RECOVERY_MATERIAL'), 'Authorized reload restores current evidence'); await ui.click(attemptRetryLabel);
    check(writes(submissionsPath).at(-1).payload, lost.payload, 'Access recovery repeats original pending UUID and payload'); check(count('submission_attempts'), 2, 'Access recovery does not duplicate the committed original pending attempt'); drained();
  });
  for (const status of [401, 403, 404]) await scenario('Loaded assignment ' + status + ' clears cached view without pending request', 'student-user-a', async ({ mount, post, submissionsPath, sqlite, setActor, drained }) => {
    await post(submissionsPath, { clientSubmissionId: crypto.randomUUID(), expectedAttempt: 0, response: 'PRIVATE_SAVED_RESPONSE_RECOVERY' });
    const ui = await mount();
    if (status === 401) setActor(null);
    if (status === 403) sqlite.exec("UPDATE users SET role='guardian' WHERE id='student-user-a'");
    if (status === 404) sqlite.exec("UPDATE enrolments SET status='withdrawn' WHERE id='student-a-enrolment'");
    await ui.click(refreshAssignment); check(hasText(ui, 'SYNTHETIC_RECOVERY_MATERIAL'), false, 'Unavailable material is removed'); check(hasText(ui, 'PRIVATE_SAVED_RESPONSE_RECOVERY'), false, 'Unavailable saved attempts are removed'); check(enabled(ui, 'Save response attempt'), false, 'Denied account cannot use cached mutation controls'); drained();
  });
  await scenario('Learning reload re-resolves current role and removes forbidden cards', 'student-user-a', async ({ mount, sqlite, drained }) => {
    const ui = await mount(learningClient.default, {}); okay(hasText(ui, 'SYNTHETIC_RECOVERY_MATERIAL'), 'Initial learner sees approved assigned material');
    sqlite.exec("UPDATE users SET role='guardian' WHERE id='student-user-a'"); await ui.click('Reload assignments');
    check(hasText(ui, 'SYNTHETIC_RECOVERY_MATERIAL'), false, 'Current forbidden role hides old material'); check(hasText(ui, 'Submit a response and view reviewed feedback'), false, 'Cached learner action link is cleared');
    sqlite.exec("UPDATE users SET role='student' WHERE id='student-user-a'"); await ui.click('Reload assignments'); okay(hasText(ui, 'SYNTHETIC_RECOVERY_MATERIAL'), 'Authorized role reload restores current approved assignment'); drained();
  });

  for (const kind of ['malformed', 'invalid-shape', 'unavailable']) await scenario('Feedback ' + kind + ' committed acknowledgement retains exact request', 'teacher-a', async ({ post, mount, submissionsPath, lose, count, writes, drained }) => {
    const attempt = await post(submissionsPath, { clientSubmissionId: crypto.randomUUID(), expectedAttempt: 0, response: 'Synthetic original saved response.' }, 'student-user-a'); const path = submissionsPath + '/' + attempt.id + '/feedback';
    const ui = await mount(); await ui.change(item => item.type === 'textarea', 'Original uncertain reviewed feedback.'); await ui.change(item => item.type === 'input' && item.props.type === 'checkbox', true);
    const lost = lose(path, kind); await ui.submit(); lost.stop(); okay(allInputsLocked(ui), 'Uncertain feedback freezes edited text and attempt selection');
    await ui.click(refreshAssignment); await ui.click(feedbackRetryLabel); check(writes(path).at(-1).payload, lost.payload, 'Feedback retry uses original immutable request after uncertainty'); check(count('submission_feedback'), 1, 'Feedback recovery does not duplicate a committed review'); drained();
  });
  for (const status of [401, 403, 404]) await scenario('Pending feedback ' + status + ' hides view and recovers only after authorized reload', 'teacher-a', async ({ post, mount, submissionsPath, lose, count, writes, sqlite, setActor, drained }) => {
    const attempt = await post(submissionsPath, { clientSubmissionId: crypto.randomUUID(), expectedAttempt: 0, response: 'PRIVATE_SAVED_RESPONSE_RECOVERY' }, 'student-user-a'); const path = submissionsPath + '/' + attempt.id + '/feedback';
    const ui = await mount(); await ui.change(item => item.type === 'textarea', 'PRIVATE_PENDING_FEEDBACK_RECOVERY'); await ui.change(item => item.type === 'input' && item.props.type === 'checkbox', true); const lost = lose(path); await ui.submit(); lost.stop();
    if (status === 401) setActor(null); if (status === 403) sqlite.exec("UPDATE users SET role='guardian' WHERE id='teacher-a'"); if (status === 404) sqlite.exec("UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'");
    await ui.click(refreshAssignment);
    for (const secret of ['SYNTHETIC_RECOVERY_MATERIAL', 'PRIVATE_SAVED_RESPONSE_RECOVERY', 'PRIVATE_PENDING_FEEDBACK_RECOVERY']) check(hasText(ui, secret), false, 'Known denial hides assignment and feedback evidence');
    check(enabled(ui, 'Save reviewed feedback'), false, 'No cached reviewed feedback action after access loss'); check(enabled(ui, 'Retry pending feedback'), false, 'Pending feedback waits for current authorized reload');
    if (status === 401) setActor('teacher-a'); if (status === 403) sqlite.exec("UPDATE users SET role='teacher' WHERE id='teacher-a'"); if (status === 404) sqlite.exec("UPDATE classes SET teacher_id='teacher-a' WHERE id='class-a'");
    await ui.click(refreshAssignment); await ui.click(feedbackRetryLabel); check(writes(path).at(-1).payload, lost.payload, 'Authorized feedback recovery keeps original UUID and exact attempt'); check(count('submission_feedback'), 1, 'Access recovery does not publish duplicate feedback'); drained();
  });
  for (const kind of ['malformed', 'invalid-shape', 'unavailable']) await scenario('Window ' + kind + ' committed acknowledgement retains exact review', 'teacher-a', async ({ api, mount, assignment, windowPath, lose, count, writes, drained }) => {
    const initial = await (await api(windowPath)).json(); let ui; const props = { assignmentId: assignment.id, actorId: 'teacher-a', available: true, window: initial, staff: true, onChanged(value) { ui.props.window = value; }, onAccessLost() { ui.props.available = false; } };
    ui = await mount(windowClient.AssignmentSubmissionWindow, props); await ui.change(item => item.type === 'select', 'closed'); await ui.change(item => item.type === 'input' && item.props.minLength === 10, 'Original uncertain window review.'); await ui.change(item => item.type === 'input' && item.props.type === 'checkbox', true);
    const lost = lose(windowPath, kind); await ui.submit(); lost.stop(); okay(allInputsLocked(ui), 'Uncertain policy freezes fields and review confirmation');
    await ui.click('Refresh submission window'); await ui.click(windowRetryLabel); check(writes(windowPath).at(-1).payload, lost.payload, 'Uncertain window retry is original payload'); check(count('assignment_submission_windows'), 1, 'Window recovery creates no additional policy revision'); drained();
  });
  for (const status of [401, 403, 404]) await scenario('Pending window ' + status + ' preserves UUID while hiding protected policy/history', 'teacher-a', async ({ api, mount, assignment, windowPath, lose, writes, count, sqlite, setActor, drained }) => {
    const initial = await (await api(windowPath)).json(); let ui; const accessLost = []; const props = { assignmentId: assignment.id, actorId: 'teacher-a', available: true, window: initial, staff: true, onChanged(value) { ui.props.window = value; ui.props.available = true; }, onAccessLost(value) { accessLost.push(value); ui.props.available = false; } };
    ui = await mount(windowClient.AssignmentSubmissionWindow, props); await ui.change(item => item.type === 'select', 'closed'); await ui.change(item => item.type === 'input' && item.props.minLength === 10, 'PRIVATE_WINDOW_REASON_RECOVERY'); await ui.change(item => item.type === 'input' && item.props.type === 'checkbox', true); const lost = lose(windowPath); await ui.submit(); lost.stop();
    if (status === 401) setActor(null); if (status === 403) sqlite.exec("UPDATE users SET role='guardian' WHERE id='teacher-a'"); if (status === 404) sqlite.exec("UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'");
    await ui.click('Refresh submission window'); okay(accessLost.length > 0, 'Known window access loss is communicated to assignment owner'); check(hasText(ui, 'PRIVATE_WINDOW_REASON_RECOVERY'), false, 'Known denial hides reviewed policy reason'); check(enabled(ui, 'Retry pending window review'), false, 'Policy retry requires current authorized reload');
    if (status === 401) setActor('teacher-a'); if (status === 403) sqlite.exec("UPDATE users SET role='teacher' WHERE id='teacher-a'"); if (status === 404) sqlite.exec("UPDATE classes SET teacher_id='teacher-a' WHERE id='class-a'");
    // Parent supplies the restored current actor/availability only after its own authorized snapshot.
    props.available = true; ui.render(); await ui.click('Refresh submission window'); await ui.click(windowRetryLabel); check(writes(windowPath).at(-1).payload, lost.payload, 'Policy access recovery keeps original serialized review'); check(count('assignment_submission_windows'), 1, 'Policy access recovery creates no duplicate revision'); drained();
  });
  await scenario('Different authorized actor cannot replay another in-memory pending window request', 'teacher-a', async ({ api, mount, assignment, windowPath, lose, writes, setActor, count, drained }) => {
    const initial = await (await api(windowPath)).json(); let ui; const props = { assignmentId: assignment.id, actorId: 'teacher-a', available: true, window: initial, staff: true, onChanged(value) { ui.props.window = value; }, onAccessLost() {} };
    ui = await mount(windowClient.AssignmentSubmissionWindow, props); await ui.change(item => item.type === 'select', 'closed'); await ui.change(item => item.type === 'input' && item.props.minLength === 10, 'Original teacher window review.'); await ui.change(item => item.type === 'input' && item.props.type === 'checkbox', true); const lost = lose(windowPath); await ui.submit(); lost.stop();
    setActor('admin-a'); props.actorId = 'admin-a'; ui.render(); await ui.click('Refresh submission window'); check(enabled(ui, 'Retry pending window review'), false, 'A different otherwise-authorized actor cannot recover another actor pending policy'); check(writes(windowPath).length, 1, 'Actor switch never submits pending policy under another identity');
    setActor('teacher-a'); props.actorId = 'teacher-a'; ui.render(); await ui.click('Refresh submission window'); await ui.click(windowRetryLabel); check(writes(windowPath).at(-1).payload, lost.payload, 'Original restored actor can retry original review'); check(count('assignment_submission_windows'), 1, 'Actor continuity recovery remains idempotent'); drained();
  });
  await scenario('Non-access assignment history error retains authorized current view and retry', 'student-user-a', async ({ mount, post, submissionsPath, intercept, drained }) => {
    await post(submissionsPath, { clientSubmissionId: crypto.randomUUID(), expectedAttempt: 0, response: 'AUTHORIZED_SAVED_RESPONSE' }); const ui = await mount();
    let injected = false; intercept(async ({ path, response }) => { if (path === submissionsPath && !injected) { injected = true; await response.arrayBuffer(); return new Response(JSON.stringify({ error: 'Synthetic temporary history outage' }), { status: 503 }); } return response; });
    await ui.click(refreshAssignment); okay(injected, 'Non-access failure reached actual source refresh callback'); okay(hasText(ui, 'SYNTHETIC_RECOVERY_MATERIAL'), 'Temporary non-access outage does not masquerade as revoked material access'); okay(hasText(ui, 'AUTHORIZED_SAVED_RESPONSE'), 'Last authorized saved evidence is retained on a temporary outage'); intercept(undefined); await ui.click(refreshAssignment); drained();
  });
  await scenario('Window history non-access error keeps valid current policy availability', 'teacher-a', async ({ api, mount, assignment, windowPath, post, intercept, drained }) => {
    await post(windowPath, { clientPolicyId: crypto.randomUUID(), expectedRevision: 0, state: 'open', closesAt: null, reviewConfirmed: true, reason: 'Authorized original policy reason.' }); const initial = await (await api(windowPath)).json(); let ui; const accessLost = [];
    const props = { assignmentId: assignment.id, actorId: 'teacher-a', available: true, window: initial, staff: true, onChanged(value) { ui.props.window = value; }, onAccessLost(value) { accessLost.push(value); } }; ui = await mount(windowClient.AssignmentSubmissionWindow, props);
    let injected = false; intercept(async ({ path, response }) => { if (path.endsWith('/submission-window/history') && !injected) { injected = true; await response.arrayBuffer(); return new Response(JSON.stringify({ error: 'Synthetic temporary review history outage' }), { status: 503 }); } return response; });
    await ui.click('Refresh submission window'); okay(injected, 'History outage reached actual source callback'); check(accessLost.length, 0, 'Non-access history error does not report revoked authority'); okay(ui.all(item => item.type === 'form').length === 1, 'Authorized policy review remains available despite temporary history outage'); intercept(undefined); await ui.click('Refresh submission window'); drained();
  });
  await scenario('Known window history denial after current GET hides partially assembled private view', 'teacher-a', async ({ api, mount, assignment, windowPath, post, intercept, sqlite, drained }) => {
    await post(windowPath, { clientPolicyId: crypto.randomUUID(), expectedRevision: 0, state: 'closed', closesAt: null, reviewConfirmed: true, reason: 'PRIVATE_WINDOW_HISTORY_REASON' }); const initial = await (await api(windowPath)).json(); let ui; const lost = [];
    const props = { assignmentId: assignment.id, actorId: 'teacher-a', available: true, window: initial, staff: true, onChanged(value) { ui.props.window = value; }, onAccessLost(value) { lost.push(value); ui.props.available = false; } }; ui = await mount(windowClient.AssignmentSubmissionWindow, props);
    let injected = false; intercept(async ({ path, response }) => { if (path.endsWith('/submission-window/history') && !injected) { injected = true; await response.arrayBuffer(); sqlite.exec("UPDATE users SET role='guardian' WHERE id='teacher-a'"); return api(path); } return response; });
    await ui.click('Refresh submission window'); okay(injected, 'Actual history role change occurs after successful current policy response'); okay(lost.length > 0, 'Late history denial invalidates the private component view'); check(hasText(ui, 'PRIVATE_WINDOW_HISTORY_REASON'), false, 'Old reviewed reason does not survive known history access loss'); check(ui.all(item => item.type === 'form').length, 0, 'Partial authorized GET then denied history leaves no editable private policy'); drained();
  });
  for (const failure of ['unauthorized', 'unavailable', 'temporary']) await scenario('Learning ' + failure + ' refresh removes stale role-dependent cards', 'student-user-a', async ({ mount, sqlite, setActor, intercept, drained }) => {
    const ui = await mount(learningClient.default, {}); okay(hasText(ui, 'SYNTHETIC_RECOVERY_MATERIAL'), 'Learning initial approved material is present');
    if (failure === 'unauthorized') setActor(null); if (failure === 'unavailable') sqlite.exec("UPDATE enrolments SET status='withdrawn' WHERE id='student-a-enrolment'");
    let injected = false; if (failure === 'temporary') intercept(async ({ path, response }) => { if (path === '/api/resource-assignments') { injected = true; await response.arrayBuffer(); return new Response(JSON.stringify({ error: 'Synthetic temporary feed error' }), { status: 503 }); } return response; });
    await ui.click('Reload assignments'); check(hasText(ui, 'SYNTHETIC_RECOVERY_MATERIAL'), false, 'A failed/currently unavailable feed cannot keep old material cards'); check(hasText(ui, 'Submit a response and view reviewed feedback'), false, 'Stale role-dependent learner actions are removed'); if (failure === 'temporary') okay(injected, 'Temporary feed failure was exercised'); intercept(undefined); drained();
  });

  await scenario('Same-frame learner submissions share a synchronous lock', 'student-user-a', async ({ mount, submissionsPath, count, writes, drained }) => {
    const ui = await mount(); await ui.change(item => item.type === 'textarea', 'Synthetic same-frame response.'); const callback = ui.one(item => item.type === 'form').props.onSubmit;
    await Promise.all([callback({ preventDefault() {} }), callback({ preventDefault() {} })]); await ui.flush(); check(writes(submissionsPath).length, 1, 'Two source callbacks before repaint send one learner request'); check(count('submission_attempts'), 1, 'Same-frame duplicate action creates one attempt'); drained();
  });
  await scenario('Same-frame reviewed feedback has one immutable revision', 'teacher-a', async ({ post, mount, submissionsPath, count, writes, drained }) => {
    const attempt = await post(submissionsPath, { clientSubmissionId: crypto.randomUUID(), expectedAttempt: 0, response: 'Synthetic response for same-frame review.' }, 'student-user-a'); const path = submissionsPath + '/' + attempt.id + '/feedback'; const ui = await mount(); await ui.change(item => item.type === 'textarea', 'Synthetic same-frame reviewed feedback.'); await ui.change(item => item.type === 'input' && item.props.type === 'checkbox', true); const callback = ui.one(item => item.type === 'form').props.onSubmit;
    await Promise.all([callback({ preventDefault() {} }), callback({ preventDefault() {} })]); await ui.flush(); check(writes(path).length, 1, 'Two source callbacks before repaint send one reviewed feedback request'); check(count('submission_feedback'), 1, 'Same-frame duplicate feedback creates one revision'); drained();
  });
  await scenario('Same-frame reviewed policy mutation shares a synchronous lock', 'teacher-a', async ({ api, mount, assignment, windowPath, count, writes, drained }) => {
    const initial = await (await api(windowPath)).json(); let ui; const props = { assignmentId: assignment.id, actorId: 'teacher-a', available: true, window: initial, staff: true, onChanged(value) { ui.props.window = value; }, onAccessLost() {} }; ui = await mount(windowClient.AssignmentSubmissionWindow, props);
    await ui.change(item => item.type === 'select', 'closed'); await ui.change(item => item.type === 'input' && item.props.minLength === 10, 'Synthetic same-frame policy review.'); await ui.change(item => item.type === 'input' && item.props.type === 'checkbox', true); const callback = ui.one(item => item.type === 'form').props.onSubmit;
    await Promise.all([callback({ preventDefault() {} }), callback({ preventDefault() {} })]); await ui.flush(); check(writes(windowPath).length, 1, 'Two policy callbacks before repaint send one review request'); check(count('assignment_submission_windows'), 1, 'Same-frame policy actions create one immutable revision'); drained();
  });
  await scenario('Obsolete learning feed response cannot restore forbidden role cards', 'student-user-a', async ({ mount, intercept, sqlite, drained }) => {
    const ui = await mount(learningClient.default, {}); okay(hasText(ui, 'SYNTHETIC_RECOVERY_MATERIAL'), 'Current learner initially has approved cards'); let release, delayed = false;
    intercept(async ({ path, response }) => { if (path === '/api/resource-assignments' && !delayed) { delayed = true; await new Promise(resolve => { release = resolve; }); } return response; });
    const callback = ui.button('Reload assignments').props.onClick; const older = callback(); await settle(); okay(delayed, 'Actual prior feed response is held after its authorized route read');
    sqlite.exec("UPDATE users SET role='guardian' WHERE id='student-user-a'"); const newer = callback(); await newer; await ui.flush(); check(hasText(ui, 'SYNTHETIC_RECOVERY_MATERIAL'), false, 'Newer forbidden role reload clears learner cards'); release(); await older; await ui.flush(); check(hasText(ui, 'SYNTHETIC_RECOVERY_MATERIAL'), false, 'Late older approved feed cannot restore stale material'); check(hasText(ui, 'Submit a response and view reviewed feedback'), false, 'Late older response cannot restore old learner actions'); intercept(undefined); drained();
  });

  await scenario('Different authorized assignment actor cannot recover pending learner request', 'student-user-a', async ({ mount, lose, submissionsPath, setActor, writes, count, drained }) => {
    const ui = await mount(); await ui.change(item => item.type === 'textarea', 'Original pending actor-bound response.'); const lost = lose(submissionsPath); await ui.submit(); lost.stop();
    setActor('admin-a'); await ui.click(refreshAssignment); check(enabled(ui, 'Retry pending response'), false, 'Current administrator cannot replay another learner pending response'); check(writes(submissionsPath).length, 1, 'Actor replacement sends no pending learner mutation');
    setActor('student-user-a'); await ui.click(refreshAssignment); await ui.click(attemptRetryLabel); check(writes(submissionsPath).at(-1).payload, lost.payload, 'Restored original learner recovers exact original request'); check(count('submission_attempts'), 1, 'Actor continuity recovery has one stored original attempt'); drained();
  });
  await scenario('Confirmed learner save remains truthful after follow-up access loss', 'student-user-a', async ({ mount, intercept, sqlite, submissionsPath, count, drained }) => {
    const ui = await mount(); await ui.change(item => item.type === 'textarea', 'PRIVATE_JUST_CONFIRMED_RESPONSE'); let changed = false;
    intercept(async ({ path, options, response }) => { if (path === submissionsPath && options.method === 'POST' && !changed) { check(response.status, 201, 'Save acknowledgement comes from a committed actual route'); changed = true; sqlite.exec("UPDATE enrolments SET status='withdrawn' WHERE id='student-a-enrolment'"); } return response; });
    await ui.submit(); check(count('submission_attempts'), 1, 'Confirmed original attempt remains stored despite subsequent read denial'); check(hasText(ui, 'SYNTHETIC_RECOVERY_MATERIAL'), false, 'Post-save current denial hides old private material'); check(hasText(ui, 'PRIVATE_JUST_CONFIRMED_RESPONSE'), false, 'Post-save current denial hides saved private response'); okay(/saved|confirmed/i.test(content(ui.tree)), 'Known committed save is not relabelled failed because follow-up access changed'); check(enabled(ui, 'Retry pending response'), false, 'Known valid acknowledgement does not retain a duplicate pending mutation'); drained();
  });
  await scenario('Confirmed feedback save is not called failed when follow-up class access changes', 'teacher-a', async ({ post, mount, submissionsPath, intercept, sqlite, count, drained }) => {
    const attempt = await post(submissionsPath, { clientSubmissionId: crypto.randomUUID(), expectedAttempt: 0, response: 'PRIVATE_PREVIOUS_RESPONSE' }, 'student-user-a'); const path = submissionsPath + '/' + attempt.id + '/feedback'; const ui = await mount(); await ui.change(item => item.type === 'textarea', 'PRIVATE_CONFIRMED_FEEDBACK'); await ui.change(item => item.type === 'input' && item.props.type === 'checkbox', true); let changed = false;
    intercept(async ({ path: selected, options, response }) => { if (selected === path && options.method === 'POST' && !changed) { check(response.status, 201, 'Reviewed acknowledgement is an actual committed feedback receipt'); changed = true; sqlite.exec("UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'"); } return response; });
    await ui.submit(); check(count('submission_feedback'), 1, 'Confirmed review remains immutable after later reassignment'); check(hasText(ui, 'PRIVATE_CONFIRMED_FEEDBACK'), false, 'Known follow-up denial hides confirmed private feedback'); check(hasText(ui, 'PRIVATE_PREVIOUS_RESPONSE'), false, 'Known follow-up denial hides old learner response'); okay(/saved|confirmed/i.test(content(ui.tree)), 'Committed feedback outcome stays truthful after read denial'); check(enabled(ui, 'Retry pending feedback'), false, 'Valid reviewed receipt clears its pending mutation'); drained();
  });

  await scenario('Repeated uncertain exact response retries keep the original request', 'student-user-a', async ({ mount, lose, submissionsPath, writes, count, drained }) => {
    const ui = await mount(); await ui.change(item => item.type === 'textarea', 'Original response through repeated uncertainty.'); const first = lose(submissionsPath); await ui.submit(); first.stop();
    await ui.click(refreshAssignment); const second = lose(submissionsPath); await ui.click(attemptRetryLabel); second.stop(); check(second.payload, first.payload, 'Second failed acknowledgement repeats original exact UUID/CAS/text'); okay(allInputsLocked(ui), 'A second uncertain result keeps pending recovery locked');
    await ui.click(refreshAssignment); await ui.click(attemptRetryLabel); check(writes(submissionsPath).at(-1).payload, first.payload, 'Third recovery still confirms original request'); check(count('submission_attempts'), 1, 'Repeated uncertain replay never appends another attempt'); drained();
  });
  await scenario('Repeated uncertain exact feedback retries do not duplicate review history', 'teacher-a', async ({ post, mount, lose, submissionsPath, writes, count, drained }) => {
    const attempt = await post(submissionsPath, { clientSubmissionId: crypto.randomUUID(), expectedAttempt: 0, response: 'Synthetic response for repeated feedback recovery.' }, 'student-user-a'); const path = submissionsPath + '/' + attempt.id + '/feedback'; const ui = await mount(); await ui.change(item => item.type === 'textarea', 'Original repeatedly uncertain feedback.'); await ui.change(item => item.type === 'input' && item.props.type === 'checkbox', true); const first = lose(path); await ui.submit(); first.stop();
    await ui.click(refreshAssignment); const second = lose(path); await ui.click(feedbackRetryLabel); second.stop(); check(second.payload, first.payload, 'Repeated uncertain feedback preserves original revision and UUID'); okay(allInputsLocked(ui), 'Repeated uncertain feedback remains frozen'); await ui.click(refreshAssignment); await ui.click(feedbackRetryLabel); check(writes(path).at(-1).payload, first.payload, 'Feedback recovery never rebases after later authorized read'); check(count('submission_feedback'), 1, 'Repeated feedback uncertainty has one reviewed history entry'); drained();
  });

  for (const flaw of ['wrong-uuid', 'wrong-actor', 'invalid-review-time', 'invalid-current-time', 'missing-current-window', 'lower-current-revision']) await scenario('Window receipt correlation rejects ' + flaw, 'teacher-a', async ({ api, mount, assignment, windowPath, intercept, writes, count, drained }) => {
    const initial = await (await api(windowPath)).json(); let ui; const props = { assignmentId: assignment.id, actorId: 'teacher-a', available: true, window: initial, staff: true, onChanged(value) { ui.props.window = value; }, onAccessLost() {} }; ui = await mount(windowClient.AssignmentSubmissionWindow, props);
    await ui.change(item => item.type === 'select', 'closed'); await ui.change(item => item.type === 'input' && item.props.minLength === 10, 'Original receipt correlation review.'); await ui.change(item => item.type === 'input' && item.props.type === 'checkbox', true); let original;
    intercept(async ({ path, options, response }) => { if (path === windowPath && options.method === 'POST' && !original) { check(response.status, 201, 'Malformed delivered receipt follows actual committed policy'); original = JSON.parse(options.body); const value = await response.json(); if (flaw === 'wrong-uuid') value.review.id = crypto.randomUUID(); if (flaw === 'wrong-actor') value.review.reviewedBy = 'teacher-other'; if (flaw === 'invalid-review-time') value.review.reviewedAt = 'not-a-real-time'; if (flaw === 'invalid-current-time') value.window.asOf = 'not-a-real-time'; if (flaw === 'missing-current-window') delete value.window; if (flaw === 'lower-current-revision') value.window.revision = value.review.revision - 1; return new Response(JSON.stringify(value), { status: 201, headers: { 'content-type': 'application/json' } }); } return response; });
    await ui.submit(); okay(original, 'Actual valid route outcome was independently altered only during synthetic delivery'); check(count('assignment_submission_windows'), 1, 'Receipt mutation never changes committed server evidence'); okay(allInputsLocked(ui), 'Uncorrelated success cannot release pending policy controls'); intercept(undefined); await ui.click(windowRetryLabel); check(writes(windowPath).at(-1).payload, original, 'Valid recovery still uses original pending request'); check(count('assignment_submission_windows'), 1, 'Correlated original recovery appends no duplicate policy'); drained();
  });
  await scenario('Malformed window history is visible error without fabricated policy access loss', 'teacher-a', async ({ api, mount, assignment, windowPath, intercept, drained }) => {
    const initial = await (await api(windowPath)).json(); let ui; const denied = []; const props = { assignmentId: assignment.id, actorId: 'teacher-a', available: true, window: initial, staff: true, onChanged(value) { ui.props.window = value; }, onAccessLost(value) { denied.push(value); } }; ui = await mount(windowClient.AssignmentSubmissionWindow, props); let changed = false;
    intercept(async ({ path, response }) => { if (path.endsWith('/submission-window/history') && !changed) { changed = true; await response.arrayBuffer(); return new Response(JSON.stringify([{ id: 'UNCONFIRMED_PRIVATE_HISTORY', reviewedAt: 'invalid' }]), { status: 200 }); } return response; });
    await ui.click('Refresh submission window'); okay(changed, 'Malformed history followed an actual authorized history read'); check(denied.length, 0, 'Malformed history is an unconfirmed history error rather than fabricated actor denial'); check(hasText(ui, 'UNCONFIRMED_PRIVATE_HISTORY'), false, 'Invalid history rows are never shown as confirmed reviews'); okay(ui.all(item => item.type === 'form').length === 1, 'Valid current policy remains available after malformed history'); intercept(undefined); await ui.click('Refresh submission window'); drained();
  });

  for (const status of [401, 403, 404]) await scenario('Attendance current snapshot then actual history ' + status + ' hides private rows and restores only after reload', 'teacher-a', async ({ mount, post, intercept, api, sqlite, setActor, count, drained }) => {
    const ui = await mount(attendanceClient.default, { params: Promise.resolve({ id: 'class-a' }) }); await ui.flush();
    const date = ui.one(item => item.type === 'input' && item.props.type === 'date').props.value, path = '/api/classes/class-a/attendance-editor';
    await post(path, { date, clientRequestId: crypto.randomUUID(), reviewConfirmed: true, reason: 'Synthetic original attendance review.', entries: [{ studentId: 'student-a', status: 'present', note: 'PRIVATE_ATTENDANCE_LOADED_NOTE', expectedRecord: null }] }); await ui.click('Reload current records'); okay(hasText(ui, 'PRIVATE_ATTENDANCE_LOADED_NOTE'), 'Actual saved attendance evidence is initially visible');
    await ui.change(item => item.type === 'textarea' && item.props.id === 'attendance-reason', 'PRIVATE_UNSAVED_ATTENDANCE_REASON'); let changed = false;
    intercept(async ({ path: selected, response }) => { if (selected.includes('/attendance-editor/history') && !changed) { changed = true; await response.arrayBuffer(); if (status === 401) setActor(null); if (status === 403) sqlite.exec("UPDATE users SET role='guardian' WHERE id='teacher-a'"); if (status === 404) sqlite.exec("UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'"); const denied = await api(selected); check(denied.status, status, 'Late attendance history denial comes from an actual current-authority route'); return denied; } return response; });
    await ui.click('Reload current records'); okay(changed, 'Actual current attendance snapshot preceded denied history read'); check(ui.all(item => item.props?.['data-attendance-student']).length, 0, 'Known history denial hides current private roster rows'); check(hasText(ui, 'PRIVATE_ATTENDANCE_LOADED_NOTE'), false, 'Known history denial hides saved private notes'); check(ui.all(item => item.props?.id === 'attendance-reason').length, 0, 'Known history denial removes writable reason control'); check(enabled(ui, 'Save reviewed attendance'), false, 'Known history denial leaves no enabled reviewed save'); check(count('attendance_reviews'), 1, 'Privacy reload neither duplicates nor deletes confirmed review');
    intercept(undefined); setActor('teacher-a'); if (status === 403) sqlite.exec("UPDATE users SET role='teacher' WHERE id='teacher-a'"); if (status === 404) sqlite.exec("UPDATE classes SET teacher_id='teacher-a' WHERE id='class-a'"); await ui.click('Reload current records'); check(ui.all(item => item.props?.['data-attendance-student']).length, 1, 'Restored authorized reload restores only current roster'); okay(hasText(ui, 'PRIVATE_ATTENDANCE_LOADED_NOTE'), 'Confirmed actual notes remain after restored current access'); drained();
  });
  await scenario('Attendance temporary history error retains valid current recording view', 'teacher-a', async ({ mount, intercept, drained }) => {
    const ui = await mount(attendanceClient.default, { params: Promise.resolve({ id: 'class-a' }) }); await ui.flush(); let changed = false;
    intercept(async ({ path, response }) => { if (path.includes('/attendance-editor/history') && !changed) { changed = true; await response.arrayBuffer(); return new Response(JSON.stringify({ error: 'Synthetic temporary attendance review history outage' }), { status: 503 }); } return response; });
    await ui.click('Reload current records'); okay(changed, 'Temporary attendance history failure reaches actual source callback'); check(ui.all(item => item.props?.['data-attendance-student']).length, 1, 'Temporary history outage retains current authorized roster'); check(ui.all(item => item.props?.id === 'attendance-reason').length, 1, 'Current valid recorder remains available on non-access history error'); okay(/history could not|history unavailable/i.test(content(ui.tree)), 'History error is visibly separate from current recording view'); intercept(undefined); await ui.click('Reload current records'); drained();
  });
  for (const kind of ['response', 'feedback']) for (const flaw of ['wrong-actor', 'wrong-sequence', 'wrong-text', 'wrong-reference']) await scenario('Assignment receipt correlation rejects ' + kind + ' ' + flaw, kind === 'response' ? 'student-user-a' : 'teacher-a', async ({ post, mount, submissionsPath, intercept, writes, count, drained }) => {
    let path = submissionsPath;
    if (kind === 'feedback') { const attempt = await post(submissionsPath, { clientSubmissionId: crypto.randomUUID(), expectedAttempt: 0, response: 'Synthetic saved response for feedback receipt.' }, 'student-user-a'); path += '/' + attempt.id + '/feedback'; }
    const ui = await mount(); await ui.change(item => item.type === 'textarea', 'Original correlation ' + kind + ' text.'); if (kind === 'feedback') await ui.change(item => item.type === 'input' && item.props.type === 'checkbox', true); let original;
    intercept(async ({ path: selected, options, response }) => { if (selected === path && options.method === 'POST' && !original) { check(response.status, 201, 'Altered acknowledgement follows actual committed assignment mutation'); original = JSON.parse(options.body); const value = await response.json(); if (flaw === 'wrong-actor') value[kind === 'response' ? 'submittedBy' : 'reviewedBy'] = 'teacher-other'; if (flaw === 'wrong-sequence') value[kind === 'response' ? 'attempt' : 'revision'] += 1; if (flaw === 'wrong-text') value[kind === 'response' ? 'response' : 'feedback'] = 'Not original submitted text.'; if (flaw === 'wrong-reference') value[kind === 'response' ? 'assignmentId' : 'submissionId'] = 'foreign-reference'; return new Response(JSON.stringify(value), { status: 201 }); } return response; });
    await ui.submit(); okay(original, 'Valid actual assignment receipt was altered only during synthetic delivery'); okay(allInputsLocked(ui), 'Uncorrelated success retains immutable pending controls'); intercept(undefined); await ui.click(refreshAssignment); await ui.click(kind === 'response' ? attemptRetryLabel : feedbackRetryLabel); check(writes(path).at(-1).payload, original, 'Correlated retry keeps original actor/body/UUID'); check(count(kind === 'response' ? 'submission_attempts' : 'submission_feedback'), 1, 'Receipt correlation recovery appends no duplicate evidence'); drained();
  });

  for (const kind of ['response', 'feedback']) await scenario('Child window401 preserves parent pending ' + kind + ' without navigating away', kind === 'response' ? 'student-user-a' : 'teacher-a', async ({ post, mount, lose, submissionsPath, setActor, writes, count, drained }) => {
    let path = submissionsPath;
    if (kind === 'feedback') { const attempt = await post(submissionsPath, { clientSubmissionId: crypto.randomUUID(), expectedAttempt: 0, response: 'PRIVATE_PARENT_RESPONSE' }, 'student-user-a'); path += '/' + attempt.id + '/feedback'; }
    const parent = await mount(); await parent.change(item => item.type === 'textarea', 'Original pending parent ' + kind + '.'); if (kind === 'feedback') await parent.change(item => item.type === 'input' && item.props.type === 'checkbox', true); const lost = lose(path); await parent.submit(); lost.stop(); await parent.click(refreshAssignment);
    const child = await mount(windowClient.AssignmentSubmissionWindow, parent.one(item => item.type === 'window-control').props);
    const before = redirects.length; setActor(null); await child.click('Refresh submission window'); await parent.flush();
    check(redirects.length, before, 'Mounted child delegates401 instead of destroying another form pending request'); check(hasText(parent, 'SYNTHETIC_RECOVERY_MATERIAL'), false, 'Parent callback hides assignment material after child denial'); check(enabled(parent, 'Retry pending'), false, 'Parent pending cannot retry before current authorized reload'); okay(parent.all(item => item.type === 'a' && item.props.target === '_blank').length > 0, 'Another-tab sign-in retains parent in-memory request');
    child.props = parent.one(item => item.type === 'window-control').props; await child.flush(); check(child.props.available, false, 'Mounted child retains lifetime with private availability false'); check(child.all(item => item.type === 'form').length, 0, 'Unavailable child hides protected policy form');
    setActor(kind === 'response' ? 'student-user-a' : 'teacher-a'); await parent.click(refreshAssignment); child.props = parent.one(item => item.type === 'window-control').props; await child.flush(); await parent.click(kind === 'response' ? attemptRetryLabel : feedbackRetryLabel); check(writes(path).at(-1).payload, lost.payload, 'Cross-form401 recovery keeps parent original UUID/CAS/body'); check(count(kind === 'response' ? 'submission_attempts' : 'submission_feedback'), 1, 'Cross-form401 exact recovery creates no duplicate educational evidence'); drained();
  });
  await scenario('Child late history401 does not discard parent pending reviewed feedback', 'teacher-a', async ({ post, mount, lose, submissionsPath, intercept, api, setActor, writes, count, drained }) => {
    const attempt = await post(submissionsPath, { clientSubmissionId: crypto.randomUUID(), expectedAttempt: 0, response: 'PRIVATE_PARENT_RESPONSE' }, 'student-user-a'); const path = submissionsPath + '/' + attempt.id + '/feedback'; const parent = await mount(); await parent.change(item => item.type === 'textarea', 'Original parent feedback during child history401.'); await parent.change(item => item.type === 'input' && item.props.type === 'checkbox', true); const lost = lose(path); await parent.submit(); lost.stop(); await parent.click(refreshAssignment); const child = await mount(windowClient.AssignmentSubmissionWindow, parent.one(item => item.type === 'window-control').props); let injected = false; const before = redirects.length;
    intercept(async ({ path: selected, response }) => { if (selected.endsWith('/submission-window/history') && !injected) { injected = true; await response.arrayBuffer(); setActor(null); const denied = await api(selected); check(denied.status, 401, 'Child history denial is an actual unavailable session route response'); return denied; } return response; });
    await child.click('Refresh submission window'); await parent.flush(); okay(injected, 'Current child window200 preceded actual history401'); check(redirects.length, before, 'History401 delegate preserves parent pending UUID without navigation'); check(hasText(parent, 'PRIVATE_PARENT_RESPONSE'), false, 'Known child history denial hides parent learner evidence'); intercept(undefined); setActor('teacher-a'); await parent.click(refreshAssignment); child.props = parent.one(item => item.type === 'window-control').props; await child.flush(); await parent.click(feedbackRetryLabel); check(writes(path).at(-1).payload, lost.payload, 'Parent original review survives child history access loss'); check(count('submission_feedback'), 1, 'Child history401 recovery appends no duplicate feedback'); drained();
  });
  await scenario('Standalone no-pending window401 can navigate to sign-in', 'teacher-a', async ({ api, mount, assignment, windowPath, setActor, drained }) => {
    const initial = await (await api(windowPath)).json(); let ui; const props = { assignmentId: assignment.id, actorId: 'teacher-a', available: true, window: initial, staff: true, onChanged(value) { ui.props.window = value; } }; ui = await mount(windowClient.AssignmentSubmissionWindow, props); const before = redirects.length; setActor(null); await ui.click('Refresh submission window'); check(redirects.length, before + 1, 'Standalone no-owner no-pending401 redirects to sign-in'); okay(redirects.at(-1).endsWith('/login'), 'Standalone401 chooses only local login destination'); drained();
  });

  await scenario('Explicit learner400 releases rejected request for corrected new save', 'student-user-a', async ({ mount, submissionsPath, writes, count, drained }) => {
    const ui = await mount(); await ui.change(item => item.type === 'textarea', 'Invalid\u0000 learner response.'); await ui.submit(); check(writes(submissionsPath).at(-1).status, 400, 'Actual plain-text schema explicitly rejects unsupported control'); check(count('submission_attempts'), 0, 'Rejected400 persists no response'); check(ui.one(item => item.type === 'textarea').props.disabled, false, 'Explicit400 unlocks rejected response for correction'); check(enabled(ui, 'Retry pending response'), false, 'Explicit rejected400 is not treated as unknown committed attempt'); await ui.change(item => item.type === 'textarea', 'Corrected intentional learner response.'); await ui.submit(); check(count('submission_attempts'), 1, 'Corrected valid new save commits once'); check(writes(submissionsPath).length, 2, 'Correction sends a deliberate new request'); drained();
  });
  await scenario('Explicit learner409 requires comparison then deliberate new attempt', 'student-user-a', async ({ mount, post, submissionsPath, writes, count, drained }) => {
    const ui = await mount(); await ui.change(item => item.type === 'textarea', 'Intentional newer learner response after conflict.'); await post(submissionsPath, { clientSubmissionId: crypto.randomUUID(), expectedAttempt: 0, response: 'Independent newer response before local submit.' }); await ui.submit(); check(writes(submissionsPath).at(-1).status, 409, 'Actual stale expectedAttempt explicitly conflicts'); check(count('submission_attempts'), 1, 'Rejected conflict creates no local response'); check(enabled(ui, 'Save response attempt'), false, 'Conflict blocks new response until current comparison'); check(enabled(ui, 'Retry pending response'), false, 'Explicit409 releases rejected pending request'); const rejected = writes(submissionsPath).at(-1).payload; await ui.click(refreshAssignment); await ui.submit(); const deliberate = writes(submissionsPath).at(-1).payload; check(deliberate.expectedAttempt, 1, 'Intentional post-comparison new response uses current number'); okay(deliberate.clientSubmissionId !== rejected.clientSubmissionId, 'Explicitly rejected request can generate new UUID after comparison'); check(count('submission_attempts'), 2, 'Deliberate newer attempt is separate from uncertain original replay'); drained();
  });
  await scenario('Explicit feedback409 requires fresh evidence and renewed review', 'teacher-a', async ({ post, mount, submissionsPath, writes, count, drained }) => {
    const attempt = await post(submissionsPath, { clientSubmissionId: crypto.randomUUID(), expectedAttempt: 0, response: 'Synthetic response for deliberate feedback conflict.' }, 'student-user-a'); const path = submissionsPath + '/' + attempt.id + '/feedback'; const ui = await mount(); await ui.change(item => item.type === 'textarea', 'Intentional feedback after comparison.'); await ui.change(item => item.type === 'input' && item.props.type === 'checkbox', true); await post(path, { clientFeedbackId: crypto.randomUUID(), expectedRevision: 0, feedback: 'Independent reviewed feedback before local submit.', reviewed: true }); await ui.submit(); check(writes(path).at(-1).status, 409, 'Actual stale feedback revision explicitly conflicts'); check(count('submission_feedback'), 1, 'Conflict appends no local reviewed revision'); check(ui.one(item => item.type === 'input' && item.props.type === 'checkbox').props.checked, false, 'Conflict clears original review confirmation'); check(enabled(ui, 'Retry pending feedback'), false, 'Explicit feedback conflict releases rejected pending request'); const rejected = writes(path).at(-1).payload; await ui.click(refreshAssignment); await ui.change(item => item.type === 'input' && item.props.type === 'checkbox', true); await ui.submit(); const deliberate = writes(path).at(-1).payload; check(deliberate.expectedRevision, 1, 'Renewed review follows latest current feedback evidence'); okay(deliberate.clientFeedbackId !== rejected.clientFeedbackId, 'Deliberate new reviewed revision has a new UUID after rejection'); check(count('submission_feedback'), 2, 'Deliberate post-conflict review appends once'); drained();
  });
  await scenario('Explicit policy409 permits only comparison and renewed intentional change', 'teacher-a', async ({ api, post, mount, assignment, windowPath, writes, count, drained }) => {
    const initial = await (await api(windowPath)).json(); let ui; const props = { assignmentId: assignment.id, actorId: 'teacher-a', available: true, window: initial, staff: true, onChanged(value) { ui.props.window = value; }, onAccessLost() {} }; ui = await mount(windowClient.AssignmentSubmissionWindow, props); await ui.change(item => item.type === 'select', 'closed'); await ui.change(item => item.type === 'input' && item.props.minLength === 10, 'Intentional policy closing after comparison.'); await ui.change(item => item.type === 'input' && item.props.type === 'checkbox', true); await post(windowPath, { clientPolicyId: crypto.randomUUID(), expectedRevision: 0, state: 'open', closesAt: null, reviewConfirmed: true, reason: 'Independent reviewed current policy.' }); await ui.submit(); check(writes(windowPath).at(-1).status, 409, 'Actual stale policy revision explicitly conflicts'); check(count('assignment_submission_windows'), 1, 'Rejected policy conflict does not close current open state'); check(ui.one(item => item.type === 'input' && item.props.type === 'checkbox').props.checked, false, 'Policy conflict clears review confirmation'); check(enabled(ui, 'Save reviewed submission window'), false, 'Rejected policy needs current refresh/comparison'); const rejected = writes(windowPath).at(-1).payload; await ui.click('Refresh submission window'); await ui.change(item => item.type === 'input' && item.props.type === 'checkbox', true); await ui.submit(); const deliberate = writes(windowPath).at(-1).payload; check(deliberate.expectedRevision, 1, 'New intentional close uses current revision after comparison'); okay(deliberate.clientPolicyId !== rejected.clientPolicyId, 'Rejected policy may create new UUID only after intentional renewed review'); check(count('assignment_submission_windows'), 2, 'Renewed intended policy has one new receipt'); drained();
  });

  for (const failure of ['fetch', 'body']) await scenario('Partial assignment ' + failure + ' rejection drains every fulfilled response', 'student-user-a', async ({ mount, submissionsPath, intercept, drained }) => {
    const ui = await mount(); let injected = false;
    intercept(async ({ path, options, response }) => { if (path === submissionsPath && options.method !== 'POST' && !injected) { injected = true; if (failure === 'fetch') { await response.arrayBuffer(); throw new TypeError('Synthetic partial assignment fetch failure after actual read'); } await response.arrayBuffer(); return new Response(new ReadableStream({ start(controller) { controller.error(new TypeError('Synthetic partial assignment response body failure')); } }), { status: 200 }); } return response; });
    await ui.click(refreshAssignment); okay(injected, 'Partial actual route reply failure reached the source read callback'); okay(hasText(ui, 'SYNTHETIC_RECOVERY_MATERIAL'), 'Temporary partial transport failure retains last authorized material rather than fake denial'); check(enabled(ui, 'Save response attempt'), false, 'Unconfirmed current partial read blocks a new mutation'); intercept(undefined); await ui.click(refreshAssignment); drained();
  });
  check(externalRequests, 0, 'Every route and callback scenario remains offline with synthetic records');
  console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0, scenarios, requests, externalRequests, scope: 'actual sessions/routes/production D1 over SQLite; unchanged source callbacks with substituted hooks; not mounted-browser evidence' }));
} finally { globalThis.fetch = oldFetch; globalThis.window = oldWindow; delete globalThis.__sahaRecoveryReact; }
