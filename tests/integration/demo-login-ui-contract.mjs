// Actual synthetic local routes/sessions and production D1 over SQLite.
// Production client callbacks use substituted React hooks and element factories.
// This is not mounted React, browser, keyboard, geometry or accessibility evidence.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { drizzle } from 'drizzle-orm/d1';
import { bindings, freshDatabase, load, root } from '../support/security-db.mjs';
import { serverWork, settleQuiet } from '../support/quiescence.mjs';

const origin = 'https://education.example.invalid';
const installation = '908df258-dff2-43d4-a540-503b2c7e7d13';
const routes = { demo: await load('app/api/demo/route.ts'), session: await load('app/api/session/route.ts'), login: await load('app/api/auth/login/route.ts') };
const demoService = await load('lib/education/demo.ts');
const identity = await load('lib/education/identity.ts');
const sessionService = await load('lib/education/session.ts');
let passed = 0, scenarios = 0, actualRequests = 0, externalRequests = 0, currentUI;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); passed++; };
const okay = (actual, message) => { assert.ok(actual, message); passed++; };
const originalFetch = globalThis.fetch, originalWindow = globalThis.window;
const redirects = [];
globalThis.window = { location: { origin, assign(url) { redirects.push(url); } } };
const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value, ...nodes(value.props?.children)] : [];
const text = value => Array.isArray(value) ? value.map(text).join('') : value && typeof value === 'object' ? text(value.props?.children) : value == null || typeof value === 'boolean' ? '' : String(value);
const slot = (tag, asChild = false) => props => asChild && props.asChild ? { ...props.children, props: { ...props.children.props, ...props, children: props.children.props.children } } : { type: tag, props };
globalThis.__sahaDemoClientReact = {
  createElement(type, props, ...children) { const value = { ...props, children: children.length === 1 ? children[0] : children }; return typeof type === 'function' ? type(value) : { type, props: value }; },
  useState(initial) { const ui = currentUI, index = ui.index++; if (!ui.cells[index]) ui.cells[index] = { value: typeof initial === 'function' ? initial() : initial }; return [ui.cells[index].value, value => { ui.cells[index].value = typeof value === 'function' ? value(ui.cells[index].value) : value; }]; },
  useRef(initial) { const ui = currentUI, index = ui.index++; if (!ui.cells[index]) ui.cells[index] = { current: initial }; return ui.cells[index]; },
  useEffect(callback, deps) { const ui = currentUI, index = ui.index++, old = ui.cells[index]; if (!old || deps.some((value, offset) => value !== old.deps[offset])) { old?.cleanup?.(); ui.cells[index] = { deps }; ui.effects.push(() => { ui.cells[index].cleanup = callback(); }); } },
};
globalThis.__sahaDemoClientSlots = { Button: slot('button', true), NavigationMenuLink: slot('a', true) };
async function client(path) {
  const compiled = ts.transpileModule(readFileSync(root + path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } }).outputText;
  const prefix = 'const React=globalThis.__sahaDemoClientReact;const {useEffect,useRef,useState}=React;const {Button,NavigationMenuLink}=globalThis.__sahaDemoClientSlots;const Card="section",CardContent="div",CardDescription="p",CardHeader="header",CardTitle="div",Avatar="span",AvatarFallback="span",NavigationMenu="nav",NavigationMenuItem="li",NavigationMenuList="ul",cn=(...values)=>values.join(" ");\n';
  return import('data:text/javascript;base64,' + Buffer.from(prefix + compiled.replace(/^import[^;]*;\s*/gm, '')).toString('base64'));
}
const Login = (await client('app/login/page.tsx')).default;
const Shell = (await client('components/app-shell.tsx')).AppShell;
const settle = () => settleQuiet();
function mount(Component, props = {}) {
  const ui = { cells: [], effects: [], index: 0, tree: null,
    render() { currentUI = ui; ui.index = 0; ui.effects = []; ui.tree = Component(props); for (const effect of ui.effects) effect(); },
    all(predicate) { return nodes(ui.tree).filter(predicate); },
    one(predicate) { const items = ui.all(predicate); assert.equal(items.length, 1, 'One requested native source control'); return items[0]; },
    button(label) { return ui.one(item => item.type === 'button' && text(item) === label); },
    async flush() { await settle(); ui.render(); await settle(); ui.render(); },
    async acknowledge() { ui.one(item => item.type === 'input' && item.props.id === 'demo-acknowledgement').props.onChange({ target: { checked: true } }); await ui.flush(); },
    async click(label) { const item = ui.button(label); okay(!item.props.disabled, 'Requested ordinary action is enabled'); await item.props.onClick(); await ui.flush(); },
    dispose() { for (const cell of ui.cells) cell?.cleanup?.(); },
  }; ui.render(); return ui;
}
function configure(enabled) {
  for (const key of ['SAHA_DEMO_ENABLED', 'SAHA_DEMO_INSTALLATION_ID', 'SAHA_OIDC_ISSUER', 'SAHA_OIDC_CLIENT_ID', 'SAHA_OIDC_CLIENT_SECRET', 'SAHA_OIDC_REDIRECT_URL', 'SAHA_OIDC_TOKEN_AUTH_METHOD']) delete bindings[key];
  bindings.SAHA_ALLOWED_ORIGINS = origin;
  if (enabled) { bindings.SAHA_DEMO_ENABLED = 'true'; bindings.SAHA_DEMO_INSTALLATION_ID = installation; }
}
async function scenario(name, enabled, action) {
  configure(enabled); redirects.length = 0;
  const fixture = freshDatabase(); const { sqlite, schema } = fixture; let cookie, intercept, wrongOrigin = false;
  function prepare(query, values = []) { return { bind(...params) { return prepare(query, params); }, async raw() { const statement = sqlite.prepare(query); statement.setReturnArrays(true); return statement.all(...values); }, async all() { return { success: true, results: sqlite.prepare(query).all(...values), meta: {} }; }, async run() { const statement = sqlite.prepare(query); if (statement.columns().length) return { success: true, results: statement.all(...values), meta: {} }; const result = statement.run(...values); return { success: true, results: [], meta: { changes: Number(result.changes) } }; } }; }
  globalThis.__sahaTestDb = drizzle({ prepare, async batch(statements) { sqlite.exec('BEGIN'); try { const rows = []; for (const statement of statements) rows.push(await statement.run()); sqlite.exec('COMMIT'); return rows; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } }, { schema });
  const trace = [], responses = [], uis = [];
  async function api(path, method = 'GET', payload) {
    const url = new URL(path, origin); if (url.origin !== origin) { externalRequests++; throw new Error('Ordinary demo checks stay offline.'); }
    actualRequests++;
    const request = new Request(url, { method, headers: { origin: wrongOrigin ? 'https://other.example.invalid' : origin, ...(cookie ? { cookie } : {}), ...(payload === undefined ? {} : { 'content-type': 'application/json' }) }, ...(payload === undefined ? {} : { body: payload }) });
    const route = path === '/api/demo' ? routes.demo : path === '/api/session' ? routes.session : path === '/api/auth/login' ? routes.login : null;
    assert.ok(route, 'Only explicit actual local routes are used');
    const response = await serverWork(() => route[method](request));
    const issued = response.headers.get('set-cookie'); if (issued) cookie = issued.split(';')[0];
    return response;
  }
  globalThis.fetch = async (path, options = {}) => {
    const response = await api(String(path), options.method ?? 'GET', options.body);
    trace.push({ path: String(path), method: options.method ?? 'GET', status: response.status, body: options.body });
    const delivered = intercept ? await intercept({ path: String(path), options, response }) : response;
    if (delivered) responses.push(delivered); return delivered;
  };
  async function open(Component = Login, props) { const ui = mount(Component, props); uis.push(ui); await ui.flush(); return ui; }
  const writes = () => trace.filter(item => item.method === 'POST' || item.method === 'DELETE');
  const drained = () => check(responses.every(response => response.bodyUsed), true, name + ': every delivered successful/error body is consumed');
  try { await action({ ...fixture, api, open, writes, trace, drained, setIntercept(value) { intercept = value; }, setWrongOrigin(value) { wrongOrigin = value; }, cookie: () => cookie }); scenarios++; }
  finally { for (const ui of uis) ui.dispose(); await settle(); sqlite.close(); }
}

try {
  await scenario('Default school sign-in does not expose fictional role controls', false, async ({ open, writes, drained }) => {
    const ui = await open(); check(ui.one(item => item.type === 'h1').props.id, 'login-title', 'Login has an actual source heading associated with its main landmark');
    check(ui.all(item => item.type === 'button' && text(item).startsWith('Explore as')).length, 0, 'Default-off screen offers school sign-in only');
    const callback = ui.button('Continue with school sign-in').props.onClick;
    await Promise.all([callback(), callback()]); await ui.flush(); check(writes().length, 1, 'Synchronous school sign-in lock emits one actual request');
    check(writes()[0].status, 503, 'Missing provider configuration fails closed at the actual school-login route'); check(redirects, [], 'Failed sign-in stays on the useful error screen');
    okay(/School sign-in is not available/.test(text(ui.tree)), 'Failure has a readable friendly message'); check(ui.button('Continue with school sign-in').props.disabled, false, 'Failed request unlocks the ordinary control'); drained();
  });
  await scenario('Failed demo availability body is drained while school entry remains usable', false, async ({ open, setIntercept, drained }) => {
    setIntercept(async ({ response }) => { await response.text(); return new Response('{"error":"Synthetic unavailable inventory"}', { status: 503 }); });
    const ui = await open(); check(text(ui.one(item => item.type === 'h1')), 'Sign in to Saha Education', 'Unavailable discovery leaves the ordinary school sign-in heading');
    check(ui.button('Continue with school sign-in').props.disabled, false, 'Discovery failure does not leave sign-in busy'); drained();
  });
  await scenario('Explicit fictional acknowledgement gates all role actions', true, async ({ open, writes, drained }) => {
    const ui = await open(); check(ui.all(item => item.type === 'button' && text(item).startsWith('Explore as')).length, 4, 'Only four fixed role controls are offered');
    const callback = ui.button('Explore as administrator').props.onClick; await callback(); await ui.flush(); check(writes().length, 0, 'Unchecked acknowledgement cannot send a demo request even through a captured callback');
    okay(ui.all(item => item.type === 'button').every(item => item.props.disabled), 'All demo buttons communicate the unchecked state');
    await ui.acknowledge(); okay(ui.all(item => item.type === 'button').every(item => !item.props.disabled), 'Explicit acknowledgement enables the fixed role choices'); drained();
  });
  for (const [role, label] of [['admin', 'administrator'], ['teacher', 'teacher'], ['guardian', 'guardian'], ['student', 'learner']]) await scenario(role + ' same-frame role selection sends one strict request', true, async ({ open, writes, sqlite, cookie, drained }) => {
    const ui = await open(); await ui.acknowledge(); const callback = ui.button('Explore as ' + label).props.onClick;
    await Promise.all([callback(), callback()]); await ui.flush(); check(writes().length, 1, 'A same-frame repeated click has one actual server entry');
    check(JSON.parse(writes()[0].body), { role, syntheticAcknowledged: true }, 'Chooser never adds public identity, school or account fields'); check(writes()[0].status, 200, 'Actual isolated server demo entry succeeds');
    const principal = await sessionService.principalForToken(cookie().slice(cookie().indexOf('=') + 1)); check(principal.role, role, 'Issued opaque session resolves the selected fixed role');
    check(sqlite.prepare('SELECT count(*) n FROM auth_sessions').get().n, 1, 'Repeated click creates one session'); check(redirects, [origin + '/'], 'Validated reply starts one full-page application navigation');
    okay(ui.all(item => item.type === 'button').every(item => item.props.disabled), 'Buttons stay busy while successful full-page navigation starts'); drained();
  });
  for (const status of [404, 429, 503]) await scenario('Actual demo error ' + status + ' drains body and allows deliberate retry', true, async ({ open, writes, sqlite, drained }) => {
    const ui = await open(); await ui.acknowledge();
    if (status === 404) bindings.SAHA_DEMO_ENABLED = 'false';
    if (status === 429) { await demoService.initializeSyntheticDemo(); const now = Date.now(), window = 600000; const bucket = `demo-login:${Math.floor(now / window)}:${await identity.digest('unknown')}`; sqlite.prepare('INSERT INTO auth_rate_limits(bucket,count,expires_at) VALUES(?,?,?)').run(bucket, 40, now + window); }
    if (status === 503) sqlite.exec("CREATE TRIGGER ordinary_demo_seed_failure BEFORE INSERT ON students BEGIN SELECT RAISE(ABORT,'synthetic ordinary unavailable'); END;");
    await ui.click('Explore as teacher'); check(writes()[0].status, status, 'Actual route produces the intended failure status'); check(redirects, [], 'Unsuccessful entry never announces navigation');
    check(sqlite.prepare('SELECT count(*) n FROM auth_sessions').get().n, 0, 'Rejected entry issues no session'); okay(ui.one(item => item.props?.role === 'alert'), 'Failure is announced in a visible source alert');
    check(ui.button('Explore as teacher').props.disabled, false, 'An unsuccessful entry releases the ordinary action lock');
    bindings.SAHA_DEMO_ENABLED = 'true'; if (status === 429) sqlite.exec('DELETE FROM auth_rate_limits'); if (status === 503) sqlite.exec('DROP TRIGGER ordinary_demo_seed_failure');
    await ui.click('Explore as teacher'); check(writes().length, 2, 'Only an explicit later click sends another entry request'); check(writes()[1].status, 200, 'Restored available entry works'); check(redirects, [origin + '/'], 'Successful recovery navigates once'); drained();
  });
  for (const malformed of ['json', 'destination', 'synthetic']) await scenario('Malformed successful demo delivery ' + malformed + ' does not navigate', true, async ({ open, setIntercept, writes, drained }) => {
    const ui = await open(); await ui.acknowledge(); let changed = false;
    setIntercept(async ({ path, options, response }) => { if (!changed && path === '/api/demo' && options.method === 'POST') { changed = true; check(response.status, 200, 'Delivery mutation follows an actual committed synthetic entry'); const value = await response.json(); if (malformed === 'destination') value.destination = 'https://outside.example.invalid'; if (malformed === 'synthetic') value.synthetic = false; return new Response(malformed === 'json' ? '{invalid' : JSON.stringify(value), { headers: { 'content-type': 'application/json' } }); } return response; });
    await ui.click('Explore as learner'); check(writes().length, 1, 'Malformed receipt triggers no automatic entry retry'); check(redirects, [], 'Untrusted successful delivery cannot navigate to another destination');
    okay(ui.one(item => item.props?.role === 'alert'), 'Malformed reply is described as unsuccessful entry'); check(ui.button('Explore as learner').props.disabled, false, 'Malformed delivery leaves a deliberate normal retry available'); drained();
  });
  await scenario('Shared shell provides native login and a main-content shortcut', false, async ({ open, drained }) => {
    const ui = await open(Shell, { principal: null, children: 'Synthetic main content' });
    check(ui.one(item => item.type === 'a' && text(item) === 'Login').props.href, '/login', 'Anonymous Login uses the existing asChild native anchor contract');
    const shortcut = ui.one(item => item.type === 'a' && text(item) === 'Skip to main content'); check(shortcut.props.href, '#' + ui.one(item => item.type === 'main').props.id, 'Native shortcut targets the actual main landmark');
    check(ui.one(item => item.type === 'main').props.tabIndex, -1, 'Main destination can receive native fragment focus');
    check(ui.all(item => item.type === 'nav').length, 0, 'Signed-out shell has no role navigation'); drained();
  });
  await scenario('Explicitly withheld shell principal stays hidden despite a live server session', true, async ({ api, open, trace, drained }) => {
    const entry = await api('/api/demo', 'POST', JSON.stringify({ role: 'teacher', syntheticAcknowledged: true })); check(entry.status, 200, 'Actual synthetic teacher session exists before the parent withholds its header'); await entry.text();
    const ui = await open(Shell, { principal: null, children: 'Synthetic protected placeholder' });
    check(ui.all(item => item.type === 'nav').length, 0, 'Explicit null immediately suppresses role navigation despite a still-live session');
    check(text(ui.tree).includes('saha-demo-teacher'), false, 'Explicit null never discovers or restores the teacher identity independently');
    check(ui.one(item => item.type === 'a' && text(item) === 'Login').props.href, '/login', 'Withheld identity retains the native sign-in action');
    check(trace.filter(item => item.path === '/api/session' && item.method === 'GET').length, 0, 'Shared shell performs no independent identity lookup');
    check(text(ui.one(item => item.type === 'main')), 'Synthetic protected placeholder', 'Parent remains responsible for its separately scoped page content');
    drained();
  });
  for (const role of ['admin', 'teacher', 'guardian', 'student']) await scenario(role + ' shell keeps scoped native navigation and single sign-out action', true, async ({ api, open, writes, sqlite, drained }) => {
    const entry = await api('/api/demo', 'POST', JSON.stringify({ role, syntheticAcknowledged: true })); check(entry.status, 200, 'Synthetic role setup is actual server entry'); await entry.text();
    const ui = await open(Shell, { principal: { id: 'saha-demo-' + role, role, schoolId: 'saha-demo-school' }, children: 'Synthetic main content' });
    check(ui.one(item => item.type === 'nav').props['aria-label'], 'School navigation', 'Role links belong to a named native navigation landmark');
    const hrefs = ui.all(item => item.type === 'a').map(item => item.props.href); okay(hrefs.includes('/'), 'Every role retains the native dashboard link'); okay(hrefs.includes('/notifications'), 'Every role retains its existing notices link');
    check(hrefs.includes('/admin/users'), role === 'admin', 'Account administration link retains its existing administrator-only visibility');
    const plannerLinks = ui.all(item => item.type === 'a' && item.props.href === '/reading-practice');
    check(plannerLinks.length, ['admin', 'teacher'].includes(role) ? 1 : 0, 'Reading practice planner has exactly one native staff-only navigation entry');
    if (plannerLinks.length) check(text(plannerLinks[0]), 'Reading practice planner', 'Staff planner link uses its exact page name');
    check(hrefs.includes('/learning'), ['admin', 'teacher', 'student'].includes(role), 'New staff planner does not expand guardian assigned-learning navigation');
    const callback = ui.button('Sign out').props.onClick; await Promise.all([callback(), callback()]); await ui.flush();
    check(writes().filter(item => item.method === 'DELETE').length, 1, 'Same-frame sign-out dispatches one actual DELETE'); check(sqlite.prepare('SELECT count(*) n FROM auth_sessions').get().n, 0, 'Actual sign-out revokes the opaque session');
    check(redirects, [origin + '/login'], 'Only acknowledged sign-out navigates to login'); drained();
  });
  await scenario('Failed shell sign-out stays visible and supports explicit retry', true, async ({ api, open, setWrongOrigin, writes, sqlite, drained }) => {
    const entry = await api('/api/demo', 'POST', JSON.stringify({ role: 'teacher', syntheticAcknowledged: true })); await entry.text();
    const ui = await open(Shell, { principal: { id: 'saha-demo-teacher', role: 'teacher', schoolId: 'saha-demo-school' }, children: 'Synthetic main content' });
    setWrongOrigin(true); await ui.click('Sign out'); check(writes().find(item => item.method === 'DELETE').status, 403, 'Actual sign-out rejects a deliberately wrong origin');
    check(sqlite.prepare('SELECT count(*) n FROM auth_sessions').get().n, 1, 'Rejected sign-out does not falsely remove the stored session'); check(redirects, [], 'Failed sign-out never falsely navigates as acknowledged');
    check(text(ui.tree).includes('Synthetic main content'), false, 'Even a rejected sign-out keeps the previous private page hidden'); check(ui.all(item => item.type === 'nav').length, 0, 'Rejected sign-out does not restore protected role navigation');
    okay(ui.one(item => item.props?.role === 'alert'), 'Friendly unconfirmed sign-out is visible'); check(ui.button('Retry sign out').props.disabled, false, 'The user can explicitly retry sign-out');
    setWrongOrigin(false); await ui.click('Retry sign out'); check(sqlite.prepare('SELECT count(*) n FROM auth_sessions').get().n, 0, 'Explicit authorized retry revokes the session'); check(redirects, [origin + '/login'], 'Confirmed retry starts one login navigation'); drained();
  });
  await scenario('Attempted sign-out hides the page before its actual reply arrives', true, async ({ api, open, setIntercept, writes, drained }) => {
    const entry = await api('/api/demo', 'POST', JSON.stringify({ role: 'teacher', syntheticAcknowledged: true })); await entry.text();
    const ui = await open(Shell, { principal: { id: 'saha-demo-teacher', role: 'teacher', schoolId: 'saha-demo-school' }, children: 'PRIVATE_SIGN_OUT_PAGE_CONTENT' });
    okay(text(ui.tree).includes('PRIVATE_SIGN_OUT_PAGE_CONTENT'), 'Authorized page content is visible before the ordinary sign-out action');
    let release, held; const gate = new Promise(resolve => { release = resolve; });
    setIntercept(async ({ path, options, response }) => { if (path === '/api/session' && options.method === 'DELETE') { held = response; await gate; } return response; });
    const callback = ui.button('Sign out').props.onClick; const pending = callback(); ui.render();
    check(text(ui.tree).includes('PRIVATE_SIGN_OUT_PAGE_CONTENT'), false, 'The attempted action hides protected children before acknowledgement delivery');
    check(text(ui.tree).includes('saha-demo-teacher'), false, 'The sign-out screen does not retain the account heading');
    check(ui.all(item => item.type === 'nav').length, 0, 'The sign-out screen omits protected role navigation');
    okay(ui.one(item => item.props?.role === 'status'), 'The waiting action has an announced progress status');
    check(ui.one(item => item.type === 'a' && text(item) === 'Continue to sign-in').props.href, '/login', 'A native sign-in route remains available while the page is hidden');
    await settle(); okay(held, 'Actual successful DELETE response is held at the delivery boundary');
    await callback(); check(writes().filter(item => item.method === 'DELETE').length, 1, 'Captured same-frame action cannot issue another in-flight sign-out');
    release(); await pending; await ui.flush(); check(redirects, [origin + '/login'], 'Confirmed completion starts the ordinary login navigation');
    check(text(ui.tree).includes('PRIVATE_SIGN_OUT_PAGE_CONTENT'), false, 'No private page is restored while navigation starts'); drained();
  });
  for (const mode of ['network', 'unavailable']) await scenario('Uncertain committed sign-out ' + mode + ' keeps only confirmation and exact retry controls', true, async ({ api, open, setIntercept, writes, sqlite, drained }) => {
    const entry = await api('/api/demo', 'POST', JSON.stringify({ role: 'guardian', syntheticAcknowledged: true })); await entry.text();
    const props = { principal: { id: 'saha-demo-guardian', role: 'guardian', schoolId: 'saha-demo-school' }, children: 'PRIVATE_UNCERTAIN_SIGN_OUT_PAGE' };
    const ui = await open(Shell, props); let changed = false;
    setIntercept(async ({ path, options, response }) => { if (!changed && path === '/api/session' && options.method === 'DELETE') { changed = true; check(response.status, 200, 'Uncertain delivery follows an actual acknowledged server sign-out'); await response.text(); if (mode === 'network') throw new TypeError('Synthetic sign-out delivery loss'); return new Response('{"error":"Synthetic unavailable sign-out reply"}', { status: 503 }); } return response; });
    await ui.click('Sign out'); okay(changed, 'The ordinary delivery failure occurs after the actual DELETE');
    check(sqlite.prepare('SELECT count(*) n FROM auth_sessions').get().n, 0, 'Server sign-out remains committed despite local delivery uncertainty');
    check(text(ui.tree).includes('PRIVATE_UNCERTAIN_SIGN_OUT_PAGE'), false, 'Unknown completion does not restore protected children');
    check(text(ui.tree).includes('saha-demo-guardian'), false, 'Unknown completion does not retain the old identity display');
    check(ui.all(item => item.type === 'nav').length, 0, 'Unknown completion has no old role navigation');
    okay(ui.one(item => item.props?.role === 'alert'), 'Uncertain completion is explained in a readable alert'); check(ui.button('Retry sign out').props.disabled, false, 'A clear deliberate retry remains enabled');
    check(redirects, [], 'Uncertain completion never claims that navigation was acknowledged');
    props.principal = { id: 'A-new-parent-account', role: 'admin', schoolId: 'saha-demo-school' }; props.children = 'FRESH_PARENT_PAGE_CONTENT'; ui.render();
    check(text(ui.tree).includes('FRESH_PARENT_PAGE_CONTENT'), false, 'A parent refresh cannot silently restore private children on the confirmation screen');
    check(text(ui.tree).includes('A-new-parent-account'), false, 'A parent refresh cannot replace the screen with an unchecked account heading');
    setIntercept(undefined); await ui.click('Retry sign out'); check(writes().filter(item => item.method === 'DELETE').length, 2, 'Only one explicit retry follows the original attempted sign-out');
    check(redirects, [origin + '/login'], 'The successful deliberate retry navigates once'); check(text(ui.tree).includes('FRESH_PARENT_PAGE_CONTENT'), false, 'Acknowledged retry still leaves content hidden until full-page navigation'); drained();
  });
  await scenario('Denied parent reload immediately hides the former shell identity and roles', true, async ({ api, open, trace, drained }) => {
    const entry = await api('/api/demo', 'POST', JSON.stringify({ role: 'teacher', syntheticAcknowledged: true })); await entry.text();
    const currentSession = await api('/api/session'); check(currentSession.status, 200, 'Actual current-session route supplies the parent identity'); const principal = await currentSession.json();
    const props = { principal, children: 'Synthetic current scoped page' }, ui = await open(Shell, props);
    okay(text(ui.tree).includes(principal.id), 'Current verified parent identity appears before denial');
    const signOut = await api('/api/session', 'DELETE'); check(signOut.status, 200, 'Actual original session is revoked by the ordinary sign-out handler'); await signOut.text();
    const denied = await api('/api/session'); check(denied.status, 401, 'A subsequent actual parent read observes the revoked session'); await denied.text();
    props.principal = null; props.children = 'Private page data is unavailable'; ui.render();
    check(text(ui.tree).includes(principal.id), false, 'Null from a denied parent hides former account in the same render');
    check(ui.all(item => item.type === 'nav').length, 0, 'Null from a denied parent hides former role menu in the same render');
    check(ui.all(item => item.type === 'button' && text(item) === 'Sign out').length, 0, 'Denied parent has no obsolete account action');
    check(ui.one(item => item.type === 'a' && text(item) === 'Login').props.href, '/login', 'Denied parent retains native sign-in recovery');
    await ui.flush();
    check(text(ui.tree).includes(principal.id), false, 'Settling unrelated callbacks cannot restore the revoked identity');
    check(trace.filter(item => item.path === '/api/session' && item.method === 'GET').length, 0, 'No shell-owned session callback can override the denied parent');
    drained();
  });
  await scenario('Delayed shell discovery cannot restore identity after current parent switches', true, async ({ api, open, setIntercept, trace, drained }) => {
    const entry = await api('/api/demo', 'POST', JSON.stringify({ role: 'teacher', syntheticAcknowledged: true })); await entry.text();
    const teacher = await (await api('/api/session')).json();
    let deliver, held; const gate = new Promise(resolve => { deliver = resolve; });
    setIntercept(async ({ path, options, response }) => { if (path === '/api/demo' && (options.method ?? 'GET') === 'GET') { held = response; await gate; } return response; });
    const props = { principal: null, children: 'Synthetic withheld page' }, ui = await open(Shell, props);
    okay(held, 'Actual demo-discovery response is queued while parent identity is withheld');
    props.principal = teacher; ui.render(); okay(text(ui.tree).includes(teacher.id), 'Only a supplied current teacher identity enables its header');
    const guardianEntry = await api('/api/demo', 'POST', JSON.stringify({ role: 'guardian', syntheticAcknowledged: true })); await guardianEntry.text();
    const guardianSession = await api('/api/session'); check(guardianSession.status, 200, 'Actual new guardian session supplies the next parent identity'); const guardian = await guardianSession.json();
    props.principal = guardian; ui.render();
    check(text(ui.tree).includes(teacher.id), false, 'Changing current parent removes the previous teacher in the same render');
    okay(text(ui.tree).includes(guardian.id), 'Changing current parent shows only its verified guardian header');
    check(ui.all(item => item.type === 'a' && item.props.href === '/reading-practice').length, 0, 'Current guardian never inherits the earlier staff planner link');
    props.principal = null; ui.render();
    check(text(ui.tree).includes(guardian.id), false, 'Withholding the changed parent immediately hides that identity');
    deliver(); await ui.flush();
    check(held.bodyUsed, true, 'Late actual discovery response is consumed');
    check(text(ui.tree).includes(teacher.id) || text(ui.tree).includes(guardian.id), false, 'Delayed discovery cannot restore either historical account');
    check(ui.all(item => item.type === 'nav').length, 0, 'Delayed discovery never enables an old role menu');
    check(trace.filter(item => item.path === '/api/session' && item.method === 'GET').length, 0, 'No independent identity request is queued across parent switches');
    props.principal = guardian; ui.render();
    okay(text(ui.tree).includes(guardian.id), 'A later explicit verified parent restores only its own current header');
    check(ui.all(item => item.type === 'a' && item.props.href === '/reading-practice').length, 0, 'Restored family header still excludes the staff planner');
    drained();
  });
  // Intentional contract: explicit null no longer starts a shell identity lookup.
  // Keep obsolete-response consumption/cancellation coverage on its presentation-only discovery.
  await scenario('Obsolete shell discovery delivery is consumed after unmount', true, async ({ api, open, setIntercept, trace, drained }) => {
    const entry = await api('/api/demo', 'POST', JSON.stringify({ role: 'guardian', syntheticAcknowledged: true })); await entry.text();
    let deliver, held; const gate = new Promise(resolve => { deliver = resolve; });
    setIntercept(async ({ path, response }) => { if (path === '/api/demo') { held = response; await gate; } return response; });
    const ui = await open(Shell, { principal: null, children: 'Synthetic main content' }); okay(held, 'Actual discovery response is held after request but before callback delivery'); ui.dispose(); deliver(); await settle();
    check(held.bodyUsed, true, 'A successful obsolete discovery response is still consumed'); check(ui.cells[0].value, false, 'Cancelled discovery callback cannot set a stale shell presentation');
    check(trace.filter(item => item.path === '/api/session' && item.method === 'GET').length, 0, 'Unmounted explicit-null shell never had an independent identity request');
    check(text(ui.tree).includes('saha-demo-guardian'), false, 'Unrelated successful discovery cannot replace a withheld account display'); drained();
  });
  check(externalRequests, 0, 'Every ordinary UI contract remains synthetic and offline');
  console.log(JSON.stringify({ passed, failed: 0, skipped: 0, scenarios, actualRequests, externalRequests,
    scope: 'Actual synthetic routes/opaque sessions/production D1 SQLite with unchanged client callbacks and substituted React hooks/elements; no mounted-browser/keyboard/layout/accessibility/provider/UAT evidence' }));
} finally { configure(false); globalThis.fetch = originalFetch; globalThis.window = originalWindow; delete globalThis.__sahaDemoClientReact; delete globalThis.__sahaDemoClientSlots; }
