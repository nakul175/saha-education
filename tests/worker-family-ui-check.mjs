// Manual mounted-browser procedures for a matching built localhost Worker.
// Uses private fictional write-worker-fixture cookies; no provider sign-in.
// Only suffix-owned in_app notices are created/marked. Base records are retained.
// Named legacy/malformed/empty projections alter delivered real GET bodies only;
// they never manufacture stored dates, alter membership or claim a saved repair.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';

const resultPath = '/private/tmp/saha-family-ui-results.json';
const plannedProcedures = 36;
const contexts = [], checks = [], screenshots = [], deliveryFailures = [];
const suffix = crypto.randomUUID().slice(0, 8), ownedNotices = new Map();
let base, sessions, browser, classContext, inboxContext, teacher, admin, classPage, inboxPage;
let passed = 0, externalRequests = 0, localBrowserRequests = 0, fixtureApiRequests = 0, pageErrors = 0, failedAssets = 0;
let checkpoint = 'Private local fixture setup', failureInfo = null, preservationVerified = false;
let originalGuardianClass, originalStudentClass, originalGuardianInbox, originalStudentInbox;

async function check(name, action) {
  checkpoint = name; await action();
  assert.equal(deliveryFailures.length, 0, 'Named local delivery injections completed');
  passed++; checks.push(name); console.log('ok - ' + name);
}
async function switchActor(value, actor) {
  await value.clearCookies();
  await value.setExtraHTTPHeaders(actor ? { cookie: sessions[actor] } : {});
}
async function context(actor) {
  const value = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', timezoneId: 'Asia/Kolkata' });
  contexts.push(value); await switchActor(value, actor);
  value.setDefaultTimeout(10000); value.setDefaultNavigationTimeout(20000);
  value.on('request', request => { const url = new URL(request.url()); if (url.origin === base.origin && url.pathname.startsWith('/api/')) localBrowserRequests++; });
  value.on('page', page => {
    page.on('pageerror', () => { pageErrors++; });
    page.on('response', response => { if (response.status() >= 400 && ['script', 'stylesheet'].includes(response.request().resourceType())) failedAssets++; });
  });
  await value.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === base.origin) {
      if (!['GET', 'HEAD'].includes(request.method()) && !(request.method() === 'PATCH' && url.pathname === '/api/notifications' && [...ownedNotices.values()].some(item => item.id === url.searchParams.get('id')) && request.postData() === null)) {
        deliveryFailures.push('Unexpected local mutation blocked'); return route.abort();
      }
      return route.continue();
    }
    externalRequests++; return route.abort();
  });
  return value;
}
async function api(value, path, method = 'GET', data, status = 200) {
  const url = new URL(path, base); assert.equal(url.origin, base.origin, 'Fixture request remains local');
  if (method !== 'GET') {
    assert.equal(url.pathname, '/api/notifications', 'Only suffix notice creation/read markers may mutate');
    if (method === 'POST') { assert.equal(data?.channel, 'in_app'); assert.ok(data?.title.endsWith(suffix)); assert.ok(['guardian-a', 'student-user-a'].includes(data?.userId)); }
    else { assert.equal(method, 'PATCH'); assert.ok([...ownedNotices.values()].some(item => item.id === url.searchParams.get('id'))); assert.equal(data, undefined); }
  }
  fixtureApiRequests++;
  let response, body;
  try {
    response = await value.request.fetch(url.href, { method, timeout: 15000, maxRedirects: 0, headers: method === 'GET' ? {} : { Origin: base.origin }, ...(data === undefined ? {} : { data }) });
    body = await response.text();
  } catch { throw new Error('Local fixture transport unavailable'); }
  assert.equal(response.status(), status, 'Expected actual local API status');
  try { return JSON.parse(body); } catch { throw new Error('Local fixture response is not JSON'); }
}
async function actual(route, status = 200) {
  assert.equal(new URL(route.request().url()).origin, base.origin, 'Injected request remains local');
  let response, body;
  try { response = await route.fetch({ timeout: 15000, maxRedirects: 0, headers: await route.request().allHeaders() }); body = await response.text(); }
  catch { throw new Error('Actual local response could not be captured'); }
  assert.equal(response.status(), status, 'Injection follows the intended actual Worker response');
  return { response, body };
}
function guarded(action) {
  return async route => {
    try { return await action(route); }
    catch {
      deliveryFailures.push('Named local delivery failed');
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Named local delivery failed"}' }).catch(() => {});
    }
  };
}
const classUrl = () => base.origin + '/api/classes/class-a';
const inboxUrl = () => base.origin + '/api/notifications';
const classReload = page => page.getByRole('button', { name: 'Reload current class', exact: true });
const inboxReload = page => page.getByRole('button', { name: 'Reload my inbox', exact: true });
const profiles = page => page.locator('tr[data-class-profile-id]');
const header = page => page.locator('header').first();
const notice = (page, item) => page.locator('article[data-notification-id="' + item.id + '"]');
const mark = (page, item) => notice(page, item).getByRole('button', { name: 'Mark as Read', exact: true });
const retry = page => page.getByRole('button', { name: 'Retry original notice read status', exact: true });
const readEndpoint = item => '/api/notifications?' + new URLSearchParams({ id: item.id });
const pending = page => page.getByRole('region', { name: 'Unconfirmed notice read status', exact: true });
async function classReady(page) { await expect(classReload(page)).toBeEnabled(); await expect(page.getByRole('status').filter({ hasText: 'Loading current class details' })).toHaveCount(0); }
async function inboxReady(page) { await expect(inboxReload(page)).toBeEnabled(); await expect(page.getByRole('status').filter({ hasText: 'Loading your current inbox' })).toHaveCount(0); }
async function refreshClass(page) { await classReload(page).click(); await classReady(page); }
async function refreshInbox(page) { await inboxReload(page).click(); await inboxReady(page); }
async function hiddenClass(page) {
  await expect(profiles(page)).toHaveCount(0); await expect(page.getByText('Class Information', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'School navigation', exact: true })).toHaveCount(0);
  for (const actor of ['guardian-a', 'student-user-a', 'teacher-a', 'teacher-other', 'admin-a']) await expect(header(page)).not.toContainText(actor);
  await expect(page.getByRole('link', { name: 'Login', exact: true })).toBeVisible();
}
async function hiddenInbox(page) { await expect(page.locator('article[data-notification-id]')).toHaveCount(0); await expect(page.getByText('No notifications found for your current account.', { exact: true })).toHaveCount(0); }
async function geometry(page) {
  assert.equal(await page.locator('input:not([type=hidden]),select,textarea').evaluateAll(items => items.filter(item => !item.labels?.length && !item.getAttribute('aria-label') && !item.getAttribute('aria-labelledby')).length), 0, 'Native form controls have labels');
  assert.equal(await page.locator('button a,a button').count(), 0, 'Native buttons and links are not nested');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'No horizontal page overflow');
  assert.equal(await page.locator('button,input:not([type=hidden]),select,textarea').evaluateAll(items => items.filter(item => { const box = item.getBoundingClientRect(); return box.width && (box.left < -1 || box.right > innerWidth + 1); }).length), 0, 'Native controls fit the viewport');
}
async function frames(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function shot(page, name) {
  await page.evaluate(async () => { await document.fonts.ready; scrollTo(0, 0); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  const path = '/private/tmp/saha-family-ui-' + name + '.png'; await page.screenshot({ path, fullPage: true }); screenshots.push(path);
}
async function injectClass(name, project, action) {
  const handler = guarded(async route => {
    const saved = await actual(route); const value = JSON.parse(saved.body);
    assert.equal(value.id, 'class-a', 'Named projection starts from the actual requested class');
    return route.fulfill({ response: saved.response, body: project(value) });
  });
  await classPage.route(classUrl(), handler);
  try { await check(name, async () => { await refreshClass(classPage); await action(); }); }
  finally { await classPage.unroute(classUrl(), handler); }
}
async function injectInbox(name, project, action) {
  const handler = guarded(async route => { const saved = await actual(route); return route.fulfill({ response: saved.response, body: project(JSON.parse(saved.body)) }); });
  await inboxPage.route(inboxUrl(), handler);
  try { await check(name, async () => { await refreshInbox(inboxPage); await action(); }); }
  finally { await inboxPage.unroute(inboxUrl(), handler); }
}

try {
  const fixture = process.env.SAHA_WORKER_SESSION_FIXTURE, executablePath = process.env.SAHA_TEST_BROWSER;
  try {
    base = new URL(process.env.SAHA_WORKER_TEST_URL);
    if (!fixture || !executablePath || !['127.0.0.1', 'localhost'].includes(base.hostname) || !['http:', 'https:'].includes(base.protocol) || base.pathname !== '/' || base.search || base.hash || base.username || base.password) throw new Error('Invalid local setup');
    sessions = JSON.parse(readFileSync(fixture, 'utf8'));
    for (const actor of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'guardian-a', 'student-user-a']) if (typeof sessions[actor] !== 'string' || !/^__Host-saha_session=[^;\s]+$/.test(sessions[actor])) throw new Error('Invalid private fixture');
  } catch { throw new Error('Use an exact localhost origin, private fictional session fixture and local browser executable.'); }
  browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-background-networking'] });
  classContext = await context('guardian-a'); inboxContext = await context('guardian-a'); teacher = await context('teacher-a'); admin = await context('admin-a');
  classPage = await classContext.newPage(); inboxPage = await inboxContext.newPage();
  originalGuardianClass = await api(classContext, '/api/classes/class-a');
  originalGuardianInbox = await api(inboxContext, '/api/notifications');
  await switchActor(inboxContext, 'student-user-a');
  originalStudentClass = await api(inboxContext, '/api/classes/class-a'); originalStudentInbox = await api(inboxContext, '/api/notifications');
  await switchActor(inboxContext, 'guardian-a');
  for (const [key, userId] of [['ordinary', 'guardian-a'], ['duplicate', 'guardian-a'], ['lost', 'guardian-a'], ['legacy', 'guardian-a'], ['student', 'student-user-a']]) {
    const title = 'Fictional family ' + key + ' notice ' + suffix;
    const value = await api(teacher, '/api/notifications', 'POST', { userId, channel: 'in_app', title, body: 'Private fictional ' + key + ' inbox body ' + suffix + '. No external delivery or real learner details.' }, 201);
    assert.equal(value.userId, userId); assert.equal(value.channel, 'in_app'); assert.equal(value.title, title); assert.equal(value.readAt, null); ownedNotices.set(key, value);
  }
  const ordinary = ownedNotices.get('ordinary'), duplicate = ownedNotices.get('duplicate'), lost = ownedNotices.get('lost'), legacy = ownedNotices.get('legacy'), studentNotice = ownedNotices.get('student');

  await check('Private fixture resolves actual current fictional accounts', async () => {
    assert.deepEqual((await api(classContext, '/api/session')).role, 'guardian');
    assert.equal((await api(teacher, '/api/session')).role, 'teacher'); assert.equal((await api(admin, '/api/session')).role, 'admin');
    assert.equal(originalGuardianClass.id, 'class-a'); assert.equal(originalGuardianClass.schoolId, 'a'); assert.ok(Array.isArray(originalGuardianClass.enrolledStudents));
    assert.deepEqual(originalGuardianClass.enrolledStudents.map(item => item.id), ['student-a']);
  });
  await classPage.goto(base.origin + '/classes/class-a', { waitUntil: 'domcontentloaded' }); await classReady(classPage);
  await check('Guardian class renders one coherent actual scoped snapshot', async () => {
    const requests = []; const listener = request => { const url = new URL(request.url()); if (url.pathname.startsWith('/api/')) requests.push({ path: url.pathname, method: request.method() }); };
    classPage.on('request', listener); try { await refreshClass(classPage); } finally { classPage.off('request', listener); }
    assert.equal(requests.filter(item => item.path === '/api/classes/class-a' && item.method === 'GET').length, 1);
    assert.equal(requests.filter(item => item.path === '/api/enrolments' || item.path.startsWith('/api/students')).length, 0);
    await expect(profiles(classPage)).toHaveCount(originalGuardianClass.enrolledStudents.length);
    await expect(profiles(classPage).first()).toHaveAttribute('data-class-profile-id', 'student-a');
    await expect(classPage.getByText('Class Information', { exact: true })).toBeVisible();
  });
  await check('Family attendance uses the supported summary and current class instruction', async () => {
    await expect(classPage.getByRole('link', { name: 'View attendance records', exact: true })).toHaveAttribute('href', '/attendance');
    await expect(classPage.getByText('Choose class-a in the attendance class selector to view the records available to your account.', { exact: true })).toBeVisible();
    await expect(classPage.getByRole('link', { name: 'Review attendance for this class', exact: true })).toHaveCount(0);
  });
  await check('Actual guardian shell has native scope-specific navigation and main shortcut', async () => {
    await expect(header(classPage)).toContainText('guardian-a');
    await expect(classPage.getByRole('navigation', { name: 'School navigation', exact: true })).toBeVisible();
    await expect(classPage.getByRole('link', { name: 'Reading practice planner', exact: true })).toHaveCount(0);
    await expect(classPage.getByRole('link', { name: 'Class resources', exact: true })).toHaveCount(0);
    await expect(classPage.getByRole('link', { name: 'Skip to main content', exact: true })).toHaveAttribute('href', '#main-content');
    await expect(classPage.locator('main#main-content')).toHaveAttribute('tabindex', '-1');
  });
  await check('Student parent switches class view and its current header together', async () => {
    await switchActor(classContext, 'student-user-a'); await refreshClass(classPage);
    await expect(header(classPage)).toContainText('student-user-a'); await expect(header(classPage)).not.toContainText('guardian-a');
    await expect(profiles(classPage)).toHaveCount(originalStudentClass.enrolledStudents.length);
    await expect(classPage.getByRole('link', { name: 'View attendance records', exact: true })).toHaveAttribute('href', '/attendance');
    await expect(classPage.getByRole('link', { name: 'Class resources', exact: true })).toHaveAttribute('href', '/learning');
    await expect(classPage.getByRole('link', { name: 'Reading practice planner', exact: true })).toHaveCount(0);
  });
  await check('Current staff class retains reviewed editor and planner navigation', async () => {
    await switchActor(classContext, 'teacher-a'); await refreshClass(classPage);
    await expect(header(classPage)).toContainText('teacher-a'); await expect(header(classPage)).not.toContainText('student-user-a');
    await expect(classPage.getByRole('link', { name: 'Review attendance for this class', exact: true })).toHaveAttribute('href', '/classes/class-a/attendance');
    await expect(classPage.getByRole('link', { name: 'Reading practice planner', exact: true })).toHaveAttribute('href', '/reading-practice');
    await switchActor(classContext, 'guardian-a'); await refreshClass(classPage);
  });
  await check('Class reload hides private snapshot and header while actual reply is held', async () => {
    let deliver, captured; const gate = new Promise(resolve => { deliver = resolve; });
    const handler = guarded(async route => { captured = await actual(route); await gate; return route.fulfill({ response: captured.response, body: captured.body }); });
    await classPage.route(classUrl(), handler);
    try {
      await classReload(classPage).click(); await expect.poll(() => !!captured).toBe(true);
      assert.deepEqual(JSON.parse(captured.body), originalGuardianClass); await hiddenClass(classPage);
      deliver(); await classReady(classPage); await expect(header(classPage)).toContainText('guardian-a'); await expect(profiles(classPage)).toHaveCount(1);
    } finally { deliver(); await classPage.unroute(classUrl(), handler); }
  });
  await check('Late original class reply cannot restore an account after scope changes', async () => {
    let deliver, captured; const gate = new Promise(resolve => { deliver = resolve; });
    const handler = guarded(async route => { captured = await actual(route); await gate; return route.fulfill({ response: captured.response, body: captured.body }); });
    await classPage.route(classUrl(), handler);
    try {
      await classReload(classPage).click(); await expect.poll(() => !!captured).toBe(true); await hiddenClass(classPage);
      await switchActor(classContext, 'teacher-other'); deliver(); await classReady(classPage);
      await hiddenClass(classPage); await expect(classPage.getByRole('alert')).toContainText('could not be verified');
      await expect(classPage.getByText('No student profiles are available in this class for your current account.', { exact: true })).toHaveCount(0);
    } finally { deliver(); await classPage.unroute(classUrl(), handler); }
  });
  await check('Actual class denial hides private content and focuses honest recovery', async () => {
    await api(classContext, '/api/classes/class-a', 'GET', undefined, 404); await refreshClass(classPage);
    await hiddenClass(classPage); await expect(classPage.getByRole('alert')).toContainText('unavailable to your current account'); await expect(classPage.getByRole('alert')).toBeFocused();
    await expect(classPage.getByRole('link', { name: 'Open your current class list', exact: true })).toHaveAttribute('href', '/classes');
  });
  await check('Restored original account reload displays only currently authorized class data', async () => {
    await switchActor(classContext, 'guardian-a'); await refreshClass(classPage); await expect(classPage.getByRole('alert')).toHaveCount(0);
    await expect(header(classPage)).toContainText('guardian-a'); await expect(profiles(classPage)).toHaveCount(1);
    assert.deepEqual(await api(classContext, '/api/classes/class-a'), originalGuardianClass);
  });
  await check('Full route change suppresses an obsolete actual class reply and prior profiles', async () => {
    await switchActor(classContext, 'admin-a'); await refreshClass(classPage);
    const expected = await api(classContext, '/api/classes/class-other');
    let deliver, captured, finish; const gate = new Promise(resolve => { deliver = resolve; });
    const completed = new Promise(resolve => { finish = resolve; });
    const handler = guarded(async route => {
      try {
        captured = await actual(route); await gate;
        // Navigating unmounts the old document and may cancel its route. Either
        // unchanged delivery or cancellation must leave the new document intact.
        return await route.fulfill({ response: captured.response, body: captured.body }).catch(() => {});
      } finally { finish(); }
    });
    await classPage.route(classUrl(), handler);
    try {
      await classReload(classPage).click(); await expect.poll(() => !!captured).toBe(true); await hiddenClass(classPage);
      await classPage.goto(base.origin + '/classes/class-other', { waitUntil: 'domcontentloaded' }); await classReady(classPage);
      await expect(classPage.getByRole('heading', { name: expected.name, exact: true })).toBeVisible();
      await expect(profiles(classPage)).toHaveCount(expected.enrolledStudents.length); await expect(classPage.locator('tr[data-class-profile-id="student-a"]')).toHaveCount(0);
      deliver(); await completed; await frames(classPage);
      await expect(classPage.getByRole('heading', { name: expected.name, exact: true })).toBeVisible(); await expect(classPage.locator('tr[data-class-profile-id="student-a"]')).toHaveCount(0);
      await expect(header(classPage)).toContainText('admin-a');
    } finally { deliver(); if (captured) await completed; await classPage.unroute(classUrl(), handler); }
    await switchActor(classContext, 'guardian-a'); await classPage.goto(base.origin + '/classes/class-a', { waitUntil: 'domcontentloaded' }); await classReady(classPage);
  });
  await injectClass('Named wrong-class response rejects the entire delivered snapshot', value => JSON.stringify({ ...value, id: 'class-other' }), async () => {
    await hiddenClass(classPage); await expect(classPage.getByRole('alert')).toContainText('could not be verified');
  });
  await injectClass('Named cross-school profile response rejects its associated class metadata', value => JSON.stringify({ ...value, enrolledStudents: value.enrolledStudents.map(item => ({ ...item, schoolId: 'b' })) }), async () => {
    await hiddenClass(classPage); await expect(classPage.getByRole('alert')).toContainText('could not be verified');
  });
  await injectClass('Named malformed class response is unavailable rather than empty', () => '{', async () => {
    await hiddenClass(classPage); await expect(classPage.getByRole('alert')).toContainText('could not be verified');
    await expect(classPage.getByText('No student profiles are available in this class for your current account.', { exact: true })).toHaveCount(0);
  });
  await check('Named failed class delivery hides former data rather than returning an empty success', async () => {
    const handler = guarded(async route => { await actual(route); return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Named class delivery unavailable"}' }); });
    await classPage.route(classUrl(), handler);
    try { await refreshClass(classPage); await hiddenClass(classPage); await expect(classPage.getByRole('alert')).toContainText('could not be verified'); }
    finally { await classPage.unroute(classUrl(), handler); }
  });
  await injectClass('Named empty availability projection never claims enrolments are absent', value => JSON.stringify({ ...value, enrolledStudents: [] }), async () => {
    await expect(profiles(classPage)).toHaveCount(0); await expect(classPage.getByText('Class Information', { exact: true })).toBeVisible();
    await expect(classPage.getByText('No student profiles are available in this class for your current account.', { exact: true })).toBeVisible();
    await expect(classPage.getByText('This list reflects your current access. It does not imply that unavailable students have no enrolment.', { exact: true })).toBeVisible();
    assert.deepEqual(await api(classContext, '/api/classes/class-a'), originalGuardianClass);
  });
  await injectClass('Named impossible and ambiguous class dates preserve literal review warnings', value => JSON.stringify({ ...value, createdAt: '2026-02-30T12:00:00.000Z', updatedAt: '0' }), async () => {
    await expect(classPage.getByText('Stored date requires review: 2026-02-30T12:00:00.000Z', { exact: true })).toBeVisible();
    await expect(classPage.getByText('Stored date requires review: 0', { exact: true })).toBeVisible(); await expect(profiles(classPage)).toHaveCount(1);
    assert.deepEqual(await api(classContext, '/api/classes/class-a'), originalGuardianClass);
  });
  await injectClass('Named duplicate profile delivery discloses repeated entries without a repair', value => JSON.stringify({ ...value, enrolledStudents: [...value.enrolledStudents, ...value.enrolledStudents] }), async () => {
    await expect(profiles(classPage)).toHaveCount(1); await expect(classPage.getByRole('status')).toContainText('1 repeated profile entries');
    assert.deepEqual(await api(classContext, '/api/classes/class-a'), originalGuardianClass);
  });
  await check('Class native focus and 390px geometry retain scoped table semantics', async () => {
    await refreshClass(classPage); await classReload(classPage).focus(); await expect(classReload(classPage)).toBeFocused();
    await expect(classPage.getByRole('region', { name: 'Available class student profiles', exact: true })).toHaveAttribute('tabindex', '0');
    await expect(classPage.getByRole('table')).toHaveAccessibleName('Student profiles currently available in this class');
    await geometry(classPage); await shot(classPage, 'class-desktop'); await classPage.setViewportSize({ width: 390, height: 900 }); await geometry(classPage); await shot(classPage, 'class-mobile');
  });

  await inboxPage.goto(base.origin + '/notifications', { waitUntil: 'domcontentloaded' }); await inboxReady(inboxPage);
  await check('Guardian inbox contains only actual owned notices and has no invented shared shell', async () => {
    const rows = await api(inboxContext, '/api/notifications'); assert.ok(rows.every(item => item.userId === 'guardian-a'));
    await expect(notice(inboxPage, ordinary)).toBeVisible(); await expect(notice(inboxPage, studentNotice)).toHaveCount(0);
    await expect(inboxPage.getByRole('navigation', { name: 'School navigation', exact: true })).toHaveCount(0);
    await expect(notice(inboxPage, ordinary).getByRole('heading', { name: ordinary.title, exact: true })).toBeVisible();
    await expect(notice(inboxPage, ordinary).locator('time')).toHaveAttribute('datetime', ordinary.createdAt);
  });
  await check('Current inbox account switch clears original bodies before exposing its own notices', async () => {
    await switchActor(inboxContext, 'student-user-a'); await refreshInbox(inboxPage);
    await expect(notice(inboxPage, ordinary)).toHaveCount(0); await expect(notice(inboxPage, studentNotice)).toBeVisible();
    assert.ok((await api(inboxContext, '/api/notifications')).every(item => item.userId === 'student-user-a'));
    await api(inboxContext, readEndpoint(ordinary), 'PATCH', undefined, 404);
    await switchActor(inboxContext, 'guardian-a'); await refreshInbox(inboxPage); await expect(notice(inboxPage, ordinary)).toBeVisible();
  });
  await check('Delayed old-owner inbox cannot restore private bodies after the account changes', async () => {
    let deliver, captured; const gate = new Promise(resolve => { deliver = resolve; });
    const handler = guarded(async route => { captured = await actual(route); await gate; return route.fulfill({ response: captured.response, body: captured.body }); });
    await inboxPage.route(inboxUrl(), handler);
    try {
      await inboxReload(inboxPage).click(); await expect.poll(() => !!captured).toBe(true); await hiddenInbox(inboxPage);
      assert.ok(JSON.parse(captured.body).every(item => item.userId === 'guardian-a'));
      await switchActor(inboxContext, 'student-user-a'); deliver(); await inboxReady(inboxPage);
      await hiddenInbox(inboxPage); await expect(inboxPage.getByRole('alert')).toContainText('could not be verified');
      await expect(pending(inboxPage)).toHaveCount(0);
    } finally { deliver(); await inboxPage.unroute(inboxUrl(), handler); }
    await switchActor(inboxContext, 'guardian-a'); await refreshInbox(inboxPage); await expect(notice(inboxPage, ordinary)).toBeVisible();
  });
  let originalRead;
  await check('Actual mark confirmation uses the saved exact recipient-owned timestamp', async () => {
    const writes = []; const capture = request => { const url = new URL(request.url()); if (url.pathname === '/api/notifications' && request.method() === 'PATCH') writes.push({ path: url.pathname + url.search, body: request.postData() }); };
    inboxPage.on('request', capture);
    try { await mark(inboxPage, ordinary).click(); await expect(inboxPage.getByRole('status')).toContainText('Read status confirmed from your saved inbox.'); await inboxReady(inboxPage); }
    finally { inboxPage.off('request', capture); }
    assert.deepEqual(writes, [{ path: readEndpoint(ordinary), body: null }]);
    originalRead = (await api(inboxContext, '/api/notifications')).find(item => item.id === ordinary.id);
    assert.ok(originalRead); assert.equal(originalRead.userId, 'guardian-a'); assert.equal(originalRead.createdAt, ordinary.createdAt);
    assert.equal(new Date(originalRead.readAt).toISOString(), originalRead.readAt);
    await expect(notice(inboxPage, ordinary).locator('time')).toHaveCount(2);
    assert.deepEqual(await notice(inboxPage, ordinary).locator('time').evaluateAll(items => items.map(item => item.getAttribute('datetime'))), [ordinary.createdAt, originalRead.readAt]);
    await expect(mark(inboxPage, ordinary)).toHaveCount(0);
  });
  await check('Viewing confirmed saved read status preserves its first read and update time', async () => {
    let writes = 0; const capture = request => { if (new URL(request.url()).pathname === '/api/notifications' && request.method() === 'PATCH') writes++; };
    inboxPage.on('request', capture); try { await refreshInbox(inboxPage); await refreshInbox(inboxPage); } finally { inboxPage.off('request', capture); }
    assert.equal(writes, 0); assert.deepEqual((await api(inboxContext, '/api/notifications')).find(item => item.id === ordinary.id), originalRead);
  });
  await check('Same-frame duplicate notice action sends one actual marker request', async () => {
    let writes = 0; const capture = request => { if (new URL(request.url()).pathname === '/api/notifications' && request.method() === 'PATCH') writes++; };
    inboxPage.on('request', capture);
    try { await mark(inboxPage, duplicate).evaluate(element => { element.click(); element.click(); }); await expect(inboxPage.getByRole('status')).toContainText('Read status confirmed from your saved inbox.'); await inboxReady(inboxPage); }
    finally { inboxPage.off('request', capture); }
    assert.equal(writes, 1); assert.ok((await api(inboxContext, '/api/notifications')).find(item => item.id === duplicate.id).readAt);
  });
  const lostWrites = []; let committedLostRead;
  const lostCapture = request => { const url = new URL(request.url()); if (url.pathname === '/api/notifications' && request.method() === 'PATCH') lostWrites.push({ path: url.pathname + url.search, body: request.postData() }); };
  inboxPage.on('request', lostCapture);
  await check('Named lost committed marker reply hides inbox without an automatic repeat', async () => {
    const handler = guarded(async route => {
      const saved = await actual(route); assert.equal(JSON.parse(saved.body).success, true);
      committedLostRead = (await api(inboxContext, '/api/notifications')).find(item => item.id === lost.id); assert.ok(committedLostRead?.readAt);
      return route.abort('failed');
    });
    await inboxPage.route(base.origin + readEndpoint(lost), handler);
    try { await mark(inboxPage, lost).click(); await expect(inboxPage.getByRole('alert')).toContainText('read status could not be confirmed'); await inboxReady(inboxPage); }
    finally { await inboxPage.unroute(base.origin + readEndpoint(lost), handler); }
    await hiddenInbox(inboxPage); await expect(pending(inboxPage)).toBeVisible(); await expect(retry(inboxPage)).toHaveCount(0); await frames(inboxPage);
    assert.deepEqual(lostWrites, [{ path: readEndpoint(lost), body: null }]);
    await expect(inboxPage.getByRole('status').filter({ hasText: 'Read status confirmed' })).toHaveCount(0);
  });
  await check('Fresh original inbox exposes deliberate exact notice recovery without sending it', async () => {
    await refreshInbox(inboxPage); await expect(pending(inboxPage)).toContainText('Original notice: ' + lost.title); await expect(retry(inboxPage)).toBeEnabled();
    await expect(notice(inboxPage, lost)).toBeVisible(); await expect(mark(inboxPage, lost)).toHaveCount(0);
    assert.equal(lostWrites.length, 1); assert.deepEqual((await api(inboxContext, '/api/notifications')).find(item => item.id === lost.id), committedLostRead);
  });
  await check('Another current inbox account cannot inspect retry or dismiss original pending notice', async () => {
    await switchActor(inboxContext, 'student-user-a'); await refreshInbox(inboxPage);
    await expect(notice(inboxPage, lost)).toHaveCount(0); await expect(pending(inboxPage)).not.toContainText(lost.title); await expect(retry(inboxPage)).toHaveCount(0);
    await expect(inboxPage.getByRole('button', { name: 'Dismiss unavailable notice reminder', exact: true })).toHaveCount(0);
    await expect(notice(inboxPage, studentNotice)).toBeVisible(); await expect(mark(inboxPage, studentNotice)).toBeDisabled(); assert.equal(lostWrites.length, 1);
  });
  await check('Explicit restored original recovery preserves exact endpoint and first saved read time', async () => {
    await switchActor(inboxContext, 'guardian-a'); await refreshInbox(inboxPage); await retry(inboxPage).click();
    await expect(inboxPage.getByRole('status')).toContainText('Read status confirmed from your saved inbox.'); await inboxReady(inboxPage);
    assert.deepEqual(lostWrites, [{ path: readEndpoint(lost), body: null }, { path: readEndpoint(lost), body: null }]);
    assert.deepEqual((await api(inboxContext, '/api/notifications')).find(item => item.id === lost.id), committedLostRead);
    await expect(pending(inboxPage)).toHaveCount(0); inboxPage.off('request', lostCapture);
  });
  await injectInbox('Named mixed-owner notice delivery rejects every private article', rows => JSON.stringify(rows.map(item => item.id === legacy.id ? { ...item, userId: 'student-user-a' } : item)), async () => {
    await hiddenInbox(inboxPage); await expect(inboxPage.getByRole('alert')).toContainText('could not be verified');
  });
  await injectInbox('Named malformed inbox delivery is unavailable rather than a false empty success', () => '{', async () => {
    await hiddenInbox(inboxPage); await expect(inboxPage.getByRole('alert')).toContainText('could not be verified');
  });
  await check('Actual signed-out refresh hides prior private inbox and focuses sign-in recovery', async () => {
    await refreshInbox(inboxPage); await expect(notice(inboxPage, legacy)).toBeVisible();
    await switchActor(inboxContext, null); await api(inboxContext, '/api/session', 'GET', undefined, 401); await refreshInbox(inboxPage);
    await hiddenInbox(inboxPage); await expect(inboxPage.getByRole('alert')).toContainText('Sign in again'); await expect(inboxPage.getByRole('alert')).toBeFocused();
    await expect(inboxPage.getByRole('link', { name: 'Sign in in another tab', exact: true })).toHaveAttribute('href', '/login');
    await switchActor(inboxContext, 'guardian-a'); await refreshInbox(inboxPage); await expect(notice(inboxPage, legacy)).toBeVisible();
  });
  await check('Actual empty current-owner inbox never grants administrator access to others notices', async () => {
    await switchActor(inboxContext, 'admin-b'); assert.deepEqual(await api(inboxContext, '/api/notifications'), []); await refreshInbox(inboxPage);
    await expect(inboxPage.getByText('No notifications found for your current account.', { exact: true })).toBeVisible(); await expect(inboxPage.locator('article[data-notification-id]')).toHaveCount(0);
    await expect(inboxPage.getByRole('alert')).toHaveCount(0); await switchActor(inboxContext, 'guardian-a'); await refreshInbox(inboxPage);
  });
  await check('Named noncanonical notice dates show literal warnings without new mark or stored repair', async () => {
    for (const stored of ['2026-02-30T12:00:00.000Z', '0', '']) {
      const handler = guarded(async route => { const saved = await actual(route); const rows = JSON.parse(saved.body); return route.fulfill({ response: saved.response, body: JSON.stringify(rows.map(item => item.id === legacy.id ? { ...item, createdAt: stored, readAt: stored } : item)) }); });
      await inboxPage.route(inboxUrl(), handler);
      try {
        await refreshInbox(inboxPage); const article = notice(inboxPage, legacy);
        assert.equal(await article.locator('span').evaluateAll((items, literal) => items.filter(item => item.textContent === 'Stored date requires review: ' + literal).length, stored), 2);
        await expect(mark(inboxPage, legacy)).toHaveCount(0); await expect(article.getByText('Unread', { exact: true })).toHaveCount(0);
        assert.deepEqual((await api(inboxContext, '/api/notifications')).find(item => item.id === legacy.id), legacy);
      } finally { await inboxPage.unroute(inboxUrl(), handler); }
    }
  });
  await check('Inbox native controls and 390px layout keep saved evidence readable', async () => {
    await refreshInbox(inboxPage); await inboxReload(inboxPage).focus(); await expect(inboxReload(inboxPage)).toBeFocused();
    assert.equal(await inboxPage.locator('article[data-notification-id]').evaluateAll(items => items.filter(item => { const id = item.getAttribute('aria-labelledby'); return !id || !document.getElementById(id); }).length), 0);
    await geometry(inboxPage); await shot(inboxPage, 'inbox-desktop'); await inboxPage.setViewportSize({ width: 390, height: 900 }); await geometry(inboxPage); await shot(inboxPage, 'inbox-mobile');
  });
  await check('Base class and inbox evidence remain unchanged and traffic stays local', async () => {
    await switchActor(classContext, 'guardian-a'); assert.deepEqual(await api(classContext, '/api/classes/class-a'), originalGuardianClass);
    await switchActor(inboxContext, 'student-user-a'); assert.deepEqual(await api(inboxContext, '/api/classes/class-a'), originalStudentClass);
    const suffixIds = new Set([...ownedNotices.values()].map(item => item.id));
    const ordered = items => [...items].sort((left, right) => left.id.localeCompare(right.id));
    assert.deepEqual(ordered((await api(inboxContext, '/api/notifications')).filter(item => !suffixIds.has(item.id))), ordered(originalStudentInbox));
    await switchActor(inboxContext, 'guardian-a'); assert.deepEqual(ordered((await api(inboxContext, '/api/notifications')).filter(item => !suffixIds.has(item.id))), ordered(originalGuardianInbox));
    assert.equal(externalRequests, 0); assert.equal(pageErrors, 0); assert.equal(failedAssets, 0); preservationVerified = true;
  });
  assert.equal(passed, plannedProcedures, 'Every planned mounted family procedure completed');
  checkpoint = 'Final local family browser record';
} catch (error) {
  const errorName = error instanceof Error && ['Error', 'AssertionError', 'TypeError', 'SyntaxError', 'TimeoutError'].includes(error.name) ? error.name : 'Error';
  failureInfo = { checkpoint, errorName };
  throw new Error('Family browser procedure failed at checkpoint: ' + checkpoint + ' (' + errorName + ')');
} finally {
  for (const value of contexts) await value.close().catch(() => {});
  await browser?.close().catch(() => {});
  const result = { executedAt: new Date().toISOString(), plannedProcedures, passed, failed: failureInfo ? 1 : 0, skipped: 0, ...(failureInfo ?? {}), checks, screenshots, externalRequests, localBrowserRequests, fixtureApiRequests, pageErrors, failedAssets, suffixNoticeCount: ownedNotices.size, preservationVerified, limits: [
    'Matching built localhost Worker and private fictional fixture sessions only; no provider authentication, external recipient, message delivery or real records.',
    'Only five suffix-scoped in_app notices are created. Only three guardian-owned suffix notices are marked; base account/profile/link/role/class/enrolment and notice fields are unchanged.',
    'Saved mark timestamps and owner/exact original retry are verified through actual Worker endpoints. Committed reply loss is an explicit local transport fault after a captured real successful PATCH.',
    'Legacy dates, duplicate/empty class profiles, wrong-class/cross-school bodies and malformed JSON are named response projections after actual real GETs; underlying saved evidence is separately checked unchanged.',
    'Actual empty admin-b inbox, current account switches, signed-out session denial and teacher-other class denial use unchanged Worker services. Delayed original class delivery is compared against fresh current-session scope.',
    'Class checks mount the actual shared AppShell; notifications currently has no shared shell. A null class principal hides header identity/menu, while the page owns protected content and current-scope verification.',
    'Pending notice recovery exists only within the mounted page. A full-page route change may cancel the old GET rather than deliver its response; both outcomes leave only the new document visible.',
    'Sampled native labels/focus/table semantics and 390px screenshots are bounded browser observations, not assistive-technology certification, hosted acceptance or UAT.',
  ] };
  writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ plannedProcedures, passed, failed: result.failed, skipped: 0, externalRequests, pageErrors, failedAssets, preservationVerified }));
}
