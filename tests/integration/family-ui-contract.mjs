// Independent family-view client callback contracts. Actual synthetic sessions,
// HTTP routes and production Drizzle D1 statements execute over SQLite. React
// hooks/elements are substituted; mounted-browser and hosted evidence are separate.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { drizzle } from 'drizzle-orm/d1';
import { freshDatabase, seedSecurityData, load, bindings, root, stamp } from '../support/security-db.mjs';
import { serverWork, settleQuiet } from '../support/quiescence.mjs';
const origin = 'https://education.example.invalid'; bindings.SAHA_ALLOWED_ORIGINS = origin;
const routes = { session: await load('app/api/session/route.ts'), notices: await load('app/api/notifications/route.ts'), class: await load('app/api/classes/[id]/route.ts') };
const sessions = await load('lib/education/session.ts');
globalThis.__sahaFamilyStoredTimestamp = (await load('lib/education/stored-timestamp.ts')).isExactStoredTimestamp;
let activeUI, checks = 0, scenarios = 0, requests = 0, externalRequests = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const okay = (value, message) => { assert.ok(value, message); checks++; };
const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value, ...nodes(value.props?.children)] : [];
const text = value => Array.isArray(value) ? value.map(text).join('') : value && typeof value === 'object' ? text(value.props?.children) : value == null || typeof value === 'boolean' ? '' : String(value);
const originalFetch = globalThis.fetch, originalWindow = globalThis.window;
globalThis.window = { location: { origin, assign() { throw new Error('Family callback recovery keeps its mounted reminder.'); } } };
globalThis.__sahaFamilyContractReact = {
  createElement(type, props, ...children) { const values = { ...props, children: children.length === 1 ? children[0] : children }; return typeof type === 'function' ? type(values) : { type, props: values }; },
  useState(initial) { const ui = activeUI, index = ui.index++; if (!ui.cells[index]) ui.cells[index] = { value: typeof initial === 'function' ? initial() : initial }; return [ui.cells[index].value, value => { ui.cells[index].value = typeof value === 'function' ? value(ui.cells[index].value) : value; }]; },
  useRef(initial) { const ui = activeUI, index = ui.index++; if (!ui.cells[index]) ui.cells[index] = { current: initial }; return ui.cells[index]; },
  useCallback(callback, deps) { const ui = activeUI, index = ui.index++, old = ui.cells[index]; if (!old || deps.some((value, index) => value !== old.deps[index])) ui.cells[index] = { callback, deps }; return ui.cells[index].callback; },
  useEffect(callback, deps) { const ui = activeUI, index = ui.index++, old = ui.cells[index]; if (!old || deps.some((value, index) => value !== old.deps[index])) { old?.cleanup?.(); ui.cells[index] = { deps }; ui.effects.push(() => { ui.cells[index].cleanup = callback(); }); } },
};
async function component(path) {
  const source = readFileSync(root + path, 'utf8'), compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } }).outputText;
  const prefix = 'const React=globalThis.__sahaFamilyContractReact;const {useState,useRef,useEffect,useCallback}=React;const Button="button",Card="section",CardContent="div",CardHeader="header",CardTitle="h2",Badge="span",AppShell="app-shell";const isExactStoredTimestamp=globalThis.__sahaFamilyStoredTimestamp;\n';
  return (await import('data:text/javascript;base64,' + Buffer.from(prefix + compiled.replace(/^import[^\n]*;\n/gm, '') + '\n//# sourceURL=saha-family-client-' + path.replaceAll('/', '-')).toString('base64'))).default;
}
const Inbox = await component('app/notifications/page.tsx'), ClassDetail = await component('app/classes/[id]/page.tsx');
const settle = () => settleQuiet();
function driver(Component, props = {}) {
  const ui = { cells: [], index: 0, effects: [], tree: null, props,
    render() { activeUI = ui; ui.index = 0; ui.effects = []; ui.tree = Component(ui.props); for (const effect of ui.effects) effect(); },
    all(predicate) { return nodes(ui.tree).filter(predicate); },
    one(predicate) { const found = ui.all(predicate); assert.equal(found.length, 1, 'Exactly one family-view control'); return found[0]; },
    button(label) { return ui.one(node => node.type === 'button' && text(node) === label); },
    async flush() { await settle(); ui.render(); await settle(); ui.render(); },
    async click(label) { const node = ui.button(label); okay(!node.props.disabled, 'Requested family-view action is enabled'); node.props.onClick(); await ui.flush(); },
    dispose() { for (const cell of ui.cells) cell?.cleanup?.(); },
  }; ui.render(); return ui;
}
const has = (ui, value) => text(ui.tree).includes(value);
const noticeIds = ui => ui.all(node => node.props['data-notification-id']).map(node => node.props['data-notification-id']);
const profileIds = ui => ui.all(node => node.props['data-class-profile-id']).map(node => node.props['data-class-profile-id']);
const privateBody = 'Synthetic private original guardian notice';
const privateSchedule = 'Synthetic private original school schedule';
async function scenario(name, Component, action, actor = 'guardian-a', options = {}) {
  const fixture = freshDatabase(options); await seedSecurityData(fixture.db, fixture.schema); const { sqlite, schema } = fixture;
  sqlite.prepare('UPDATE notifications SET body=? WHERE id=?').run(privateBody, 'notice-guardian-a');
  sqlite.prepare('UPDATE classes SET schedule=? WHERE id=?').run(privateSchedule, 'class-a');
  for (const id of ['admin-a', 'teacher-a', 'student-user-a']) sqlite.prepare('INSERT INTO notifications (id,user_id,channel,title,body,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run('notice-' + id, id, 'in_app', 'Synthetic own notice ' + id, 'Synthetic private account body ' + id, stamp, stamp);
  function prepare(query, values = []) { return { bind(...params) { return prepare(query, params); }, async raw() { const statement = sqlite.prepare(query); statement.setReturnArrays(true); return statement.all(...values); }, async all() { return { success: true, results: sqlite.prepare(query).all(...values), meta: {} }; }, async run() { const statement = sqlite.prepare(query); if (statement.columns().length) return { success: true, results: statement.all(...values), meta: {} }; const result = statement.run(...values); return { success: true, results: [], meta: { changes: Number(result.changes) } }; } }; }
  globalThis.__sahaTestDb = drizzle({ prepare, async batch(statements) { sqlite.exec('BEGIN'); try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec('COMMIT'); return result; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } }, { schema });
  const cookies = {}; for (const id of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'guardian-a', 'guardian-other', 'student-user-a']) cookies[id] = (await sessions.createSession(id)).split(';')[0];
  const context = { sqlite, actor, trace: [], before: null, after: null, uis: [], async renew(id = context.actor) { cookies[id] = (await sessions.createSession(id)).split(';')[0]; }, writes() { return context.trace.filter(row => row.method !== 'GET'); }, mount(props = Component === ClassDetail ? { params: Promise.resolve({ id: 'class-a' }) } : {}) { const ui = driver(Component, props); context.uis.push(ui); return ui; } };
  globalThis.fetch = async (path, init = {}) => {
    const url = new URL(path, origin); if (url.origin !== origin) { externalRequests++; throw new Error('Family contracts stay offline.'); }
    const method = init.method ?? 'GET'; context.before?.(url.pathname, method, url);
    let route, parameters;
    if (url.pathname === '/api/session') route = routes.session;
    else if (url.pathname === '/api/notifications') route = routes.notices;
    else if (url.pathname.startsWith('/api/classes/')) { route = routes.class; parameters = { params: Promise.resolve({ id: decodeURIComponent(url.pathname.split('/').at(-1)) }) }; }
    else throw new Error('Unexpected family-view route; coherent class view must not request child records');
    requests++; const response = await serverWork(() => route[method](new Request(url, { ...init, headers: { ...init.headers, origin, cookie: cookies[context.actor] ?? '' } }), parameters));
    context.trace.push({ path: url.pathname, search: url.search, method, status: response.status, actor: context.actor });
    return context.after ? await context.after(url.pathname, method, response, url, init) : response;
  };
  try { await action(context); scenarios++; }
  catch (error) { error.message = name + ': ' + error.message; throw error; }
  finally { for (const ui of context.uis) ui.dispose(); await settle(); sqlite.close(); }
}
try {
  for (const actor of ['admin-a', 'teacher-a', 'guardian-a', 'student-user-a']) await scenario('Owned inbox role ' + actor, Inbox, async ctx => {
    const ui = ctx.mount(); await ui.flush(); check(noticeIds(ui), ['notice-' + actor], 'Every role sees only its exact owned notice');
    okay(!has(ui, 'guardian-other') && !has(ui, 'Synthetic private account body admin-b'), 'Other account content is absent');
    check(ctx.writes().length, 0, 'Opening an inbox never sends a message or marks a notice');
    check(ctx.trace.map(row => row.path), ['/api/session', '/api/notifications', '/api/session'], 'Inbox is verified around one scoped feed');
  }, actor);
  await scenario('Empty owned inbox is a truthful empty state', Inbox, async ctx => {
    ctx.sqlite.prepare('DELETE FROM notifications WHERE user_id=?').run('guardian-a'); const ui = ctx.mount(); await ui.flush();
    check(noticeIds(ui), [], 'An empty owned inbox has no article'); okay(has(ui, 'No notifications found for your current account.'), 'Verified empty state is explicit');
    okay(!has(ui, 'could not be verified'), 'Successful empty data is not misreported as an error');
  });
  await scenario('Read marker uses actual saved timestamp and synchronous lock', Inbox, async ctx => {
    const ui = ctx.mount(); await ui.flush(); const callback = ui.button('Mark as Read').props.onClick;
    callback(); callback(); await ui.flush(); check(ctx.writes().length, 1, 'Two pre-render clicks send one read marker');
    check(ctx.writes()[0].status, 200, 'Actual scoped read mutation succeeds');
    const saved = ctx.sqlite.prepare('SELECT read_at,updated_at FROM notifications WHERE id=?').get('notice-guardian-a');
    okay(saved.read_at, 'Server stores the read timestamp'); check(saved.updated_at, saved.read_at, 'First read updates its server timestamp once');
    check(ui.all(node => node.type === 'time').map(node => node.props.dateTime), [stamp, saved.read_at], 'UI renders exactly the original saved date and actual server readAt');
    okay(has(ui, 'Read status confirmed from your saved inbox.'), 'Success follows verified saved state');
    check(ui.all(node => node.type === 'button' && text(node) === 'Mark as Read').length, 0, 'Saved read notice no longer has an unread action');
  });
  await scenario('Changed account before marker sends no request and hides old inbox', Inbox, async ctx => {
    const ui = ctx.mount(); await ui.flush(); ctx.actor = 'guardian-other'; await ui.click('Mark as Read');
    check(ctx.writes().length, 0, 'Fresh owner check blocks the old notice before mutation');
    check(noticeIds(ui), [], 'Changed owner hides the entire former inbox'); okay(!has(ui, privateBody), 'Previous guardian private body is absent');
    check(ctx.sqlite.prepare('SELECT read_at FROM notifications WHERE id=?').get('notice-guardian-a').read_at, null, 'Original guardian read state is unchanged');
  });
  for (const status of [401, 404]) await scenario('Late actual marker denial ' + status, Inbox, async ctx => {
    const ui = ctx.mount(); await ui.flush(); ctx.before = (path, method) => { if (path === '/api/notifications' && method === 'PATCH') { ctx.before = null; if (status === 401) ctx.sqlite.prepare('DELETE FROM auth_sessions WHERE user_id=?').run('guardian-a'); else ctx.sqlite.prepare('UPDATE notifications SET user_id=? WHERE id=?').run('guardian-other', 'notice-guardian-a'); } };
    await ui.click('Mark as Read'); check(ctx.writes()[0].status, status, 'Actual HTTP route denies changed current scope');
    check(noticeIds(ui), [], 'Known denial hides previous inbox articles'); okay(!has(ui, privateBody), 'Known denial hides private notice body');
    okay(!has(ui, 'Original notice:'), 'Pending notice identity is private without verified original scope');
    check(ctx.sqlite.prepare('SELECT read_at FROM notifications WHERE id=?').get('notice-guardian-a').read_at, null, 'Denied marker preserves unread storage');
  });
  await scenario('Committed lost read reply retries exact original notice without changing first read time', Inbox, async ctx => {
    const ui = ctx.mount(); await ui.flush(); ctx.after = async (path, method, response) => { if (method === 'PATCH') { await response.arrayBuffer(); throw new Error('Synthetic lost read marker reply'); } return response; };
    await ui.click('Mark as Read'); const saved = ctx.sqlite.prepare('SELECT * FROM notifications WHERE id=?').get('notice-guardian-a');
    okay(saved.read_at, 'Actual marker committed before delivery loss'); check(noticeIds(ui), [], 'Unknown outcome hides old inbox');
    ctx.after = null; await ui.click('Reload my inbox'); check(ctx.writes().length, 1, 'Reload does not automatically retry a read marker');
    okay(has(ui, 'Original notice: Synthetic notice'), 'Fresh original owner can inspect the pending notice');
    await ui.click('Retry original notice read status'); check(ctx.writes().map(row => [row.method, row.search]), [['PATCH', '?id=notice-guardian-a'], ['PATCH', '?id=notice-guardian-a']], 'Explicit retry uses the exact original notice request');
    check(ctx.sqlite.prepare('SELECT * FROM notifications WHERE id=?').get('notice-guardian-a'), saved, 'Idempotent retry preserves all original notice fields and first read timestamp');
    okay(!has(ui, 'The original notice read status is unconfirmed'), 'Saved retry confirmation clears the reminder');
  });
  await scenario('Wrong account cannot inspect or retry pending read marker', Inbox, async ctx => {
    const ui = ctx.mount(); await ui.flush(); ctx.after = async (path, method, response) => { if (method === 'PATCH') { await response.arrayBuffer(); throw new Error('Synthetic lost reply'); } return response; }; await ui.click('Mark as Read');
    ctx.after = null; ctx.actor = 'guardian-other'; await ui.click('Reload my inbox');
    check(noticeIds(ui), ['notice-guardian-other'], 'Different account only receives its own current inbox');
    okay(!has(ui, privateBody) && !has(ui, 'Original notice:'), 'Different account cannot inspect original pending content');
    check(ui.all(node => node.type === 'button' && ['Retry original notice read status', 'Dismiss unavailable notice reminder'].includes(text(node))).length, 0, 'Different account cannot retry or dismiss original actor reminder');
    check(ctx.writes().length, 1, 'Different owner reload sends no marker');
  });
  await scenario('Revoked marker is recovered only after restored original account', Inbox, async ctx => {
    const ui = ctx.mount(); await ui.flush(); ctx.before = (path, method) => { if (method === 'PATCH') { ctx.before = null; ctx.sqlite.prepare('DELETE FROM auth_sessions WHERE user_id=?').run('guardian-a'); } }; await ui.click('Mark as Read');
    check(ctx.writes()[0].status, 401, 'Actual revoked original cookie is denied'); await ctx.renew(); await ui.click('Reload my inbox');
    check(ctx.writes().length, 1, 'Restored owner reload does not mark automatically'); await ui.click('Retry original notice read status');
    check(ctx.writes().map(row => row.status), [401, 200], 'Only explicit same-owner retry marks the exact notice');
    const saved = ctx.sqlite.prepare('SELECT read_at FROM notifications WHERE id=?').get('notice-guardian-a');
    okay(ui.all(node => node.type === 'time').some(node => node.props.dateTime === saved.read_at), 'Restored retry displays actual saved readAt');
  });
  await scenario('Missing original notice reminder can be dismissed without confirming a read', Inbox, async ctx => {
    const ui = ctx.mount(); await ui.flush(); ctx.before = (path, method) => { if (method === 'PATCH') { ctx.before = null; ctx.sqlite.prepare('DELETE FROM notifications WHERE id=?').run('notice-guardian-a'); } }; await ui.click('Mark as Read');
    check(ctx.writes()[0].status, 404, 'Removed notice actual route is unavailable'); await ui.click('Reload my inbox');
    okay(has(ui, 'Its read status has not been confirmed.'), 'Missing original record has an honest unconfirmed state');
    await ui.click('Dismiss unavailable notice reminder'); check(ctx.writes().length, 1, 'Dismissing reminder never marks or recreates a record');
    okay(has(ui, 'No read status was changed or confirmed.'), 'Dismissal does not claim a saved read');
  });
  await scenario('Acknowledgement alone cannot fabricate saved read status', Inbox, async ctx => {
    const ui = ctx.mount(); await ui.flush(); let reject = false;
    ctx.after = async (path, method, response) => { if (method === 'PATCH') reject = true; if (path === '/api/notifications' && method === 'GET' && reject) { await response.arrayBuffer(); throw new Error('Synthetic saved inbox refresh failure'); } return response; };
    await ui.click('Mark as Read'); okay(ctx.sqlite.prepare('SELECT read_at FROM notifications WHERE id=?').get('notice-guardian-a').read_at, 'Server read really committed');
    check(noticeIds(ui), [], 'Unavailable confirmation hides inbox instead of marking locally'); okay(!has(ui, 'Read status confirmed from your saved inbox.'), 'Acknowledgement without saved status never claims success');
    okay(has(ui, 'The read status could not be confirmed.'), 'Saved-state verification failure remains recoverable');
  });
  await scenario('False success acknowledgement remains unconfirmed', Inbox, async ctx => {
    const ui = ctx.mount(); await ui.flush(); ctx.after = async (path, method, response) => { if (method === 'PATCH') { await response.arrayBuffer(); return Response.json({ success: false }); } return response; };
    await ui.click('Mark as Read'); check(noticeIds(ui), [], 'Uncorrelated acknowledgement hides previous inbox');
    okay(!has(ui, 'Read status confirmed from your saved inbox.'), 'False acknowledgement cannot claim a saved read'); check(ctx.writes().length, 1, 'Unconfirmed response is not automatically retried');
  });
  await scenario('Account change during feed prevents mixed private inbox', Inbox, async ctx => {
    ctx.after = async (path, method, response) => { if (path === '/api/notifications') ctx.actor = 'guardian-other'; return response; };
    const ui = ctx.mount(); await ui.flush(); check(noticeIds(ui), [], 'Post-feed account mismatch rejects old owner data');
    okay(!has(ui, privateBody), 'Mixed-owner feed body remains hidden'); check(ctx.writes().length, 0, 'Mixed-owner feed makes no mutation');
  });
  await scenario('Foreign owner payload is rejected', Inbox, async ctx => {
    ctx.after = async (path, method, response) => { if (path === '/api/notifications') { const rows = await response.json(); return Response.json(rows.map(row => ({ ...row, userId: 'guardian-other' }))); } return response; };
    const ui = ctx.mount(); await ui.flush(); check(noticeIds(ui), [], 'Foreign owner result is not rendered');
    okay(!has(ui, privateBody), 'Unconfirmed owner payload body is absent');
  });
  await scenario('Late former inbox reply cannot replace current account', Inbox, async ctx => {
    const ui = ctx.mount(); await ui.flush(); let release;
    ctx.after = async (path, method, response) => path === '/api/notifications' && ctx.actor === 'guardian-a' ? new Promise(resolve => { release = () => resolve(response); }) : response;
    ui.button('Reload my inbox').props.onClick(); await ui.flush(); okay(release, 'Actual former-owner feed reply is held');
    ctx.actor = 'guardian-other'; ui.button('Reload my inbox').props.onClick(); await ui.flush(); check(noticeIds(ui), ['notice-guardian-other'], 'Newer verified account feed is applied');
    ctx.after = null; release(); await ui.flush(); check(noticeIds(ui), ['notice-guardian-other'], 'Late former feed cannot overwrite current inbox');
    okay(!has(ui, privateBody), 'Late former notice body remains absent');
  });
  await scenario('Legacy stored invalid dates do not crash inbox or invent dates', Inbox, async ctx => {
    ctx.sqlite.prepare('UPDATE notifications SET created_at=?,read_at=? WHERE id=?').run('legacy-invalid-created', 'legacy-invalid-read', 'notice-guardian-a');
    const ui = ctx.mount(); await ui.flush(); check(noticeIds(ui), ['notice-guardian-a'], 'Legacy notice remains visible to its current owner');
    okay(has(ui, 'Stored date requires review: legacy-invalid-created'), 'Invalid saved creation date is disclosed as stored evidence');
    okay(has(ui, 'Stored date requires review: legacy-invalid-read'), 'Invalid saved read timestamp is disclosed without a fabricated value');
    check(ui.all(node => node.type === 'time').length, 0, 'Invalid legacy date never becomes a valid time element'); check(ctx.writes().length, 0, 'Viewing legacy dates changes no stored evidence');
  });
  await scenario('Exact legacy notice identifiers are URL encoded', Inbox, async ctx => {
    const id = 'legacy-notice&foreign=id?/#'; ctx.sqlite.prepare('UPDATE notifications SET id=? WHERE id=?').run(id, 'notice-guardian-a');
    const ui = ctx.mount(); await ui.flush(); await ui.click('Mark as Read');
    check(new URLSearchParams(ctx.writes()[0].search).get('id'), id, 'Mutation query retains the exact original notice id');
    okay(ctx.sqlite.prepare('SELECT read_at FROM notifications WHERE id=?').get(id).read_at, 'The exact legacy notice receives its saved read timestamp');
    check(ctx.writes().length, 1, 'Encoded id sends one scoped marker');
  });
  for (const actor of ['admin-a', 'teacher-a', 'guardian-a', 'student-user-a']) await scenario('Current coherent class snapshot ' + actor, ClassDetail, async ctx => {
    const ui = ctx.mount(); await ui.flush(); check(profileIds(ui), ['student-a'], 'Current role sees its authorized class profile');
    okay(has(ui, privateSchedule), 'Authorized role sees current class metadata'); check(ctx.trace.map(row => row.path), ['/api/session', '/api/classes/class-a', '/api/session'], 'Class uses one coherent scoped payload and no child lookups');
    if (actor === 'admin-a' || actor === 'teacher-a') okay(ui.all(node => node.type === 'a').some(node => node.props.href === '/classes/class-a/attendance'), 'Staff retain class-specific reviewed attendance editor');
    else { okay(ui.all(node => node.type === 'a').some(node => node.props.href === '/attendance'), 'Family viewer uses existing scoped attendance summary'); check(ui.all(node => node.type === 'a' && node.props.href === '/classes/class-a/attendance').length, 0, 'Family viewer is not sent to a staff-only editor'); okay(has(ui, 'Choose class-a in the attendance class selector'), 'Family selector instruction names the current authorized class'); }
    check(ctx.writes().length, 0, 'Class view sends no writes');
  }, actor);
  await scenario('Different teaching class is unavailable rather than false empty roster', ClassDetail, async ctx => {
    const ui = ctx.mount(); await ui.flush(); check(profileIds(ui), [], 'Unassigned teacher receives no class profile');
    okay(!has(ui, privateSchedule), 'Unassigned teacher receives no private class schedule');
    okay(has(ui, 'This class is unavailable to your current account.'), 'Unavailable scope is an error, not an empty-enrolment claim');
    okay(!has(ui, 'No student profiles are available'), 'Denied class is not shown as a successful empty roster');
  }, 'teacher-other');
  await scenario('Class account change after scoped snapshot hides previous school data', ClassDetail, async ctx => {
    ctx.after = async (path, method, response) => { if (path === '/api/classes/class-a') ctx.actor = 'admin-b'; return response; };
    const ui = ctx.mount(); await ui.flush(); check(profileIds(ui), [], 'Changed school account cannot receive old class roster');
    okay(!has(ui, privateSchedule), 'Changed school account sees no original school schedule');
    check(ui.one(node => node.type === 'app-shell').props.principal, null, 'Mixed-account class does not retain old user navigation');
    okay(!has(ui, 'No students enrolled'), 'Mixed-account failure does not fabricate no-enrolment statement');
  }, 'admin-a');
  await scenario('Late disabled class account clears complete snapshot', ClassDetail, async ctx => {
    ctx.after = async (path, method, response) => { if (path === '/api/classes/class-a') ctx.sqlite.prepare('UPDATE users SET disabled_at=? WHERE id=?').run(stamp, 'guardian-a'); return response; };
    const ui = ctx.mount(); await ui.flush(); check(profileIds(ui), [], 'Post-snapshot revocation hides all profile data');
    okay(!has(ui, privateSchedule), 'Post-snapshot revocation hides class metadata'); okay(has(ui, 'Sign in again'), 'Revoked class access gives recovery instruction');
  });
  await scenario('Class refresh denial hides an already loaded private snapshot', ClassDetail, async ctx => {
    const ui = ctx.mount(); await ui.flush(); ctx.sqlite.prepare('DELETE FROM student_guardians WHERE student_id=? AND guardian_id=?').run('student-a', 'guardian-profile-a');
    await ui.click('Reload current class'); check(profileIds(ui), [], 'Removed current family link hides loaded roster on refresh');
    okay(!has(ui, privateSchedule), 'Removed family access hides prior schedule');
    okay(has(ui, 'This class is unavailable to your current account.'), 'Removed family access is reported honestly');
  });
  await scenario('Route change hides old class immediately and ignores late reply', ClassDetail, async ctx => {
    const ui = ctx.mount(); await ui.flush(); let release;
    ctx.after = async (path, method, response) => path === '/api/classes/class-a' ? new Promise(resolve => { release = () => resolve(response); }) : response;
    ui.button('Reload current class').props.onClick(); await ui.flush(); okay(release, 'Actual former class reply is held');
    ui.props = { params: Promise.resolve({ id: 'class-other' }) }; ui.render();
    check(profileIds(ui), [], 'New route props immediately hide previous class snapshot'); okay(!has(ui, privateSchedule), 'Previous schedule is hidden before route effect completes');
    await ui.flush(); check(profileIds(ui), ['student-other'], 'New current class receives its own coherent roster');
    ctx.after = null; release(); await ui.flush(); check(profileIds(ui), ['student-other'], 'Late former class reply cannot replace new route profile');
    okay(!has(ui, privateSchedule), 'Late previous schedule remains hidden');
  }, 'admin-a');
  await scenario('Wrong class payload id is rejected', ClassDetail, async ctx => {
    ctx.after = async (path, method, response) => { if (path === '/api/classes/class-a') { const saved = await response.json(); return Response.json({ ...saved, id: 'class-other' }); } return response; };
    const ui = ctx.mount(); await ui.flush(); check(profileIds(ui), [], 'Uncorrelated class snapshot is not rendered'); okay(!has(ui, privateSchedule), 'Uncorrelated class private metadata is absent');
  });
  await scenario('Available-profile empty state does not imply no enrolment', ClassDetail, async ctx => {
    ctx.sqlite.prepare('DELETE FROM enrolments WHERE class_id=?').run('class-a'); const ui = ctx.mount(); await ui.flush();
    check(profileIds(ui), [], 'Verified class without available profiles is empty');
    okay(has(ui, 'No student profiles are available in this class for your current account.'), 'Scoped empty view is explicit');
    okay(has(ui, 'It does not imply that unavailable students have no enrolment.'), 'Availability is distinguished from enrollment absence');
    okay(!has(ui, 'No students enrolled in this class.'), 'False global no-enrolment assertion is absent');
  }, 'admin-a');
  await scenario('Legacy duplicate roster profiles are disclosed without changing membership evidence', ClassDetail, async ctx => {
    ctx.sqlite.prepare('INSERT INTO enrolments (id,student_id,class_id,status,enrolled_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run('legacy-extra-class-pair', 'student-a', 'class-a', 'active', stamp, stamp, stamp);
    const before = ctx.sqlite.prepare('SELECT * FROM enrolments ORDER BY id').all(), ui = ctx.mount(); await ui.flush();
    check(profileIds(ui), ['student-a'], 'Each available profile is rendered once');
    okay(has(ui, '1 repeated profile entries'), 'Repeated snapshot evidence is disclosed');
    check(ctx.sqlite.prepare('SELECT * FROM enrolments ORDER BY id').all(), before, 'Viewing duplicate evidence preserves every legacy enrolment field');
    check(ctx.writes().length, 0, 'Deduplicated presentation performs no repair');
  }, 'admin-a', { beforeMigration: '0009_academic_integrity.sql' });
  for (const Component of [Inbox, ClassDetail]) await scenario('Unmount ignores pending private reply ' + (Component === Inbox ? 'inbox' : 'class'), Component, async ctx => {
    let release; ctx.after = async (path, method, response) => path === (Component === Inbox ? '/api/notifications' : '/api/classes/class-a') ? new Promise(resolve => { release = () => resolve(response); }) : response;
    const ui = ctx.mount(); await ui.flush(); okay(release, 'Actual private reply is held');
    const before = ui.cells.filter(cell => Object.hasOwn(cell ?? {}, 'value')).map(cell => cell.value); ui.dispose(); ctx.after = null; release(); await settle();
    check(ui.cells.filter(cell => Object.hasOwn(cell ?? {}, 'value')).map(cell => cell.value), before, 'Unmounted view never applies the late private reply'); check(ctx.writes().length, 0, 'Unmounted reads never mutate records');
  });
  await scenario('Unmounted marker acknowledgement cannot start a private refresh', Inbox, async ctx => {
    const ui = ctx.mount(); await ui.flush(); let release;
    ctx.after = async (path, method, response) => method === 'PATCH' ? new Promise(resolve => { release = () => resolve(response); }) : response;
    ui.button('Mark as Read').props.onClick(); await ui.flush(); okay(release, 'Actual committed marker acknowledgement is held');
    const before = ui.cells.filter(cell => Object.hasOwn(cell ?? {}, 'value')).map(cell => cell.value), count = ctx.trace.length;
    ui.dispose(); ctx.after = null; release(); await settle();
    check(ctx.trace.length, count, 'Unmounted acknowledgement performs no additional inbox or session requests');
    check(ui.cells.filter(cell => Object.hasOwn(cell ?? {}, 'value')).map(cell => cell.value), before, 'Unmounted acknowledgement makes no client state changes');
    okay(ctx.sqlite.prepare('SELECT read_at FROM notifications WHERE id=?').get('notice-guardian-a').read_at, 'Already committed server read evidence is retained');
  });
  await scenario('Empty non-null legacy read evidence is disclosed without an unread action', Inbox, async ctx => {
    ctx.sqlite.prepare('UPDATE notifications SET read_at=? WHERE id=?').run('', 'notice-guardian-a');
    const before = ctx.sqlite.prepare('SELECT * FROM notifications WHERE id=?').get('notice-guardian-a'), ui = ctx.mount(); await ui.flush();
    check(noticeIds(ui), ['notice-guardian-a'], 'Empty legacy read evidence does not remove the current owned notice');
    okay(has(ui, 'Saved read time: Stored date requires review: '), 'Every non-null read value, including empty storage, is disclosed for review');
    check(ui.all(node => node.type === 'button' && text(node) === 'Mark as Read').length, 0, 'Empty saved read evidence is not presented as an unread marker action');
    okay(!has(ui, 'Unread'), 'Only null or missing read state is labelled unread');
    check(ctx.writes().length, 0, 'Viewing empty legacy evidence performs no attempted repair or marker');
    check(ctx.sqlite.prepare('SELECT * FROM notifications WHERE id=?').get('notice-guardian-a'), before, 'Exact invalid stored evidence and all original notice fields remain unchanged');
  });
  await scenario('Existing saved read time is displayed without rewriting', Inbox, async ctx => {
    const savedRead = '2020-01-02T03:04:05.000Z'; ctx.sqlite.prepare('UPDATE notifications SET read_at=?,updated_at=? WHERE id=?').run(savedRead, savedRead, 'notice-guardian-a');
    const ui = ctx.mount(); await ui.flush(); check(ui.all(node => node.type === 'time').map(node => node.props.dateTime), [stamp, savedRead], 'Existing old read timestamp is displayed exactly from storage');
    check(ui.all(node => node.type === 'button' && text(node) === 'Mark as Read').length, 0, 'Already-read notice has no new marker action');
    check(ctx.writes().length, 0, 'Viewing stored read time never refreshes its saved value');
  });
  await scenario('All stored channels remain unchanged without external delivery', Inbox, async ctx => {
    for (const channel of ['email', 'sms']) ctx.sqlite.prepare('INSERT INTO notifications (id,user_id,channel,title,body,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run('saved-' + channel, 'guardian-a', channel, 'Synthetic saved ' + channel + ' record', 'Synthetic channel record only', stamp, stamp);
    const before = ctx.sqlite.prepare('SELECT * FROM notifications ORDER BY id').all(), ui = ctx.mount(); await ui.flush();
    check(noticeIds(ui).sort(), ['notice-guardian-a', 'saved-email', 'saved-sms'], 'All existing owned channel records stay available');
    check(ctx.sqlite.prepare('SELECT * FROM notifications ORDER BY id').all(), before, 'Viewing channel records preserves exact stored evidence');
    check(ctx.writes().length, 0, 'Inbox does not send, recreate or activate any channel');
  });
  await scenario('Same user changed school before marking cannot use old scope', Inbox, async ctx => {
    const ui = ctx.mount(); await ui.flush(); ctx.sqlite.prepare('UPDATE users SET school_id=? WHERE id=?').run('b', 'guardian-a');
    await ui.click('Mark as Read'); check(ctx.writes().length, 0, 'Same identity in another school fails original-scope preflight');
    okay(!has(ui, privateBody), 'Changed-school original inbox is hidden');
    check(ctx.sqlite.prepare('SELECT read_at FROM notifications WHERE id=?').get('notice-guardian-a').read_at, null, 'Changed-scope marker never updates original record');
  });
  await scenario('Account change after marker cannot fabricate confirmed status', Inbox, async ctx => {
    const ui = ctx.mount(); await ui.flush(); ctx.after = async (path, method, response) => { if (method === 'PATCH') ctx.actor = 'guardian-other'; return response; };
    await ui.click('Mark as Read'); check(noticeIds(ui), [], 'Post-marker different account does not display either inbox as confirmation');
    okay(!has(ui, 'Read status confirmed from your saved inbox.'), 'Different account cannot confirm original marker');
    okay(!has(ui, privateBody), 'Original private notice body is absent after account transition');
    check(ctx.writes().length, 1, 'Post-marker account change causes no automatic retry');
  });
  await scenario('Malformed successful feed does not restore prior inbox', Inbox, async ctx => {
    const ui = ctx.mount(); await ui.flush(); ctx.after = async (path, method, response) => { if (path === '/api/notifications') { await response.arrayBuffer(); return new Response('{', { status: 200 }); } return response; };
    await ui.click('Reload my inbox'); check(noticeIds(ui), [], 'Malformed current feed hides prior articles');
    okay(!has(ui, privateBody), 'Malformed response does not retain previous private body');
    okay(has(ui, 'could not be verified'), 'Malformed response is an error rather than a successful empty inbox');
  });
  await scenario('Malformed successful class payload is not a false empty roster', ClassDetail, async ctx => {
    ctx.after = async (path, method, response) => { if (path === '/api/classes/class-a') { await response.arrayBuffer(); return new Response('{', { status: 200 }); } return response; };
    const ui = ctx.mount(); await ui.flush(); check(profileIds(ui), [], 'Malformed class response shows no profile');
    okay(!has(ui, privateSchedule), 'Malformed class response shows no metadata');
    okay(has(ui, 'could not be verified'), 'Malformed class response has an honest recovery error');
    okay(!has(ui, 'No student profiles are available'), 'Malformed data is not claimed as a verified empty class');
  });
  await scenario('Cross-school embedded profile makes the class snapshot unavailable', ClassDetail, async ctx => {
    ctx.after = async (path, method, response) => { if (path === '/api/classes/class-a') { const saved = await response.json(); return Response.json({ ...saved, enrolledStudents: saved.enrolledStudents.map(profile => ({ ...profile, schoolId: 'b' })) }); } return response; };
    const ui = ctx.mount(); await ui.flush(); check(profileIds(ui), [], 'Unconfirmed cross-school embedded profile is rejected');
    okay(!has(ui, privateSchedule), 'Unconfirmed roster rejects the whole associated class snapshot');
    okay(has(ui, 'could not be verified'), 'Invalid embedded scope gives a clear reload error');
  });
  await scenario('Legacy class timestamps remain visible evidence without crashing', ClassDetail, async ctx => {
    ctx.sqlite.prepare('UPDATE classes SET created_at=?,updated_at=? WHERE id=?').run('legacy-created-value', 'legacy-updated-value', 'class-a');
    const before = ctx.sqlite.prepare('SELECT * FROM classes WHERE id=?').get('class-a'), ui = ctx.mount(); await ui.flush();
    check(profileIds(ui), ['student-a'], 'Invalid stored class dates do not remove authorized profiles');
    okay(has(ui, 'Stored date requires review: legacy-created-value') && has(ui, 'Stored date requires review: legacy-updated-value'), 'Both invalid stored timestamps are disclosed');
    check(ctx.sqlite.prepare('SELECT * FROM classes WHERE id=?').get('class-a'), before, 'Viewing invalid timestamps never repairs or replaces stored evidence');
  });
  const invalidStoredTimes = [
    ['impossible day', '2026-02-30T12:00:00.000Z'],
    ['non-leap February day', '2026-02-29T12:00:00.000Z'],
    ['ambiguous numeric literal', '0'],
    ['normalized next-day hour', '2026-10-05T24:00:00.000Z'],
    ['missing stored millisecond precision', '2026-10-05T12:00:00Z'],
    ['equivalent noncanonical offset', '2026-10-05T12:00:00.000+00:00'],
    ['calendar day without stored time', '2026-10-05'],
    ['surrounding whitespace', ' 2026-10-05T12:00:00.000Z '],
  ];
  for (const [label, stored] of invalidStoredTimes) await scenario('Inbox discloses exact ' + label, Inbox, async ctx => {
    ctx.sqlite.prepare('UPDATE notifications SET created_at=?,read_at=? WHERE id=?').run(stored, stored, 'notice-guardian-a');
    const before = ctx.sqlite.prepare('SELECT * FROM notifications WHERE id=?').get('notice-guardian-a'), ui = ctx.mount(); await ui.flush();
    check(noticeIds(ui), ['notice-guardian-a'], 'Malformed timestamps preserve the currently owned notice');
    check(ui.all(node => node.type === 'span' && text(node) === 'Stored date requires review: ' + stored).length, 2, 'Both original noncanonical timestamp literals appear verbatim as review warnings');
    check(ui.all(node => node.type === 'time').length, 0, 'Malformed timestamp evidence is never rendered as a normalized instant');
    check(ui.all(node => node.type === 'button' && text(node) === 'Mark as Read').length, 0, 'Non-null malformed saved read evidence has no unread action');
    okay(!has(ui, 'Unread'), 'Non-null malformed read evidence is never labelled unread');
    check(ctx.writes().length, 0, 'Displaying malformed timestamp evidence never repairs or marks it');
    check(ctx.sqlite.prepare('SELECT * FROM notifications WHERE id=?').get('notice-guardian-a'), before, 'Every original notice field remains unchanged');
  });
  for (let index = 0; index < invalidStoredTimes.length; index += 2) await scenario('Class preserves exact malformed timestamp pair ' + index, ClassDetail, async ctx => {
    const created = invalidStoredTimes[index][1], updated = invalidStoredTimes[index + 1][1];
    ctx.sqlite.prepare('UPDATE classes SET created_at=?,updated_at=? WHERE id=?').run(created, updated, 'class-a');
    const before = ctx.sqlite.prepare('SELECT * FROM classes WHERE id=?').get('class-a'), ui = ctx.mount(); await ui.flush();
    check(profileIds(ui), ['student-a'], 'Malformed class dates preserve authorized learner availability');
    okay(ui.all(node => node.type === 'span').some(node => text(node) === 'Stored date requires review: ' + created) && ui.all(node => node.type === 'span').some(node => text(node) === 'Stored date requires review: ' + updated), 'Both original malformed class timestamps appear verbatim');
    check(ui.all(node => node.type === 'time').length, 0, 'Class dates never silently normalize malformed stored literals');
    check(ctx.writes().length, 0, 'Malformed class evidence triggers no write');
    check(ctx.sqlite.prepare('SELECT * FROM classes WHERE id=?').get('class-a'), before, 'All original class fields remain unchanged');
  });
  const validStoredTimes = ['2000-02-29T23:59:59.999Z', '2024-02-29T00:00:00.000Z', '2026-10-05T12:34:56.123Z'];
  for (const stored of validStoredTimes) {
    await scenario('Canonical inbox timestamp remains an exact instant ' + stored, Inbox, async ctx => {
      ctx.sqlite.prepare('UPDATE notifications SET created_at=?,read_at=? WHERE id=?').run(stored, stored, 'notice-guardian-a');
      const before = ctx.sqlite.prepare('SELECT * FROM notifications WHERE id=?').get('notice-guardian-a'), ui = ctx.mount(); await ui.flush();
      check(ui.all(node => node.type === 'time').map(node => node.props.dateTime), [stored, stored], 'Valid leap and millisecond timestamps retain their exact machine-readable stored instants');
      okay(!has(ui, 'Stored date requires review:'), 'Valid canonical stored instants need no malformed-evidence warning');
      check(ctx.writes().length, 0, 'Valid stored dates are displayed without writes');
      check(ctx.sqlite.prepare('SELECT * FROM notifications WHERE id=?').get('notice-guardian-a'), before, 'Valid saved notice evidence remains unchanged');
    });
    await scenario('Canonical class timestamp remains an exact instant ' + stored, ClassDetail, async ctx => {
      ctx.sqlite.prepare('UPDATE classes SET created_at=?,updated_at=? WHERE id=?').run(stored, stored, 'class-a');
      const before = ctx.sqlite.prepare('SELECT * FROM classes WHERE id=?').get('class-a'), ui = ctx.mount(); await ui.flush();
      check(ui.all(node => node.type === 'time').map(node => node.props.dateTime), [stored, stored], 'Valid class timestamps preserve exact stored instants including leap days and milliseconds');
      okay(!has(ui, 'Stored date requires review:'), 'Valid class timestamps display normally');
      check(ctx.sqlite.prepare('SELECT * FROM classes WHERE id=?').get('class-a'), before, 'Valid class evidence is never rewritten by viewing');
    });
  }
  await scenario('Normalized legacy saved read time cannot confirm an acknowledged marker', Inbox, async ctx => {
    const ui = ctx.mount(); await ui.flush(); const stored = '2026-02-30T12:00:00.000Z';
    ctx.after = async (path, method, response) => {
      if (method === 'PATCH') ctx.sqlite.prepare('UPDATE notifications SET read_at=? WHERE id=?').run(stored, 'notice-guardian-a');
      return response;
    };
    await ui.click('Mark as Read'); check(ctx.writes().length, 1, 'Only the requested actual marker was attempted');
    check(noticeIds(ui), [], 'Malformed saved timestamp leaves acknowledged marker confirmation unavailable');
    okay(!has(ui, 'Read status confirmed from your saved inbox.'), 'Normalized legacy timestamp cannot fabricate a confirmed saved read status');
    check(ctx.sqlite.prepare('SELECT read_at FROM notifications WHERE id=?').get('notice-guardian-a').read_at, stored, 'Unconfirmed original saved literal remains unchanged');
    ctx.after = null; await ui.click('Reload my inbox');
    okay(has(ui, 'Saved read time: Stored date requires review: ' + stored), 'Fresh original-account reload discloses exact legacy read evidence for review');
    okay(has(ui, 'Original notice:'), 'Original idempotent marker remains explicitly recoverable without losing its notice identity');
    check(ctx.writes().length, 1, 'Reload with malformed evidence never automatically retries or repairs it');
  });
  await scenario('Inbox pages newest first through actual route cursors with honest counts and a current-page hide-read filter', Inbox, async ctx => {
    const insert = ctx.sqlite.prepare('INSERT INTO notifications (id,user_id,channel,title,body,created_at,updated_at) VALUES (?,?,?,?,?,?,?)');
    for (let index = 1; index <= 29; index++) { const at = `2026-10-06T00:${String(index).padStart(2, '0')}:00.000Z`; insert.run('paged-' + String(index).padStart(2, '0'), 'guardian-a', 'in_app', 'Paged ' + index, 'Synthetic paged body', at, at); }
    const ui = ctx.mount(); await ui.flush(); let ids = noticeIds(ui);
    check([ids.length, ids[0], ids.at(-1)], [25, 'paged-29', 'paged-05'], 'The first page is the 25 newest notices');
    okay(has(ui, '30 unread of 30 notices.'), 'Counts come from the whole owned inbox, not the page');
    okay(ui.button('Newer notices').props.disabled, 'There is no newer page from the first page'); okay(!ui.button('Older notices').props.disabled, 'An older page is offered');
    await ui.click('Older notices'); ids = noticeIds(ui);
    check(ids, ['paged-04', 'paged-03', 'paged-02', 'paged-01', 'notice-guardian-a'], 'The older page continues exactly where the first ended');
    const feeds = ctx.trace.filter(row => row.path === '/api/notifications' && row.method === 'GET').map(row => row.search);
    check([feeds[0], feeds[1].startsWith('?cursor=')], ['', true], 'The older page used the server-issued cursor');
    okay(ui.button('Older notices').props.disabled && !ui.button('Newer notices').props.disabled, 'The last page offers only newer notices');
    await ui.click('Newer notices'); check(noticeIds(ui).length, 25, 'Newer returns to the first page');
    ui.all(node => node.type === 'button' && text(node) === 'Mark as Read')[0].props.onClick(); await ui.flush();
    okay(has(ui, '29 unread of 30 notices.'), 'A confirmed read moves the unread count and keeps the page');
    ui.one(node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } }); await ui.flush();
    check(noticeIds(ui).length, 24, 'Hiding read notices removes only the read notice from the current page');
    check(ctx.writes().length, 1, 'Paging and filtering sent no write other than the requested marker');
  });
  check(externalRequests, 0, 'All family-view callback requests remained synthetic and offline');
  console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0, scenarios, requests, externalRequests, evidence: 'Substituted client callbacks with actual synthetic sessions, routes and production D1 SQL; mounted browser separate.' }));
} finally { globalThis.fetch = originalFetch; globalThis.window = originalWindow; delete globalThis.__sahaFamilyContractReact; delete globalThis.__sahaFamilyStoredTimestamp; }
