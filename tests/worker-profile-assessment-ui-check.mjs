// Manual mounted-browser procedures over a matching isolated built localhost Worker.
// Uses private fictional fixture sessions. Only suffix-owned unlinked profiles and
// their exact student–guardian pairs may be created; base educational evidence is read-only.
// Named delivery faults/projections use actual handler responses and are disclosed separately.
// Public guardian-link DTOs omit isPrimary: its persistence is proved by the offline
// profile-assessment contract, not claimed by these mounted browser procedures.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';

const plannedProcedures = 36;
const resultPath = '/private/tmp/saha-profile-assessment-ui-results.json';
const origin = process.env.SAHA_WORKER_TEST_URL, fixture = process.env.SAHA_WORKER_SESSION_FIXTURE, executablePath = process.env.SAHA_TEST_BROWSER;
if (!origin || !fixture || !executablePath) throw new Error('Supply exact localhost Worker origin, private fictional session fixture and local browser.');
const base = new URL(origin);
if (!['localhost', '127.0.0.1'].includes(base.hostname) || !['http:', 'https:'].includes(base.protocol) || base.pathname !== '/' || base.search || base.hash || base.username || base.password) throw new Error('This procedure requires an exact localhost origin.');
const sessions = JSON.parse(readFileSync(fixture, 'utf8'));
const suffix = crypto.randomUUID().slice(0, 8), ownedStudents = new Set(), ownedGuardians = new Set();
const fixtureActors = new WeakMap();
const contexts = [], checks = [], screenshots = [], deliveryFailures = [], faults = [];
let browser, admin, teacher, guardian, learner;
let passed = 0, fixtureRequests = 0, browserApiRequests = 0, externalRequests = 0, pageErrors = 0, failedAssets = 0;
let procedure = 'Private fictional fixture setup', checkpoint = 'Local setup', failure = null, preservationVerified = false;
const stage = name => { checkpoint = name; };
async function bounded(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Named local delivery readiness timed out')), 20000); })]); }
  finally { clearTimeout(timer); }
}
async function check(name, action) {
  procedure = name; stage('Named procedure assertions'); await action();
  assert.equal(deliveryFailures.length, 0, 'Named local transport setup completed'); checks.push(name); passed++; console.log('ok - ' + name);
}
function mutationAllowed(path, method, data) {
  if (['GET', 'HEAD'].includes(method)) return true;
  if (method !== 'POST') return false;
  if (path === '/api/students') return data?.schoolId === 'a' && data?.userId === undefined && typeof data?.firstName === 'string' && data.firstName.includes(suffix)
    && data?.lastName === 'Synthetic' && typeof data?.admissionNumber === 'string' && data.admissionNumber.startsWith('UI-PROFILE-' + suffix + '-') && data.dateOfBirth === '2012-02-29';
  if (path === '/api/guardians') return data?.userId === undefined && typeof data?.name === 'string' && data.name.startsWith('Profile Guardian ' + suffix + '-') && data.relationship === 'Synthetic guardian';
  const link = /^\/api\/students\/([^/]+)\/guardians$/.exec(path);
  return !!link && ownedStudents.has(decodeURIComponent(link[1])) && ownedGuardians.has(data?.guardianId) && Object.keys(data ?? {}).length === 1;
}
async function switchActor(value, actor) {
  assert.equal(typeof sessions[actor], 'string', 'Required fictional fixture actor exists');
  const cookie = sessions[actor], split = cookie.indexOf('=');
  assert.ok(split > 0, 'Actual fixture cookie has a name and opaque value');
  await value.clearCookies(); await value.setExtraHTTPHeaders({ cookie });
  // Native redirects need the real browser jar: an injected Cookie header alone
  // is lost on the redirect. Use the exact existing fixture token, never a new one.
  await value.addCookies([{ name: cookie.slice(0, split), value: cookie.slice(split + 1), domain: base.hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]);
  fixtureActors.set(value, actor);
}
async function context(actor) {
  const value = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Kolkata', serviceWorkers: 'block' });
  contexts.push(value); await switchActor(value, actor);
  value.setDefaultTimeout(12000); value.setDefaultNavigationTimeout(20000);
  value.on('request', request => { const url = new URL(request.url()); if (url.origin === base.origin && url.pathname.startsWith('/api/')) browserApiRequests++; });
  value.on('page', page => {
    page.on('pageerror', () => { pageErrors++; });
    page.on('response', response => { if (response.status() >= 400 && ['script', 'stylesheet'].includes(response.request().resourceType())) failedAssets++; });
  });
  await value.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base.origin) { externalRequests++; return route.abort(); }
    let data; try { data = request.postData() ? request.postDataJSON() : undefined; } catch { deliveryFailures.push('Unexpected non-JSON local mutation'); return route.abort(); }
    if (!mutationAllowed(url.pathname, request.method(), data)) { deliveryFailures.push('Unexpected local mutation blocked'); return route.abort(); }
    return route.continue();
  });
  return value;
}
async function api(value, path, method = 'GET', data, expected = 200) {
  const url = new URL(path, base); assert.equal(url.origin, base.origin, 'API request remains local');
  assert.equal(mutationAllowed(url.pathname, method, data), true, 'Fixture mutation is suffix-owned'); fixtureRequests++;
  let response, body;
  try { response = await value.request.fetch(url.href, { method, timeout: 15000, maxRedirects: 0, headers: method === 'GET' ? {} : { Origin: base.origin }, ...(data === undefined ? {} : { data }) }); body = await response.text(); }
  catch { throw new Error('Local fixture transport unavailable'); }
  assert.equal(response.status(), expected, 'Actual fixture handler returned expected status');
  try { return JSON.parse(body); } catch { throw new Error('Actual fixture response is not JSON'); }
}
async function actual(route, expected = 200) {
  const request = route.request(), url = new URL(request.url()); assert.equal(url.origin, base.origin, 'Captured actual response remains local');
  // Capture the exact fixture actor now. A held old response never re-fetches
  // under a newer account; only the browser transport's Cookie is normalized.
  const actor = fixtureActors.get(request.frame().page().context()), cookie = sessions[actor];
  assert.equal(typeof cookie, 'string', 'Captured browser context has an actual fixture actor');
  assert.equal(mutationAllowed(url.pathname, request.method(), request.postData() ? request.postDataJSON() : undefined), true, 'Captured request mutation is suffix-owned');
  let response, body;
  try { response = await route.fetch({ timeout: 15000, maxRedirects: 0, headers: { ...await request.allHeaders(), cookie } }); body = await response.text(); }
  catch { throw new Error('Actual local delivery capture unavailable'); }
  assert.equal(response.status(), expected, 'Named delivery starts from an actual saved handler response'); return { response, body };
}
function guarded(action) {
  return async route => {
    try { return await action(route); }
    catch { deliveryFailures.push('Named local delivery failed'); return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Named local delivery failed"}' }).catch(() => {}); }
  };
}
const profilePath = id => '/students/' + encodeURIComponent(id);
const profileApi = id => '/api/students/' + encodeURIComponent(id);
const linkApi = id => profileApi(id) + '/guardians';
const main = page => page.locator('#main-content');
const reloadProfile = page => page.getByRole('button', { name: 'Reload student profile', exact: true });
const reloadIndex = page => page.getByRole('button', { name: 'Reload assessments', exact: true });
const linkedRows = page => page.locator('[data-linked-guardian-id]');
const assessmentRows = page => page.locator('[data-assessment-list-item]');
const chooser = page => page.getByRole('combobox', { name: 'Guardian to link', exact: true });
const linkButton = page => page.getByRole('button', { name: 'Link Guardian', exact: true });
const retry = page => page.getByRole('button', { name: 'Retry pending guardian link', exact: true });
async function profileReady(page) {
  await expect(page.getByRole('heading', { name: 'Student Profile', exact: true, level: 1 })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /^Loading current student profile…$/ })).toHaveCount(0);
  await expect(main(page).locator('dl')).toBeVisible();
}
async function indexReady(page) {
  await expect(page.getByRole('heading', { name: 'Assessments', exact: true, level: 1 })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /^Loading current assessments…$/ })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Filter by Class', exact: true })).toBeVisible();
}
async function openProfile(page, id) { stage('Native profile document'); const response = await page.goto(base.origin + profilePath(id), { waitUntil: 'domcontentloaded' }); assert.equal(response.status(), 200); await profileReady(page); }
async function openIndex(page) { stage('Native assessment document'); const response = await page.goto(base.origin + '/assessments', { waitUntil: 'domcontentloaded' }); assert.equal(response.status(), 200); await indexReady(page); }
async function refreshProfile(page) { await reloadProfile(page).click(); await profileReady(page); }
async function refreshIndex(page) { await reloadIndex(page).click(); await indexReady(page); }
async function hiddenProfile(page) {
  await expect(main(page).locator('dl')).toHaveCount(0); await expect(linkedRows(page)).toHaveCount(0); await expect(chooser(page)).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'School navigation', exact: true })).toHaveCount(0);
}
async function ids(locator, attr) { return locator.evaluateAll((items, key) => items.map(item => item.getAttribute(key)).sort(), attr); }
async function pairRows(item) { return api(admin, linkApi(item.student.id)); }
async function choose(page, item) { await chooser(page).selectOption(item.guardian.id); await expect(linkButton(page)).toBeEnabled(); }
async function capturePost(page, item, action) {
  let captured; const path = linkApi(item.student.id), handler = guarded(async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const saved = await actual(route); captured = { endpoint: new URL(route.request().url()).pathname, body: route.request().postData(), value: JSON.parse(saved.body) };
    return route.fulfill({ response: saved.response, body: saved.body });
  });
  await page.route(base.origin + path, handler);
  try { await action(); await expect(page.getByRole('status').filter({ hasText: 'Guardian link was acknowledged by the school system.' })).toBeVisible(); await profileReady(page); assert.ok(captured); return captured; }
  finally { await page.unroute(base.origin + path, handler); }
}
async function preserveBase() {
  const pupils = await Promise.all(['student-a', 'student-other'].map(id => api(admin, profileApi(id))));
  const links = await Promise.all(['student-a', 'student-other'].map(id => api(admin, linkApi(id))));
  const guardianProfiles = (await api(admin, '/api/guardians')).filter(row => ['guardian-profile-a', 'guardian-profile-other'].includes(row.id));
  const enrolments = (await api(admin, '/api/enrolments')).filter(row => ['student-a', 'student-other'].includes(row.studentId));
  const classes = (await api(admin, '/api/classes')).filter(row => ['class-a', 'class-other'].includes(row.id));
  const assessments = (await api(admin, '/api/assessments')).filter(row => row.id === 'assessment-a');
  const results = await api(admin, '/api/assessments/assessment-a/results');
  return { pupils, links, guardianProfiles, enrolments, classes, assessments, results };
}
async function geometry(page) {
  assert.equal(await page.locator('input:not([type=hidden]),select,textarea').evaluateAll(items => items.filter(item => !item.labels?.length && !item.getAttribute('aria-label') && !item.getAttribute('aria-labelledby')).length), 0, 'Native controls have labels');
  assert.equal(await page.locator('button a,a button').count(), 0, 'Interactive elements are not nested');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Page fits viewport');
  assert.equal(await page.locator('button,input:not([type=hidden]),select,textarea').evaluateAll(items => items.filter(item => { const box = item.getBoundingClientRect(); return box.width && (box.left < -1 || box.right > innerWidth + 1); }).length), 0, 'Native controls fit viewport');
}
async function shot(page, name) {
  await page.evaluate(async () => { await document.fonts.ready; scrollTo(0, 0); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  const path = '/private/tmp/saha-profile-assessment-ui-' + name + '.png'; await page.screenshot({ path, fullPage: true }); screenshots.push(path);
}
async function projectedProfile(page, id, name, project, assertion) {
  const handler = guarded(async route => { const saved = await actual(route); return route.fulfill({ response: saved.response, body: JSON.stringify(project(JSON.parse(saved.body))) }); });
  faults.push(name + ' (delivered actual GET projection only; no stored change)'); await page.route(base.origin + profileApi(id), handler);
  try { await check(name, async () => { await refreshProfile(page); await assertion(); }); }
  finally { await page.unroute(base.origin + profileApi(id), handler); }
}
try {
  stage('Launch isolated local browser'); browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-background-networking'] });
  admin = await context('admin-a'); teacher = await context('teacher-a'); guardian = await context('guardian-a'); learner = await context('student-user-a');
  stage('Capture read-only base evidence'); const before = await preserveBase();
  stage('Create only suffix-owned fictional profiles'); const pairs = [];
  for (let index = 0; index < 8; index++) {
    const student = await api(admin, '/api/students', 'POST', { schoolId: 'a', firstName: 'Profile Learner ' + suffix + '-' + index, lastName: 'Synthetic', admissionNumber: 'UI-PROFILE-' + suffix + '-' + index, dateOfBirth: '2012-02-29', gradeLevel: '8' }, 201);
    assert.equal(student.userId, null); assert.equal(student.schoolId, 'a'); assert.ok(student.admissionNumber.includes(suffix)); ownedStudents.add(student.id);
    const profile = await api(admin, '/api/guardians', 'POST', { name: 'Profile Guardian ' + suffix + '-' + index, relationship: 'Synthetic guardian', email: 'profile-' + suffix + '-' + index + '@example.invalid' }, 201);
    assert.equal(profile.userId, null); assert.equal(profile.schoolId, 'a'); assert.ok(profile.name.includes(suffix)); ownedGuardians.add(profile.id); pairs.push({ student, guardian: profile });
  }
  const rolePages = [];
  for (const [value, role, actor] of [[admin, 'administrator', 'admin-a'], [teacher, 'teacher', 'teacher-a'], [guardian, 'guardian', 'guardian-a'], [learner, 'learner', 'student-user-a']]) {
    const page = await value.newPage(); rolePages.push({ page, value, role, actor });
    await check(role + ' profile has verified shell, actual visible guardian rows and native return paths', async () => {
      await openProfile(page, 'student-a'); await expect(page.getByRole('navigation', { name: 'School navigation', exact: true })).toBeVisible(); await expect(page.locator('header').first()).toContainText(actor);
      assert.deepEqual(await ids(linkedRows(page), 'data-linked-guardian-id'), (await api(value, linkApi('student-a'))).map(row => row.id).sort());
      await expect(chooser(page)).toHaveCount(role === 'administrator' ? 1 : 0); await expect(linkButton(page)).toHaveCount(role === 'administrator' ? 1 : 0);
      await expect(main(page).getByRole('link', { name: 'Return to dashboard', exact: true })).toHaveAttribute('href', '/'); await expect(main(page).getByRole('link', { name: 'Students', exact: true })).toHaveAttribute('href', '/students');
      await main(page).getByRole('link', { name: 'Students', exact: true }).click(); await expect(page).toHaveURL(base.origin + '/students'); await expect(page.getByRole('heading', { name: 'Student Registry', exact: true, level: 1 })).toBeVisible(); await openProfile(page, 'student-a');
    });
    await check(role + ' assessment list is current metadata with appropriate native invitations', async () => {
      const requests = []; const observe = request => { const path = new URL(request.url()).pathname; if (path.startsWith('/api/assessments/')) requests.push(path); }; page.on('request', observe);
      try { await openIndex(page); } finally { page.off('request', observe); }
      const rows = await api(value, '/api/assessments'); assert.deepEqual(await ids(assessmentRows(page), 'data-assessment-list-item'), rows.map(row => row.id).sort());
      const staff = ['administrator', 'teacher'].includes(role); assert.equal(await main(page).locator('a[href^="/assessments/"]:not([href="/assessments/manage"])').count(), staff ? rows.length : 0); assert.equal(requests.some(path => /\/results|\/result-editor/.test(path)), false);
      await expect(main(page).getByRole('link', { name: staff ? 'Report cards' : 'Published report cards', exact: true })).toHaveAttribute('href', '/report-cards');
      if (!staff) await expect(page.getByText('View assessment details for your current classes. Individual assessment results are private staff records.', { exact: true })).toBeVisible();
      if (staff && rows.length) {
        const id = rows.find(row => row.id === 'assessment-a')?.id ?? rows[0].id; const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/assessments/' + id + '/result-editor' && response.request().method() === 'GET');
        await main(page).locator('a[href=' + JSON.stringify('/assessments/' + encodeURIComponent(id)) + ']').click(); const editorResponse = await saved; assert.equal(editorResponse.status(), 200); await editorResponse.body(); await expect(page.getByRole('heading', { name: 'Review assessment results', exact: true, level: 1 })).toBeVisible(); await openIndex(page);
      }
    });
    await check(role + ' native published-report or report return and dashboard journey opens real headings', async () => {
      stage('Native report destination link'); await main(page).getByRole('link', { name: ['administrator', 'teacher'].includes(role) ? 'Report cards' : 'Published report cards', exact: true }).click();
      stage('Native report document and heading'); await expect(page).toHaveURL(base.origin + '/report-cards'); await expect(page.getByRole('heading', { name: 'Report Cards', exact: true, level: 1 })).toBeVisible();
      await openIndex(page); stage('Native dashboard return link'); await main(page).getByRole('link', { name: 'Return to dashboard', exact: true }).click();
      stage('Native dashboard destination and verified navigation'); await expect(page).toHaveURL(new RegExp('/dashboard/(admin|teacher|guardian|student)$')); await expect(page.getByRole('navigation', { name: 'School navigation', exact: true })).toBeVisible();
    });
  }
  const page = await admin.newPage(); await openProfile(page, pairs[0].student.id);
  await check('Administrator chooser is labeled and excludes already linked guardian profiles', async () => {
    await expect(chooser(page)).toBeEnabled(); const linked = await pairRows(pairs[0]); const options = await chooser(page).locator('option').evaluateAll(items => items.map(item => item.value).filter(Boolean)); for (const row of linked) assert.equal(options.includes(row.id), false);
    await expect(main(page).getByRole('link', { name: 'reviewed profile links', exact: true })).toHaveAttribute('href', '/admin/profile-links');
  });
  await check('Actual administrator guardian association acknowledges the exact pair then reloads saved relationships', async () => {
    await choose(page, pairs[0]); const saved = await capturePost(page, pairs[0], () => linkButton(page).click()); assert.equal(saved.value.message, 'Guardian linked successfully'); assert.equal(saved.body, JSON.stringify({ guardianId: pairs[0].guardian.id }));
    assert.deepEqual((await pairRows(pairs[0])).map(row => row.id), [pairs[0].guardian.id]); await expect(linkedRows(page)).toHaveCount(1); await expect(page.getByRole('region', { name: 'Acknowledged guardian link', exact: true })).toContainText(pairs[0].guardian.name); assert.equal((await chooser(page).locator('option').evaluateAll(items => items.map(item => item.value))).includes(pairs[0].guardian.id), false);
  });
  await check('Same-frame duplicate guardian button actions send one actual suffix-pair POST', async () => {
    await openProfile(page, pairs[1].student.id); await choose(page, pairs[1]); let count = 0;
    const observe = request => { if (new URL(request.url()).pathname === linkApi(pairs[1].student.id) && request.method() === 'POST') count++; }; page.on('request', observe);
    try { await linkButton(page).evaluate(button => { button.click(); button.click(); }); await expect(page.getByRole('status').filter({ hasText: 'Guardian link was acknowledged by the school system.' })).toBeVisible(); await profileReady(page); } finally { page.off('request', observe); }
    assert.equal(count, 1); assert.equal((await pairRows(pairs[1])).filter(row => row.id === pairs[1].guardian.id).length, 1);
  });
  for (const [offset, mode] of [[2, 'lost committed network reply'], [3, '503 substituted acknowledgement'], [4, 'malformed substituted 200 acknowledgement']]) await check(mode + ' retains exact original pair and recovers once by explicit replay', async () => {
    const item = pairs[offset]; await openProfile(page, item.student.id); await choose(page, item); const records = []; let dropped = false, firstRows;
    const handler = guarded(async route => {
      if (route.request().method() !== 'POST') return route.continue(); const saved = await actual(route); records.push({ path: new URL(route.request().url()).pathname, body: route.request().postData() });
      if (dropped) return route.fulfill({ response: saved.response, body: saved.body }); dropped = true; firstRows = await pairRows(item);
      if (offset === 2) return route.abort('failed'); return route.fulfill({ status: offset === 3 ? 503 : 200, contentType: 'application/json', body: offset === 3 ? '{"error":"Synthetic uncertain acknowledgement"}' : '{not-json' });
    }); faults.push(mode + ' after actual POST200 commit'); await page.route(base.origin + linkApi(item.student.id), handler);
    try {
      await linkButton(page).click(); await expect(page.getByRole('alert').filter({ hasText: 'outcome could not be confirmed' })).toBeVisible(); await hiddenProfile(page); assert.equal(records.length, 1); await expect(retry(page)).toHaveCount(0);
      await refreshProfile(page); await expect(retry(page)).toBeEnabled(); assert.equal(records.length, 1); await retry(page).click(); await expect(page.getByRole('status').filter({ hasText: 'Guardian link was acknowledged by the school system.' })).toBeVisible(); await profileReady(page);
      assert.equal(records.length, 2); assert.deepEqual(records[1], records[0]); assert.deepEqual(await pairRows(item), firstRows); assert.equal(firstRows.filter(row => row.id === item.guardian.id).length, 1); await expect(retry(page)).toHaveCount(0);
    } finally { await page.unroute(base.origin + linkApi(item.student.id), handler); }
  });
  await check('Acknowledged association followed by failed current GET preserves saved fact separately from unavailable profile', async () => {
    const item = pairs[5]; await openProfile(page, item.student.id); await choose(page, item); let committed = false, count = 0;
    const handler = guarded(async route => {
      if (route.request().method() === 'POST') { const saved = await actual(route); committed = true; count++; return route.fulfill({ response: saved.response, body: saved.body }); }
      if (committed && new URL(route.request().url()).pathname === profileApi(item.student.id)) { const saved = await actual(route); assert.equal(JSON.parse(saved.body).id, item.student.id); return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Synthetic read unavailable"}' }); }
      return route.continue();
    }); faults.push('Known actual POST200, substituted current-profile GET503'); await page.route(base.origin + profileApi(item.student.id) + '**', handler);
    try { await linkButton(page).click(); await expect(page.getByRole('status').filter({ hasText: 'Guardian link was acknowledged by the school system.' })).toContainText('profile refresh failed'); await hiddenProfile(page); await expect(page.getByText('No linked guardians are available in this view.', { exact: true })).toHaveCount(0); assert.equal(count, 1); assert.equal((await pairRows(item)).length, 1); }
    finally { await page.unroute(base.origin + profileApi(item.student.id) + '**', handler); }
    await refreshProfile(page); await expect(linkedRows(page)).toHaveCount(1); await expect(page.getByRole('region', { name: 'Acknowledged guardian link', exact: true })).toBeVisible();
  });
  const pendingPage = await admin.newPage(), pendingItem = pairs[6];
  await check('Actual changed guardian account before unknown reply hides old protected content and original pair details', async () => {
    await openProfile(pendingPage, pendingItem.student.id); await choose(pendingPage, pendingItem); let once = false;
    const handler = guarded(async route => { if (route.request().method() !== 'POST') return route.continue(); const saved = await actual(route); if (once) return route.fulfill({ response: saved.response, body: saved.body }); once = true; await switchActor(admin, 'guardian-a'); return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Synthetic changed-account acknowledgement loss"}' }); });
    faults.push('Actual suffix association commit, account cookie change, substituted503 delivery'); await pendingPage.route(base.origin + linkApi(pendingItem.student.id), handler);
    try { await linkButton(pendingPage).click(); await expect(pendingPage.getByRole('alert').filter({ hasText: 'outcome could not be confirmed' })).toBeVisible(); await hiddenProfile(pendingPage); await expect(pendingPage.locator('body')).not.toContainText(pendingItem.guardian.name); }
    finally { await pendingPage.unroute(base.origin + linkApi(pendingItem.student.id), handler); }
    await reloadProfile(pendingPage).click(); await expect(pendingPage.getByRole('alert').filter({ hasText: 'unavailable to your current account' })).toBeVisible(); await hiddenProfile(pendingPage); await expect(retry(pendingPage)).toHaveCount(0);
  });
  await check('Different administrator cannot recover retained pair and original administrator can reload and replay exact bytes', async () => {
    await switchActor(admin, 'admin-b'); await reloadProfile(pendingPage).click(); await expect(pendingPage.getByRole('alert').filter({ hasText: 'unavailable to your current account' })).toBeVisible(); await hiddenProfile(pendingPage); await expect(pendingPage.locator('body')).not.toContainText(pendingItem.guardian.name); await expect(retry(pendingPage)).toHaveCount(0);
    await switchActor(admin, 'admin-a'); await refreshProfile(pendingPage); await expect(retry(pendingPage)).toBeEnabled(); const rows = await pairRows(pendingItem);
    const saved = await capturePost(pendingPage, pendingItem, () => retry(pendingPage).click()); assert.equal(saved.endpoint, linkApi(pendingItem.student.id)); assert.equal(saved.body, JSON.stringify({ guardianId: pendingItem.guardian.id })); assert.deepEqual(await pairRows(pendingItem), rows);
  });
  const scopePage = await admin.newPage();
  for (const kind of ['profile', 'assessment']) await check(kind + ' superseded delayed administrator delivery cannot restore staff controls after fresh family load', async () => {
    await switchActor(admin, 'admin-a'); if (kind === 'profile') await openProfile(scopePage, 'student-a'); else await openIndex(scopePage);
    const path = kind === 'profile' ? '/api/guardians' : '/api/assessments'; let release, arrived, finished, heldRequest, aborted = false, delivered = false;
    const gate = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { arrived = resolve; }), done = new Promise(resolve => { finished = resolve; });
    const onFailed = request => { if (request === heldRequest) aborted = true; }; scopePage.on('requestfailed', onFailed);
    const handler = async route => {
      if (heldRequest) return route.continue(); heldRequest = route.request();
      try { const saved = await actual(route); arrived(); await gate; try { await route.fulfill({ response: saved.response, body: saved.body }); delivered = true; } catch { if (!aborted) deliveryFailures.push('Delayed actual response could not be delivered or observed as cancelled'); } }
      catch { deliveryFailures.push('Delayed actual response could not be captured'); arrived(); }
      finally { finished(); }
    };
    faults.push(kind + ' held actual administrator GET; fresh family reload then obsolete release'); await scopePage.route(base.origin + path, handler);
    try {
      await (kind === 'profile' ? reloadProfile(scopePage) : reloadIndex(scopePage)).click(); await bounded(started); await switchActor(admin, 'guardian-a'); if (kind === 'profile') await refreshProfile(scopePage); else await refreshIndex(scopePage);
      release(); await bounded(done); await expect(chooser(scopePage)).toHaveCount(0); await expect(main(scopePage).locator('a[href^="/assessments/"]')).toHaveCount(0); await expect(scopePage.locator('header').first()).toContainText('guardian-a'); assert.equal(aborted || delivered, true, 'Old request was exactly observed as cancelled or delivered');
      if (kind === 'profile') assert.deepEqual(await ids(linkedRows(scopePage), 'data-linked-guardian-id'), (await api(guardian, linkApi('student-a'))).map(row => row.id).sort()); else assert.deepEqual(await ids(assessmentRows(scopePage), 'data-assessment-list-item'), (await api(guardian, '/api/assessments')).map(row => row.id).sort());
    } finally { release(); await scopePage.unroute(base.origin + path, handler); scopePage.off('requestfailed', onFailed); await switchActor(admin, 'admin-a'); }
  });
  for (const kind of ['profile', 'assessment']) await check(kind + ' current session mismatch hides assembled former-account data until clean current reload', async () => {
    if (kind === 'profile') await openProfile(scopePage, 'student-a'); else await openIndex(scopePage); const path = kind === 'profile' ? '/api/guardians' : '/api/assessments'; let changed = false;
    const handler = guarded(async route => { const saved = await actual(route); if (!changed) { changed = true; await switchActor(admin, 'guardian-a'); } return route.fulfill({ response: saved.response, body: saved.body }); });
    faults.push(kind + ' actual GET then current cookie switch before final session check'); await scopePage.route(base.origin + path, handler);
    try { await (kind === 'profile' ? reloadProfile(scopePage) : reloadIndex(scopePage)).click(); await expect(scopePage.getByRole('alert').filter({ hasText: 'unavailable to your current account' })).toBeVisible(); await expect(scopePage.getByRole('navigation', { name: 'School navigation', exact: true })).toHaveCount(0); await expect(main(scopePage).locator('dl')).toHaveCount(0); await expect(assessmentRows(scopePage)).toHaveCount(0); }
    finally { await scopePage.unroute(base.origin + path, handler); }
    if (kind === 'profile') await refreshProfile(scopePage); else await refreshIndex(scopePage); await expect(scopePage.locator('header').first()).toContainText('guardian-a'); await switchActor(admin, 'admin-a');
  });
  await openProfile(page, pairs[7].student.id);
  for (const raw of ['legacy-nonempty-date-value', '2012-02-30', '2012-01-01T00:00:00+05:30']) await projectedProfile(page, pairs[7].student.id, 'Named raw birth-date projection: ' + raw, value => ({ ...value, dateOfBirth: raw }), async () => { await expect(page.getByText('Stored date requires review: ' + raw, { exact: true })).toBeVisible(); await expect(page.getByText('Invalid Date', { exact: true })).toHaveCount(0); });
  await projectedProfile(page, pairs[7].student.id, 'Named leap-day projection displays exact stored calendar evidence without timezone conversion', value => ({ ...value, dateOfBirth: '2000-02-29' }), async () => { await expect(page.locator('time[datetime="2000-02-29"]')).toHaveText('2000-02-29'); });
  await check('Named duplicate guardian inventory projection produces review error and no partial profile', async () => {
    const handler = guarded(async route => { const saved = await actual(route), rows = JSON.parse(saved.body); assert.ok(rows.length); return route.fulfill({ response: saved.response, body: JSON.stringify([...rows, rows[0]]) }); }); faults.push('Duplicate guardian actual GET projection only'); await page.route(base.origin + '/api/guardians', handler);
    try { await reloadProfile(page).click(); await expect(page.getByRole('alert')).toContainText('duplicated or incomplete rows'); await hiddenProfile(page); } finally { await page.unroute(base.origin + '/api/guardians', handler); } await refreshProfile(page);
  });
  await check('Named invalid assessment metadata projection preserves raw date and labels maximum without invented results', async () => {
    const handler = guarded(async route => { const saved = await actual(route), rows = JSON.parse(saved.body); assert.ok(rows.length); rows[0] = { ...rows[0], date: '2026-02-30', maxScore: -1 }; return route.fulfill({ response: saved.response, body: JSON.stringify(rows) }); }); faults.push('Invalid assessment date/max actual GET projection only'); await page.route(base.origin + '/api/assessments', handler);
    try { await openIndex(page); await expect(page.getByText('Stored date requires review: 2026-02-30', { exact: true })).toBeVisible(); await expect(page.getByText('Stored maximum requires review.', { exact: true })).toBeVisible(); } finally { await page.unroute(base.origin + '/api/assessments', handler); } await refreshIndex(page);
  });
  await check('Native class filter matches actual loaded assessments and restores the current list', async () => {
    const classes = await api(admin, '/api/classes'), rows = await api(admin, '/api/assessments'); assert.ok(classes.length); const selection = classes.find(row => row.id === 'class-other') ?? classes[0], expected = rows.filter(row => row.classId === selection.id).map(row => row.id).sort();
    await page.getByRole('combobox', { name: 'Filter by Class', exact: true }).selectOption(selection.id); assert.deepEqual(await ids(assessmentRows(page), 'data-assessment-list-item'), expected); await expect(page.getByRole('status').filter({ hasText: /^Showing / })).toHaveText('Showing ' + expected.length + ' of ' + rows.length + ' assessments in the current authorised list.'); if (!expected.length) await expect(page.getByText('No assessments are available for this selection.', { exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Filter by Class', exact: true }).selectOption(''); assert.deepEqual(await ids(assessmentRows(page), 'data-assessment-list-item'), rows.map(row => row.id).sort());
  });
  await check('390px profile shell, native guardian label and keyboard return navigation fit the page', async () => {
    await openProfile(page, pairs[7].student.id); await page.setViewportSize({ width: 390, height: 844 }); await geometry(page); await chooser(page).focus(); await expect(chooser(page)).toBeFocused(); await main(page).getByRole('link', { name: 'Students', exact: true }).focus(); await expect(main(page).getByRole('link', { name: 'Students', exact: true })).toBeFocused(); await shot(page, 'profile-mobile');
  });
  await check('390px assessment metadata region and class filter are labeled keyboard focus targets', async () => {
    await openIndex(page); await geometry(page); const region = page.getByRole('region', { name: 'Assessment metadata', exact: true }); await region.focus(); await expect(region).toBeFocused(); const filter = page.getByRole('combobox', { name: 'Filter by Class', exact: true }); await filter.focus(); await expect(filter).toBeFocused(); await shot(page, 'assessment-mobile'); await page.setViewportSize({ width: 1280, height: 900 }); await shot(page, 'assessment-desktop');
  });
  await openProfile(page, pairs[7].student.id); await shot(page, 'profile-desktop');
  await projectedProfile(page, pairs[7].student.id, 'Named HTML-like profile display projection remains plain text', value => ({ ...value, firstName: '<script>window.__profileInjected=true</script>' }), async () => { const name = page.locator('dl dd').filter({ hasText: '<script>window.__profileInjected=true</script>' }); await expect(name).toHaveText('<script>window.__profileInjected=true</script> Synthetic'); assert.equal(await page.evaluate(() => window.__profileInjected), undefined); assert.equal(await name.locator('script').count(), 0); });
  await check('Read-only base evidence is unchanged and all browser journeys remain finite and offline', async () => {
    assert.deepEqual(await preserveBase(), before); preservationVerified = true; assert.equal(externalRequests, 0); assert.equal(pageErrors, 0); assert.equal(failedAssets, 0); assert.ok(browserApiRequests < 1500); assert.equal(passed + 1, plannedProcedures);
  });
} catch (error) {
  failure = { procedure, checkpoint, errorName: /^[A-Za-z]{1,40}$/.test(error?.name ?? '') ? error.name : 'Error' };
} finally {
  for (const value of contexts) await value.close().catch(() => {}); await browser?.close().catch(() => {});
  const result = { recordedAt: new Date().toISOString(), plannedProcedures, passed, failed: failure ? 1 : 0, skipped: Math.max(0, plannedProcedures - passed - (failure ? 1 : 0)), fixtureRequests, browserApiRequests, externalRequests, pageErrors, failedAssets, preservationVerified, checks, screenshots, namedTransportFaults: faults, failure,
    limits: ['Mounted local fictional fixture only; no provider or business acceptance evidence', 'Browser cookie jar and routed Cookie normalization use the exact existing fixture token; server authorization remains unchanged', 'Only suffix-owned unlinked profiles and their exact pairs may be created', 'Base accounts/profile ownership/enrolments/classes/results are read-only and compared', 'Named transport faults/projections do not change stored evidence', 'Link DTO omits isPrimary; primary persistence is independently proved by actual SQLite integration, not observable here', 'Pending pairs remain in memory and hard reload/navigation discards them'] };
  writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ passed, failed: result.failed, skipped: result.skipped, plannedProcedures, fixtureRequests, browserApiRequests, externalRequests, pageErrors, failedAssets, preservationVerified, resultPath, screenshots, ...(failure ? { failure } : {}) }));
  if (failure) process.exitCode = 1;
}
