// Independent client callback contracts using actual synthetic sessions, routes
// and production Drizzle D1 statements over SQLite. Hooks/elements are substituted;
// this is not mounted-browser, educator acceptance or hosted execution evidence.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { drizzle } from 'drizzle-orm/d1';
import { freshDatabase, seedSecurityData, load, bindings, root } from '../support/security-db.mjs';
import { serverWork, settleQuiet } from '../support/quiescence.mjs';
const origin = 'https://education.example.invalid'; bindings.SAHA_ALLOWED_ORIGINS = origin;
const routes = { students: await load('app/api/students/route.ts'), classes: await load('app/api/classes/route.ts'), enrolments: await load('app/api/enrolments/route.ts'), session: await load('app/api/session/route.ts'), reports: await load('app/api/report-cards/route.ts'), report: await load('app/api/report-cards/[id]/route.ts') };
const sessions = await load('lib/education/session.ts');
let activeUI, checks = 0, scenarios = 0, requests = 0, externalRequests = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const okay = (value, message) => { assert.ok(value, message); checks++; };
const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value, ...nodes(value.props?.children)] : [];
const text = value => Array.isArray(value) ? value.map(text).join('') : value && typeof value === 'object' ? text(value.props?.children) : value == null || typeof value === 'boolean' ? '' : String(value);
const originalFetch = globalThis.fetch, originalWindow = globalThis.window;
globalThis.window = { location: { origin, assign() { throw new Error('Academic callback contracts preserve the mounted reminder.'); } } };
globalThis.__sahaAcademicContractReact = {
  createElement(type, props, ...children) { return { type, props: { ...props, children: children.length === 1 ? children[0] : children } }; },
  useState(initial) { const ui = activeUI, index = ui.index++; if (!ui.cells[index]) ui.cells[index] = { value: typeof initial === 'function' ? initial() : initial }; return [ui.cells[index].value, value => { ui.cells[index].value = typeof value === 'function' ? value(ui.cells[index].value) : value; }]; },
  useRef(initial) { const ui = activeUI, index = ui.index++; if (!ui.cells[index]) ui.cells[index] = { current: initial }; return ui.cells[index]; },
  useCallback(callback, deps) { const ui = activeUI, index = ui.index++, old = ui.cells[index]; if (!old || deps.some((value, index) => value !== old.deps[index])) ui.cells[index] = { callback, deps }; return ui.cells[index].callback; },
  useEffect(callback, deps) { const ui = activeUI, index = ui.index++, old = ui.cells[index]; if (!old || deps.some((value, index) => value !== old.deps[index])) { old?.cleanup?.(); ui.cells[index] = { deps }; ui.effects.push(() => { ui.cells[index].cleanup = callback(); }); } },
};
async function component(path) {
  const source = readFileSync(root + path, 'utf8'), compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } }).outputText;
  const prefix = 'const React=globalThis.__sahaAcademicContractReact;const {useState,useRef,useEffect,useCallback}=React;const Button="button",Label="label",Card="section",CardContent="div",CardDescription="p",CardHeader="header",CardTitle="h2",Badge="span",Input="input",Textarea="textarea";\n';
  return (await import('data:text/javascript;base64,' + Buffer.from(prefix + compiled.replace(/^import[^\n]*;\n/gm, '') + '\n//# sourceURL=saha-academic-client-' + path.replaceAll('/', '-')).toString('base64'))).default;
}
const Enrolments = await component('app/enrolments/page.tsx'), Reports = await component('app/report-cards/page.tsx');
const settle = () => settleQuiet();
function driver(Component) {
  const ui = { cells: [], index: 0, effects: [], tree: null,
    render() { activeUI = ui; ui.index = 0; ui.effects = []; ui.tree = Component(); for (const effect of ui.effects) effect(); },
    all(predicate) { return nodes(ui.tree).filter(predicate); },
    one(predicate) { const found = ui.all(predicate); assert.equal(found.length, 1, 'Exactly one academic control'); return found[0]; },
    button(label) { return ui.one(node => node.type === 'button' && text(node) === label); },
    async flush() { await settle(); ui.render(); await settle(); ui.render(); },
    async change(id, value) { const node = ui.one(node => node.props.id === id && ['select', 'input', 'textarea'].includes(node.type)); okay(!node.props.disabled, 'Requested academic field is enabled'); node.props.onChange({ target: { value, checked: value } }); await ui.flush(); },
    async click(label) { const node = ui.button(label); okay(!node.props.disabled, 'Requested academic action is enabled'); node.props.onClick(); await ui.flush(); },
    dispose() { for (const cell of ui.cells) cell?.cleanup?.(); },
  }; ui.render(); return ui;
}
const has = (ui, value) => text(ui.tree).includes(value);
const rosterIds = ui => ui.all(node => node.props['data-enrolment-id']).map(node => node.props['data-enrolment-id']);
const reportIds = ui => ui.all(node => node.props['data-report-card-id']).map(node => node.props['data-report-card-id']);
const privateSummary = 'Synthetic private stored report summary';
const draftFields = { term: 'Synthetic academic term', overallGrade: 'School-supplied grade', summary: 'Synthetic private unsaved report draft' };
async function fillDraft(ui) { for (const [id, value] of Object.entries(draftFields)) await ui.change(id, value); }
async function scenario(name, Component, action, actor = 'admin-a') {
  const fixture = freshDatabase(); await seedSecurityData(fixture.db, fixture.schema); const { sqlite, schema } = fixture;
  sqlite.prepare('UPDATE report_cards SET summary=? WHERE id=?').run(privateSummary, 'draft-a');
  function prepare(query, values = []) { return { bind(...params) { return prepare(query, params); }, async raw() { const statement = sqlite.prepare(query); statement.setReturnArrays(true); return statement.all(...values); }, async all() { return { success: true, results: sqlite.prepare(query).all(...values), meta: {} }; }, async run() { const statement = sqlite.prepare(query); if (statement.columns().length) return { success: true, results: statement.all(...values), meta: {} }; const result = statement.run(...values); return { success: true, results: [], meta: { changes: Number(result.changes) } }; } }; }
  globalThis.__sahaTestDb = drizzle({ prepare, async batch(statements) { sqlite.exec('BEGIN'); try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec('COMMIT'); return result; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } }, { schema });
  const cookies = {}; for (const id of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'guardian-a', 'student-user-a']) cookies[id] = (await sessions.createSession(id)).split(';')[0];
  const context = { sqlite, actor, trace: [], before: null, after: null, uis: [], async renew(id = context.actor) { cookies[id] = (await sessions.createSession(id)).split(';')[0]; }, count(table) { return sqlite.prepare('SELECT count(*) n FROM ' + table).get().n; }, writes() { return context.trace.filter(row => row.method !== 'GET'); }, mount() { const ui = driver(Component); context.uis.push(ui); return ui; } };
  globalThis.fetch = async (path, init = {}) => {
    const url = new URL(path, origin); if (url.origin !== origin) { externalRequests++; throw new Error('Academic contracts stay offline.'); }
    const method = init.method ?? 'GET'; context.before?.(url.pathname, method, url);
    const request = new Request(url, { ...init, headers: { ...init.headers, origin, cookie: cookies[context.actor] ?? '' } });
    let route, parameters;
    if (url.pathname === '/api/students') route = routes.students;
    else if (url.pathname === '/api/classes') route = routes.classes;
    else if (url.pathname === '/api/enrolments') route = routes.enrolments;
    else if (url.pathname === '/api/session') route = routes.session;
    else if (url.pathname === '/api/report-cards') route = routes.reports;
    else if (url.pathname.startsWith('/api/report-cards/')) { route = routes.report; parameters = { params: Promise.resolve({ id: url.pathname.split('/').at(-1) }) }; }
    else throw new Error('Unexpected academic route');
    requests++; const response = await serverWork(() => route[method](request, parameters));
    context.trace.push({ path: url.pathname, search: url.search, method, status: response.status, body: init.body, actor: context.actor });
    return context.after ? await context.after(url.pathname, method, response, url, init) : response;
  };
  try { await action(context); scenarios++; }
  catch (error) { error.message = name + ': ' + error.message; throw error; }
  finally { for (const ui of context.uis) ui.dispose(); await settle(); sqlite.close(); }
}
try {
  await scenario('Administrator enrolment scope', Enrolments, async ctx => {
    const ui = ctx.mount(); await ui.flush(); check(rosterIds(ui), ['student-a-enrolment'], 'Initial roster belongs to the selected class');
    check(ui.one(node => node.props.id === 'class-select').props.value, 'class-a', 'Selected class matches initial roster');
    okay(ui.all(node => node.type === 'button' && text(node) === 'Withdraw').length, 'Current administrators have status actions');
    check(ctx.writes().length, 0, 'Loading enrolments does not mutate records');
    okay(!has(ui, 'student-b Synthetic'), 'Another school learner remains absent');
  });
  for (const actor of ['teacher-a', 'guardian-a', 'student-user-a']) await scenario('Read-only enrolment role ' + actor, Enrolments, async ctx => {
    const ui = ctx.mount(); await ui.flush(); check(rosterIds(ui), ['student-a-enrolment'], 'Read-only role keeps authorized roster');
    check(ui.all(node => node.type === 'button' && ['Enrol Student', 'Withdraw', 'Complete'].includes(text(node))).length, 0, 'Read-only roles do not receive administrator actions');
    okay(!has(ui, 'student-other Synthetic') && !has(ui, 'student-b Synthetic'), 'Read-only role does not receive unrelated learner choices');
    check(ctx.writes().length, 0, 'Read-only render sends no writes');
  }, actor);
  await scenario('Class selection clears old content synchronously', Enrolments, async ctx => {
    const ui = ctx.mount(); await ui.flush(); let release;
    ctx.after = async (path, method, response, url) => path === '/api/enrolments' && url.search.includes('class-other') ? new Promise(resolve => { release = () => resolve(response); }) : response;
    ui.one(node => node.props.id === 'class-select').props.onChange({ target: { value: 'class-other' } }); ui.render();
    check(rosterIds(ui), [], 'Previous class actions disappear as soon as selection changes');
    okay(!has(ui, 'student-a Synthetic'), 'Previous learner names are hidden while loading'); await ui.flush(); okay(release, 'Actual next-class response is held');
    ctx.after = null; release(); await ui.flush(); check(rosterIds(ui), ['student-other-enrolment'], 'Verified current-class response is applied');
  });
  await scenario('Late former class reply cannot cause wrong-class withdrawal', Enrolments, async ctx => {
    const ui = ctx.mount(); await ui.flush();
    const select = ui.one(node => node.props.id === 'class-select').props.onChange; let release;
    ctx.after = async (path, method, response, url) => path === '/api/enrolments' && url.search.includes('class-a') ? new Promise(resolve => { release = () => resolve(response); }) : response;
    ui.button('Reload current enrolments').props.onClick(); await ui.flush(); okay(release, 'Actual former class reply is held');
    select({ target: { value: 'class-other' } }); await ui.flush();
    check(rosterIds(ui), ['student-other-enrolment'], 'Newer selected class is fully loaded before the older reply');
    ctx.after = null; release(); await ui.flush();
    check(ui.one(node => node.props.id === 'class-select').props.value, 'class-other', 'Late former reply cannot change the selected class');
    check(rosterIds(ui), ['student-other-enrolment'], 'Late former reply cannot replace current selected roster');
    await ui.click('Withdraw'); check(ctx.sqlite.prepare('SELECT status FROM enrolments WHERE id=?').get('student-a-enrolment').status, 'active', 'Former class enrolment remains untouched');
    check(ctx.sqlite.prepare('SELECT status FROM enrolments WHERE id=?').get('student-other-enrolment').status, 'withdrawn', 'Only the selected class enrolment changes');
    check(JSON.parse(ctx.writes()[0].body).id, 'student-other-enrolment', 'Status mutation targets the selected current roster');
  });
  await scenario('Denied reload hides former academic inventory', Enrolments, async ctx => {
    const ui = ctx.mount(); await ui.flush(); ctx.sqlite.prepare('UPDATE users SET disabled_at=? WHERE id=?').run('2026-10-05T00:00:00Z', 'admin-a');
    await ui.click('Reload current enrolments'); check(rosterIds(ui), [], 'Denied reload hides all enrolment rows');
    check(ui.all(node => node.type === 'select').length, 0, 'Denied reload hides school choices');
    okay(has(ui, 'Sign in again'), 'Denied reload explains restoring sign-in');
  });
  await scenario('Changed account during inventory is rejected', Enrolments, async ctx => {
    let injected = false; ctx.before = path => { if (!injected && path === '/api/classes') { injected = true; ctx.actor = 'admin-b'; } };
    const ui = ctx.mount(); await ui.flush(); check(rosterIds(ui), [], 'Mixed-account inventory is never shown');
    check(ui.all(node => node.type === 'select').length, 0, 'Mixed-account choices remain hidden');
    check(ctx.writes().length, 0, 'Mixed-account loading cannot write');
  });
  await scenario('Unenrolled student creation and synchronous duplicate lock', Enrolments, async ctx => {
    const ui = ctx.mount(); await ui.flush(); await ui.change('student-select', 'student-other');
    const callback = ui.button('Enrol Student').props.onClick; callback(); callback(); await ui.flush();
    check(ctx.writes().length, 1, 'Two pre-render clicks send one enrolment creation'); check(ctx.writes()[0].status, 201, 'Current administrator creates the new pair');
    check(ctx.sqlite.prepare('SELECT count(*) n FROM enrolments WHERE student_id=? AND class_id=?').get('student-other', 'class-a').n, 1, 'One confirmed student–class pair is saved');
    check(ui.one(node => node.props.id === 'student-select').props.value, '', 'Confirmed creation clears the selected learner');
  });
  for (const status of [401, 403]) await scenario('Late enrolment access denial ' + status, Enrolments, async ctx => {
    const ui = ctx.mount(); await ui.flush(); ctx.before = (path, method) => { if (path === '/api/enrolments' && method === 'PATCH') { if (status === 401) ctx.sqlite.prepare('DELETE FROM auth_sessions WHERE user_id=?').run('admin-a'); else ctx.sqlite.prepare('UPDATE users SET role=? WHERE id=?').run('teacher', 'admin-a'); } };
    await ui.click('Withdraw'); check(ctx.writes()[0].status, status, 'Actual server denies the late changed authority');
    check(rosterIds(ui), [], 'Late denial hides loaded enrolment records'); okay(!has(ui, 'student-a Synthetic'), 'Late denial hides original learner name');
    okay(!has(ui, 'Submitted change:'), 'Pending exact original action stays private without current scope');
    check(ctx.sqlite.prepare('SELECT status FROM enrolments WHERE id=?').get('student-a-enrolment').status, 'active', 'Denied write preserves original status');
  });
  for (const kind of ['enrol', 'status']) await scenario('Committed lost enrolment reply ' + kind, Enrolments, async ctx => {
    const ui = ctx.mount(); await ui.flush(); if (kind === 'enrol') await ui.change('student-select', 'student-other');
    ctx.after = async (path, method, response) => { if (path === '/api/enrolments' && method !== 'GET') { await response.arrayBuffer(); throw new Error('Synthetic lost academic reply'); } return response; };
    await ui.click(kind === 'enrol' ? 'Enrol Student' : 'Withdraw'); check(ctx.writes().length, 1, 'The original action was sent once');
    check(rosterIds(ui), [], 'An unknown result hides the previous roster'); okay(!has(ui, 'Submitted change:'), 'Unconfirmed original payload stays private until verification');
    ctx.after = null; await ui.click('Reload current enrolments'); check(ctx.writes().length, 1, 'Reload never automatically retries the legacy mutation');
    okay(has(ui, 'Submitted change:'), 'Original account can compare its exact submitted action');
    check(ui.button('Enrol Student').props.disabled, true, 'A new creation remains blocked while an action is unresolved');
    check(ui.button('Finish comparing saved enrolments').props.disabled, true, 'Comparison requires explicit confirmation');
    await ui.change('enrolment-compared', true); await ui.click('Finish comparing saved enrolments');
    okay(!has(ui, 'The previous change is unconfirmed'), 'Manual comparison releases the in-page reminder');
    check(ctx.writes().length, 1, 'Finishing comparison does not send another mutation');
  });
  await scenario('Wrong account cannot inspect an unconfirmed enrolment', Enrolments, async ctx => {
    const ui = ctx.mount(); await ui.flush(); ctx.after = async (path, method, response) => { if (method === 'PATCH') { await response.arrayBuffer(); throw new Error('Synthetic lost reply'); } return response; }; await ui.click('Withdraw');
    ctx.after = null; ctx.actor = 'admin-b'; await ui.click('Reload current enrolments');
    okay(!has(ui, 'Submitted change:') && !has(ui, 'student-a Synthetic'), 'Different school account cannot see pending actor details');
    check(ui.all(node => node.props.id === 'enrolment-compared').length, 0, 'Different actor cannot release the original reminder');
    check(ctx.writes().length, 1, 'Different actor reload does not retry original mutation');
  });
  await scenario('Wrong success correlation is unconfirmed', Enrolments, async ctx => {
    const ui = ctx.mount(); await ui.flush(); ctx.after = async (path, method, response) => { if (method === 'PATCH') { const row = await response.json(); return Response.json({ ...row, classId: 'class-other' }); } return response; };
    await ui.click('Withdraw'); check(rosterIds(ui), [], 'Mismatched successful payload hides prior records');
    okay(has(ui, 'could not be confirmed'), 'Mismatched result does not claim confirmed save'); okay(!has(ui, 'Enrolment status saved.'), 'Uncorrelated payload cannot produce a success notice');
  });
  await scenario('Administrator report scope', Reports, async ctx => {
    const ui = ctx.mount(); await ui.flush(); await ui.change('report-student', 'student-a');
    check(reportIds(ui).sort(), ['draft-a', 'published-a'], 'Staff see saved draft and published reports for selected student');
    okay(has(ui, privateSummary), 'Authorized administrator can review stored private details'); check(ctx.writes().length, 0, 'Loading reports creates no report or notice');
  });
  for (const actor of ['teacher-a', 'guardian-a', 'student-user-a']) await scenario('Read-only report role ' + actor, Reports, async ctx => {
    const ui = ctx.mount(); await ui.flush(); await ui.change('report-student', 'student-a');
    check(reportIds(ui).sort(), actor === 'teacher-a' ? ['draft-a', 'published-a'] : ['published-a'], 'Existing staff/family publication scopes are preserved');
    check(ui.all(node => node.type === 'button' && ['Publish', 'Create Draft'].includes(text(node))).length, 0, 'Read-only accounts receive no report mutation controls');
    if (actor !== 'teacher-a') okay(!has(ui, privateSummary), 'Unpublished report content is absent from family views');
    check(ctx.writes().length, 0, 'Read-only report journey makes no mutation');
  }, actor);
  await scenario('Report student selection hides prior content', Reports, async ctx => {
    const ui = ctx.mount(); await ui.flush(); await ui.change('report-student', 'student-a'); let release;
    ctx.after = async (path, method, response, url) => path === '/api/report-cards' && url.search.includes('student-other') ? new Promise(resolve => { release = () => resolve(response); }) : response;
    ui.one(node => node.props.id === 'report-student').props.onChange({ target: { value: 'student-other' } }); ui.render();
    check(reportIds(ui), [], 'Former student reports hide synchronously'); okay(!has(ui, privateSummary), 'Former private summary is absent while next student loads');
    await ui.flush(); okay(release, 'Next student actual route response is held'); ctx.after = null; release(); await ui.flush();
    check(reportIds(ui), [], 'Current student empty result is shown without former student records');
    check(ui.one(node => node.props.id === 'report-student').props.value, 'student-other', 'Empty current roster retains correct selected learner');
  });
  for (const status of [401, 403]) await scenario('Late report publication denial ' + status, Reports, async ctx => {
    const ui = ctx.mount(); await ui.flush(); await ui.change('report-student', 'student-a'); await fillDraft(ui); await ui.change('review-draft-a', true);
    ctx.before = (path, method) => { if (path === '/api/report-cards/draft-a' && method === 'PATCH') { if (status === 401) ctx.sqlite.prepare('DELETE FROM auth_sessions WHERE user_id=?').run('admin-a'); else ctx.sqlite.prepare('UPDATE users SET role=? WHERE id=?').run('teacher', 'admin-a'); } };
    await ui.click('Publish'); check(ctx.writes()[0].status, status, 'Actual report endpoint denies changed authority');
    check(reportIds(ui), [], 'Denied publication hides stored reports'); okay(!has(ui, privateSummary), 'Denied publication hides private summary');
    check(ui.all(node => ['input', 'textarea', 'select'].includes(node.type)).length, 0, 'Denied publication hides school choices and unsaved draft fields');
    okay(!has(ui, 'Original publication:'), 'Original report request is private until access is verified');
    check(ctx.sqlite.prepare('SELECT published_at FROM report_cards WHERE id=?').get('draft-a').published_at, null, 'Denied publication does not publish the draft');
  });
  await scenario('Account change before mutation sends no publication', Reports, async ctx => {
    const ui = ctx.mount(); await ui.flush(); await ui.change('report-student', 'student-a'); await ui.change('review-draft-a', true);
    ctx.actor = 'admin-b'; await ui.click('Publish'); check(ctx.writes().length, 0, 'Fresh account preflight blocks different actor before publication');
    check(reportIds(ui), [], 'Changed actor clears loaded reports'); okay(!has(ui, privateSummary), 'Changed actor sees no original private summary');
  });
  await scenario('Confirmed report creation and duplicate lock', Reports, async ctx => {
    const ui = ctx.mount(); await ui.flush(); await ui.change('report-student', 'student-a'); await fillDraft(ui);
    const submit = ui.one(node => node.type === 'form').props.onSubmit; submit({ preventDefault() {} }); submit({ preventDefault() {} }); await ui.flush();
    check(ctx.writes().length, 1, 'Two pre-render form submissions create one report'); check(ctx.writes()[0].status, 201, 'Manual draft creation succeeds');
    check(ctx.sqlite.prepare('SELECT count(*) n FROM report_cards WHERE term=?').get(draftFields.term).n, 1, 'Exactly one submitted draft is stored');
    check(ui.one(node => node.props.id === 'summary').props.value, '', 'Confirmed draft clears entered fields');
    check(ctx.count('report_publication_receipts'), 0, 'Creating a draft does not publish it');
  });
  await scenario('Lost report creation requires manual comparison without retry', Reports, async ctx => {
    const ui = ctx.mount(); await ui.flush(); await ui.change('report-student', 'student-a'); await fillDraft(ui);
    ctx.after = async (path, method, response) => { if (method === 'POST') { await response.arrayBuffer(); throw new Error('Synthetic lost report create reply'); } return response; };
    ui.one(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); await ui.flush();
    check(reportIds(ui), [], 'Unknown draft save hides prior reports'); check(ui.all(node => node.type === 'textarea').length, 0, 'Unknown draft fields stay private without current access');
    ctx.after = null; await ui.click('Reload current reports'); okay(has(ui, 'Submitted draft for student-a Synthetic'), 'Original administrator sees exact pending draft after reload');
    okay(has(ui, draftFields.summary), 'Submitted draft summary is preserved for comparison'); check(ui.button('Create Draft').props.disabled, true, 'A new draft cannot bypass unconfirmed creation');
    check(ctx.writes().length, 1, 'Reload does not retry non-idempotent creation');
    await ui.change('report-draft-compared', true); await ui.click('Finish comparing saved reports');
    check(ui.one(node => node.props.id === 'summary').props.value, '', 'Manual comparison starts a separate blank draft');
    check(ctx.writes().length, 1, 'Comparison sends no report creation'); check(ctx.sqlite.prepare('SELECT count(*) n FROM report_cards WHERE term=?').get(draftFields.term).n, 1, 'Lost reply leaves one saved draft');
  });
  await scenario('Lost publication retries original report exactly once without duplicate notices', Reports, async ctx => {
    const ui = ctx.mount(); await ui.flush(); await ui.change('report-student', 'student-a'); await ui.change('review-draft-a', true);
    ctx.after = async (path, method, response) => { if (method === 'PATCH') { await response.arrayBuffer(); throw new Error('Synthetic lost report publish reply'); } return response; };
    await ui.click('Publish'); check(ctx.count('report_publication_receipts'), 1, 'Publication commits before the reply is lost');
    const notices = ctx.sqlite.prepare("SELECT * FROM notifications WHERE id LIKE 'report-card-published:draft-a:%' ORDER BY id").all();
    check(notices.length, 1, 'Committed original publication has one eligible guardian notice');
    check(reportIds(ui), [], 'Unknown publication hides prior private reports');
    ctx.after = null; await ui.click('Reload current reports'); okay(has(ui, 'Original publication: report draft-a'), 'Fresh original account can recover exact original publication');
    check(ctx.writes().length, 1, 'Reload does not publish automatically'); await ui.click('Retry original report publication');
    check(ctx.writes().map(row => [row.path, row.method, row.body]), [['/api/report-cards/draft-a', 'PATCH', '{"publish":true}'], ['/api/report-cards/draft-a', 'PATCH', '{"publish":true}']], 'Explicit retry preserves original report endpoint and bytes');
    check(ctx.count('report_publication_receipts'), 1, 'Idempotent retry retains one original receipt');
    check(ctx.sqlite.prepare("SELECT * FROM notifications WHERE id LIKE 'report-card-published:draft-a:%' ORDER BY id").all(), notices, 'Idempotent retry preserves exact original notice evidence');
    okay(!has(ui, 'The previous report action is unconfirmed'), 'Confirmed original publication clears recovery reminder');
  });
  await scenario('Different account cannot inspect or retry pending report action', Reports, async ctx => {
    const ui = ctx.mount(); await ui.flush(); await ui.change('report-student', 'student-a'); await ui.change('review-draft-a', true);
    ctx.after = async (path, method, response) => { if (method === 'PATCH') { await response.arrayBuffer(); throw new Error('Synthetic lost reply'); } return response; }; await ui.click('Publish');
    ctx.after = null; ctx.actor = 'admin-b'; await ui.click('Reload current reports');
    okay(!has(ui, 'Original publication:') && !has(ui, privateSummary), 'Different account cannot inspect the original report action');
    check(ui.all(node => node.type === 'button' && text(node) === 'Retry original report publication').length, 0, 'Different account cannot retry original publication'); check(ctx.writes().length, 1, 'Different account reload makes no publication');
  });
  await scenario('Report response from another learner is unconfirmed', Reports, async ctx => {
    const ui = ctx.mount(); await ui.flush(); await ui.change('report-student', 'student-a'); await ui.change('review-draft-a', true);
    ctx.after = async (path, method, response) => { if (method === 'PATCH') { const card = await response.json(); return Response.json({ ...card, studentId: 'student-other' }); } return response; };
    await ui.click('Publish'); check(reportIds(ui), [], 'Uncorrelated report success hides loaded reports'); okay(!has(ui, 'Report published.'), 'Uncorrelated report response cannot claim publication success');
    okay(has(ui, 'Publication could not be confirmed'), 'Uncorrelated report result remains recoverable');
  });
  await scenario('Report reload retains only same current administrator draft', Reports, async ctx => {
    const ui = ctx.mount(); await ui.flush(); await ui.change('report-student', 'student-a'); await fillDraft(ui); await ui.click('Reload current reports');
    check(ui.one(node => node.props.id === 'summary').props.value, draftFields.summary, 'Same current administrator retains in-page entered text');
    ctx.actor = 'teacher-a'; await ui.click('Reload current reports'); check(ui.all(node => node.type === 'textarea').length, 0, 'Different role cannot view administrator draft fields');
    okay(!has(ui, draftFields.summary), 'Administrator unsaved draft is absent from the different account view');
    check(ctx.writes().length, 0, 'Draft refresh never saves entered text');
  });
  await scenario('Stale former-class action callback cannot withdraw a different roster', Enrolments, async ctx => {
    const ui = ctx.mount(); await ui.flush(); const oldWithdraw = ui.button('Withdraw').props.onClick;
    await ui.change('class-select', 'class-other'); oldWithdraw(); await ui.flush();
    check(ctx.writes().length, 0, 'Obsolete former-class control does not send a mutation');
    check(rosterIds(ui), ['student-other-enrolment'], 'Obsolete control preserves current class roster');
    check(ctx.sqlite.prepare('SELECT status FROM enrolments WHERE id=?').get('student-a-enrolment').status, 'active', 'Former-class learner status remains active');
  });
  await scenario('Stale previous-student draft form cannot create for a new learner', Reports, async ctx => {
    const ui = ctx.mount(); await ui.flush(); await ui.change('report-student', 'student-a'); await fillDraft(ui);
    const previousSubmit = ui.one(node => node.type === 'form').props.onSubmit;
    await ui.change('report-student', 'student-other'); previousSubmit({ preventDefault() {} }); await ui.flush();
    check(ctx.writes().length, 0, 'Former-student submit cannot use the old draft in a new selection');
    check(ui.one(node => node.props.id === 'summary').props.value, '', 'New student selection has a separate blank draft');
    check(ctx.sqlite.prepare('SELECT count(*) n FROM report_cards WHERE term=?').get(draftFields.term).n, 0, 'No previous draft is saved to either learner');
  });
  await scenario('Late previous-student report reply cannot replace current learner view', Reports, async ctx => {
    const ui = ctx.mount(); await ui.flush(); await ui.change('report-student', 'student-a');
    const select = ui.one(node => node.props.id === 'report-student').props.onChange; let release;
    ctx.after = async (path, method, response, url) => path === '/api/report-cards' && url.search.includes('student-a') ? new Promise(resolve => { release = () => resolve(response); }) : response;
    ui.button('Reload current reports').props.onClick(); await ui.flush(); okay(release, 'Actual previous-student report reply is held');
    select({ target: { value: 'student-other' } }); await ui.flush();
    check(reportIds(ui), [], 'New student with no report is applied before old reply');
    ctx.after = null; release(); await ui.flush();
    check(ui.one(node => node.props.id === 'report-student').props.value, 'student-other', 'Late report reply does not replace selected learner');
    check(reportIds(ui), [], 'Late report reply does not restore former reports');
    okay(!has(ui, privateSummary), 'Former private report summary remains absent');
  });
  for (const Component of [Enrolments, Reports]) await scenario('Unmount ignores late inventory reply ' + (Component === Enrolments ? 'enrolments' : 'reports'), Component, async ctx => {
    let release; ctx.after = async (path, method, response) => path === '/api/students' ? new Promise(resolve => { release = () => resolve(response); }) : response;
    const ui = ctx.mount(); await ui.flush(); okay(release, 'Actual inventory response is held before unmount');
    const before = ui.cells.filter(cell => Object.hasOwn(cell ?? {}, 'value')).map(cell => cell.value);
    ui.dispose(); ctx.after = null; release(); await settle();
    check(ui.cells.filter(cell => Object.hasOwn(cell ?? {}, 'value')).map(cell => cell.value), before, 'Unmounted client does not apply late private state');
    check(ctx.writes().length, 0, 'Unmounted inventory does not mutate any record');
  });
  await scenario('Enrolment duplicate conflict preserves concurrent original evidence', Enrolments, async ctx => {
    const ui = ctx.mount(); await ui.flush(); await ui.change('student-select', 'student-other');
    ctx.before = (path, method) => { if (path === '/api/enrolments' && method === 'POST') { ctx.before = null; ctx.sqlite.prepare('INSERT INTO enrolments (id,student_id,class_id,status,enrolled_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run('synthetic-concurrent-pair', 'student-other', 'class-a', 'active', '2026-10-05T00:00:00Z', '2026-10-05T00:00:00Z', '2026-10-05T00:00:00Z'); } };
    await ui.click('Enrol Student'); check(ctx.writes()[0].status, 409, 'Actual concurrent pair creates a known conflict');
    check(rosterIds(ui), [], 'Conflict hides obsolete roster until reload'); okay(!has(ui, 'The previous change is unconfirmed'), 'Known rejected creation is not claimed as uncertain commit');
    await ui.click('Reload current enrolments');
    okay(rosterIds(ui).includes('synthetic-concurrent-pair'), 'Reload preserves and shows the concurrent saved pair');
    check(ctx.sqlite.prepare('SELECT count(*) n FROM enrolments WHERE student_id=? AND class_id=?').get('student-other', 'class-a').n, 1, 'Conflict preserves exactly one existing pair');
    check(ctx.writes().length, 1, 'Conflict reload never retries the rejected creation');
  });
  await scenario('Restored original administrator recovers denied publication', Reports, async ctx => {
    const ui = ctx.mount(); await ui.flush(); await ui.change('report-student', 'student-a'); await ui.change('review-draft-a', true);
    ctx.before = (path, method) => { if (method === 'PATCH') { ctx.before = null; ctx.sqlite.prepare('DELETE FROM auth_sessions WHERE user_id=?').run('admin-a'); } };
    await ui.click('Publish'); check(ctx.writes()[0].status, 401, 'Actual revoked session denies original publication');
    ctx.actor = 'admin-b'; await ui.click('Reload current reports');
    check(ui.all(node => node.type === 'button' && text(node) === 'Retry original report publication').length, 0, 'Other administrator cannot retry original actor action');
    ctx.actor = 'admin-a'; await ctx.renew(); await ui.click('Reload current reports');
    okay(has(ui, 'Original publication: report draft-a'), 'Restored original account recovers original report identity');
    await ui.click('Retry original report publication'); check(ctx.writes().map(row => row.status), [401, 200], 'Only explicit restored-account retry publishes the exact original draft');
    check(ctx.count('report_publication_receipts'), 1, 'Recovery creates one immutable publication receipt');
    check(ctx.sqlite.prepare("SELECT count(*) n FROM notifications WHERE id LIKE 'report-card-published:draft-a:%'").get().n, 1, 'Recovered publication sends one eligible in-app notice');
  });
  await scenario('Rapid report field callbacks preserve all intended fields', Reports, async ctx => {
    const ui = ctx.mount(); await ui.flush(); await ui.change('report-student', 'student-a');
    const term = ui.one(node => node.props.id === 'term').props.onChange, grade = ui.one(node => node.props.id === 'overallGrade').props.onChange, summary = ui.one(node => node.props.id === 'summary').props.onChange;
    term({ target: { value: draftFields.term } }); grade({ target: { value: draftFields.overallGrade } }); summary({ target: { value: draftFields.summary } }); await ui.flush();
    for (const [id, value] of Object.entries(draftFields)) check(ui.one(node => node.props.id === id).props.value, value, 'Synchronous field events preserve exact ' + id);
    ui.one(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); await ui.flush();
    const saved = ctx.sqlite.prepare('SELECT term,overall_grade,summary FROM report_cards WHERE term=?').get(draftFields.term);
    check({ ...saved }, { term: draftFields.term, overall_grade: draftFields.overallGrade, summary: draftFields.summary }, 'Actual saved draft retains all rapidly entered exact fields');
  });
  check(externalRequests, 0, 'All academic callback routes stayed synthetic and offline');
  console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0, scenarios, requests, externalRequests, evidence: 'Substituted client callbacks with actual synthetic sessions, routes and production D1 SQL; mounted browser separate.' }));
} finally { globalThis.fetch = originalFetch; globalThis.window = originalWindow; delete globalThis.__sahaAcademicContractReact; }
