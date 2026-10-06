// Actual synthetic opaque sessions/routes/production D1 over SQLite.
// Candidate page callbacks use substituted hooks/elements, not mounted-browser evidence.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { drizzle } from 'drizzle-orm/d1';
import { freshDatabase, seedSecurityData, load, bindings, root } from '../support/security-db.mjs';
import { serverWork, settleQuiet } from '../support/quiescence.mjs';
const origin = 'https://education.example.invalid'; bindings.SAHA_ALLOWED_ORIGINS = origin;
const routes = { session: await load('app/api/session/route.ts'), schools: await load('app/api/schools/route.ts'), school: await load('app/api/schools/[id]/route.ts') };
const sessions = await load('lib/education/session.ts');
globalThis.__sahaSchoolTimestamp = (await load('lib/education/stored-timestamp.ts')).isExactStoredTimestamp;
let checks = 0, scenarios = 0, requests = 0, externalRequests = 0, activeUI;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const okay = (actual, message) => { assert.ok(actual, message); checks++; };
const oldFetch = globalThis.fetch, oldWindow = globalThis.window;
const redirects = []; globalThis.window = { location: { origin, assign(path) { redirects.push(path); } } };
const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value, ...nodes(value.props?.children)] : [];
const text = value => Array.isArray(value) ? value.map(text).join('') : value && typeof value === 'object' ? text(value.props?.children) : value == null || typeof value === 'boolean' ? '' : String(value);
globalThis.__sahaSchoolReact = {
  createElement(type, props, ...children) { const values = { ...props, children: children.length === 1 ? children[0] : children }; return typeof type === 'function' ? type(values) : { type, props: values }; },
  useState(initial) { const ui = activeUI, index = ui.index++; if (!ui.cells[index]) ui.cells[index] = { value: typeof initial === 'function' ? initial() : initial }; return [ui.cells[index].value, value => { ui.cells[index].value = typeof value === 'function' ? value(ui.cells[index].value) : value; }]; },
  useRef(initial) { const ui = activeUI, index = ui.index++; if (!ui.cells[index]) ui.cells[index] = { current: initial }; return ui.cells[index]; },
  useCallback(callback, deps) { const ui = activeUI, index = ui.index++, old = ui.cells[index]; if (!old || deps.some((value, index) => value !== old.deps[index])) ui.cells[index] = { deps, callback }; return ui.cells[index].callback; },
  useEffect(callback, deps) { const ui = activeUI, index = ui.index++, old = ui.cells[index]; if (!old || !deps || !old.deps || deps.some((value, index) => value !== old.deps[index])) { old?.cleanup?.(); ui.cells[index] = { deps }; ui.effects.push(() => { ui.cells[index].cleanup = callback(); }); } },
};
async function client(path) {
  const compiled = ts.transpileModule(readFileSync(root + path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } }).outputText;
  const prefix = 'const React=globalThis.__sahaSchoolReact;const {useState,useRef,useCallback,useEffect}=React;const isExactStoredTimestamp=globalThis.__sahaSchoolTimestamp;const AppShell="app-shell",Button="button",Input="input",Label="label",Card="section",CardContent="div",CardDescription="p",CardHeader="header",CardTitle="h2",Table="table",TableBody="tbody",TableCell="td",TableHead="th",TableHeader="thead",TableRow="tr";\n';
  return import('data:text/javascript;base64,' + Buffer.from(prefix + compiled.replace(/^import[^\n]*;\n/gm, '')).toString('base64'));
}
const School = (await client('app/schools/page.tsx')).default;
const settle = () => settleQuiet();
function driver(Component, props) {
  const ui = { cells: [], effects: [], index: 0, tree: null, props,
    render() { activeUI = ui; ui.index = 0; ui.effects = []; ui.tree = Component(ui.props); for (const effect of ui.effects) effect(); },
    all(predicate) { return nodes(ui.tree).filter(predicate); },
    one(predicate) { const found = ui.all(predicate); assert.equal(found.length, 1, 'Exactly one intended native control'); return found[0]; },
    button(label) { return ui.one(item => item.type === 'button' && text(item) === label); },
    async flush() { await settle(); ui.render(); await settle(); ui.render(); },
    async click(label) { const item = ui.button(label); okay(!item.props.disabled, 'Intended action is enabled'); await item.props.onClick(); await ui.flush(); },
    async change(id, value) { const item = ui.one(item => item.type === 'input' && item.props.id === id); okay(!item.props.disabled, 'Native selection is enabled'); item.props.onChange({ target: { value } }); await ui.flush(); },
    async submit() { const item = ui.one(item => item.type === 'form'); await item.props.onSubmit({ preventDefault() {} }); await ui.flush(); },
    value(id) { return ui.one(item => item.type === 'input' && item.props.id === id).props.value; },
    dispose() { for (const cell of ui.cells) cell?.cleanup?.(); },
  }; ui.render(); return ui;
}
const has = (ui, value) => text(ui.tree).includes(value);
const rowIds = (ui, attr) => ui.all(item => item.props?.[attr]).map(item => item.props[attr]).sort();
const shell = ui => ui.one(item => item.type === 'app-shell').props.principal;
const privateSchool = ui => rowIds(ui, 'data-school-details');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const form = ui => ui.one(item => item.type === 'form').props.onSubmit;
const ack = ui => ui.all(item => item.props?.['aria-label'] === 'Acknowledged school update');
const pending = ui => ui.all(item => item.props?.['aria-label'] === 'Pending school update');
const noPrivate = ui => { check(shell(ui), null, 'No unverified header principal'); check(privateSchool(ui), [], 'No stale saved school'); check(ui.all(item => item.type === 'input').length, 0, 'No private form fields'); };
async function scenario(name, action, initialActor = 'admin-a') {
  const fixture = freshDatabase(); await seedSecurityData(fixture.db, fixture.schema); const { sqlite, schema } = fixture;
  function prepare(query, values = []) { return { bind(...params) { return prepare(query, params); }, async raw() { const statement = sqlite.prepare(query); statement.setReturnArrays(true); return statement.all(...values); }, async all() { return { success: true, results: sqlite.prepare(query).all(...values), meta: {} }; }, async run() { const statement = sqlite.prepare(query); if (statement.columns().length) return { success: true, results: statement.all(...values), meta: {} }; const result = statement.run(...values); return { success: true, results: [], meta: { changes: Number(result.changes) } }; } }; }
  globalThis.__sahaTestDb = drizzle({ prepare, async batch(statements) { sqlite.exec('BEGIN'); try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec('COMMIT'); return result; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } }, { schema });
  const cookies = {}; for (const id of ['admin-a', 'admin-b', 'teacher-a', 'guardian-a', 'student-user-a']) cookies[id] = (await sessions.createSession(id)).split(';')[0];
  let actor = initialActor, intercept;
  const trace = [], responses = [], uis = [];
  function api(...args) { return serverWork(() => routeApi(...args)); }
  async function routeApi(path, method = 'GET', payload, user = actor) {
    const url = new URL(path, origin); if (url.origin !== origin) { externalRequests++; throw new Error('Contracts are local synthetic only'); }
    requests++; const headers = { origin, ...(user ? { cookie: cookies[user] } : {}) };
    const request = new Request(url, { method, headers: { ...headers, ...(payload === undefined ? {} : { 'content-type': 'application/json' }) }, ...(payload === undefined ? {} : { body: typeof payload === 'string' ? payload : JSON.stringify(payload) }) });
    if (url.pathname === '/api/session') return routes.session[method](request);
    if (url.pathname === '/api/schools') return routes.schools[method](request);
    const school = /^\/api\/schools\/([^/]+)$/.exec(url.pathname);
    if (school) return routes.school[method](request, { params: Promise.resolve({ id: decodeURIComponent(school[1]) }) });
    throw new Error('Unexpected local contract route');
  }
  globalThis.fetch = async (path, options = {}) => {
    const response = await api(String(path), options.method || 'GET', options.body);
    trace.push({ path: String(path), method: options.method || 'GET', status: response.status, ...(options.body ? { body: options.body } : {}) });
    const result = intercept ? await intercept({ path: String(path), options, response }) : response; if (result) responses.push(result); return result;
  };
  async function mount(props = {}) { const ui = driver(School, props); uis.push(ui); await ui.flush(); return ui; }
  const writes = () => trace.filter(row => row.method === 'PATCH');
  const saved = (id = 'a') => sqlite.prepare('SELECT * FROM schools WHERE id=?').get(id);
  const drained = () => check(responses.every(response => response.bodyUsed), true, 'Every delivered success/error response is drained');
  try { await action({ ...fixture, mount, api, trace, writes, saved, drained, setActor(value) { actor = value; }, intercept(value) { intercept = value; } }); scenarios++; }
  finally { for (const ui of uis) ui.dispose(); intercept = undefined; await settle(); sqlite.close(); }
}
try {
  await scenario('initial session failure can explicitly retry without inferred empty school', async ({ mount, intercept, trace, drained }) => {
    let once = false; intercept(async ({ path, response }) => { if (path === '/api/session' && !once) { once = true; await response.text(); return new Response('{}', { status: 503 }); } return response; });
    const ui = await mount(); check(ui.button('Reload saved school details').props.disabled, false, 'Initial current-session failure leaves explicit reload enabled'); check(has(ui, 'No school details available.'), false, 'Unavailable school is not presented as verified empty');
    intercept(undefined); await ui.click('Reload saved school details'); check(shell(ui)?.role, 'admin', 'Explicit retry verifies actual administrator session'); okay(has(ui, 'Synthetic school a'), 'Actual saved school is restored'); check(trace.filter(row => row.path === '/api/session').length, 3, 'Successful retry sandwiches the actual school read'); drained();
  });
  for (const actor of ['teacher-a', 'guardian-a', 'student-user-a']) await scenario('current non-administrator reads without editing controls', async ({ mount, writes, drained }) => {
    const ui = await mount(); check(privateSchool(ui), ['a'], 'Current scoped school is shown'); check(shell(ui).id, actor, 'Required shell principal is current'); check(ui.all(item => item.type === 'form').length, 0, 'Non-administrator has no form'); check(writes().length, 0, 'No write for read-only role'); check(ui.one(item => item.type === 'a' && text(item) === 'Dashboard').props.href, '/', 'Dashboard uses native anchor'); drained();
  }, actor);
  await scenario('current administrator native fields and reload have a complete scoped snapshot', async ({ mount, trace, writes, drained }) => {
    const ui = await mount(); check(privateSchool(ui), ['a'], 'Exactly current school'); check(ui.value('school-name'), 'Synthetic school a', 'Current saved name populates field'); check(ui.value('school-address'), '', 'SQL-null address is presented as blank');
    check(trace.map(row => row.path), ['/api/session', '/api/schools', '/api/session'], 'Both actual session checks bracket one school read');
    for (const [id, label] of [['school-name', 'School name'], ['school-address', 'Address (optional)']]) check(text(ui.one(item => item.type === 'label' && item.props.htmlFor === id)), label, 'Native field label is bound');
    check(ui.one(item => item.type === 'input' && item.props.id === 'school-name').props.required, true, 'Name remains required'); check(writes().length, 0, 'Read alone never updates'); drained();
  });
  for (const status of [401, 403, 404, 500]) await scenario('failed school read hides stale identity and can retry ' + status, async ({ mount, intercept, writes, drained }) => {
    const ui = await mount(); await ui.change('school-name', 'Private unsent name');
    intercept(async ({ path, response }) => { if (path === '/api/schools') { await response.text(); return new Response('{}', { status }); } return response; });
    const reload = ui.button('Reload saved school details').props.onClick; reload(); ui.render(); noPrivate(ui); await ui.flush(); noPrivate(ui); check(has(ui, 'Private unsent name'), false, 'Unsent values are hidden'); check(has(ui, 'No school details available.'), false, 'Failure is not verified empty');
    check(ui.button('Reload saved school details').props.disabled, false, 'Failed read remains recoverable'); check(ui.all(item => item.props?.role === 'alert').length, 1, 'Failure has native alert'); check(ui.one(item => item.props?.tabIndex === -1).props.tabIndex, -1, 'Result has focus target');
    intercept(undefined); await ui.click('Reload saved school details'); check(shell(ui).id, 'admin-a', 'Recovered actual account'); check(ui.value('school-name'), 'Private unsent name', 'Same-actor deliberate entries survive'); check(writes().length, 0, 'Retry does not save'); drained();
  });
  for (const mutation of ['missing', 'duplicate', 'incomplete', 'foreign', 'nonarray', 'malformed']) await scenario('unavailable school evidence is rejected ' + mutation, async ({ mount, intercept, writes, drained }) => {
    intercept(async ({ path, response }) => {
      if (path !== '/api/schools') return response;
      const rows = await response.json();
      const value = mutation === 'missing' ? [] : mutation === 'duplicate' ? [rows[0], rows[0]] : mutation === 'incomplete' ? [{ ...rows[0], address: undefined }] : mutation === 'foreign' ? [{ ...rows[0], id: 'b' }] : mutation === 'nonarray' ? { school: rows[0] } : null;
      return new Response(mutation === 'malformed' ? '{' : JSON.stringify(value), { status: 200 });
    });
    const ui = await mount(); noPrivate(ui); check(has(ui, 'No school details available.'), false, 'Malformed evidence is not an empty result'); check(ui.button('Reload saved school details').props.disabled, false, 'Explicit retry enabled'); check(writes().length, 0, 'No mutation from unavailable school evidence');
    intercept(undefined); await ui.click('Reload saved school details'); check(privateSchool(ui), ['a'], 'Fresh coherent scope is recoverable'); drained();
  });
  for (const value of [null, { id: 'admin-a', role: 'owner', schoolId: 'a' }, { id: 'admin-a', role: 'admin' }, { id: '', role: 'admin', schoolId: 'a' }]) await scenario('incomplete current account is rejected', async ({ mount, intercept, trace, drained }) => {
    intercept(async ({ path, response }) => { if (path === '/api/session') { await response.text(); return new Response(JSON.stringify(value), { status: 200 }); } return response; });
    const ui = await mount(); noPrivate(ui); check(trace.length, 1, 'Invalid account cannot authorize a school read'); okay(has(ui, 'could not be verified'), 'Account failure is explicit'); drained();
  });
  await scenario('changed final session suppresses old-school publication', async ({ mount, intercept, setActor, trace, writes, drained }) => {
    intercept(async ({ path, response }) => { if (path === '/api/schools') setActor('admin-b'); return response; });
    const ui = await mount(); noPrivate(ui); okay(has(ui, 'account changed'), 'Changed account is reported'); check(writes().length, 0, 'Read account change cannot write');
    intercept(undefined); await ui.click('Reload saved school details'); check(privateSchool(ui), ['b'], 'Explicit reload displays new school'); check(shell(ui).id, 'admin-b', 'New shell identity'); check(trace.filter(row => row.path === '/api/session').length, 4, 'Each attempted snapshot has current session brackets'); drained();
  });
  await scenario('late obsolete school read cannot restore old header or unsent form', async ({ mount, intercept, setActor, trace, drained }) => {
    const ui = await mount(); await ui.change('school-name', 'Old private draft'); const held = deferred(); let captured = false;
    intercept(async ({ path, response }) => { if (path === '/api/schools' && !captured) { captured = true; await held.promise; } return response; });
    ui.button('Reload saved school details').props.onClick(); await settle(); ui.render(); noPrivate(ui); setActor('admin-b'); await ui.click('Reload saved school details'); check(privateSchool(ui), ['b'], 'New authorized result shown');
    const count = trace.length; held.resolve(); await ui.flush(); check(trace.length, count, 'Obsolete response does not trigger another session read'); check(privateSchool(ui), ['b'], 'Late response cannot restore old school'); check(shell(ui).id, 'admin-b', 'Late response cannot restore old identity'); check(has(ui, 'Old private draft'), false, 'Old private draft never reaches new actor'); check(ui.value('school-name'), 'Synthetic school b', 'New form is from new school'); drained();
  });
  await scenario('unmounted held read is drained without further reads or publication', async ({ mount, intercept, trace, drained }) => {
    const held = deferred(); let first = true; intercept(async ({ path, response }) => { if (path === '/api/session' && first) { first = false; await held.promise; } return response; });
    const ui = await mount(); check(trace.length, 1, 'Only first session started'); ui.dispose(); const cells = ui.cells.map(cell => cell?.value); held.resolve(); await settle(); check(trace.length, 1, 'Unmount blocks subsequent school read'); check(ui.cells.map(cell => cell?.value), cells, 'Unmounted response cannot publish state'); drained();
  });
  await scenario('obsolete captured form cannot write after reload begins', async ({ mount, writes, drained }) => {
    const ui = await mount(); const submit = form(ui); ui.button('Reload saved school details').props.onClick(); await submit({ preventDefault() {} }); await ui.flush(); check(writes().length, 0, 'Old rendered form is invalid immediately'); drained();
  });
  await scenario('name-only update omits unchanged null address with fresh preflight', async ({ mount, writes, saved, trace, drained }) => {
    const ui = await mount(); await ui.change('school-name', 'Reviewed school name'); await ui.submit();
    check(writes().length, 1, 'One explicit update'); check(JSON.parse(writes()[0].body), { name: 'Reviewed school name' }, 'Untouched SQL-null address omitted'); check(saved().address, null, 'Actual SQL-null remains null'); check(saved().name, 'Reviewed school name', 'Actual saved name'); check(ack(ui).length, 1, 'Known acknowledged update separate'); check(pending(ui).length, 0, 'Known result has no uncertain pending'); okay(has(ui, 'left the saved address unchanged'), 'Omission is described honestly');
    check(trace.map(row => row.path), ['/api/session', '/api/schools', '/api/session', '/api/session', '/api/schools', '/api/session', '/api/schools/a', '/api/session', '/api/schools', '/api/session'], 'Fresh exact actor before update and current read after acknowledgement'); drained();
  });
  await scenario('deliberately empty address is explicit empty, not omitted null', async ({ mount, writes, saved, drained }) => {
    const ui = await mount(); await ui.change('school-address', 'Temporary manual address'); await ui.change('school-address', ''); await ui.submit(); check(JSON.parse(writes()[0].body), { name: 'Synthetic school a', address: '' }, 'Deliberate blank remains explicit address'); check(saved().address, '', 'Actual SQL stores empty string'); okay(has(ui, 'Submitted address: (empty)'), 'Acknowledgement preserves explicit empty'); drained();
  });
  await scenario('name-only dirty draft refreshes untouched address changed from SQL-null', async ({ mount, api, writes, saved, drained }) => {
    const ui = await mount(); await ui.change('school-name', 'Retained deliberate name'); const other = await api('/api/schools/a', 'PATCH', { name: 'Another saved name', address: 'New legitimate saved address' }); check(other.status, 200, 'Other authorized update actual handler succeeds'); await other.text();
    await ui.click('Reload saved school details'); check(ui.value('school-name'), 'Retained deliberate name', 'Deliberately edited name retained'); check(ui.value('school-address'), 'New legitimate saved address', 'Untouched blank refreshes to newly saved address'); await ui.submit();
    check(JSON.parse(writes()[0].body), { name: 'Retained deliberate name', address: 'New legitimate saved address' }, 'Explicit save does not convert previous null presentation into empty overwrite'); check(saved().address, 'New legitimate saved address', 'Actual changed address survives'); drained();
  });
  await scenario('fresh preflight refreshes untouched name and address without manual reload', async ({ mount, api, writes, saved, drained }) => {
    const ui = await mount(); const other = await api('/api/schools/a', 'PATCH', { name: 'Newest saved name', address: 'Newest saved address' }); await other.text(); await ui.submit();
    check(JSON.parse(writes()[0].body), { name: 'Newest saved name', address: 'Newest saved address' }, 'Untouched fields derive from fresh current school'); check(saved().address, 'Newest saved address', 'Fresh address survives'); check(saved().name, 'Newest saved name', 'Fresh name survives'); drained();
  });
  await scenario('deliberately edited address remains deliberate across current reload', async ({ mount, api, writes, saved, drained }) => {
    const ui = await mount(); await ui.change('school-address', 'Manually reviewed address'); const other = await api('/api/schools/a', 'PATCH', { name: 'Another saved name', address: 'Another saved address' }); await other.text(); await ui.click('Reload saved school details');
    check(ui.value('school-name'), 'Another saved name', 'Untouched name refreshes'); check(ui.value('school-address'), 'Manually reviewed address', 'Deliberate address retained'); await ui.submit(); check(saved().address, 'Manually reviewed address', 'Later explicit save applies deliberate intent'); check(writes().length, 1, 'No implicit write on refresh'); drained();
  });
  for (const actor of ['admin-b', 'teacher-a', 'guardian-a']) await scenario('changed preflight actor prevents captured school write ' + actor, async ({ mount, setActor, writes, drained }) => {
    const ui = await mount(); await ui.change('school-name', 'Private original name'); setActor(actor); await ui.submit(); check(writes().length, 0, 'No PATCH after account/role/school change'); noPrivate(ui); okay(has(ui, 'No update was sent'), 'No sent update is claimed'); await ui.click('Reload saved school details'); check(shell(ui).id, actor, 'Explicit read shows actual actor'); check(has(ui, 'Private original name'), false, 'Original draft is not displayed to another actor'); drained();
  });
  await scenario('scope changes during preflight school read prevent write', async ({ mount, intercept, setActor, writes, drained }) => {
    const ui = await mount(); intercept(async ({ path, response }) => { if (path === '/api/schools') setActor('admin-b'); return response; }); await ui.submit(); noPrivate(ui); check(writes().length, 0, 'Final verified actor mismatch blocks PATCH'); drained();
  });
  await scenario('synchronous duplicate save lock uses actual one PATCH', async ({ mount, intercept, writes, saved, drained }) => {
    const ui = await mount(); await ui.change('school-name', 'Single update'); const held = deferred(); let captured = false;
    intercept(async ({ path, response }) => { if (path === '/api/session' && !captured) { captured = true; await held.promise; } return response; });
    const submit = form(ui), first = submit({ preventDefault() {} }), second = submit({ preventDefault() {} }); await settle(); ui.render(); noPrivate(ui); check(writes().length, 0, 'Held preflight has not written'); held.resolve(); await Promise.all([first, second]); await ui.flush(); check(writes().length, 1, 'Same-frame duplicate action produces one actual PATCH'); check(saved().name, 'Single update', 'Single requested update saved'); drained();
  });
  await scenario('known save remains acknowledged after failed current read with private fields hidden', async ({ mount, intercept, writes, saved, drained }) => {
    const ui = await mount(); await ui.change('school-name', 'Acknowledged original name'); let committed = false;
    intercept(async ({ path, options, response }) => { if (options.method === 'PATCH') committed = true; if (path === '/api/schools' && committed) { await response.text(); return new Response('{}', { status: 503 }); } return response; });
    await ui.submit(); check(saved().name, 'Acknowledged original name', 'Real handler update committed'); noPrivate(ui); okay(has(ui, 'submitted update was acknowledged'), 'Known 200 fact remains separate from reload failure'); check(ack(ui).length, 0, 'Submitted private values hidden when current view unavailable'); check(pending(ui).length, 0, 'Known 200 is not mislabeled unknown'); check(writes().length, 1, 'Failed refresh never resubmits');
    intercept(undefined); await ui.click('Reload saved school details'); check(ack(ui).length, 1, 'Original authorized actor can see separate acknowledgement'); check(ui.value('school-name'), 'Acknowledged original name', 'Known result restores fresh form'); check(writes().length, 1, 'Recovery read does not repeat PATCH'); drained();
  });
  await scenario('acknowledgement stays separate from later current revision and hidden from other actor', async ({ mount, api, setActor, writes, drained }) => {
    const ui = await mount(); await ui.change('school-name', 'Original acknowledged name'); await ui.submit(); const later = await api('/api/schools/a', 'PATCH', { name: 'Later current name', address: 'Later current address' }); await later.text(); await ui.click('Reload saved school details');
    check(ui.value('school-name'), 'Later current name', 'Current school reflects later revision'); okay(text(ack(ui)[0]).includes('Original acknowledged name'), 'Original acknowledged submission remains separate'); setActor('admin-b'); await ui.click('Reload saved school details'); check(ack(ui).length, 0, 'Private acknowledgement hidden from another administrator'); check(has(ui, 'Original acknowledged name'), false, 'Original school submission is absent'); check(privateSchool(ui), ['b'], 'Only new current school displayed'); check(writes().length, 1, 'Read-only comparison never replays'); drained();
  });
  for (const status of [400, 401, 403, 404, 409]) await scenario('known rejected response hides fields then original actor may explicitly reload ' + status, async ({ mount, intercept, writes, drained }) => {
    const ui = await mount(); await ui.change('school-name', 'Rejected original draft'); intercept(async ({ options, response }) => { if (options.method === 'PATCH') { await response.text(); return new Response('{}', { status }); } return response; });
    // Only the delivered non-success status is asserted; this transport injection
    // follows a real committed handler and does not claim server rollback.
    await ui.submit(); noPrivate(ui); okay(has(ui, 'rejected'), 'Delivered known rejection is explicit'); check(pending(ui).length, 0, 'Known rejection is not an uncertain receipt'); check(ack(ui).length, 0, 'Rejected reply is never acknowledged');
    intercept(undefined); await ui.click('Reload saved school details'); check(ui.value('school-name'), 'Rejected original draft', 'Same-actor deliberate draft can be reviewed after fresh read'); check(writes().length, 1, 'Reload never repeats rejected PATCH'); drained();
  });
  for (const fault of ['lost', '503', 'malformed', 'wrong-id', 'wrong-name', 'wrong-address', '201']) await scenario('unconfirmed committed reply needs original-account read and explicit comparison ' + fault, async ({ mount, intercept, writes, saved, drained }) => {
    const ui = await mount(); await ui.change('school-name', 'Original uncertain name'); await ui.change('school-address', 'Original uncertain address');
    intercept(async ({ options, response }) => {
      if (options.method !== 'PATCH') return response;
      const real = await response.json();
      if (fault === 'lost') throw new TypeError('Named synthetic lost committed response');
      if (fault === '503') return new Response('{}', { status: 503 });
      if (fault === 'malformed') return new Response('{', { status: 200 });
      const changed = fault === 'wrong-id' ? { ...real, id: 'b' } : fault === 'wrong-name' ? { ...real, name: 'Uncorrelated response' } : fault === 'wrong-address' ? { ...real, address: 'Uncorrelated address' } : real;
      return new Response(JSON.stringify(changed), { status: fault === '201' ? 201 : 200 });
    });
    await ui.submit(); check(saved().name, 'Original uncertain name', 'Unmodified actual handler committed before named reply fault'); check(saved().address, 'Original uncertain address', 'Actual committed address'); noPrivate(ui); check(pending(ui).length, 1, 'Exact original update remains pending privately'); check(has(ui, 'Original uncertain name'), false, 'Unknown private payload hidden before current reload'); check(ack(ui).length, 0, 'Unknown response cannot produce acknowledgement');
    okay(has(ui, 'may still be saved after you leave'), 'Started-request limitation disclosed'); okay(has(ui, 'hard reload discards'), 'In-memory recovery limitation disclosed'); check(writes().length, 1, 'Fault does not trigger auto replay'); const original = writes()[0].body;
    intercept(undefined); await ui.click('Reload saved school details'); check(shell(ui).id, 'admin-a', 'Original account freshly verified'); okay(has(ui, 'Original submitted school name: Original uncertain name'), 'Exact original submitted name shown separately'); okay(has(ui, 'Original submitted address: Original uncertain address'), 'Exact original address shown separately'); check(ui.one(item => item.type === 'fieldset').props.disabled, true, 'Pending comparison blocks edit/save'); check(writes().length, 1, 'Read does not automatically resubmit');
    const obsoleteSave = form(ui); await obsoleteSave({ preventDefault() {} }); await ui.flush(); check(writes().length, 1, 'Captured save remains blocked by private pending lock');
    await ui.click('I compared the saved details'); check(pending(ui).length, 0, 'Fresh stable original-account comparison clears pending'); check(ack(ui).length, 0, 'Manual comparison never fabricates save acknowledgement'); okay(has(ui, 'does not confirm whether the earlier request was saved'), 'Unknown outcome remains honestly unresolved'); check(ui.one(item => item.type === 'fieldset').props.disabled, false, 'Fresh form enabled only after comparison'); check(writes().length, 1, 'Comparison is read-only');
    await ui.change('school-name', 'New explicit reviewed name'); await ui.submit(); check(writes().length, 2, 'Further update requires a new explicit action'); check(writes()[0].body, original, 'Original request bytes are immutable history'); check(JSON.parse(writes()[1].body).name, 'New explicit reviewed name', 'New save is not replay of original request'); drained();
  });
  await scenario('unknown body stays private through other account then returns intact to original actor', async ({ mount, intercept, setActor, writes, drained }) => {
    const ui = await mount(); await ui.change('school-name', 'Only original actor may see'); const oldSubmit = form(ui); intercept(async ({ options, response }) => { if (options.method === 'PATCH') { await response.text(); throw new TypeError('Named lost committed response'); } return response; }); await ui.submit();
    intercept(undefined); setActor('admin-b'); await ui.click('Reload saved school details'); check(shell(ui).id, 'admin-b', 'Actual other account displayed'); check(has(ui, 'Only original actor may see'), false, 'Original uncertain body never rendered to other account'); check(ui.all(item => item.type === 'button' && text(item) === 'I compared the saved details').length, 0, 'Other actor cannot compare original request'); check(ui.one(item => item.type === 'fieldset').props.disabled, true, 'Other actor cannot start a new write while original pending exists'); await oldSubmit({ preventDefault() {} }); await form(ui)({ preventDefault() {} }); await ui.flush(); check(writes().length, 1, 'Neither old nor current other-account save can bypass pending');
    setActor('admin-a'); await ui.click('Reload saved school details'); okay(has(ui, 'Original submitted school name: Only original actor may see'), 'Original pending body survives other-actor read privately'); await ui.click('I compared the saved details'); check(pending(ui).length, 0, 'Original account can complete fresh comparison'); check(writes().length, 1, 'No resubmission during account return'); drained();
  });
  await scenario('changed saved values during comparison retain exact pending and require reviewing current result', async ({ mount, intercept, api, writes, drained }) => {
    const ui = await mount(); await ui.change('school-name', 'Original pending name'); intercept(async ({ options, response }) => { if (options.method === 'PATCH') { await response.text(); throw new TypeError('Named lost committed response'); } return response; }); await ui.submit(); intercept(undefined); await ui.click('Reload saved school details');
    const later = await api('/api/schools/a', 'PATCH', { name: 'Newer comparison name', address: 'Newer comparison address' }); await later.text(); await ui.click('I compared the saved details'); check(pending(ui).length, 1, 'Changed saved snapshot cannot silently finish comparison'); okay(has(ui, 'changed during comparison'), 'Changed current values demand renewed review'); okay(has(ui, 'Original submitted school name: Original pending name'), 'Original request stays separately visible'); okay(has(ui, 'Newer comparison address'), 'Fresh saved value is displayed for renewed comparison'); check(writes().length, 1, 'Comparison changes no school records');
    await ui.click('I compared the saved details'); check(pending(ui).length, 0, 'Explicit second comparison verifies stable saved snapshot'); check(ui.value('school-name'), 'Newer comparison name', 'Reset form uses saved current name, not original pending'); check(ui.value('school-address'), 'Newer comparison address', 'Reset form uses saved current address'); check(writes().length, 1, 'Neither comparison replays update'); drained();
  });
  await scenario('failed comparison read hides private values and preserves pending for next explicit original read', async ({ mount, intercept, writes, drained }) => {
    const ui = await mount(); await ui.change('school-name', 'Privately pending after failure'); intercept(async ({ options, response }) => { if (options.method === 'PATCH') { await response.text(); throw new TypeError('Named lost committed response'); } return response; }); await ui.submit(); intercept(undefined); await ui.click('Reload saved school details');
    intercept(async ({ path, response }) => { if (path === '/api/schools') { await response.text(); return new Response('{}', { status: 503 }); } return response; }); await ui.click('I compared the saved details'); noPrivate(ui); check(has(ui, 'Privately pending after failure'), false, 'Failed current read hides original private request'); check(pending(ui).length, 1, 'Read failure cannot discard original request'); check(writes().length, 1, 'Failed comparison makes no repeated update');
    intercept(undefined); await ui.click('Reload saved school details'); okay(has(ui, 'Original submitted school name: Privately pending after failure'), 'Original pending survives failed comparison'); await ui.click('I compared the saved details'); check(pending(ui).length, 0, 'Later stable comparison completes'); drained();
  });
  await scenario('actor changes before explicit comparison cannot discard pending', async ({ mount, intercept, setActor, writes, drained }) => {
    const ui = await mount(); await ui.change('school-name', 'Uncertain original actor'); intercept(async ({ options, response }) => { if (options.method === 'PATCH') { await response.text(); throw new TypeError('Named lost committed response'); } return response; }); await ui.submit(); intercept(undefined); await ui.click('Reload saved school details');
    setActor('admin-b'); await ui.click('I compared the saved details'); noPrivate(ui); check(pending(ui).length, 1, 'Changed current administrator cannot clear original pending'); check(has(ui, 'Uncertain original actor'), false, 'Original submitted values hidden after changed-account verification'); setActor('admin-a'); await ui.click('Reload saved school details'); await ui.click('I compared the saved details'); check(pending(ui).length, 0, 'Original account recovers retained pending'); check(writes().length, 1, 'Account mismatch does not submit'); drained();
  });
  await scenario('synchronous duplicate comparison performs one verification sequence', async ({ mount, intercept, trace, writes, drained }) => {
    const ui = await mount(); intercept(async ({ options, response }) => { if (options.method === 'PATCH') { await response.text(); throw new TypeError('Named lost committed response'); } return response; }); await ui.submit(); intercept(undefined); await ui.click('Reload saved school details');
    const held = deferred(); let first = true; intercept(async ({ path, response }) => { if (path === '/api/session' && first) { first = false; await held.promise; } return response; });
    const compare = ui.button('I compared the saved details').props.onClick, before = trace.length; compare(); compare(); await settle(); check(trace.length, before + 1, 'Only one first verification starts in same frame'); held.resolve(); await ui.flush(); check(trace.length, before + 3, 'Exactly one complete comparison snapshot'); check(pending(ui).length, 0, 'Single stable comparison clears pending'); check(writes().length, 1, 'Comparison duplicate cannot issue PATCH'); drained();
  });
  await scenario('unmount during preflight prevents started write', async ({ mount, intercept, writes, drained }) => {
    const ui = await mount(); const held = deferred(); let first = true; intercept(async ({ path, response }) => { if (path === '/api/session' && first) { first = false; await held.promise; } return response; });
    const submit = form(ui)({ preventDefault() {} }); await settle(); ui.dispose(); const cells = ui.cells.map(cell => cell?.value); held.resolve(); await submit; await settle(); check(writes().length, 0, 'Unmounted preflight cannot send PATCH'); check(ui.cells.map(cell => cell?.value), cells, 'Unmounted preflight cannot publish state'); drained();
  });
  await scenario('started real PATCH may commit after unmount without restoring abandoned state', async ({ mount, intercept, writes, saved, trace, drained }) => {
    const ui = await mount(); await ui.change('school-name', 'Started before leaving'); const held = deferred(); intercept(async ({ options, response }) => { if (options.method === 'PATCH') await held.promise; return response; });
    const submit = form(ui)({ preventDefault() {} }); await settle(); check(saved().name, 'Started before leaving', 'Actual started handler committed before held reply'); check(writes().length, 1, 'One started update'); ui.dispose(); const cells = ui.cells.map(cell => cell?.value), count = trace.length; held.resolve(); await submit; await settle(); check(trace.length, count, 'Unmounted committed reply starts no current reload'); check(ui.cells.map(cell => cell?.value), cells, 'Unmounted reply cannot restore identity or private form'); drained();
  });
  await scenario('queued captured input after unmount cannot alter abandoned private form', async ({ mount, writes, drained }) => {
    const ui = await mount(); const change = ui.one(item => item.type === 'input' && item.props.id === 'school-name').props.onChange;
    ui.dispose(); const cells = ui.cells.map(cell => cell?.value); change({ target: { value: 'Obsolete unmounted entry' } });
    check(ui.cells.map(cell => cell?.value), cells, 'Unmounted captured input cannot publish state'); check(writes().length, 0, 'Unmounted input never writes'); drained();
  });
  await scenario('actual validation rejection does not persist and retains deliberate original entries after read', async ({ mount, writes, saved, drained }) => {
    const ui = await mount(); await ui.change('school-name', ''); await ui.submit();
    check(writes()[0].status, 400, 'Actual handler rejects invalid empty name'); check(saved().name, 'Synthetic school a', 'Actual validation rejection leaves saved name unchanged'); check(saved().address, null, 'Actual validation rejection leaves nullable address unchanged'); noPrivate(ui); check(pending(ui).length, 0, 'Known validation rejection is not pending'); check(ack(ui).length, 0, 'Validation rejection is not acknowledged');
    await ui.click('Reload saved school details'); check(ui.value('school-name'), '', 'Deliberate invalid draft is retained for manual correction'); await ui.change('school-name', 'Corrected manual name'); await ui.submit(); check(writes().length, 2, 'Correction requires a separate explicit action'); check(writes()[1].status, 200, 'Actual corrected name passes handler'); check(saved().name, 'Corrected manual name', 'Actual correction persists'); drained();
  });
  await scenario('actual role change immediately after preflight is denied at PATCH and private fields stay hidden', async ({ mount, intercept, setActor, writes, saved, drained }) => {
    const ui = await mount(); await ui.change('school-name', 'Original administrator entry'); let reads = 0;
    intercept(async ({ path, response }) => { if (path === '/api/session' && ++reads === 2) setActor('teacher-a'); return response; });
    await ui.submit(); check(writes().length, 1, 'One update starts after fresh captured preflight'); check(writes()[0].status, 403, 'Actual current teacher session is denied by handler'); check(saved().name, 'Synthetic school a', 'Actual denied update does not persist'); noPrivate(ui); check(pending(ui).length, 0, 'Known current-role rejection has no uncertain replay'); intercept(undefined);
    await ui.click('Reload saved school details'); check(shell(ui).id, 'teacher-a', 'Explicit read verifies actual changed role'); check(ui.all(item => item.type === 'form').length, 0, 'Changed role cannot restore administrator form'); check(has(ui, 'Original administrator entry'), false, 'Original deliberate entry remains hidden'); drained();
  });
  await scenario('original omitted-null uncertain request is only compared; later address survives fresh new save', async ({ mount, intercept, api, writes, saved, drained }) => {
    const ui = await mount(); await ui.change('school-name', 'Uncertain name-only update'); intercept(async ({ options, response }) => { if (options.method === 'PATCH') { await response.text(); throw new TypeError('Named lost committed reply'); } return response; }); await ui.submit(); check(JSON.parse(writes()[0].body), { name: 'Uncertain name-only update' }, 'Original body omitted untouched SQL-null address');
    intercept(undefined); const later = await api('/api/schools/a', 'PATCH', { name: 'Later current name', address: 'Later legitimate non-null address' }); await later.text(); await ui.click('Reload saved school details'); okay(has(ui, 'left the saved address unchanged'), 'Original omission stays disclosed separately'); okay(has(ui, 'Later legitimate non-null address'), 'Current changed address is shown for manual comparison'); await ui.click('I compared the saved details'); check(ui.value('school-address'), 'Later legitimate non-null address', 'Comparison resets untouched address from current saved snapshot');
    await ui.change('school-name', 'Next explicit name'); await ui.submit(); check(writes().length, 2, 'Only original and new explicit PATCH exist'); check(JSON.parse(writes()[1].body), { name: 'Next explicit name', address: 'Later legitimate non-null address' }, 'Fresh next action preserves later address rather than replaying omission/blank'); check(saved().address, 'Later legitimate non-null address', 'Actual later saved address survives'); drained();
  });
  for (const path of ['/api/session', '/api/schools']) await scenario('unexpected successful status cannot authorize protected current read ' + path, async ({ mount, intercept, trace, drained }) => {
    intercept(async ({ path: actual, response }) => actual === path ? new Response(await response.text(), { status: 201 }) : response);
    const ui = await mount(); noPrivate(ui); okay(has(ui, 'could not be verified'), 'Unexpected success status is unavailable, not current evidence'); check(trace.length, path === '/api/session' ? 1 : 2, 'No follow-up reads after unverified response'); intercept(undefined); await ui.click('Reload saved school details'); check(privateSchool(ui), ['a'], 'Ordinary 200 reply recovers'); drained();
  });
  for (const [field, value] of [
    ['updatedAt', '2026-02-30T10:30:00.000Z'],
    ['updatedAt', '2026-10-06T10:30:00.000+00:00'],
    ['updatedAt', '2026-10-06'],
    ['updatedAt', '2026-10-06T10:30:00Z'],
    ['createdAt', '2000-01-01T00:00:00.000Z'],
  ]) await scenario('unmatched timestamp projection cannot acknowledge committed update ' + field + value, async ({ mount, intercept, writes, saved, drained }) => {
    const ui = await mount(); await ui.change('school-name', 'Timestamp-correlated original submission'); const originalCreatedAt = saved().created_at; let realSaved;
    // This named response projection is applied only after an unmodified actual
    // handler has committed. It is not server rollback or no-effect evidence.
    intercept(async ({ options, response }) => { if (options.method !== 'PATCH') return response; realSaved = await response.json(); return new Response(JSON.stringify({ ...realSaved, [field]: value }), { status: 200 }); });
    await ui.submit(); check(writes().length, 1, 'One actual handler update occurred'); check(writes()[0].status, 200, 'Unmodified handler returned real 200'); check(saved().name, 'Timestamp-correlated original submission', 'Actual update committed before malformed projection'); check(saved().created_at, originalCreatedAt, 'Actual stored creation evidence is unchanged'); check(realSaved.createdAt, originalCreatedAt, 'Real acknowledgement used exact stored original creation value'); check(new Date(realSaved.updatedAt).toISOString(), realSaved.updatedAt, 'Real committed updated timestamp is canonical UTC milliseconds');
    noPrivate(ui); check(pending(ui).length, 1, 'Unmatched acknowledgement remains privately pending'); check(ack(ui).length, 0, 'Impossible/noncanonical/mismatched timestamp is not acknowledged'); check(has(ui, 'Timestamp-correlated original submission'), false, 'Unknown original name is hidden'); check(has(ui, 'School details saved.'), false, 'Unmatched 200 cannot claim known save');
    intercept(undefined); await ui.click('Reload saved school details'); okay(has(ui, 'Original submitted school name: Timestamp-correlated original submission'), 'Fresh original actor may separately compare exact original values'); check(writes().length, 1, 'Fresh read never repeats original PATCH'); await ui.click('I compared the saved details'); check(pending(ui).length, 0, 'Explicit stable comparison clears pending without acknowledgement'); check(ack(ui).length, 0, 'Read comparison does not repair the earlier acknowledgement'); check(writes().length, 1, 'Comparison remains read-only'); drained();
  });
  await scenario('legacy GET timestamps stay raw and exact legacy creation value can correlate new canonical update', async ({ sqlite, mount, writes, saved, drained }) => {
    const rawCreatedAt = '2025-01-31', rawUpdatedAt = 'Legacy saved date requires review';
    sqlite.prepare('UPDATE schools SET created_at=?,updated_at=? WHERE id=?').run(rawCreatedAt, rawUpdatedAt, 'a');
    const ui = await mount(); check(privateSchool(ui), ['a'], 'Complete legacy current record is not repaired or refused by GET'); check(saved().created_at, rawCreatedAt, 'Legacy stored creation text remains exact'); check(saved().updated_at, rawUpdatedAt, 'Read does not normalize legacy update text'); await ui.change('school-name', 'Legacy creation remains exact'); await ui.submit();
    check(writes()[0].status, 200, 'Actual service supplies new canonical update'); check(saved().created_at, rawCreatedAt, 'PATCH leaves legacy stored creation value unchanged'); check(new Date(saved().updated_at).toISOString(), saved().updated_at, 'New actual update is canonical UTC milliseconds'); check(ack(ui).length, 1, 'Exact raw legacy creation match and new canonical updated timestamp acknowledge'); check(pending(ui).length, 0, 'Valid new update is not uncertain merely because legacy creation text is raw'); drained();
  });
  await scenario('omitted nullable address allows a legitimate concurrent saved address in real acknowledgement', async ({ mount, intercept, api, writes, saved, drained }) => {
    const ui = await mount(); await ui.change('school-name', 'Name-only acknowledged update'); let reads = 0;
    intercept(async ({ path, response }) => { if (path === '/api/session' && ++reads === 2) { const concurrent = await api('/api/schools/a', 'PATCH', { name: 'Concurrent saved name', address: 'Concurrent legitimate address' }); check(concurrent.status, 200, 'Actual authorized concurrent change succeeds after read preflight'); await concurrent.text(); } return response; });
    await ui.submit(); check(JSON.parse(writes()[0].body), { name: 'Name-only acknowledged update' }, 'Original unchanged-null address remains omitted'); check(saved().name, 'Name-only acknowledged update', 'Actual explicit name applies'); check(saved().address, 'Concurrent legitimate address', 'Actual PATCH omission preserves concurrent saved address'); check(ack(ui).length, 1, 'Matching real acknowledgement permits changed omitted-address value'); check(pending(ui).length, 0, 'Legitimate omitted-field concurrency is not fabricated conflict'); okay(has(ui, 'left the saved address unchanged'), 'Acknowledgement describes omission rather than original null value'); drained();
  });
  console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0, scenarios, requests, externalRequests, scope: 'actual opaque sessions/routes/production D1 SQLite; candidate callbacks with substituted hooks/elements/AppShell; not mounted-browser or full-shell/accessibility evidence' }));
} finally { globalThis.fetch = oldFetch; globalThis.window = oldWindow; delete globalThis.__sahaSchoolReact; delete globalThis.__sahaSchoolTimestamp; }
