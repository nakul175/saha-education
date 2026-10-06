// Manual localhost-only browser procedure for assessment lifecycle (create/edit/publish) and published report cards.
// Run against the built Worker with tests/support/write-lifecycle-fixture.mjs. Synthetic data only; every non-local request is aborted and counted.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';

const origin = process.env.SAHA_WORKER_TEST_URL, fixture = process.env.SAHA_WORKER_SESSION_FIXTURE, executablePath = process.env.SAHA_TEST_BROWSER;
if (!origin || !fixture || !executablePath) throw new Error('Supply a local built Worker, private synthetic sessions and local browser.');
const base = new URL(origin);
const outputDir = process.env.SAHA_TEST_OUTPUT_DIR || '/private/tmp'; mkdirSync(outputDir, { recursive: true });
if (!['127.0.0.1', 'localhost'].includes(base.hostname) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('Lifecycle browser checks require an exact localhost origin.');
const sessions = JSON.parse(readFileSync(fixture, 'utf8'));
const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-background-networking'] });
const contexts = [], pageErrors = [], externalRequests = [], failedResources = [], dialogs = [], checks = [], screenshots = [];
let passed = 0;
const suffix = crypto.randomUUID().slice(0, 8), reason = 'Synthetic mounted reason ' + suffix;
const check = async (name, action) => { await action(); passed++; checks.push(name); console.log('ok - ' + name); };
const ANA = 'lc-learner-ana', BEN = 'lc-learner-ben', ANA_NAME = 'Synthetic Ana Lifecycle';
const PRIVATE_NOTE = /Synthetic private teacher note/;

async function context(user, viewport = { width: 1280, height: 900 }) {
  if (user && typeof sessions[user] !== 'string') throw new Error('Missing a required synthetic session: ' + user);
  const value = await browser.newContext({ viewport, timezoneId: 'Pacific/Kiritimati', serviceWorkers: 'block', extraHTTPHeaders: user ? { cookie: sessions[user] } : {} });
  if (user) { const separator = sessions[user].indexOf('='); await value.addCookies([{ name: sessions[user].slice(0, separator), value: sessions[user].slice(separator + 1), domain: base.hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]); }
  contexts.push(value);
  value.on('page', page => {
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
    page.on('response', response => { if (response.status() >= 400 && ['script', 'stylesheet'].includes(response.request().resourceType())) failedResources.push({ path: new URL(response.url()).pathname, status: response.status() }); });
  });
  await value.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin === base.origin) return route.continue(); externalRequests.push({ origin: url.origin, pathname: url.pathname }); return route.abort(); });
  return value;
}
async function api(value, path, method = 'GET', data, expected = 200) {
  const url = new URL(path, base); if (url.origin !== base.origin || url.username || url.password) throw new Error('Synthetic requests must remain local.');
  const response = await value.request.fetch(url.href, { method, timeout: 15000, maxRedirects: 0, headers: method === 'GET' ? {} : { Origin: base.origin }, ...(data === undefined ? {} : { data }) });
  const body = await response.text(); assert.equal(response.status(), expected, 'Local API status for ' + method + ' ' + path + ': ' + body.slice(0, 200)); return body ? JSON.parse(body) : null;
}
async function localRouteFetch(route, user) {
  if (new URL(route.request().url()).origin !== base.origin) throw new Error('Injected requests must remain local.');
  return route.fetch({ timeout: 15000, maxRedirects: 0, headers: { ...await route.request().allHeaders(), cookie: sessions[user] } });
}
const editorPath = id => '/api/assessments/' + encodeURIComponent(id) + '/result-editor';
const lifecyclePath = id => '/api/assessments/' + encodeURIComponent(id) + '/lifecycle';
async function manualReview(value, id, changes, explanation) {
  const saved = await api(value, editorPath(id));
  const entries = changes.map(change => { const pupil = saved.roster.items.find(item => item.student.id === change.studentId); assert.ok(pupil, 'Pupil is on the roster'); return { studentId: change.studentId, score: change.score, grade: pupil.record?.grade ?? null, feedback: pupil.record?.feedback ?? null, expectedRecord: pupil.record ?? null }; });
  return api(value, editorPath(id), 'POST', { expectedAssessment: saved.assessment, clientRequestId: crypto.randomUUID(), reviewConfirmed: true, reason: explanation, entries }, 201);
}
const waitPost = (page, path, method = 'POST') => page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === method);
async function noLeaks(page, label) {
  const text = await page.locator('body').innerText();
  assert.doesNotMatch(text, /lc-(learner|assessment|class|enrolment)|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-|\{"|\[object|undefined|\bNaN\b/i, label + ': no raw JSON or internal ids');
}
async function labelsAndWidth(page, label) {
  const missing = await page.locator('input:not([type=hidden]),select,textarea').evaluateAll(items => items.filter(item => !item.labels?.length && !item.getAttribute('aria-label') && !item.getAttribute('aria-labelledby')).map(item => item.id || item.tagName));
  assert.deepEqual(missing, [], label + ': every control has a label');
  const width = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth })); assert.ok(width.scroll <= width.viewport + 1, label + ': no horizontal overflow ' + JSON.stringify(width));
}
async function shot(page, name) {
  await page.evaluate(async () => { await document.fonts.ready; const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); await frames(); });
  const path = join(outputDir, 'saha-assessment-lifecycle-ui-' + name + '.png'); await page.screenshot({ path, fullPage: true }); screenshots.push(path);
}
async function go(page, path, heading) {
  const response = await page.goto(base.origin + path, { waitUntil: 'domcontentloaded', timeout: 20000 });
  assert.equal(response?.status(), 200, 'Page ' + path);
  await expect(page.getByRole('heading', { name: heading, exact: true, level: 1 })).toBeVisible();
  for (const loading of [/^Loading/, /^Checking your account/]) await expect(page.getByText(loading)).toHaveCount(0, { timeout: 15000 });
}
const manageHeading = 'Assessment details and publication';
const goManage = (page, id) => go(page, '/assessments/' + encodeURIComponent(id) + '/manage', manageHeading);
const goList = page => go(page, '/assessments/manage', 'Manage assessments');
const rowFor = (page, title) => page.locator('[data-assessment-row]').filter({ hasText: title });
const publishButton = page => page.getByRole('button', { name: 'Publish results', exact: true });
const unpublishButton = page => page.getByRole('button', { name: 'Unpublish results', exact: true });
const partialBox = page => page.getByRole('checkbox', { name: /I understand the others will show no result/ });
const status = (page, text) => page.getByRole('status').filter({ hasText: text });
const alertText = (page, text) => page.getByRole('alert').filter({ hasText: text });
async function publishUi(page, id, { partial = false } = {}) {
  await goManage(page, id); if (partial) await partialBox(page).check();
  const saved = waitPost(page, lifecyclePath(id)); await publishButton(page).click(); const response = await saved; assert.equal(response.status(), 201);
  await expect(status(page, 'Results published.')).toBeVisible(); await expect(page.locator('[data-assessment-state=published]').first()).toBeVisible(); return response.json();
}
async function setEditorScore(page, id, entries) {
  const opened = await page.goto(base.origin + '/assessments/' + encodeURIComponent(id), { waitUntil: 'domcontentloaded' }); assert.equal(opened?.status(), 200);
  await expect(page.getByRole('heading', { name: 'Review assessment results', exact: true, level: 1 })).toBeVisible();
  await expect(page.getByText('Loading saved results and current roster…', { exact: true })).toHaveCount(0); await expect(page.getByText('Loading review history…', { exact: true })).toHaveCount(0);
  for (const [name, value] of entries) await page.getByLabel('Score for ' + name, { exact: true }).fill(value);
  await page.getByLabel('Reason for result changes', { exact: true }).fill(reason);
  await page.getByRole('checkbox', { name: 'I reviewed the loaded assessment, saved results and these intended changes.', exact: true }).check();
  const saved = waitPost(page, editorPath(id)); await page.getByRole('button', { name: 'Save reviewed results', exact: true }).click(); assert.equal((await saved).status(), 201);
  await expect(page.getByRole('status').filter({ hasText: 'Result review saved.' })).toBeVisible();
}

try {
  const teacher = await context('teacher-a'), admin = await context('admin-a'), other = await context('teacher-other'), family = await context('lc-guardian'),
    learner = await context('lc-student'), stranger = await context('guardian-a'), strangerLearnerFamily = await context('guardian-other');
  const page = await teacher.newPage(), adminPage = await admin.newPage();

  // ---------- A. Overview, review status, scoping ----------
  await goList(page);
  await check('Overview lists legacy and new assessments with plain status, coverage and review text', async () => {
    for (const title of ['Seeded partial quiz', 'Seeded empty test', 'Seeded legacy malformed maximum', 'Seeded legacy duplicate results']) await expect(rowFor(page, title)).toHaveCount(1);
    await expect(rowFor(page, 'Seeded partial quiz')).toContainText('2 of 3 pupils'); await expect(rowFor(page, 'Seeded partial quiz')).toContainText('No corrections reviewed');
    await expect(rowFor(page, 'Seeded empty test')).toContainText('0 of 3 pupils');
    for (const title of ['Seeded partial quiz', 'Seeded empty test']) await expect(rowFor(page, title).locator('[data-assessment-state=draft]')).toHaveText('Not published');
    await noLeaks(page, 'overview'); await labelsAndWidth(page, 'overview');
  });
  await check('Legacy malformed maximum and duplicate results are flagged for review, never silently shown as valid', async () => {
    await expect(rowFor(page, 'Seeded legacy malformed maximum')).toContainText('The stored maximum needs review.'); await expect(rowFor(page, 'Seeded legacy malformed maximum')).toContainText('Maximum:Needs review');
    await expect(rowFor(page, 'Seeded legacy duplicate results')).toContainText('Duplicate records need an administrator review.');
  });
  await check('Dates are exact stored calendar days in a UTC+14 browser', async () => {
    await expect(rowFor(page, 'Seeded partial quiz').locator('time')).toHaveAttribute('datetime', '2026-10-05'); await expect(rowFor(page, 'Seeded partial quiz').locator('time')).toHaveText('5 Oct 2026');
    await expect(rowFor(page, 'Seeded empty test').locator('time')).toHaveText('6 Oct 2026');
  });
  await check('Status filter narrows the list and says so in plain language', async () => {
    await page.getByLabel('Status', { exact: true }).selectOption('published'); await expect(page.locator('[data-assessment-row]')).toHaveCount(0);
    await expect(page.getByText('No assessments match this status. Choose another status to see the rest.')).toBeVisible(); await page.getByLabel('Status', { exact: true }).selectOption('all'); await expect(page.locator('[data-assessment-row]')).toHaveCount(5);
  });
  await check('An unassigned teacher sees none of the class assessments; a guardian gets a staff-only message', async () => {
    const screen = await other.newPage(); await goList(screen); await expect(screen.locator('[data-assessment-row]')).toHaveCount(0); await expect(screen.getByText('No assessments exist for your classes yet.')).toBeVisible();
    const direct = await other.newPage(); const response = await direct.goto(base.origin + '/assessments/lc-assessment-partial/manage'); assert.equal(response?.status(), 200);
    await expect(alertText(direct, 'not found among your classes')).toBeVisible(); await expect(direct.getByText('Seeded partial quiz')).toHaveCount(0);
    const guardianScreen = await family.newPage(); await guardianScreen.goto(base.origin + '/assessments/manage'); await expect(alertText(guardianScreen, 'available to teachers and school administrators')).toBeVisible(); await expect(guardianScreen.locator('[data-assessment-row]')).toHaveCount(0);
    await api(family, '/api/assessments/overview', 'GET', undefined, 403); await api(family, lifecyclePath('lc-assessment-partial'), 'GET', undefined, 403); await api(other, lifecyclePath('lc-assessment-partial'), 'GET', undefined, 404);
  });

  // ---------- B. Create ----------
  const created = { title: 'Mounted unit test ' + suffix };
  await go(page, '/assessments/new', 'New assessment');
  await check('Empty and malformed creation shows field errors in plain language and sends nothing', async () => {
    let posts = 0; const observe = request => { if (request.method() === 'POST') posts++; }; page.on('request', observe);
    try {
      await page.getByRole('button', { name: 'Save assessment', exact: true }).click();
      await expect(alertText(page, 'Some details need attention.')).toBeVisible();
      for (const text of ['Choose the assessment date.', 'Enter a title.', 'Choose the class this assessment belongs to.', 'Enter the maximum score.']) await expect(page.getByText(text)).toBeVisible();
      await expect(page.getByLabel('Title', { exact: true })).toHaveAttribute('aria-invalid', 'true');
      for (const bad of ['12.5', '-1', '1e3', 'abc']) { await page.getByLabel('Maximum score', { exact: true }).fill(bad); await page.getByRole('button', { name: 'Save assessment', exact: true }).click(); await expect(page.getByText('Enter a whole number from 0 to 9999999 using digits only.')).toBeVisible(); }
    } finally { page.off('request', observe); }
    assert.equal(posts, 0, 'Invalid forms send zero POST requests'); await labelsAndWidth(page, 'new');
  });
  await check('A valid assessment saves once, keeps the entered calendar day and offers next steps', async () => {
    await page.getByLabel('Class', { exact: true }).selectOption({ label: 'Synthetic lifecycle class' }); await page.getByLabel('Title', { exact: true }).fill(created.title);
    await page.getByLabel('Type', { exact: true }).selectOption('exam'); await page.getByLabel('Date', { exact: true }).fill('2026-10-07'); await page.getByLabel('Maximum score', { exact: true }).fill('30');
    let posts = 0; const observe = request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/assessments') posts++; }; page.on('request', observe);
    try { const saved = waitPost(page, '/api/assessments'); await page.getByRole('button', { name: 'Save assessment', exact: true }).evaluate(button => { button.form.requestSubmit(); button.form.requestSubmit(); }); assert.equal((await saved).status(), 201); } finally { page.off('request', observe); }
    assert.equal(posts, 1, 'Two same-frame submits create one assessment');
    const note = status(page, 'Assessment saved: ' + created.title); await expect(note).toContainText('Synthetic lifecycle class'); await expect(note).toContainText('Exam on 7 Oct 2026, maximum 30');
    created.resultsHref = await note.getByRole('link', { name: 'Enter results', exact: true }).getAttribute('href'); created.id = decodeURIComponent(created.resultsHref.split('/').pop()); assert.ok(created.id);
    await noLeaks(page, 'created');
  });
  await check('The new assessment is listed as not published, with the correct day, and is private to the class teacher', async () => {
    await goList(page); const rowCard = rowFor(page, created.title); await expect(rowCard).toHaveCount(1); await expect(rowCard).toContainText('0 of 3 pupils'); await expect(rowCard.locator('time')).toHaveText('7 Oct 2026'); await expect(rowCard.locator('[data-assessment-state=draft]')).toBeVisible();
    await api(other, lifecyclePath(created.id), 'GET', undefined, 404);
  });

  // ---------- C. Result entry in the merged editor, then publish rules ----------
  await check('Results entered in the reviewed editor keep a raw zero and leave a missing learner blank', async () => {
    await setEditorScore(page, created.id, [[ANA_NAME, '0'], ['Synthetic Ben Lifecycle', '25']]);
    const saved = await api(teacher, editorPath(created.id)); const byId = Object.fromEntries(saved.roster.items.map(item => [item.student.id, item.record]));
    assert.equal(byId[ANA].score, 0, 'Raw zero stays 0'); assert.equal(byId[BEN].score, 25); assert.equal(byId['lc-learner-cai'], null, 'A learner with no entry has no result, not a zero');
  });
  await check('Editing details with saved results needs a reason; a maximum below a saved score is refused in plain language', async () => {
    await goManage(page, created.id); await expect(page.locator('[data-readiness=ready]')).toBeVisible(); await expect(page.getByText('Results recorded:')).toBeVisible();
    await page.getByLabel('Title', { exact: true }).fill(created.title + ' edited'); let posts = 0; const observe = request => { if (request.method() === 'PATCH') posts++; }; page.on('request', observe);
    try { await page.getByRole('button', { name: 'Save details', exact: true }).click(); await expect(page.getByText('Results are already saved, so give a reason of at least 10 characters.')).toBeVisible(); } finally { page.off('request', observe); }
    assert.equal(posts, 0, 'Missing reason sends nothing');
    await page.getByLabel('Maximum score', { exact: true }).fill('20'); await page.getByLabel('Reason for the change', { exact: true }).fill(reason);
    const refused = waitPost(page, '/api/assessments/' + created.id, 'PATCH'); await page.getByRole('button', { name: 'Save details', exact: true }).click(); assert.equal((await refused).status(), 409);
    await expect(alertText(page, 'The new maximum is below a score that is already saved.')).toBeVisible(); await noLeaks(page, 'below-saved');
  });
  await check('Saving edited details records before/after history with the reason', async () => {
    await goManage(page, created.id); await page.getByLabel('Title', { exact: true }).fill(created.title + ' edited'); await page.getByLabel('Maximum score', { exact: true }).fill('28'); await page.getByLabel('Reason for the change', { exact: true }).fill(reason);
    const saved = waitPost(page, '/api/assessments/' + created.id, 'PATCH'); await page.getByRole('button', { name: 'Save details', exact: true }).click(); assert.equal((await saved).status(), 201);
    await expect(status(page, 'Details saved.')).toBeVisible(); const history = page.locator('[data-history=edits] li'); await expect(history).toHaveCount(1);
    await expect(history.first()).toContainText('Before: ' + created.title + ', Exam, 7 Oct 2026, maximum 30.'); await expect(history.first()).toContainText('After: ' + created.title + ' edited, Exam, 7 Oct 2026, maximum 28.'); await expect(history.first()).toContainText('Reason: ' + reason);
  });
  await check('A second tab holding old details gets a plain conflict message and cannot overwrite the newer edit', async () => {
    const first = await teacher.newPage(), second = await teacher.newPage(); await goManage(first, created.id); await goManage(second, created.id);
    await first.getByLabel('Title', { exact: true }).fill(created.title + ' first'); await first.getByLabel('Reason for the change', { exact: true }).fill(reason + ' first');
    const savedFirst = waitPost(first, '/api/assessments/' + created.id, 'PATCH'); await first.getByRole('button', { name: 'Save details', exact: true }).click(); assert.equal((await savedFirst).status(), 201);
    await second.getByLabel('Title', { exact: true }).fill(created.title + ' second'); await second.getByLabel('Reason for the change', { exact: true }).fill(reason + ' second');
    const savedSecond = waitPost(second, '/api/assessments/' + created.id, 'PATCH'); await second.getByRole('button', { name: 'Save details', exact: true }).click(); assert.equal((await savedSecond).status(), 409);
    await expect(alertText(second, 'changed by someone else after you opened it')).toBeVisible(); await expect(second.getByLabel('Title', { exact: true })).toHaveValue(created.title + ' first'); created.title += ' first';
    await first.close(); await second.close();
  });
  await check('Partial coverage needs an explicit confirmation; publishing records an auditable event with the gap', async () => {
    await goManage(page, created.id); await expect(publishButton(page)).toBeDisabled(); await expect(partialBox(page)).toBeVisible();
    await partialBox(page).check(); await expect(publishButton(page)).toBeEnabled(); const saved = waitPost(page, lifecyclePath(created.id)); await publishButton(page).click(); const response = await saved; assert.equal(response.status(), 201);
    await expect(status(page, 'Results published.')).toBeVisible(); const event = page.locator('[data-history=publication] li').first();
    await expect(event).toContainText('Published by'); await expect(event).toContainText('2 of 3 pupils had a result (published with the gap confirmed).');
  });
  await check('Published details are locked in the page and refused by the server with the allowlisted conflict', async () => {
    await expect(page.locator('[data-edit-locked]')).toBeVisible(); await expect(page.getByLabel('Title', { exact: true })).toHaveCount(0);
    const stale = await api(teacher, lifecyclePath(created.id)); const refused = await api(teacher, '/api/assessments/' + created.id, 'PATCH', { clientRequestId: crypto.randomUUID(), expected: { title: stale.assessment.title, kind: stale.assessment.kind, maxScore: stale.assessment.maxScore, date: stale.assessment.date, updatedAt: stale.assessment.updatedAt }, details: { title: 'Locked', kind: 'exam', maxScore: 28, date: '2026-10-07' }, reason }, 409);
    assert.deepEqual(refused, { error: 'Conflict', code: 'published' });
  });
  await check('A publish replay with the same request id is an exact replay and never a second event', async () => {
    const before = (await api(teacher, lifecyclePath(created.id))).eventTotal; const first = (await api(teacher, lifecyclePath(created.id))).events[0];
    const requestId = first.id; const replay = await api(teacher, lifecyclePath(created.id), 'POST', { clientRequestId: requestId, action: 'publish', partialConfirmed: true }, 200); assert.equal(replay.replayed, true);
    const reused = await api(teacher, lifecyclePath(created.id), 'POST', { clientRequestId: requestId, action: 'unpublish', reason }, 409); assert.equal(reused.code, 'request_reused'); assert.equal((await api(teacher, lifecyclePath(created.id))).eventTotal, before);
  });
  await check('An assessment with no results, a malformed legacy maximum, or duplicate results cannot be published and says why', async () => {
    await goManage(page, 'lc-assessment-empty'); await expect(page.locator('[data-readiness=blocked]')).toContainText('No results are recorded for the current roster yet.'); await expect(publishButton(page)).toBeDisabled();
    await goManage(page, 'lc-assessment-bad-max'); await expect(page.locator('[data-readiness=blocked]')).toContainText('The stored maximum is not a whole number'); await expect(publishButton(page)).toBeDisabled();
    await goManage(page, 'lc-assessment-dupes'); await expect(page.locator('[data-readiness=blocked]')).toContainText('Duplicate saved results or enrolment records exist.'); await expect(publishButton(page)).toBeDisabled();
    for (const id of ['lc-assessment-empty', 'lc-assessment-bad-max', 'lc-assessment-dupes']) { const refused = await api(teacher, lifecyclePath(id), 'POST', { clientRequestId: crypto.randomUUID(), action: 'publish', partialConfirmed: true }, 409); assert.equal(refused.code, 'not_ready'); }
    await noLeaks(page, 'blocked readiness');
  });
  await check('Unpublish needs a reason, then publish again keeps a full ordered history', async () => {
    await publishUi(page, 'lc-assessment-partial', { partial: true });
    let posts = 0; const observe = request => { if (request.method() === 'POST' && new URL(request.url()).pathname === lifecyclePath('lc-assessment-partial')) posts++; }; page.on('request', observe);
    try { await page.getByRole('button', { name: 'Unpublish results', exact: true }).click(); await expect(alertText(page, 'Give a reason of 10 to 500 characters before unpublishing.')).toBeVisible(); } finally { page.off('request', observe); }
    assert.equal(posts, 0, 'Missing unpublish reason sends nothing');
    await page.getByLabel('Reason for unpublishing', { exact: true }).fill(reason); const saved = waitPost(page, lifecyclePath('lc-assessment-partial')); await unpublishButton(page).click(); assert.equal((await saved).status(), 201);
    await expect(status(page, 'Results unpublished.')).toBeVisible(); await expect(page.locator('[data-assessment-state=unpublished]').first()).toBeVisible();
    await expect(page.locator('[data-history=publication] li').first()).toContainText('Reason: ' + reason);
  });
  await check('A lost acknowledgement is retried with the same request id and confirmed as already published', async () => {
    await goManage(page, 'lc-assessment-partial'); await partialBox(page).check(); const ids = []; let armed = true;
    const lose = async route => {
      if (route.request().method() !== 'POST' || !armed) return route.continue(); armed = false; ids.push(route.request().postDataJSON().clientRequestId);
      const response = await localRouteFetch(route, 'teacher-a'); assert.equal(response.status(), 201); await response.body(); return route.abort('failed');
    };
    const matchLifecycle = url => url.pathname === lifecyclePath('lc-assessment-partial');
    await page.route(matchLifecycle, lose);
    try { await publishButton(page).click(); await expect(alertText(page, 'could not be confirmed')).toBeVisible(); } finally { await page.unroute(matchLifecycle, lose); }
    const retry = page.getByRole('button', { name: 'Send the same request again', exact: true }); await expect(retry).toBeVisible();
    const replayed = page.waitForResponse(response => new URL(response.url()).pathname === lifecyclePath('lc-assessment-partial') && response.request().method() === 'POST'); await retry.click(); const response = await replayed; assert.equal(response.status(), 200);
    assert.equal(response.request().postDataJSON().clientRequestId, ids[0], 'Retry reuses the original request id'); await expect(status(page, 'These results were already published.')).toBeVisible();
    const lifecycle = await api(teacher, lifecyclePath('lc-assessment-partial')); assert.equal(lifecycle.eventTotal, 3, 'publish, unpublish, publish: the lost acknowledgement created exactly one event'); assert.deepEqual(lifecycle.events.map(item => item.action), ['publish', 'unpublish', 'publish']);
  });

  // ---------- D. Report cards ----------
  const report = { term: 'Mounted term ' + suffix, summary: 'Synthetic mounted summary ' + suffix };
  await go(adminPage, '/report-cards/compile', 'Compile a report card');
  await check('Compile lists only published, valid results for the chosen learner and keeps the raw zero', async () => {
    await adminPage.getByLabel('Learner', { exact: true }).selectOption({ label: ANA_NAME }); await expect(adminPage.locator('[data-eligible-result]')).toHaveCount(2);
    await expect(adminPage.locator('[data-eligible-result="lc-assessment-partial"] [data-score]')).toHaveText('0 out of 20'); await expect(adminPage.locator('[data-eligible-result="' + created.id + '"] [data-score]')).toHaveText('0 out of 28');
    for (const id of ['lc-assessment-empty', 'lc-assessment-bad-max', 'lc-assessment-dupes']) await expect(adminPage.locator('[data-eligible-result="' + id + '"]')).toHaveCount(0);
    await expect(adminPage.getByText(PRIVATE_NOTE)).toHaveCount(0); await noLeaks(adminPage, 'compile'); await labelsAndWidth(adminPage, 'compile');
  });
  await check('A draft report with selected published results saves privately and links to review', async () => {
    let posts = 0; const observe = request => { if (request.method() === 'POST') posts++; }; adminPage.on('request', observe);
    try { await adminPage.getByRole('button', { name: 'Save draft report', exact: true }).click(); await expect(adminPage.getByText('Enter the term or period this report covers.')).toBeVisible(); await expect(adminPage.getByText('Enter the overall grade.')).toBeVisible(); } finally { adminPage.off('request', observe); }
    assert.equal(posts, 0, 'Invalid report sends nothing');
    for (const id of ['lc-assessment-partial', created.id]) await adminPage.locator('[data-eligible-result="' + id + '"] input').check();
    await adminPage.getByLabel('Term', { exact: true }).fill(report.term); await adminPage.getByLabel('Overall grade', { exact: true }).fill('B'); await adminPage.getByLabel('Summary (optional)', { exact: true }).fill(report.summary);
    const saved = waitPost(adminPage, '/api/report-cards'); await adminPage.getByRole('button', { name: 'Save draft report', exact: true }).click(); const response = await saved; assert.equal(response.status(), 201); report.id = (await response.json()).id;
    await expect(status(adminPage, 'Draft saved for ' + ANA_NAME)).toContainText('with 2 published results attached'); await expect(adminPage.getByRole('link', { name: 'Review and publish this draft', exact: true })).toBeVisible();
  });
  await check('An unpublished draft is invisible to the linked guardian, the learner and unlinked guardians', async () => {
    for (const account of [family, learner, stranger, strangerLearnerFamily]) { await api(account, '/api/report-cards/' + report.id, 'GET', undefined, 404); await api(account, '/api/report-cards/' + report.id + '/detail', 'GET', undefined, 404); }
    const screen = await family.newPage(); const response = await screen.goto(base.origin + '/report-cards/' + report.id); assert.equal(response?.status(), 200); await expect(alertText(screen, 'not available to your account')).toBeVisible(); await expect(screen.getByText(report.term)).toHaveCount(0); await expect(screen.getByText(report.summary)).toHaveCount(0);
    const listing = await api(family, '/api/report-cards?studentId=' + ANA); assert.equal(listing.length, 0);
    await api(family, '/api/report-cards/eligible?studentId=' + ANA, 'GET', undefined, 403);
  });
  await check('Staff review shows the learner by name, the snapshot lines and no private feedback; publishing needs the review box', async () => {
    await go(adminPage, '/report-cards/' + report.id, 'Report Card'); await expect(adminPage.getByText('Learner: ' + ANA_NAME)).toBeVisible(); await expect(adminPage.locator('[data-report-line]')).toHaveCount(2);
    await expect(adminPage.locator('[data-report-line="lc-assessment-partial"] [data-score]')).toHaveText('Score: 0 out of 20, grade Seeded grade'); await expect(adminPage.getByText(PRIVATE_NOTE)).toHaveCount(0);
    await expect(adminPage.getByText('Not published. Only staff can see this draft.')).toBeVisible(); await expect(adminPage.getByRole('button', { name: 'Publish report', exact: true })).toBeDisabled(); await noLeaks(adminPage, 'staff report');
  });
  await check('Publishing is atomic with its receipt, sends one notice, and a repeat publish is a harmless replay', async () => {
    await adminPage.getByRole('checkbox', { name: /I reviewed this report/ }).check(); const saved = waitPost(adminPage, '/api/report-cards/' + report.id, 'PATCH'); await adminPage.getByRole('button', { name: 'Publish report', exact: true }).click(); assert.equal((await saved).status(), 200);
    await expect(status(adminPage, 'Report published.')).toBeVisible(); await expect(adminPage.getByRole('button', { name: 'Publish report', exact: true })).toHaveCount(0);
    const again = await api(admin, '/api/report-cards/' + report.id, 'PATCH', { publish: true }, 200); assert.ok(again.publishedAt);
    const notices = (await api(family, '/api/notifications')).filter(item => item.title === 'Report Card Published'); assert.equal(notices.length, 1, 'Exactly one in-app notice for the linked guardian after two publish calls');
    assert.equal((await api(stranger, '/api/notifications')).filter(item => item.title === 'Report Card Published').length, 0);
  });
  await check('The linked guardian and learner read the published report with raw zeros and no private teacher feedback', async () => {
    for (const account of [family, learner]) {
      const screen = await account.newPage(); await go(screen, '/report-cards/' + report.id, 'Report Card'); await expect(screen.getByText(report.summary, { exact: true })).toBeVisible(); await expect(screen.getByText('Learner: ' + ANA_NAME)).toBeVisible();
      await expect(screen.locator('[data-report-line]')).toHaveCount(2); await expect(screen.locator('[data-report-line="lc-assessment-partial"] [data-score]')).toHaveText('Score: 0 out of 20, grade Seeded grade');
      await expect(screen.getByText(PRIVATE_NOTE)).toHaveCount(0); await expect(screen.getByRole('button', { name: 'Publish report', exact: true })).toHaveCount(0); await expect(screen.locator('[data-line-changed],[data-results-changed]')).toHaveCount(0); await noLeaks(screen, 'family report');
      const detail = await api(account, '/api/report-cards/' + report.id + '/detail'); assert.ok(detail.lines.every(line => line.current === null && !('feedback' in line)), 'Family lines expose no staff-only fields'); assert.equal(detail.resultsChanged, null);
    }
    const listing = await family.newPage(); await go(listing, '/report-cards', 'Report Cards'); await listing.getByLabel('Student', { exact: true }).selectOption({ label: ANA_NAME }); await expect(listing.getByText(report.term, { exact: true })).toBeVisible();
  });
  await check('Unlinked guardians and unassigned staff cannot read the published report or its lines', async () => {
    for (const account of [stranger, strangerLearnerFamily]) { await api(account, '/api/report-cards/' + report.id, 'GET', undefined, 404); await api(account, '/api/report-cards/' + report.id + '/detail', 'GET', undefined, 404); }
    const screen = await stranger.newPage(); await screen.goto(base.origin + '/report-cards/' + report.id); await expect(alertText(screen, 'not available to your account')).toBeVisible(); await expect(screen.getByText(report.summary)).toHaveCount(0);
    await api(other, '/api/report-cards/eligible?studentId=' + ANA, 'GET', undefined, 403);
  });
  await check('Results used by a published report cannot be unpublished, in the page or the API', async () => {
    await goManage(page, 'lc-assessment-partial'); await expect(page.getByText('line in published report cards use these results')).toBeVisible(); await expect(unpublishButton(page)).toBeDisabled();
    const refused = await api(teacher, lifecyclePath('lc-assessment-partial'), 'POST', { clientRequestId: crypto.randomUUID(), action: 'unpublish', reason }, 409); assert.equal(refused.code, 'in_published_report');
  });

  // ---------- E. Correction path with history ----------
  await check('A reviewed correction of a published result keeps the old report line and flags it for staff only', async () => {
    await manualReview(teacher, 'lc-assessment-partial', [{ studentId: ANA, score: 2 }], reason + ' correction');
    const detail = await api(admin, '/api/report-cards/' + report.id + '/detail'); assert.equal(detail.resultsChanged, true); assert.equal(detail.lines.find(line => line.assessmentId === 'lc-assessment-partial').score, 0, 'The compiled snapshot keeps the value families were told');
    await go(adminPage, '/report-cards/' + report.id, 'Report Card'); await expect(adminPage.locator('[data-line-changed]')).toHaveCount(1); await expect(adminPage.locator('[data-results-changed]')).toContainText('compile a replacement report');
    const familyDetail = await api(family, '/api/report-cards/' + report.id + '/detail'); assert.equal(familyDetail.resultsChanged, null); assert.ok(familyDetail.lines.every(line => line.current === null));
    const history = await api(teacher, editorPath('lc-assessment-partial') + '/history'); assert.ok(history.total >= 1, 'The correction is preserved in the reviewed history');
  });
  const replacement = { term: 'Corrected ' + report.term };
  await check('A replacement report links to the original with a reason and publishes once its lines match the current results', async () => {
    await go(adminPage, '/report-cards/compile', 'Compile a report card'); await adminPage.getByLabel('Learner', { exact: true }).selectOption({ label: ANA_NAME });
    await expect(adminPage.locator('[data-eligible-result="lc-assessment-partial"] [data-score]')).toHaveText('2 out of 20'); await expect(adminPage.locator('[data-eligible-result="lc-assessment-partial"]')).toContainText('Already used in 1 report.');
    await adminPage.locator('[data-eligible-result="lc-assessment-partial"] input').check(); await adminPage.getByLabel('Term', { exact: true }).fill(replacement.term); await adminPage.getByLabel('Overall grade', { exact: true }).fill('B+');
    await expect(adminPage.getByLabel('This report replaces a published report (optional)', { exact: true }).locator('option')).toHaveCount(2);
    await adminPage.getByLabel('This report replaces a published report (optional)', { exact: true }).selectOption({ index: 1 });
    let posts = 0; const observe = request => { if (request.method() === 'POST') posts++; }; adminPage.on('request', observe);
    try { await adminPage.getByRole('button', { name: 'Save draft report', exact: true }).click(); await expect(adminPage.getByText('Give a reason of 10 to 500 characters for replacing the published report.')).toBeVisible(); } finally { adminPage.off('request', observe); }
    assert.equal(posts, 0, 'A correction without a reason sends nothing');
    await adminPage.getByLabel('Reason for replacing it', { exact: true }).fill('Synthetic corrected score ' + suffix); const saved = waitPost(adminPage, '/api/report-cards'); await adminPage.getByRole('button', { name: 'Save draft report', exact: true }).click(); const response = await saved; assert.equal(response.status(), 201); replacement.id = (await response.json()).id;
    await go(adminPage, '/report-cards/' + replacement.id, 'Report Card'); await expect(adminPage.locator('[data-corrects]')).toContainText(report.term); await expect(adminPage.locator('[data-corrects]')).toContainText('Synthetic corrected score ' + suffix);
    await adminPage.getByRole('checkbox', { name: /I reviewed this report/ }).check(); const published = waitPost(adminPage, '/api/report-cards/' + replacement.id, 'PATCH'); await adminPage.getByRole('button', { name: 'Publish report', exact: true }).click(); assert.equal((await published).status(), 200);
    await expect(status(adminPage, 'Report published.')).toBeVisible();
  });
  await check('After publication the original stays readable and marked as replaced; the family sees both and never an unpublished state', async () => {
    const screen = await family.newPage(); await go(screen, '/report-cards/' + report.id, 'Report Card'); await expect(screen.locator('[data-superseded]')).toContainText('replaced by a corrected report'); await expect(screen.locator('[data-superseded]')).toContainText('Synthetic corrected score ' + suffix);
    await expect(screen.locator('[data-report-line="lc-assessment-partial"] [data-score]')).toHaveText('Score: 0 out of 20, grade Seeded grade'); await screen.locator('[data-superseded] a').click(); await expect(screen).toHaveURL(base.origin + '/report-cards/' + replacement.id);
    await expect(screen.getByRole('heading', { name: 'Report Card', exact: true, level: 1 })).toBeVisible(); await expect(screen.locator('[data-report-line="lc-assessment-partial"] [data-score]')).toHaveText('Score: 2 out of 20, grade Seeded grade'); await expect(screen.locator('[data-corrects]')).toBeVisible();
    const listing = await api(family, '/api/report-cards?studentId=' + ANA); assert.deepEqual(listing.map(item => item.id).sort(), [report.id, replacement.id].sort());
  });
  await check('A draft whose results changed after compiling cannot be published, in the page or the API', async () => {
    const stale = await api(admin, '/api/report-cards', 'POST', { studentId: ANA, term: 'Stale draft ' + suffix, overallGrade: 'C', assessmentIds: ['lc-assessment-partial'] }, 201);
    await manualReview(teacher, 'lc-assessment-partial', [{ studentId: ANA, score: 3 }], reason + ' second correction');
    await go(adminPage, '/report-cards/' + stale.id, 'Report Card'); await expect(adminPage.locator('[data-publish-blocked]')).toContainText('cannot be published'); await expect(adminPage.getByRole('button', { name: 'Publish report', exact: true })).toHaveCount(0);
    const refused = await api(admin, '/api/report-cards/' + stale.id, 'PATCH', { publish: true }, 409); assert.equal(refused.code, 'results_changed'); assert.equal((await api(admin, '/api/report-cards/' + stale.id)).publishedAt, null);
    assert.equal((await api(family, '/api/notifications')).filter(item => item.title === 'Report Card Published').length, 2, 'A refused publish sends no notice');
  });

  // ---------- F. Accessibility, mobile, locality ----------
  const phone = await context('teacher-a', { width: 375, height: 800 }), phoneAdmin = await context('admin-a', { width: 375, height: 800 }), phoneFamily = await context('lc-guardian', { width: 375, height: 800 });
  await check('At 375px every new page has no horizontal scroll, labelled controls and no raw ids', async () => {
    const mobile = await phone.newPage(), mobileAdmin = await phoneAdmin.newPage(), mobileFamily = await phoneFamily.newPage();
    await goList(mobile); await labelsAndWidth(mobile, 'manage 375'); await noLeaks(mobile, 'manage 375'); await shot(mobile, 'manage-375');
    await go(mobile, '/assessments/new', 'New assessment'); await labelsAndWidth(mobile, 'new 375'); await shot(mobile, 'new-375');
    await goManage(mobile, created.id); await labelsAndWidth(mobile, 'detail 375'); await noLeaks(mobile, 'detail 375'); await shot(mobile, 'detail-375');
    await go(mobileAdmin, '/report-cards/compile', 'Compile a report card'); await mobileAdmin.getByLabel('Learner', { exact: true }).selectOption({ label: ANA_NAME }); await expect(mobileAdmin.locator('[data-eligible-result]')).toHaveCount(2); await labelsAndWidth(mobileAdmin, 'compile 375'); await shot(mobileAdmin, 'compile-375');
    await go(mobileFamily, '/report-cards/' + replacement.id, 'Report Card'); await labelsAndWidth(mobileFamily, 'report 375'); await noLeaks(mobileFamily, 'report 375'); await shot(mobileFamily, 'report-375');
  });
  await check('Keyboard users can reach and operate the publish controls with native focus', async () => {
    await goManage(page, 'lc-assessment-dupes'); const textbox = page.getByLabel('Title', { exact: true }); await textbox.focus(); await expect(textbox).toBeFocused(); await page.keyboard.press('Tab'); await expect(page.getByLabel('Type', { exact: true })).toBeFocused();
    await goManage(page, created.id); await page.getByLabel('Reason for unpublishing', { exact: true }).focus(); await expect(page.getByLabel('Reason for unpublishing', { exact: true })).toBeFocused();
  });
  await check('No alert dialogs, page errors, failed assets or external requests occurred', async () => { assert.deepEqual(dialogs, []); assert.deepEqual(pageErrors, []); assert.deepEqual(failedResources, []); assert.deepEqual(externalRequests, []); });
  const result = { executedAt: new Date().toISOString(), passed, failed: 0, skipped: 0, externalRequests: externalRequests.length, pageErrors: pageErrors.length, dialogs: dialogs.length, checks, screenshots };
  writeFileSync(join(outputDir, 'saha-assessment-lifecycle-ui-results.json'), JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify({ passed, failed: 0, skipped: 0, externalRequests: externalRequests.length, pageErrors: pageErrors.length }));
} catch (error) {
  const result = { executedAt: new Date().toISOString(), passed, failed: 1, skipped: 0, externalRequests: externalRequests.length, pageErrors: pageErrors.length, checks, screenshots, failure: error instanceof Error ? error.message : String(error) };
  writeFileSync(join(outputDir, 'saha-assessment-lifecycle-ui-results.json'), JSON.stringify(result, null, 2) + '\n');
  for (const value of contexts) for (const screen of value.pages()) if (screen.url().startsWith(base.origin)) console.error('Local screen: ' + new URL(screen.url()).pathname + '\n' + (await screen.locator('body').innerText().catch(() => '')).slice(0, 1600));
  console.log(JSON.stringify({ passed, failed: 1, externalRequests: externalRequests.length, pageErrors: pageErrors.length })); throw error;
} finally { for (const value of contexts) await value.close(); await browser.close(); }
