// Identity screens (FR-01, FR-04): the production login, account and account-administration client code, run with
// substituted React hooks and element factories against the ACTUAL route handlers, opaque sessions and production D1
// SQL over an isolated SQLite database. Synthetic identities only; every fetch stays inside the local route table.
// This is not mounted React, browser, keyboard, geometry or accessibility evidence (the mounted procedure covers that).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { drizzle } from 'drizzle-orm/d1';
import { bindings, freshDatabase, load, root, seedSecurityData } from '../support/security-db.mjs';
import { serverWork, settleQuiet } from '../support/quiescence.mjs';

const origin = 'https://education.example.invalid';
const installation = '908df258-dff2-43d4-a540-503b2c7e7d13';
const provider = 'https://identity.example.invalid';
const routes = {
  demo: await load('app/api/demo/route.ts'), session: await load('app/api/session/route.ts'), login: await load('app/api/auth/login/route.ts'),
  account: await load('app/api/account/route.ts'), users: await load('app/api/admin/users/route.ts'), detail: await load('app/api/admin/users/[id]/route.ts'),
  role: await load('app/api/admin/users/[id]/role/route.ts'), identity: await load('app/api/admin/users/[id]/identity/route.ts'),
  events: await load('app/api/admin/users/events/route.ts'), changes: await load('app/api/admin/users/changes/route.ts'),
};
const sessionService = await load('lib/education/session.ts');
const demoService = await load('lib/education/demo.ts');
const identity = await load('lib/education/identity.ts');
let passed = 0, scenarios = 0, actualRequests = 0, externalRequests = 0, currentUI;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); passed++; };
const okay = (actual, message) => { assert.ok(actual, message); passed++; };
const originalFetch = globalThis.fetch, originalWindow = globalThis.window;
const redirects = [];
let search = '';
globalThis.window = { location: { origin, get search() { return search; }, assign(url) { redirects.push(url); } } };
const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value, ...nodes(value.props?.children)] : [];
const text = value => Array.isArray(value) ? value.map(text).join('') : value && typeof value === 'object' ? text(value.props?.children) : value == null || typeof value === 'boolean' ? '' : String(value);
const slot = (tag, asChild = false) => props => asChild && props.asChild ? { ...props.children, props: { ...props.children.props, ...props, children: props.children.props.children } } : { type: tag, props };
globalThis.__sahaDemoClientReact = {
  createElement(type, props, ...children) { const value = { ...props, children: children.length === 1 ? children[0] : children }; return typeof type === 'function' ? type(value) : { type, props: value }; },
  useState(initial) { const ui = currentUI, index = ui.index++; if (!ui.cells[index]) ui.cells[index] = { value: typeof initial === 'function' ? initial() : initial }; return [ui.cells[index].value, value => { ui.cells[index].value = typeof value === 'function' ? value(ui.cells[index].value) : value; }]; },
  useRef(initial) { const ui = currentUI, index = ui.index++; if (!ui.cells[index]) ui.cells[index] = { current: initial }; return ui.cells[index]; },
  useEffect(callback, deps) { const ui = currentUI, index = ui.index++, old = ui.cells[index]; if (!old || deps.some((value, offset) => value !== old.deps[offset])) { old?.cleanup?.(); ui.cells[index] = { deps }; ui.effects.push(() => { ui.cells[index].cleanup = callback(); }); } },
};
globalThis.__sahaDemoClientSlots = { Button: slot('button', true) };
async function client(path) {
  const compiled = ts.transpileModule(readFileSync(root + path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } }).outputText;
  const prefix = 'const React=globalThis.__sahaDemoClientReact;const {useEffect,useRef,useState}=React;const {Button}=globalThis.__sahaDemoClientSlots;const Card="section",CardContent="div",CardDescription="p",CardHeader="header",CardTitle="div";\n';
  return import('data:text/javascript;base64,' + Buffer.from(prefix + compiled.replace(/^import[^;]*;\s*/gm, '')).toString('base64'));
}
const Login = (await client('app/login/page.tsx')).default;
const Account = (await client('app/account/page.tsx')).default;
const Admin = (await client('app/admin/users/page.tsx')).default;
const settle = () => settleQuiet();
function mount(Component, props = {}) {
  const ui = { cells: [], effects: [], index: 0, tree: null,
    render() { currentUI = ui; ui.index = 0; ui.effects = []; ui.tree = Component(props); for (const effect of ui.effects) effect(); },
    all(predicate) { return nodes(ui.tree).filter(predicate); },
    one(predicate, message = 'One requested native source control') { const items = ui.all(predicate); assert.equal(items.length, 1, message); return items[0]; },
    button(label) { return ui.one(item => item.type === 'button' && (text(item) === label || item.props['aria-label'] === label), 'One button named ' + label); },
    has(label) { return ui.all(item => item.type === 'button' && (text(item) === label || item.props['aria-label'] === label)).length === 1; },
    async flush() { await settle(); ui.render(); await settle(); ui.render(); },
    control(labelStart) { const label = ui.one(item => item.type === 'label' && text(item).startsWith(labelStart), 'One label ' + labelStart); return nodes(label.props.children).find(item => ['input', 'select', 'textarea'].includes(item.type)); },
    async type(labelStart, value) { ui.control(labelStart).props.onChange({ target: { value, checked: value } }); await ui.flush(); },
    async tick(labelStart) { ui.control(labelStart).props.onChange({ target: { checked: true } }); await ui.flush(); },
    async submit(titleId) { await ui.one(item => item.type === 'form' && item.props['aria-labelledby'] === titleId).props.onSubmit({ preventDefault() {} }); await ui.flush(); },
    async click(label) { const item = ui.button(label); okay(!item.props.disabled, label + ' is enabled'); await item.props.onClick(); await ui.flush(); },
    dispose() { for (const cell of ui.cells) cell?.cleanup?.(); },
  }; ui.render(); return ui;
}
function configure({ demo = false, oidc = false } = {}) {
  for (const key of ['SAHA_DEMO_ENABLED', 'SAHA_DEMO_INSTALLATION_ID', 'SAHA_OIDC_ISSUER', 'SAHA_OIDC_CLIENT_ID', 'SAHA_OIDC_CLIENT_SECRET', 'SAHA_OIDC_REDIRECT_URL', 'SAHA_OIDC_TOKEN_AUTH_METHOD']) delete bindings[key];
  bindings.SAHA_ALLOWED_ORIGINS = origin;
  if (demo) { bindings.SAHA_DEMO_ENABLED = 'true'; bindings.SAHA_DEMO_INSTALLATION_ID = installation; }
  if (oidc) Object.assign(bindings, { SAHA_OIDC_ISSUER: 'https://issuer.test.invalid', SAHA_OIDC_CLIENT_ID: 'saha-test', SAHA_OIDC_CLIENT_SECRET: 'synthetic-secret',
    SAHA_OIDC_REDIRECT_URL: origin + '/api/auth/callback', SAHA_OIDC_TOKEN_AUTH_METHOD: 'client_secret_basic' });
}
const dynamic = (path, method) => {
  const match = /^\/api\/admin\/users\/([^/]+)(\/role|\/identity)?$/.exec(path);
  if (!match || ['events', 'changes'].includes(match[1])) return null;
  const target = match[2] === '/role' ? routes.role : match[2] === '/identity' ? routes.identity : routes.detail;
  return request => target[method](request, { params: Promise.resolve({ id: decodeURIComponent(match[1]) }) });
};
function lookup(path, method) {
  const fixed = { '/api/demo': routes.demo, '/api/session': routes.session, '/api/auth/login': routes.login, '/api/account': routes.account,
    '/api/admin/users': routes.users, '/api/admin/users/events': routes.events, '/api/admin/users/changes': routes.changes }[path];
  if (fixed) return request => fixed[method](request);
  return dynamic(path, method);
}
async function scenario(name, options, action) {
  configure(options); redirects.length = 0; search = '';
  const fixture = freshDatabase(); const { sqlite, schema } = fixture; let cookie, intercept, wrongOrigin = false;
  if (options.seed) await seedSecurityData(fixture.db, fixture.schema);
  function prepare(query, values = []) { return { bind(...params) { return prepare(query, params); }, async raw() { const statement = sqlite.prepare(query); statement.setReturnArrays(true); return statement.all(...values); }, async all() { return { success: true, results: sqlite.prepare(query).all(...values), meta: {} }; }, async run() { const statement = sqlite.prepare(query); if (statement.columns().length) return { success: true, results: statement.all(...values), meta: {} }; const result = statement.run(...values); return { success: true, results: [], meta: { changes: Number(result.changes) } }; } }; }
  globalThis.__sahaTestDb = drizzle({ prepare, async batch(statements) { sqlite.exec('BEGIN'); try { const rows = []; for (const statement of statements) rows.push(await statement.run()); sqlite.exec('COMMIT'); return rows; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } }, { schema });
  const trace = [], responses = [], uis = [];
  async function api(path, method = 'GET', payload) {
    const url = new URL(path, origin); if (url.origin !== origin) { externalRequests++; throw new Error('Identity screens stay offline.'); }
    actualRequests++;
    const handler = lookup(url.pathname, method);
    assert.ok(handler, 'Only explicit actual local routes are used: ' + method + ' ' + path);
    const request = new Request(url, { method, headers: { origin: wrongOrigin ? 'https://other.example.invalid' : origin, ...(cookie ? { cookie } : {}), ...(payload === undefined ? {} : { 'content-type': 'application/json' }) }, ...(payload === undefined ? {} : { body: payload }) });
    const response = await serverWork(() => handler(request));
    const issued = response.headers.get('set-cookie'); if (issued) cookie = issued.split(';')[0];
    return response;
  }
  globalThis.fetch = async (path, options = {}) => {
    const response = await api(String(path), options.method ?? 'GET', options.body);
    trace.push({ path: String(path), method: options.method ?? 'GET', status: response.status, body: options.body });
    const delivered = intercept ? await intercept({ path: String(path), options, response }) : response;
    if (delivered) responses.push(delivered); return delivered;
  };
  async function open(Component, props) { const ui = mount(Component, props); uis.push(ui); await ui.flush(); return ui; }
  const writes = () => trace.filter(item => item.method !== 'GET');
  const drained = () => check(responses.every(response => response.bodyUsed), true, name + ': every delivered response body is consumed');
  const count = (table, where = '1=1') => sqlite.prepare(`SELECT count(*) n FROM ${table} WHERE ${where}`).get().n;
  try { await action({ ...fixture, api, open, writes, trace, drained, count, setIntercept(value) { intercept = value; }, setWrongOrigin(value) { wrongOrigin = value; },
    cookie: () => cookie, setCookie(value) { cookie = value; } }); scenarios++; }
  finally { for (const ui of uis) ui.dispose(); await settle(); sqlite.close(); }
}
const why = 'Reviewed synthetic roster decision with the school';
const alertText = ui => ui.all(item => item.props?.role === 'alert').map(text).join('|');
const statusText = ui => text(ui.one(item => item.props?.role === 'status', 'Exactly one status region'));
async function adminSession(setCookie, id = 'admin-a') { setCookie((await sessionService.createSession(id)).split(';')[0]); }
async function provision(api, name, subject, role = 'teacher') {
  const response = await api('/api/admin/users', 'POST', JSON.stringify({ clientRequestId: crypto.randomUUID(), name, email: `${subject}@example.invalid`, role,
    identityIssuer: provider, identitySubject: subject, reviewConfirmed: true, reason: why }));
  assert.equal(response.status, 201); return (await response.json()).user;
}

try {
  // ---- Login page ------------------------------------------------------------------------------------------------
  await scenario('Real mode unconfigured notice and failed-callback redirect', {}, async ({ open, writes, drained, trace }) => {
    search = '?error=signin_failed';
    const ui = await open(Login);
    okay(/could not be completed/.test(alertText(ui)), 'The callback redirect ?error=signin_failed is explained in an alert');
    okay(ui.all(item => item.props?.role === 'note').some(item => /has not been set up/.test(text(item))), 'Unconfigured school sign-in is stated up front');
    check(trace.filter(item => item.method === 'GET' && item.path === '/api/auth/login').map(item => item.status), [200], 'The status check is one read-only GET');
    check(ui.button('Continue with school sign-in').props.disabled, false, 'The sign-in button stays available when unconfigured');
    check(writes().length, 0, 'Loading the page sends no write'); drained();
  });
  await scenario('Real mode configured shows no setup notice; expiry notice', { oidc: true }, async ({ open, drained }) => {
    search = '?reason=expired';
    const ui = await open(Login);
    check(ui.all(item => item.props?.role === 'note').map(text), ['Your session ended. Sign in again to continue.'], 'Only the expiry notice appears when the provider is configured');
    check(alertText(ui), '', 'No error alert on a plain expiry'); drained();
  });
  await scenario('Unknown query values are ignored', {}, async ({ open, drained }) => {
    search = '?error=<script>&reason=other';
    const ui = await open(Login);
    check(alertText(ui), '', 'Unrecognised error values are never echoed'); okay(!text(ui.tree).includes('<script>'), 'Query text is not rendered'); drained();
  });
  for (const [label, prepare, expected] of [
    ['disabled demo account', async ({ sqlite }) => { sqlite.exec("UPDATE users SET disabled_at='2026-01-01T00:00:00.000Z' WHERE id='saha-demo-teacher'"); }, /demo account is switched off/],
    ['wrong origin', async ({ setWrongOrigin }) => setWrongOrigin(true), /could not be verified as part of this site/],
    ['demo switched off', async () => { bindings.SAHA_DEMO_ENABLED = 'false'; }, /demo is switched off on this installation/],
  ]) await scenario('Demo entry refusal explained: ' + label, { demo: true }, async context => {
    await demoService.initializeSyntheticDemo();
    const ui = await context.open(Login); await ui.one(item => item.type === 'input' && item.props.id === 'demo-acknowledgement').props.onChange({ target: { checked: true } }); await ui.flush();
    await prepare(context);
    await ui.click('Explore as teacher');
    okay(expected.test(alertText(ui)), label + ' has its own plain message: ' + alertText(ui));
    check(context.count('auth_sessions'), 0, 'Nothing was issued'); check(redirects, [], 'No navigation'); context.drained();
  });

  // ---- Account page --------------------------------------------------------------------------------------------------
  for (const [role, label] of [['admin', 'School administrator'], ['teacher', 'Teacher'], ['guardian', 'Guardian'], ['student', 'Student']]) await scenario('Account page for synthetic ' + role, { demo: true }, async ({ api, open, drained, count, writes }) => {
    await (await api('/api/demo', 'POST', JSON.stringify({ role, syntheticAcknowledged: true }))).text();
    const ui = await open(Account); const page = text(ui.tree);
    okay(page.includes('Your account') && page.includes(label) && page.includes('Synthetic demo entry') && page.includes('fictional'), 'Role, synthetic sign-in and fictional label shown');
    okay(!/saha-demo\.example\.invalid|identity_subject|issuer/i.test(page), 'Provider issuer and subject are never shown');
    okay(ui.has('Switch demo role') || ui.all(item => item.type === 'a' && item.props.href === '/login').length === 1, 'Demo accounts can switch role');
    const signOut = ui.button('Sign out').props.onClick; await Promise.all([signOut(), signOut()]); await ui.flush();
    check(writes().filter(item => item.method === 'DELETE').length, 1, 'Same-frame double sign-out sends one request'); check(count('auth_sessions'), 0, 'The server session was revoked');
    check(redirects, [origin + '/login'], 'Confirmed sign-out goes to login'); drained();
  });
  await scenario('Account page for a school sign-in account and expired session', { seed: true }, async ({ open, drained, setCookie, count }) => {
    await adminSession(setCookie, 'teacher-a');
    const ui = await open(Account); const page = text(ui.tree);
    okay(page.includes('School sign-in') && !page.includes('Synthetic demo') && page.includes('Teacher') && page.includes('Synthetic school a'), 'School sign-in account shows its own method, role and school');
    check(ui.all(item => item.props?.['data-synthetic']).length, 0, 'No synthetic label on a school sign-in account');
    check(count('auth_sessions'), 1, 'Session present');
    drained();
  });
  await scenario('Account page without a session redirects with the expiry reason', { seed: true }, async ({ open, drained }) => {
    await open(Account);
    check(redirects, [origin + '/login?reason=expired'], 'A revoked or expired session leads to the login expiry notice'); drained();
  });
  await scenario('Failed account sign-out stays on the page and can retry', { demo: true }, async ({ api, open, setWrongOrigin, drained, count }) => {
    await (await api('/api/demo', 'POST', JSON.stringify({ role: 'teacher', syntheticAcknowledged: true }))).text();
    const ui = await open(Account); setWrongOrigin(true); await ui.click('Sign out');
    okay(/could not be confirmed/.test(alertText(ui)), 'Refused sign-out is explained'); check([count('auth_sessions'), redirects], [1, []], 'Session untouched and no navigation');
    setWrongOrigin(false); await ui.click('Sign out'); check([count('auth_sessions'), redirects], [0, [origin + '/login']], 'Explicit retry signs out'); drained();
  });

  // ---- Account administration ----------------------------------------------------------------------------------------
  await scenario('Administration: search, filter, role change, history, conflicts', { seed: true }, async ({ api, open, drained, setCookie, count, trace, sqlite }) => {
    await adminSession(setCookie);
    const rita = await provision(api, 'Rita Roster', 'rita-sub');
    const ui = await open(Admin); const page = () => text(ui.tree);
    const listed = () => ui.all(item => item.type === 'h3' && /font-semibold/.test(item.props.className ?? '') && item.props.className.includes('break-words')).map(text);
    okay(page().includes('Reviewed account administration') && page().includes('Rita Roster') && page().includes('teacher-a'), 'Accounts of the administrator’s school are listed');
    okay(!page().includes('admin-b') && !page().includes('teacher-b'), 'Another school’s accounts are never listed');
    check(ui.all(item => item.props?.role === 'status').length, 1, 'One status region keeps the existing announcement contract');
    await ui.type('Search accounts', 'rita'); check(listed(), ['Rita Roster'], 'Search narrows the list'); okay(page().includes('Showing 1 of'), 'The count is announced');
    await ui.type('Search accounts', 'nobody-here'); okay(page().includes('No loaded account matches'), 'Empty search is explained');
    await ui.type('Search accounts', ''); await ui.type('Filter by role', 'guardian'); check(listed(), ['guardian-a', 'guardian-other'], 'Role filter works');
    await ui.type('Filter by role', 'all'); await ui.type('Filter by status', 'disabled'); okay(page().includes('No loaded account matches'), 'Status filter works');
    await ui.type('Filter by status', 'all');
    // A teacher with a class cannot become a learner, and the reason is explained in plain language.
    await ui.click('Manage account for teacher-a');
    check(text(ui.one(item => item.type === 'h2' && item.props.id === 'manage-title')), 'Manage account', 'Manage panel opens for the chosen account');
    await ui.type('New role for this account', 'student'); await ui.type('Reason for the role change', why); await ui.tick('I reviewed this account and confirm this role');
    await ui.submit('role-change-title');
    okay(/still has classes/.test(alertText(ui)), 'Server refusal class_assigned is explained: ' + alertText(ui)); check(count('identity_admin_changes'), 0, 'Nothing was recorded');
    okay(ui.has('Change role'), 'The panel stays open with the typed review');
    // A teacher without classes can be changed; sessions end; history and list update.
    await ui.click('Close account panel');
    await sessionService.createSession(rita.id);
    await ui.click('Manage account for Rita Roster');
    check(ui.one(item => item.type === 'button' && text(item) === 'Change role').props.disabled, true, 'Unchanged role cannot be submitted');
    await ui.type('New role for this account', 'guardian'); await ui.type('Reason for the role change', why);
    check(ui.one(item => item.type === 'button' && text(item) === 'Change role').props.disabled, true, 'Unconfirmed review cannot be submitted');
    await ui.tick('I reviewed this account and confirm this role');
    check(ui.control('I reviewed this account and confirm this role').props.checked, true, 'The confirmation is recorded');
    await ui.type('Reason for the role change', why + ' (edited)');
    check(ui.control('I reviewed this account and confirm this role').props.checked, false, 'Editing the reason clears the earlier confirmation');
    await ui.tick('I reviewed this account and confirm this role'); await ui.type('New role for this account', 'student'); await ui.type('New role for this account', 'guardian');
    check(ui.control('I reviewed this account and confirm this role').props.checked, false, 'Editing the role clears the earlier confirmation');
    await ui.tick('I reviewed this account and confirm this role');
    await ui.submit('role-change-title');
    okay(/Reviewed role change saved\. Rita Roster is now guardian\./.test(statusText(ui)), 'Role change confirmed in the status region: ' + statusText(ui));
    check([count('identity_admin_changes'), count('auth_sessions', `user_id='${rita.id}'`)], [1, 0], 'One audit row and the person’s sessions ended');
    okay(page().includes('Role changed from teacher to guardian · Rita Roster'), 'History shows the role change by name'); okay(!page().includes(rita.id), 'No raw identifier is shown to the user');
    check(ui.all(item => item.type === 'section' && item.props['aria-labelledby'] === 'manage-title').length, 0, 'Panel closed after saving');
    // Own account is protected.
    await ui.click('Manage account for admin-a');
    okay(/your own account/.test(page()), 'Own account explains why it cannot be changed');
    okay(ui.all(item => item.type === 'fieldset').filter(item => item.props.disabled).length >= 2, 'Own role and sign-in forms are disabled');
    await ui.click('Close account panel');
    okay(trace.every(item => !/admin-b|teacher-b/.test(item.path)), 'No cross-school record was requested'); drained();
    void sqlite;
  });
  await scenario('Administration: link and unlink with conflicts, and a lost reply retried safely', { seed: true }, async ({ api, open, drained, setCookie, count, trace, setIntercept, sqlite }) => {
    await adminSession(setCookie);
    const noor = await provision(api, 'Noor Newcomer', 'noor-sub');
    const ui = await open(Admin); const page = () => text(ui.tree);
    await ui.click('Manage account for Noor Newcomer');
    okay(ui.all(item => item.type === 'h3').some(item => text(item) === 'Remove school sign-in link'), 'A linked account offers removal');
    // Lose the reply of the first unlink: the screen must keep the review and reuse the same request id on retry.
    let lost = false;
    setIntercept(async ({ path, options, response }) => { if (!lost && options.method === 'PATCH' && path.endsWith('/identity')) { lost = true; await response.text(); throw new TypeError('Synthetic lost reply'); } return response; });
    await ui.type('Reason for the sign-in change', why); await ui.tick('I reviewed this account and confirm this sign-in');
    await ui.submit('sign-in-change-title');
    okay(lost && count('identity_admin_changes') === 1, 'The change committed although its reply was lost');
    okay(/could not be confirmed/.test(alertText(ui)), 'The unconfirmed save is reported, not assumed');
    await ui.submit('sign-in-change-title');
    const patches = trace.filter(item => item.method === 'PATCH');
    check(patches.length, 2, 'Exactly one explicit retry'); check(JSON.parse(patches[0].body).clientRequestId, JSON.parse(patches[1].body).clientRequestId, 'The retry reuses the request id');
    check([patches[1].status, count('identity_admin_changes')], [200, 1], 'The replay is recognised: still one audit row');
    okay(/no longer has a school sign-in link/.test(statusText(ui)), 'Retried save confirmed: ' + statusText(ui)); okay(page().includes('Not mapped'), 'List shows the account as unmapped');
    check({ ...sqlite.prepare('SELECT identity_issuer a, identity_subject b FROM users WHERE id=?').get(noor.id) }, { a: null, b: null }, 'Server cleared the mapping');
    // Link it again: the held identity of another account is refused, a free one is accepted.
    setIntercept(undefined);
    await ui.click('Manage account for Noor Newcomer');
    okay(ui.all(item => item.type === 'h3').some(item => text(item) === 'Link school sign-in'), 'An unlinked account offers linking');
    await ui.type('Provider issuer to link', provider); await ui.type('Provider subject to link', 'sub-teacher-a'); await ui.type('Reason for the sign-in change', why); await ui.tick('I reviewed this account and confirm this sign-in');
    await ui.submit('sign-in-change-title');
    okay(/already uses that sign-in identity/.test(alertText(ui)), 'identity_in_use explained: ' + alertText(ui));
    await ui.type('Provider subject to link', 'noor-new-sub'); await ui.tick('I reviewed this account and confirm this sign-in');
    await ui.submit('sign-in-change-title');
    okay(/is now linked to the school sign-in identity/.test(statusText(ui)), 'Free identity accepted: ' + statusText(ui));
    check({ ...sqlite.prepare('SELECT identity_subject s FROM users WHERE id=?').get(noor.id) }, { s: 'noor-new-sub' }, 'Server stored the new subject');
    okay(page().includes('School sign-in linked · Noor Newcomer') && page().includes('School sign-in link removed · Noor Newcomer'), 'Both decisions appear in the history');
    // Stale panel: another administrator changes the account first.
    await ui.click('Manage account for Noor Newcomer');
    sqlite.exec(`UPDATE identity_admin_user_versions SET version = version + 1 WHERE user_id='${noor.id}'`);
    await ui.type('Reason for the sign-in change', why); await ui.tick('I reviewed this account and confirm this sign-in');
    await ui.submit('sign-in-change-title');
    okay(/changed after you opened it/.test(alertText(ui)), 'stale_version explained: ' + alertText(ui)); drained();
  });
  await scenario('Administration inside the synthetic demo: labelled, link-only, no removal', { demo: true }, async ({ api, open, drained, count }) => {
    await (await api('/api/demo', 'POST', JSON.stringify({ role: 'admin', syntheticAcknowledged: true }))).text();
    const ui = await open(Admin); const page = () => text(ui.tree);
    okay(page().includes('Synthetic demo sign-in'), 'Fixed demo accounts are labelled as synthetic sign-in');
    okay(!page().includes('saha-demo.example.invalid'), 'The synthetic issuer URL is not shown');
    await ui.click('Manage account for Demo teacher');
    okay(ui.all(item => item.props?.['data-synthetic']).length === 1 && /Synthetic demo\./.test(page()), 'The panel carries the synthetic label');
    okay(/removal is unavailable/.test(page()), 'Removal of the demo sign-in is explained as unavailable');
    check(ui.all(item => item.type === 'fieldset').filter(item => item.props.disabled).length, 1, 'The sign-in form is disabled for a synthetic account');
    check(count('identity_admin_changes'), 0, 'Nothing recorded by looking');
    // Provisioning with a provider issuer is refused inside the synthetic installation, with its own plain explanation.
    await ui.type('Name', 'Outside Teacher'); await ui.type('Email', 'outside@example.invalid'); await ui.type('Exact trusted identity issuer', provider);
    await ui.type('Exact provider identity subject', 'outside-sub'); await ui.type('Reason and review reference', why); await ui.tick('I checked this person');
    const before = count('users'); await ui.submit('provision-title');
    okay(/accepts only the synthetic demo sign-in provider/.test(alertText(ui)), 'demo_issuer explained: ' + alertText(ui)); check(count('users'), before, 'No account was created');
    drained();
  });
  check(externalRequests, 0, 'Identity screens remain synthetic and offline');
  console.log(JSON.stringify({ passed, failed: 0, skipped: 0, scenarios, actualRequests, externalRequests,
    scope: 'Production login/account/admin-users client code with substituted React hooks/elements over actual routes, opaque sessions and production D1 SQLite; no mounted-browser/keyboard/layout/accessibility/provider/UAT evidence' }));
} finally { configure(); globalThis.fetch = originalFetch; globalThis.window = originalWindow; delete globalThis.__sahaDemoClientReact; delete globalThis.__sahaDemoClientSlots; void identity; }
