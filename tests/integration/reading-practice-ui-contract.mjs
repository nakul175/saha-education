// Independent client callback contracts using actual synthetic sessions, routes
// and production Drizzle D1 statements over SQLite. Hooks/elements are substituted;
// this is not mounted-browser, educator acceptance or hosted execution evidence.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate as turn } from 'node:timers/promises';
import ts from 'typescript';
import { drizzle } from 'drizzle-orm/d1';
import { freshDatabase, seedSecurityData, load, bindings, root } from '../support/security-db.mjs';
import { serverWork, settleQuiet } from '../support/quiescence.mjs';
const origin = 'https://education.example.invalid'; bindings.SAHA_ALLOWED_ORIGINS = origin;
const routes = { classes: await load('app/api/classes/route.ts'), session: await load('app/api/session/route.ts'), reading: await load('app/api/reading-checks/route.ts'), review: await load('app/api/reading-review/route.ts'), corrections: await load('app/api/reading-checks/[id]/corrections/route.ts'), curriculum: await load('app/api/curriculum/route.ts'), curriculumDetail: await load('app/api/curriculum/[id]/route.ts'), versions: await load('app/api/curriculum/[id]/versions/route.ts'), approve: await load('app/api/curriculum/[id]/approve/route.ts'), snapshot: await load('app/api/curriculum/[id]/snapshot/route.ts'), draft: await load('app/api/curriculum/[id]/draft/route.ts'), resource: await load('app/api/resources/[id]/route.ts'), resourceApprove: await load('app/api/resources/[id]/approve/route.ts') };
const sessions = await load('lib/education/session.ts');
let activeUI, checks = 0, scenarios = 0, requests = 0, externalRequests = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const okay = (value, message) => { assert.ok(value, message); checks++; };
const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value, ...nodes(value.props?.children)] : [];
const text = value => Array.isArray(value) ? value.map(text).join('') : value && typeof value === 'object' ? text(value.props?.children) : value == null || typeof value === 'boolean' ? '' : String(value);
const originalFetch = globalThis.fetch, originalWindow = globalThis.window;
globalThis.window = { location: { origin, assign() { throw new Error('Practice callback contracts preserve the mounted reminder.'); } } };
globalThis.__sahaReadingPracticeContractReact = {
  createElement(type, props, ...children) { return { type, props: { ...props, children: children.length === 1 ? children[0] : children } }; },
  useState(initial) { const ui = activeUI, index = ui.index++; if (!ui.cells[index]) ui.cells[index] = { value: typeof initial === 'function' ? initial() : initial }; return [ui.cells[index].value, value => { ui.cells[index].value = typeof value === 'function' ? value(ui.cells[index].value) : value; }]; },
  useRef(initial) { const ui = activeUI, index = ui.index++; if (!ui.cells[index]) ui.cells[index] = { current: initial }; return ui.cells[index]; },
  useCallback(callback, deps) { const ui = activeUI, index = ui.index++, old = ui.cells[index]; if (!old || deps.some((value, index) => value !== old.deps[index])) ui.cells[index] = { callback, deps }; return ui.cells[index].callback; },
  useEffect(callback, deps) { const ui = activeUI, index = ui.index++, old = ui.cells[index]; if (!old || deps.some((value, index) => value !== old.deps[index])) { old?.cleanup?.(); ui.cells[index] = { deps }; ui.effects.push(() => { ui.cells[index].cleanup = callback(); }); } },
};
async function component(path) {
  const source = readFileSync(root + path, 'utf8'), compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } }).outputText;
  const prefix = 'const React=globalThis.__sahaReadingPracticeContractReact;const {useState,useRef,useEffect,useCallback}=React;const Button="button",Label="label",Card="section",CardContent="div",CardDescription="p",CardHeader="header",CardTitle="h2",Badge="span",Input="input",Textarea="textarea";\n';
  return (await import('data:text/javascript;base64,' + Buffer.from(prefix + compiled.replace(/^import[^\n]*;\n/gm, '') + '\n//# sourceURL=saha-practice-client-' + path.replaceAll('/', '-')).toString('base64'))).default;
}
const Planner = await component('app/reading-practice/page.tsx');
const settle = () => settleQuiet();
function driver(Component) {
  const ui = { cells: [], index: 0, effects: [], tree: null,
    render() { activeUI = ui; ui.index = 0; ui.effects = []; ui.tree = Component(); for (const effect of ui.effects) effect(); },
    all(predicate) { return nodes(ui.tree).filter(predicate); },
    one(predicate) { const found = ui.all(predicate); assert.equal(found.length, 1, 'Exactly one practice control'); return found[0]; },
    button(label) { return ui.one(node => node.type === 'button' && text(node) === label); },
    async flush() { await settle(); ui.render(); await settle(); ui.render(); },
    async change(id, value) { const node = ui.one(node => node.props.id === id && ['select', 'input', 'textarea'].includes(node.type)); okay(!node.props.disabled, 'Requested practice field is enabled'); node.props.onChange({ target: { value, checked: value } }); await ui.flush(); },
    async click(label) { const node = ui.button(label); okay(!node.props.disabled, 'Requested practice action is enabled'); node.props.onClick(); await ui.flush(); },
    dispose() { for (const cell of ui.cells) cell?.cleanup?.(); },
  }; ui.render(); return ui;
}
const has = (ui, value) => text(ui.tree).includes(value);
const protectedText = ui => text(ui.tree) + ui.all(node => ['input','textarea','select'].includes(node.type)).map(node => node.props.value ?? '').join('');
const content = { title: 'Synthetic reviewed literacy source', curriculum: 'Synthetic curriculum', gradeLevel: '8', subject: 'Literacy', language: 'en-IN', objectives: 'Practice reading carefully.', body: 'Original synthetic teacher activity: compare the words cat and cap.', rightsStatement: 'Original synthetic content; permitted for this isolated test school.', sourceReference: 'SYNTHETIC-PRACTICE-1', sourceUrl: null };
const focus = 'Private synthetic teacher focus: deliberate paired-word practice';
const readingInput = { classId: 'class-a', studentId: 'student-a', language: 'en-IN', readingDate: '2026-01-01', passageReference: 'PRIVATE-SYNTHETIC-READING-TASK', durationSeconds: 60, wordsAttempted: 100, wordsCorrect: 91, clientCheckId: '1ee636d9-a37b-46f3-8d7a-bf48afee4249' };
async function plan(ui, ctx, reviewed = true) { await ui.change('practice-reading', readingInput.clientCheckId); await ui.change('practice-focus', focus); await ui.change('practice-reference', ctx.reference.id); if (reviewed) await ui.change('practice-reviewed', true); }
async function scenario(name, action, actor = 'teacher-a') {
  const fixture = freshDatabase(); await seedSecurityData(fixture.db, fixture.schema); const { sqlite, schema } = fixture;
  function prepare(query, values = []) { return { bind(...params) { return prepare(query, params); }, async raw() { const statement = sqlite.prepare(query); statement.setReturnArrays(true); return statement.all(...values); }, async all() { return { success: true, results: sqlite.prepare(query).all(...values), meta: {} }; }, async run() { const statement = sqlite.prepare(query); if (statement.columns().length) return { success: true, results: statement.all(...values), meta: {} }; const result = statement.run(...values); return { success: true, results: [], meta: { changes: Number(result.changes) } }; } }; }
  globalThis.__sahaTestDb = drizzle({ prepare, async batch(statements) { sqlite.exec('BEGIN'); try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec('COMMIT'); return result; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } }, { schema });
  const cookies = {}; for (const id of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'guardian-a', 'student-user-a']) cookies[id] = (await sessions.createSession(id)).split(';')[0];
  const context = { sqlite, actor, trace: [], before: null, after: null, uis: [], async renew(id = context.actor) { cookies[id] = (await sessions.createSession(id)).split(';')[0]; }, count(table) { return sqlite.prepare('SELECT count(*) n FROM ' + table).get().n; }, writes() { return context.trace.filter(row => row.method !== 'GET'); }, mount() { const ui = driver(Planner); context.uis.push(ui); return ui; } };
  globalThis.fetch = async (path, init = {}) => {
    const url = new URL(path, origin); if (url.origin !== origin) { externalRequests++; throw new Error('Practice contracts stay offline.'); }
    const method = init.method ?? 'GET'; context.before?.(url.pathname, method, url);
    const request = new Request(url, { ...init, headers: { ...init.headers, origin, cookie: cookies[context.actor] ?? '' } });
    let route, parameters;
    if (url.pathname === '/api/classes') route = routes.classes;
    else if (url.pathname === '/api/session') route = routes.session;
    else if (url.pathname === '/api/reading-checks') route = routes.reading;
    else if (url.pathname === '/api/reading-review') route = routes.review;
    else if (url.pathname === '/api/curriculum') route = routes.curriculum;
    else {
      const match = /^\/api\/curriculum\/([^/]+)(?:\/(versions|approve|snapshot|draft))?$/.exec(url.pathname);
      if (match) { route = routes[match[2] ?? 'curriculumDetail']; parameters = { params: Promise.resolve({ id: decodeURIComponent(match[1]) }) }; }
      else if (url.pathname.startsWith('/api/reading-checks/')) { route = routes.corrections; parameters = { params: Promise.resolve({ id: url.pathname.split('/')[3] }) }; }
      else if (url.pathname.startsWith('/api/resources/')) { const parts = url.pathname.split('/'); route = parts[4] === 'approve' ? routes.resourceApprove : routes.resource; parameters = { params: Promise.resolve({ id: parts[3] }) }; }
      else throw new Error('Unexpected practice route ' + url.pathname);
    }
    requests++; const response = await serverWork(() => route[method](request, parameters));
    context.trace.push({ path: url.pathname, search: url.search, method, status: response.status, body: init.body, actor: context.actor });
    return context.after ? await context.after(url.pathname, method, response, url, init) : response;
  };
  context.api = async (path, method = 'GET', payload, user = context.actor) => { const old = context.actor; context.actor = user; try { return await fetch(path, { method, ...(payload === undefined ? {} : { headers: { 'Content-Type':'application/json' }, body: typeof payload === 'string' ? payload : JSON.stringify(payload) }) }); } finally { context.actor = old; } };
  context.copyWrites = () => context.trace.filter(row => row.path.endsWith('/draft') && row.method === 'POST');
  context.reading = await (await context.api('/api/reading-checks', 'POST', readingInput, 'teacher-a')).json();
  context.reference = await (await context.api('/api/curriculum', 'POST', { content, clientReferenceId: 'd1c9a50f-20c6-4e8c-aa92-3dc670f773e2' }, 'teacher-a')).json();
  context.version = await (await context.api('/api/curriculum/' + context.reference.id + '/approve', 'POST', { versionId: context.reference.latest.id, confirmReview: true }, 'teacher-a')).json();
  context.trace = [];
  try { await action(context); scenarios++; }
  catch (error) { error.message = name + ': ' + error.message; throw error; }
  finally { for (const ui of context.uis) ui.dispose(); await settle(); sqlite.close(); }
}
try {
  for (const actor of ['teacher-a', 'admin-a']) await scenario('Current staff choices ' + actor, async ctx => {
    const ui = ctx.mount(); await ui.flush();
    okay(has(ui, content.title), 'Authorized reviewed curriculum is available');
    okay(has(ui, readingInput.passageReference), 'Authorized reading is available');
    okay(has(ui, 'no validated screening'), 'Manual educational boundary is explicit');
    check(ctx.copyWrites().length, 0, 'Reading the planner never creates a resource');
    check(has(ui, 'student-b'), false, 'Cross-school reading identities are absent');
  }, actor);
  for (const actor of ['guardian-a', 'student-user-a', 'admin-b']) await scenario('Private choices exclude ' + actor, async ctx => {
    const ui = ctx.mount(); await ui.flush();
    check(has(ui, readingInput.passageReference), false, 'Unrelated or family account cannot see staff evidence');
    check(has(ui, content.body), false, 'Unrelated or family account cannot see staff source content');
    check(ctx.copyWrites().length, 0, 'Unrelated or family account sends no copy');
  }, actor);
  await scenario('Reviewed effective reading and private focus create an original unassigned draft', async ctx => {
    const corrected = await ctx.api('/api/reading-checks/' + ctx.reading.id + '/corrections', 'POST', { clientCorrectionId: crypto.randomUUID(), expectedRevision: 0, confirmReviewed: true, reason: 'Synthetic reviewed count correction.', ...readingInput, wordsCorrect: 88, clientCheckId: undefined, classId: undefined, studentId: undefined });
    check(corrected.status, 201, 'Actual correction handler commits revised evidence'); await corrected.arrayBuffer();
    const ui = ctx.mount(); await ui.flush(); await plan(ui, ctx);
    okay(has(ui, '88 correct of 100'), 'Planner displays current corrected values');
    okay(has(ui, 'Reviewed correction revision 1'), 'Effective revision is disclosed');
    okay(has(ui, content.rightsStatement), 'Exact source declared rights are shown');
    check(ui.one(node => node.props.id === 'practice-focus').props.value, focus, 'Manual private focus survives source selection');
    await ui.click('Create provisional practice draft');
    check(ctx.copyWrites().length, 1, 'Explicit review creates exactly one copy');
    const request = JSON.parse(ctx.copyWrites()[0].body);
    check(Object.keys(request).sort(), ['clientResourceId', 'type', 'versionId'], 'Only existing copy fields leave the planner');
    check(request.versionId, ctx.version.id, 'Request pins exact reviewed source');
    check(request.type, 'activity', 'Selected resource format is explicit');
    const stored = ctx.sqlite.prepare('SELECT * FROM resource_versions WHERE resource_id=?').get(request.clientResourceId);
    check(stored.body, content.body, 'Copied body contains only existing source text');
    check(stored.teacher_notes, '', 'Private focus is never inserted into teacher notes');
    check(stored.answer_key, '', 'Copy never fabricates an answer key');
    check(stored.approved_at, null, 'New resource still needs review');
    check(ctx.count('resource_assignments'), 0, 'Copy never assigns to learners or classes');
    check(JSON.stringify(stored).includes(readingInput.passageReference), false, 'Private reading provenance is absent from resource content');
    check(JSON.stringify(stored).includes(focus), false, 'Private planning focus is absent from persistent copy');
    okay(has(ui, 'Original copied draft receipt'), 'Original copy receipt is shown separately');
    okay(ui.all(node => node.type === 'a' && node.props.href === '/resources/' + request.clientResourceId).length, 'Confirmed receipt links to existing editor');
  });
  await scenario('Changed manual focus or format requires a new suitability review', async ctx => {
    const ui = ctx.mount(); await ui.flush(); await plan(ui, ctx);
    await ui.change('practice-focus', focus + ' revised');
    check(ui.one(node => node.props.id === 'practice-reviewed').props.checked, false, 'Changing focus clears explicit confirmation');
    check(ui.button('Create provisional practice draft').props.disabled, true, 'Unreviewed changed focus cannot copy');
    await ui.change('practice-reviewed', true); await ui.change('practice-type', 'worksheet');
    check(ui.one(node => node.props.id === 'practice-reviewed').props.checked, false, 'Changing draft format clears explicit confirmation');
    check(ctx.copyWrites().length, 0, 'Changing controls never submits automatically');
  });
  await scenario('Unreviewed curriculum cannot be copied', async ctx => {
    const response = await ctx.api('/api/curriculum', 'POST', { content: { ...content, title: 'Synthetic private unapproved source' }, clientReferenceId: crypto.randomUUID() });
    check(response.status, 201, 'Actual handler creates an unreviewed reference'); const reference = await response.json();
    const ui = ctx.mount(); await ui.flush(); await ui.change('practice-reading', ctx.reading.id); await ui.change('practice-focus', focus); await ui.change('practice-reference', reference.id);
    okay(has(ui, 'no reviewed version'), 'Lack of reviewed source is disclosed');
    check(ui.button('Create provisional practice draft').props.disabled, true, 'Private source does not authorize copying');
    check(ctx.copyWrites().length, 0, 'Unreviewed selection makes no copy');
  });
  await scenario('Language mismatch is manual suitability disclosure', async ctx => {
    const response = await ctx.api('/api/curriculum', 'POST', { content: { ...content, title: 'Synthetic Hindi practice source', language: 'hi-IN' }, clientReferenceId: crypto.randomUUID() });
    const reference = await response.json(); const reviewed = await ctx.api('/api/curriculum/' + reference.id + '/approve', 'POST', { versionId: reference.latest.id, confirmReview: true }); await reviewed.arrayBuffer();
    const ui = ctx.mount(); await ui.flush(); await ui.change('practice-reading', ctx.reading.id); await ui.change('practice-focus', focus); await ui.change('practice-reference', reference.id);
    okay(has(ui, 'language tags differ'), 'Different recorded languages are disclosed');
    okay(has(ui, 'does not establish cross-language equivalence'), 'No language-comparability claim is invented');
    check(ui.button('Create provisional practice draft').props.disabled, true, 'Mismatch does not inherit an automatic review');
  });
  for (const failure of ['network', 'malformed', 'shape', 'wrong-source', 'wrong-actor', 'timestamp', 'unavailable']) await scenario('Committed uncertain reply retains exact recoverable request ' + failure, async ctx => {
    const ui = ctx.mount(); await ui.flush(); await plan(ui, ctx);
    let intercepted = false;
    ctx.after = async (path, method, response) => {
      if (path.endsWith('/draft') && method === 'POST' && !intercepted) {
        intercepted = true; check(response.status, 201, 'Real handler commits before delivery uncertainty');
        const value = await response.json();
        if (failure === 'network') throw new TypeError('Synthetic lost committed copy reply');
        if (failure === 'wrong-source') value.provenance.referenceVersionId = 'foreign-version';
        if (failure === 'wrong-actor') value.resource.authorId = 'teacher-other';
        if (failure === 'timestamp') value.provenance.createdAt = 'invalid';
        return new Response(failure === 'malformed' ? '{broken' : failure === 'shape' ? '{}' : JSON.stringify(value), { status: failure === 'unavailable' ? 503 : 201 });
      } return response;
    };
    await ui.click('Create provisional practice draft');
    check(ctx.count('teaching_resources'), 1, 'Unknown reply leaves one actual committed resource');
    check(has(ui, content.body), false, 'Unknown reply hides previously loaded private source');
    check(protectedText(ui).includes(focus), false, 'Unknown reply hides private focus values');
    check(has(ui, readingInput.passageReference), false, 'Unknown reply hides reading details and choices');
    check(ctx.copyWrites().length, 1, 'Unknown reply never causes automatic retry');
    const original = ctx.copyWrites()[0].body; ctx.after = null;
    await ui.click('Reload current planner');
    okay(has(ui, 'Original reviewed source'), 'Fresh original account can inspect pending original source');
    check(ui.one(node => node.props.id === 'practice-focus').props.value, focus, 'Private pending focus returns only after current original scope verification');
    await ui.click('Recover original draft');
    check(ctx.copyWrites().length, 2, 'Explicit recovery sends exactly one additional request');
    check(ctx.copyWrites()[1].body, original, 'Recovery preserves original bytes and UUID');
    check(ctx.count('teaching_resources'), 1, 'Idempotent recovery creates no duplicate');
    check(ctx.count('resource_reference_bindings'), 1, 'Recovery preserves one source binding');
    okay(has(ui, 'Original copied draft receipt'), 'Recovered original receipt is displayed');
  });
  await scenario('Changed current account before save sends no POST', async ctx => {
    const ui = ctx.mount(); await ui.flush(); await plan(ui, ctx); ctx.actor = 'guardian-a';
    await ui.click('Create provisional practice draft');
    check(ctx.copyWrites().length, 0, 'Fresh session mismatch prevents copy');
    check(has(ui, content.body), false, 'Preflight account mismatch hides private source');
    check(protectedText(ui).includes(focus), false, 'Preflight account mismatch hides private focus');
  });
  await scenario('Unknown original request stays private under another staff account', async ctx => {
    const ui = ctx.mount(); await ui.flush(); await plan(ui, ctx);
    ctx.after = async (path, method, response) => { if (path.endsWith('/draft') && method === 'POST') { await response.arrayBuffer(); throw new TypeError('Synthetic committed reply loss'); } return response; };
    await ui.click('Create provisional practice draft'); ctx.after = null; const original = ctx.copyWrites()[0].body;
    ctx.actor = 'admin-a'; await ui.click('Reload current planner');
    check(protectedText(ui).includes(focus), false, 'Other same-school staff cannot view original pending focus');
    check(has(ui, 'Original reviewed source:'), false, 'Other staff cannot view original pending submission summary');
    check(ui.all(node => node.type === 'button' && text(node) === 'Recover original draft').length, 0, 'Another staff account cannot recover original request');
    check(ctx.copyWrites().length, 1, 'Changing account sends no copy');
    ctx.actor = 'teacher-a'; await ui.click('Reload current planner'); await ui.click('Recover original draft');
    check(ctx.copyWrites()[1].body, original, 'Restored original staff recovers unchanged request');
    check(ctx.count('teaching_resources'), 1, 'Restored account creates no duplicate');
  });
  await scenario('Account changes after actual committed acknowledgement remain unconfirmed and private', async ctx => {
    const ui = ctx.mount(); await ui.flush(); await plan(ui, ctx);
    ctx.after = async (path, method, response) => { if (path.endsWith('/draft') && method === 'POST') ctx.actor = 'guardian-a'; return response; };
    await ui.click('Create provisional practice draft'); ctx.after = null;
    check(ctx.count('teaching_resources'), 1, 'Original staff copy committed once');
    check(has(ui, 'Original copied draft receipt'), false, 'Changed final account cannot see original receipt');
    check(has(ui, readingInput.passageReference), false, 'Changed final account cannot see original readings');
    ctx.actor = 'teacher-a'; await ui.click('Reload current planner'); await ui.click('Recover original draft');
    check(ctx.count('teaching_resources'), 1, 'Original current account recovers without duplicate');
  });
  await scenario('Revised reading before initial POST requires renewed planning', async ctx => {
    const ui = ctx.mount(); await ui.flush(); await plan(ui, ctx);
    const correction = await ctx.api('/api/reading-checks/' + ctx.reading.id + '/corrections', 'POST', { clientCorrectionId: crypto.randomUUID(), expectedRevision: 0, confirmReviewed: true, reason: 'Synthetic later reading correction.', language: readingInput.language, readingDate: readingInput.readingDate, passageReference: readingInput.passageReference, durationSeconds: 60, wordsAttempted: 100, wordsCorrect: 80 });
    check(correction.status, 201, 'Reading actually changed after planning review'); await correction.arrayBuffer();
    await ui.click('Create provisional practice draft');
    check(ctx.copyWrites().length, 0, 'Changed reading prevents initial stale-plan copy');
    check(has(ui, content.body), false, 'Changed plan hides old protected review');
    await ui.click('Reload current planner');
    check(ui.one(node => node.props.id === 'practice-reviewed').props.checked, false, 'Fresh reading requires new explicit suitability confirmation');
  });
  await scenario('Duplicate captured action is synchronously locked', async ctx => {
    const ui = ctx.mount(); await ui.flush(); await plan(ui, ctx);
    const action = ui.button('Create provisional practice draft').props.onClick;
    action(); action(); await ui.flush();
    check(ctx.copyWrites().length, 1, 'Same-turn repeated callback sends one copy');
    check(ctx.count('teaching_resources'), 1, 'Synchronous lock prevents duplicate drafts');
  });
  await scenario('Obsolete captured controls cannot act on a new class', async ctx => {
    const ui = ctx.mount(); await ui.flush(); await plan(ui, ctx); const action = ui.button('Create provisional practice draft').props.onClick;
    const referenceChange = ui.one(node => node.props.id === 'practice-reference').props.onChange;
    await ui.change('practice-class', 'class-other'); action(); referenceChange({ target: { value: ctx.reference.id } }); await ui.flush();
    check(ctx.copyWrites().length, 0, 'Old reviewed callback cannot create under a new context');
    check(ui.one(node => node.props.id === 'practice-reference').props.value, '', 'Obsolete source control cannot change a newer class context');
  }, 'admin-a');
  await scenario('Delayed old class response cannot replace current selected class', async ctx => {
    const ui = ctx.mount(); await ui.flush(); let release, reached = false;
    const gate = new Promise(resolve => { release = resolve; });
    ctx.after = async (path, method, response, url) => { if (path === '/api/reading-review' && url.searchParams.get('classId') === 'class-a' && !reached) { reached = true; await gate; } return response; };
    const oldChange = ui.one(node => node.props.id === 'practice-class').props.onChange;
    ui.button('Reload current planner').props.onClick(); await settle(); okay(reached, 'Actual old reading response is held');
    // A captured older selector is rejected while the old load is hidden.
    oldChange({ target: { value: 'class-other' } }); await ui.flush(); release(); await ui.flush();
    check(ui.one(node => node.props.id === 'practice-class').props.value, 'class-a', 'Obsolete selection cannot redirect an in-flight reload');
    ctx.after = null; await ui.change('practice-class', 'class-other');
    check(has(ui, readingInput.passageReference), false, 'Current alternate class has no stale first-class reading');
  }, 'admin-a');
  await scenario('Delayed source reply cannot survive a newer explicit reload', async ctx => {
    const ui = ctx.mount(); await ui.flush(); await ui.change('practice-reading', ctx.reading.id); await ui.change('practice-focus', focus);
    let release, reached = false; const gate = new Promise(resolve => { release = resolve; });
    ctx.after = async (path, method, response) => { if (path.endsWith('/snapshot') && !reached) { reached = true; await gate; } return response; };
    ui.one(node => node.props.id === 'practice-reference').props.onChange({ target: { value: ctx.reference.id } }); await settle(); okay(reached, 'Actual source preview is held');
    ui.render(); ui.button('Reload current planner').props.onClick(); await ui.flush(); const currentTree = text(ui.tree); release(); await ui.flush();
    check(text(ui.tree), currentTree, 'Old delayed source preview cannot overwrite a newer verified reload');
  });
  for (const mode of ['session-mismatch', 'wrong-reading', 'wrong-source']) await scenario('Scoped read correlation fails closed ' + mode, async ctx => {
    const ui = ctx.mount(); await ui.flush(); await plan(ui, ctx);
    ctx.after = async (path, method, response) => {
      if (mode === 'session-mismatch' && path === '/api/reading-review') ctx.actor = 'guardian-a';
      if (mode === 'wrong-reading' && path === '/api/reading-review') { const value = await response.json(); value.observations[0].original.classId = 'class-b'; return Response.json(value); }
      if (mode === 'wrong-source' && path.endsWith('/snapshot')) { const value = await response.json(); value.content.id = 'unrelated-version'; return Response.json(value); }
      return response;
    };
    await ui.click('Reload current planner');
    check(has(ui, content.body), false, 'Failed read correlation clears private source');
    check(has(ui, readingInput.passageReference), false, 'Failed read correlation clears private reading choices');
    check(ctx.copyWrites().length, 0, 'Failed read correlation sends no copy');
  });
  await scenario('Actual token revocation denies copy and hides planning context', async ctx => {
    const ui = ctx.mount(); await ui.flush(); await plan(ui, ctx); ctx.sqlite.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(ctx.actor);
    await ui.click('Create provisional practice draft');
    check(ctx.copyWrites().length, 0, 'Deleted actual token fails current-session preflight');
    check(has(ui, content.body), false, 'Token denial hides source');
    await ctx.renew(); await ui.click('Reload current planner');
    check(ui.one(node => node.props.id === 'practice-reviewed').props.checked, false, 'Restored session requires fresh review');
  });
  await scenario('Unmount before save preflight completes sends no mutation', async ctx => {
    const ui = ctx.mount(); await ui.flush(); await plan(ui, ctx); let release, reached = false;
    const gate = new Promise(resolve => { release = resolve; });
    ctx.after = async (path, method, response) => { if (path === '/api/session' && !reached) { reached = true; await gate; } return response; };
    ui.button('Create provisional practice draft').props.onClick(); await settle(); okay(reached, 'Actual preflight response is held'); ui.dispose(); release(); await settle();
    check(ctx.copyWrites().length, 0, 'Disposed page cannot proceed to a delayed copy');
  });
  await scenario('Original receipt remains distinct after later source and copied-resource revisions', async ctx => {
    const ui = ctx.mount(); await ui.flush(); await plan(ui, ctx); await ui.click('Create provisional practice draft');
    const request = JSON.parse(ctx.copyWrites()[0].body);
    const changed = await ctx.api('/api/resources/' + request.clientResourceId, 'PATCH', { expectedVersion: 1, content: { title: 'Later edited synthetic resource', type: 'activity', curriculum: content.curriculum, gradeLevel: content.gradeLevel, subject: content.subject, language: content.language, objectives: content.objectives, body: 'Later edited body', teacherNotes: 'Later private notes', answerKey: '' } });
    check(changed.status, 200, 'Actual resource revision follows original copied draft'); await changed.arrayBuffer();
    // The real source-copy service recovers original version 1, not latest edited version 2.
    const response = await ctx.api('/api/curriculum/' + ctx.reference.id + '/draft', 'POST', ctx.copyWrites()[0].body);
    check(response.status, 201, 'Existing handler supports original exact copy retry after later revision'); const original = await response.json();
    check(original.resource.latest.version, 1, 'Actual exact retry returns original initial resource version');
    check(original.resource.latest.body, content.body, 'Actual retry preserves original source text');
    const sourceRevision = await ctx.api('/api/curriculum/' + ctx.reference.id, 'PATCH', { expectedVersion: 1, content: { ...content, title: 'Newer reviewed synthetic source', body: 'A different later reviewed activity.' } });
    check(sourceRevision.status, 200, 'Actual source author appends a newer reference version'); const later = await sourceRevision.json();
    const approval = await ctx.api('/api/curriculum/' + ctx.reference.id + '/approve', 'POST', { versionId: later.latest.id, confirmReview: true }); check(approval.status, 200, 'Actual author reviews newer exact source'); await approval.arrayBuffer();
    await ui.click('Reload current planner');
    await ui.change('practice-version', later.latest.id);
    okay(has(ui, 'Newer reviewed synthetic source'), 'Fresh currently selected source version is shown');
    okay(has(ui, 'Synthetic reviewed literacy source · original source version 1'), 'Original receipt source remains distinct from newly selected version');
    okay(has(ui, 'original copied resource version 1'), 'Original receipt never claims latest resource revision');
    check(has(ui, 'Later private notes'), false, 'Planner never fetches private later resource edits');
  });
  await scenario('Later corrected reading does not rebase an unknown original copy', async ctx => {
    const ui = ctx.mount(); await ui.flush(); await plan(ui, ctx);
    ctx.after = async (path, method, response) => { if (path.endsWith('/draft') && method === 'POST') { await response.arrayBuffer(); throw new TypeError('Synthetic lost original copy reply'); } return response; };
    await ui.click('Create provisional practice draft'); ctx.after = null; const original = ctx.copyWrites()[0].body;
    const correction = await ctx.api('/api/reading-checks/' + ctx.reading.id + '/corrections', 'POST', { clientCorrectionId: crypto.randomUUID(), expectedRevision: 0, confirmReviewed: true, reason: 'Synthetic correction after uncertain copy.', language: readingInput.language, readingDate: readingInput.readingDate, passageReference: readingInput.passageReference, durationSeconds: 60, wordsAttempted: 100, wordsCorrect: 70 });
    check(correction.status, 201, 'A later actual reading correction is saved'); await correction.arrayBuffer();
    await ui.click('Reload current planner'); okay(has(ui, '70 correct of 100'), 'Restored planner uses current corrected reading');
    await ui.click('Recover original draft');
    check(ctx.copyWrites()[1].body, original, 'Current reading correction never changes original copy bytes');
    check(ctx.count('teaching_resources'), 1, 'Original copy recovery creates no duplicate despite changed evidence');
    okay(has(ui, 'does not represent later edits'), 'Receipt scope remains the original copy');
  });
  await scenario('Actual class reassignment clears old protected planning access', async ctx => {
    const ui = ctx.mount(); await ui.flush(); await plan(ui, ctx);
    ctx.sqlite.prepare('UPDATE classes SET teacher_id=? WHERE id=?').run('teacher-other', 'class-a');
    await ui.click('Reload current planner');
    check(has(ui, readingInput.passageReference), false, 'Reassigned class readings are no longer displayed');
    check(has(ui, content.body), false, 'Denied original planner context hides the selected source view');
    check(protectedText(ui).includes(focus), false, 'Denied original context hides private manual focus');
    check(ctx.copyWrites().length, 0, 'Class access loss makes no copy');
    ctx.sqlite.prepare('UPDATE classes SET teacher_id=? WHERE id=?').run('teacher-a', 'class-a');
    await ui.click('Reload current planner'); check(ui.one(node => node.props.id === 'practice-reviewed').props.checked, false, 'Restored class scope requires new explicit review');
  });
  await scenario('Unavailable selected observation clears its private unsent planning focus', async ctx => {
    const ui = ctx.mount(); await ui.flush(); await plan(ui, ctx);
    const obsoleteCreate = ui.button('Create provisional practice draft').props.onClick;
    ctx.sqlite.prepare('UPDATE students SET school_id=? WHERE id=?').run('b', 'student-a');
    await ui.click('Reload current planner');
    check(ui.one(node => node.props.id === 'practice-reading').props.value, '', 'Verified reading list clears the unavailable selected observation');
    check(ui.one(node => node.props.id === 'practice-focus').props.value, '', 'Verified reading list clears the private focus tied to the unavailable observation');
    check(protectedText(ui).includes(focus), false, 'Unavailable observation leaves no former private manual focus in rendered controls');
    check(has(ui, readingInput.passageReference), false, 'Current reading view omits the learner who left this school');
    okay(has(ui, content.body), 'Separately authorized reviewed source remains available');
    check(ui.one(node => node.props.id === 'practice-reviewed').props.checked, false, 'Reload clears suitability confirmation');
    check(ui.button('Create provisional practice draft').props.disabled, true, 'Absent observation cannot create a practice draft');
    obsoleteCreate(); await ui.flush();
    check(ctx.copyWrites().length, 0, 'Captured obsolete creation cannot copy from the former observation');
    check(has(ui, 'original copied draft is confirmed'), false, 'A read-only reload makes no saved-copy claim');
    ctx.sqlite.prepare('UPDATE students SET school_id=? WHERE id=?').run('a', 'student-a');
    await ui.click('Reload current planner');
    okay(has(ui, readingInput.passageReference), 'Restored current learner scope makes its observation available again');
    check(ui.one(node => node.props.id === 'practice-reading').props.value, '', 'Restored observation is not automatically reselected');
    check(ui.one(node => node.props.id === 'practice-focus').props.value, '', 'Restoring scope does not restore the cleared unsent private focus');
    check(ctx.copyWrites().length, 0, 'Restoring observation access makes no draft request');
  });
  await scenario('Unavailable observation hides but retains exact original uncertain copy recovery', async ctx => {
    const ui = ctx.mount(); await ui.flush(); await plan(ui, ctx);
    ctx.after = async (path, method, response) => { if (path.endsWith('/draft') && method === 'POST') { await response.arrayBuffer(); throw new TypeError('Synthetic committed practice copy reply loss'); } return response; };
    await ui.click('Create provisional practice draft'); ctx.after = null;
    const original = ctx.copyWrites()[0].body, resourceId = JSON.parse(original).clientResourceId;
    check(ctx.count('teaching_resources'), 1, 'Actual original copy commits before delivery loss');
    ctx.sqlite.prepare('UPDATE students SET school_id=? WHERE id=?').run('b', 'student-a');
    await ui.click('Reload current planner');
    check(ui.one(node => node.props.id === 'practice-reading').props.value, '', 'Unavailable original observation remains unselected during recovery');
    check(ui.one(node => node.props.id === 'practice-focus').props.value, '', 'Unavailable original observation cannot expose captured private focus');
    check(protectedText(ui).includes(focus), false, 'Current inaccessible reading context hides the held manual focus');
    okay(has(ui, 'Unconfirmed draft'), 'Original uncertain request remains pending after the current observation disappears');
    check(has(ui, 'Original reviewed source:'), false, 'Unavailable original evidence hides the pending source summary');
    check(ui.all(node => node.type === 'button' && text(node) === 'Recover original draft').length, 0, 'Unavailable original observation offers no recovery action');
    check(ui.button('Create provisional practice draft').props.disabled, true, 'Pending uncertainty never unlocks a separate copy');
    check(ctx.copyWrites().length, 1, 'A verified unavailable observation causes no automatic copy retry');
    check(has(ui, 'original copied draft is confirmed'), false, 'Unavailable observation cannot turn delivery loss into a confirmation');
    ctx.sqlite.prepare('UPDATE students SET school_id=? WHERE id=?').run('a', 'student-a');
    await ui.click('Reload current planner');
    check(ui.one(node => node.props.id === 'practice-reading').props.value, readingInput.clientCheckId, 'Restored original scope restores the exact pending observation');
    check(ui.one(node => node.props.id === 'practice-focus').props.value, focus, 'Fresh original authorized scope may restore the captured pending focus');
    check(ui.button('Create provisional practice draft').props.disabled, true, 'Authorized recovery still prevents a separate copy');
    await ui.click('Recover original draft');
    check(ctx.copyWrites().length, 2, 'Only deliberate original recovery sends the second actual copy request');
    check(ctx.copyWrites()[1].body, original, 'Recovery retains the exact original UUID, source, format and body bytes');
    check(ctx.count('teaching_resources'), 1, 'Original idempotent recovery creates no duplicate resource');
    okay(ui.all(node => node.type === 'a' && node.props.href === '/resources/' + resourceId).length, 'Confirmed original receipt links to the original resource');
    check(has(ui, 'Unconfirmed draft'), false, 'Confirmed original recovery releases its pending reminder');
  });
  for (const status of [400, 409]) await scenario('Rejected original recovery retains uncertainty ' + status, async ctx => {
    const ui = ctx.mount(); await ui.flush(); await plan(ui, ctx);
    ctx.after = async (path, method, response) => { if (path.endsWith('/draft') && method === 'POST') { await response.arrayBuffer(); throw new TypeError('Synthetic committed copy reply loss'); } return response; };
    await ui.click('Create provisional practice draft'); ctx.after = null; const original = ctx.copyWrites()[0].body;
    await ui.click('Reload current planner');
    ctx.after = async (path, method, response) => { if (path.endsWith('/draft') && method === 'POST') { check(response.status, 201, 'Real original recovery succeeded before delivery rejection'); await response.arrayBuffer(); return Response.json({ error: 'Synthetic delivery rejection' }, { status }); } return response; };
    await ui.click('Recover original draft'); ctx.after = null;
    check(has(ui, 'original request remains pending'), true, 'A rejected uncertain recovery cannot silently release a new creation');
    check(has(ui, content.body), false, 'Rejected recovery hides protected source');
    check(ctx.count('teaching_resources'), 1, 'Delivery rejection changes no original saved copy');
    await ui.click('Reload current planner'); check(ui.button('Create provisional practice draft').props.disabled, true, 'Reload does not unlock a different copy');
    await ui.click('Recover original draft'); check(ctx.copyWrites().at(-1).body, original, 'Later successful recovery keeps exact original bytes');
    check(ctx.count('teaching_resources'), 1, 'Later actual recovery creates no duplicate');
  });
  await scenario('Receipt belonging to a previous staff account cannot accompany a new pending request', async ctx => {
    const ui = ctx.mount(); await ui.flush(); await plan(ui, ctx); await ui.click('Create provisional practice draft');
    const oldResourceId = JSON.parse(ctx.copyWrites()[0].body).clientResourceId;
    ctx.actor = 'admin-a'; await ui.click('Reload current planner');
    check(ui.all(node => node.type === 'a' && node.props.href === '/resources/' + oldResourceId).length, 0, 'Different account cannot see previous original receipt');
    await plan(ui, ctx);
    ctx.after = async (path, method, response) => { if (path.endsWith('/draft') && method === 'POST') { await response.arrayBuffer(); throw new TypeError('Synthetic new administrator reply loss'); } return response; };
    await ui.click('Create provisional practice draft'); ctx.after = null; await ui.click('Reload current planner');
    okay(has(ui, 'Original reviewed source'), 'Current original administrator can inspect its own pending summary');
    check(ui.all(node => node.type === 'a' && node.props.href === '/resources/' + oldResourceId).length, 0, 'New pending actor cannot restore an older actor receipt');
    await ui.click('Recover original draft'); check(ctx.count('teaching_resources'), 2, 'Two separately reviewed actors retain their two own copies');
    check(ui.all(node => node.type === 'a' && node.props.href === '/resources/' + oldResourceId).length, 0, 'Recovered current actor receipt does not expose old actor link');
  });
  check(externalRequests, 0, 'All planner callback scenarios remain local and synthetic');
  console.log(`Reading practice client contracts: ${checks} checks across ${scenarios} scenarios; ${requests} actual handler requests; ${externalRequests} external requests. Hook/element substitution over real sessions and Drizzle D1 statements on isolated SQLite; no mounted browser or acceptance claim.`);
  console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0, scenarios, requests, externalRequests }));
} finally {
  globalThis.fetch = originalFetch; globalThis.window = originalWindow; delete globalThis.__sahaReadingPracticeContractReact;
}
