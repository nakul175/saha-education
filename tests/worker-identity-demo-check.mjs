// Manual mounted-browser procedures for trusted sign-in and identity administration (FR-01, FR-04), over an isolated built
// local Worker + D1 and headless Chromium. Synthetic data only. Two separately started Workers are used, selected by what
// the Worker itself reports at GET /api/demo:
//   * synthetic demo ON (pristine migrated D1, a UUID installation id, every OIDC setting absent, no session fixture):
//     role entry, account page, sign-out, switch role, wrong-origin refusal, server-side session expiry and renewal,
//     disabled/re-enabled demo account, administration inside the demo;
//   * synthetic demo OFF (the shared write-worker-fixture sessions, every OIDC setting absent => fail-closed sign-in):
//     the unavailable state, failed-callback notice, the account page for school sign-in, and the full account
//     administration journey including role change, link/unlink, conflicts, school scope and role refusal.
// A real provider is NOT contacted (none is provided). The provider protocol itself is proven by the local fake-issuer
// contract (tests/integration/oidc-local-issuer-contract.mjs), not here.
// Optional: SAHA_WORKER_STATE_DIR (the persisted D1 directory) and SAHA_WORKER_REPO enable a genuine server-side session
// expiry in the demo run; without them that one procedure is recorded as not executed.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';

const suppliedOrigin = process.env.SAHA_WORKER_TEST_URL, executablePath = process.env.SAHA_TEST_BROWSER, fixture = process.env.SAHA_WORKER_SESSION_FIXTURE;
if (!suppliedOrigin || !executablePath) throw new Error('Supply a local Worker URL and a browser executable.');
const base = new URL(suppliedOrigin);
if (!['127.0.0.1', 'localhost'].includes(base.hostname) || !['http:', 'https:'].includes(base.protocol) || base.pathname !== '/' || base.search || base.hash || base.username || base.password) throw new Error('Mounted identity procedures run only against an exact localhost origin.');
const outputDir = process.env.SAHA_TEST_OUTPUT_DIR || '/private/tmp'; mkdirSync(outputDir, { recursive: true });
const stateDir = process.env.SAHA_WORKER_STATE_DIR, repoDir = process.env.SAHA_WORKER_REPO;
const provider = 'https://identity.example.invalid';
const suffix = crypto.randomUUID().slice(0, 8);
const why = 'Synthetic mounted identity review ' + suffix;
const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-background-networking'] });
const contexts = [], externalRequests = [], pageErrors = [], procedures = [], screenshots = [];
let localApiRequests = 0, mode = 'unknown';
const sessions = fixture ? JSON.parse(readFileSync(fixture, 'utf8')) : {};
async function newContext({ cookie, width = 1280, height = 900 } = {}) {
  const value = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', timezoneId: 'Asia/Kolkata', ...(cookie ? { extraHTTPHeaders: { cookie } } : {}) });
  value.setDefaultTimeout(15000); value.setDefaultNavigationTimeout(20000);
  contexts.push(value);
  value.on('page', page => page.on('pageerror', error => pageErrors.push(error.message.slice(0, 200))));
  value.on('request', request => { const url = new URL(request.url()); if (url.origin === base.origin && url.pathname.startsWith('/api/')) localApiRequests++; });
  await value.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === base.origin) return route.continue();
    externalRequests.push({ origin: url.origin, path: url.pathname }); return route.abort();
  });
  return value;
}
function describe(error) {
  const first = String(error?.message ?? error).split('\n')[0].slice(0, 200);
  return error && 'actual' in error && 'expected' in error ? `${first} actual=${JSON.stringify(error.actual)} expected=${JSON.stringify(error.expected)}`.slice(0, 400) : first;
}
async function proc(name, action) {
  try { await action(); procedures.push({ name, result: 'pass' }); console.log('ok - ' + name); }
  catch (error) { procedures.push({ name, result: 'fail', message: describe(error) }); console.log('not ok - ' + name + ' :: ' + describe(error)); }
}
let navigationRetries = 0;
/** One retry of a navigation that timed out (a stalled local response); every retry is counted in the result record. */
async function go(page, path, options = { waitUntil: 'networkidle' }) {
  try { return await page.goto(new URL(path, base).href, options); }
  catch (error) { if (!/Timeout/.test(String(error?.message))) throw error; navigationRetries++; return page.goto(new URL(path, base).href, options); }
}
const skip = (name, reason) => { procedures.push({ name, result: 'not-executed', message: reason }); console.log('skipped - ' + name + ' :: ' + reason); };
async function shot(page, name) {
  const path = `${outputDir}/identity-${mode}-${name}.png`;
  try { await page.screenshot({ path, fullPage: true }); screenshots.push(path); } catch { /* A screenshot failure must not hide the check result. */ }
}
async function whoami(page) {
  return page.evaluate(async () => { const response = await fetch('/api/session', { cache: 'no-store' }); const body = await response.text(); return { status: response.status, body: response.ok ? JSON.parse(body) : null }; });
}
async function labelsAndWidth(page, scope = 'main') {
  const unlabelled = await page.locator(`${scope} input:not([type=hidden]), ${scope} select, ${scope} textarea`).evaluateAll(items => items.filter(item => !item.labels?.length && !item.getAttribute('aria-label') && !item.getAttribute('aria-labelledby')).length);
  assert.equal(unlabelled, 0, 'Every visible form control has an accessible label');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'No horizontal page overflow');
  assert.equal(await page.locator('button a, a button').count(), 0, 'No nested button and link');
}
const alertLine = page => page.locator('p[role=alert]');
async function api(context, path, method = 'GET', data) {
  // The request jar does not send a Secure host cookie to http://127.0.0.1, so the browser context's cookie is passed explicitly.
  const stored = (await context.cookies()).filter(cookie => cookie.name === '__Host-saha_session');
  const response = await context.request.fetch(new URL(path, base).href, { method, maxRedirects: 0, headers: { ...(stored.length ? { cookie: `${stored[0].name}=${stored[0].value}` } : {}), ...(method === 'GET' ? {} : { Origin: base.origin, 'Content-Type': 'application/json' }) }, ...(data === undefined ? {} : { data: JSON.stringify(data) }), timeout: 15000 });
  const text = await response.text(); let body = null; try { body = JSON.parse(text); } catch { /* Not JSON. */ }
  return { status: response.status(), body, headers: response.headers() };
}

// ---------------------------------------------------------------------------------------------------------------------------
async function demoSuite() {
  const roles = [
    { role: 'admin', label: 'administrator', title: 'Admin Dashboard', roleLabel: 'School administrator' },
    { role: 'teacher', label: 'teacher', title: 'Teacher Dashboard', roleLabel: 'Teacher' },
    { role: 'guardian', label: 'guardian', title: 'Guardian Dashboard', roleLabel: 'Guardian' },
    { role: 'student', label: 'student', title: 'My progress', roleLabel: 'Student' },
  ];
  async function loginPage(page) {
    const response = await go(page, '/login');
    assert.equal(response?.status(), 200);
    await expect(page.getByRole('heading', { name: 'Explore Saha Education', exact: true })).toBeVisible();
  }
  async function enter(page, role) {
    await loginPage(page);
    await page.getByRole('checkbox', { name: /exploring fictional records/ }).check();
    await page.getByRole('button', { name: 'Explore as ' + role.label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp('/dashboard/' + role.role + '$'));
    await expect(page.getByRole('heading', { name: role.title, exact: true })).toBeVisible();
  }
  function expireServerSide(where) {
    execFileSync('node', ['--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB', '--config', 'dist/server/wrangler.json', '--local',
      '--persist-to', stateDir, '--command', `UPDATE auth_sessions SET expires_at = 1000 WHERE ${where}`], { cwd: repoDir, stdio: 'pipe', timeout: 40000 });
  }
  const main = await newContext(); const page = await main.newPage();
  await proc('Demo login is clearly labelled synthetic and gated by an acknowledgement', async () => {
    await loginPage(page);
    await expect(page.getByText('A private demonstration with fictional school records.', { exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /exploring fictional records/ })).not.toBeChecked();
    for (const role of roles) await expect(page.getByRole('button', { name: 'Explore as ' + role.label, exact: true })).toBeDisabled();
    await page.getByRole('checkbox', { name: /exploring fictional records/ }).check();
    for (const role of roles) await expect(page.getByRole('button', { name: 'Explore as ' + role.label, exact: true })).toBeEnabled();
    await expect(page.locator('p[role=alert]')).toHaveCount(0);
    await labelsAndWidth(page); await shot(page, 'login');
  });
  for (const role of roles) {
    await proc(role.label + ': role entry, account page and sign-out', async () => {
      await enter(page, role);
      await expect(page.getByRole('complementary', { name: 'Synthetic demo', exact: true })).toContainText('Fictional records only');
      assert.deepEqual((await whoami(page)).body, { id: 'saha-demo-' + role.role, role: role.role, schoolId: 'saha-demo-school' }, 'The server session resolves the chosen fixed role');
      const link = page.getByRole('link', { name: 'Your account', exact: true });
      await expect(link).toHaveAttribute('href', '/account'); await link.click();
      await expect(page).toHaveURL(/\/account$/);
      await expect(page.getByRole('heading', { name: 'Your account', exact: true })).toBeVisible();
      await expect(page.locator('dl')).toContainText(role.roleLabel); await expect(page.locator('dl')).toContainText('Synthetic demo entry (no school provider)');
      await expect(page.getByText(/Nothing here is a real person or school/)).toBeVisible();
      await expect(page.locator('dl')).toContainText('This session ends');
      assert.equal(/issuer|subject|saha-demo\.example/i.test(await page.locator('main').innerText()), false, 'The account page never shows provider issuer or subject');
      await expect(page.getByRole('link', { name: 'Switch demo role', exact: true })).toHaveAttribute('href', '/login');
      await page.setViewportSize({ width: 375, height: 800 }); await labelsAndWidth(page); await shot(page, 'account-' + role.role + '-mobile'); await page.setViewportSize({ width: 1280, height: 900 });
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(page).toHaveURL(/\/login$/);
      assert.equal((await whoami(page)).status, 401, 'The server session is gone after sign-out');
      await go(page, '/account');
      await expect(page).toHaveURL(/\/login$/); await expect(page.getByRole('heading', { name: 'Explore Saha Education', exact: true })).toBeVisible();
    });
  }
  await proc('Switching role replaces the earlier session of this browser', async () => {
    await enter(page, roles[1]);
    await page.getByRole('link', { name: 'Switch demo role', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole('checkbox', { name: /exploring fictional records/ }).check();
    await page.getByRole('button', { name: 'Explore as guardian', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/guardian$/);
    assert.equal((await whoami(page)).body.id, 'saha-demo-guardian');
    const cookies = (await main.cookies()).filter(cookie => cookie.name === '__Host-saha_session');
    assert.equal(cookies.length, 1, 'Exactly one opaque session cookie');
    assert.equal(cookies[0].httpOnly && cookies[0].secure && cookies[0].sameSite === 'Lax' && cookies[0].path === '/', true, 'HttpOnly, Secure, SameSite=Lax, Path=/');
  });
  await proc('Wrong-origin and origin-less demo entry is refused with no session', async () => {
    const stranger = await newContext();
    for (const headers of [{ Origin: 'https://attacker.example.invalid' }, {}]) {
      const response = await stranger.request.fetch(new URL('/api/demo', base).href, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, data: JSON.stringify({ role: 'teacher', syntheticAcknowledged: true }), maxRedirects: 0 });
      assert.equal(response.status(), 403); assert.equal(response.headers()['set-cookie'], undefined, 'No cookie is set on refusal');
    }
    const notAcknowledged = await stranger.request.fetch(new URL('/api/demo', base).href, { method: 'POST', headers: { Origin: base.origin, 'Content-Type': 'application/json' }, data: JSON.stringify({ role: 'teacher', syntheticAcknowledged: false }) });
    assert.equal(notAcknowledged.status(), 400, 'The fictional-data acknowledgement is required by the server');
    const forged = await stranger.request.fetch(new URL('/api/session', base).href, { headers: { cookie: 'saha_demo_role=admin' } });
    assert.equal(forged.status(), 401, 'A forged public role cookie confers nothing');
  });
  if (stateDir && repoDir) await proc('Expired session is ended by the server, explained, and can be renewed', async () => {
    await enter(page, roles[1]);
    await page.getByRole('link', { name: 'Your account', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your account', exact: true })).toBeVisible();
    expireServerSide("user_id = 'saha-demo-teacher'");
    assert.equal((await whoami(page)).status, 401, 'The expired session no longer resolves');
    // The account page also redirects itself to the expiry notice as soon as it learns the session ended, which can interrupt this reload. Either outcome is the behaviour under test, so tolerate only an interrupted navigation and then wait for the page to settle.
    await page.reload({ waitUntil: 'commit' }).catch(error => { if (!/ERR_ABORTED|interrupted by another navigation/.test(String(error))) throw error; });
    await expect(page).toHaveURL(/\/login\?reason=expired$/, { timeout: 15000 });
    await expect(page.getByText('Your session ended. Sign in again to continue.', { exact: true })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await go(page, '/dashboard/teacher');
    await expect(page).toHaveURL(/\/login/); await page.waitForLoadState('networkidle'); await shot(page, 'expired');
    await enter(page, roles[1]);
    assert.equal((await whoami(page)).body.id, 'saha-demo-teacher', 'Entering again renews a working session');
    await page.getByRole('link', { name: 'Your account', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await expect(page).toHaveURL(/\/login$/);
  }); else skip('Expired session is ended by the server, explained, and can be renewed', 'SAHA_WORKER_STATE_DIR/SAHA_WORKER_REPO not supplied');

  // ---- administration inside the synthetic demo ----------------------------------------------------------------
  const teacherContext = await newContext(); const teacher = await teacherContext.newPage();
  await enter(page, roles[0]);
  await proc('A teacher cannot reach account administration', async () => {
    await enter(teacher, roles[1]);
    await go(teacher, '/admin/users');
    await expect(teacher.getByText('This workspace is available to school administrators.')).toBeVisible();
    const refused = await api(teacherContext, '/api/admin/users'); assert.equal(refused.status, 403);
    assert.equal((await api(teacherContext, '/api/admin/users/saha-demo-admin/role', 'PATCH', { clientRequestId: crypto.randomUUID(), expectedVersion: 0, role: 'teacher', reviewConfirmed: true, reason: why })).status, 403);
  });
  await proc('Administrator opens account administration with the synthetic label and mobile layout', async () => {
    await go(page, '/admin/users');
    await expect(page.getByRole('heading', { name: 'Reviewed account administration', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Demo teacher', exact: true })).toBeVisible();
    await expect(page.getByText('Synthetic demo sign-in').first()).toBeVisible();
    assert.equal(/saha-demo\.example\.invalid/.test(await page.locator('main').innerText()), false, 'The synthetic issuer URL is not shown');
    await page.getByRole('button', { name: 'Manage account for Demo teacher', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Manage account', exact: true })).toBeVisible();
    await expect(page.getByText(/Synthetic demo\./).first()).toBeVisible();
    await expect(page.getByText(/removal is unavailable/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove sign-in link', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Close account panel', exact: true }).click();
    await page.setViewportSize({ width: 375, height: 800 }); await labelsAndWidth(page); await shot(page, 'admin-mobile'); await page.setViewportSize({ width: 1280, height: 900 });
  });
  await proc('Demo administration refuses a provider issuer in plain words', async () => {
    await page.getByLabel('Name', { exact: true }).fill('Outside Teacher ' + suffix);
    await page.getByLabel('Email', { exact: true }).fill('outside-' + suffix + '@example.invalid');
    await page.getByLabel('Exact trusted identity issuer', { exact: true }).fill(provider);
    await page.getByLabel('Exact provider identity subject', { exact: true }).fill('outside-' + suffix);
    await page.getByLabel('Reason and review reference', { exact: true }).fill(why);
    await page.getByRole('checkbox', { name: /I checked this person/ }).check();
    await page.getByRole('button', { name: 'Provision reviewed account', exact: true }).click();
    await expect(alertLine(page)).toContainText('accepts only the synthetic demo sign-in provider');
    await expect(page.getByRole('heading', { name: 'Outside Teacher ' + suffix, exact: true })).toHaveCount(0);
  });
  const learnerContext = await newContext(); const learner = await learnerContext.newPage();
  await proc('Disabling a demo account signs it out at once, blocks entry in plain words, and re-enabling does not revive the session', async () => {
    await enter(learner, roles[3]);
    await go(page, '/admin/users');
    await page.getByRole('button', { name: 'Disable access for Demo student', exact: true }).click();
    await page.getByLabel('Reason for this access change', { exact: false }).fill(why);
    await page.getByRole('checkbox', { name: /I reviewed this account and confirm this disable/ }).check();
    await page.getByRole('button', { name: 'Disable reviewed account', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('currently disabled');
    assert.equal((await whoami(learner)).status, 401, 'The disabled account’s open session ended at once');
    await loginPage(learner);
    await learner.getByRole('checkbox', { name: /exploring fictional records/ }).check();
    await learner.getByRole('button', { name: 'Explore as student', exact: true }).click();
    await expect(alertLine(learner)).toContainText('This demo account is switched off'); await shot(learner, 'disabled-entry');
    assert.equal((await whoami(learner)).status, 401, 'No session was issued');
    await page.getByRole('button', { name: 'Enable access for Demo student', exact: true }).click();
    await page.getByLabel('Reason for this access change', { exact: false }).fill(why + ' re-enable');
    await page.getByRole('checkbox', { name: /I reviewed this account and confirm this enable/ }).check();
    await page.getByRole('button', { name: 'Enable reviewed account', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('currently enabled');
    assert.equal((await whoami(learner)).status, 401, 'Re-enabling never revives the earlier session');
    await learner.getByRole('button', { name: 'Explore as student', exact: true }).click();
    await expect(learner).toHaveURL(/\/dashboard\/student$/);
    assert.equal((await whoami(learner)).body.id, 'saha-demo-student');
  });
  await proc('The demo accounts keep working after the administration decisions and the history names people, not raw ids', async () => {
    await go(page, '/admin/users');
    await expect(page.getByRole('heading', { name: 'Recent administration reviews', exact: true })).toBeVisible();
    const history = await page.locator('section[aria-labelledby=administration-history-title]').innerText();
    assert.match(history, /Disabled · Demo student/); assert.match(history, /Enabled · Demo student/);
    assert.equal(/saha-demo-(admin|teacher|student|guardian)\b/.test(history), false, 'No raw account id in the history');
  });
}

// ---------------------------------------------------------------------------------------------------------------------------
async function realSuite() {
  if (!fixture) throw new Error('Real-mode procedures need the synthetic session fixture.');
  const asRole = async id => { if (typeof sessions[id] !== 'string') throw new Error('Missing synthetic session ' + id); return newContext({ cookie: sessions[id] }); };
  const anonymous = await newContext(); const visitor = await anonymous.newPage();
  await proc('Real mode fails closed: no demo, an unavailable notice, and a friendly failure on sign-in', async () => {
    assert.deepEqual((await api(anonymous, '/api/demo')).body, { available: false, synthetic: true });
    assert.deepEqual((await api(anonymous, '/api/auth/login')).body, { configured: false }, 'The status check reports only configured or not');
    await go(visitor, '/login');
    await expect(visitor.getByRole('heading', { name: 'Sign in to Saha Education', exact: true })).toBeVisible();
    await expect(visitor.getByRole('button', { name: /^Explore as/ })).toHaveCount(0);
    await expect(visitor.getByText(/School sign-in has not been set up on this installation yet/)).toBeVisible();
    await visitor.getByRole('button', { name: 'Continue with school sign-in', exact: true }).click();
    await expect(alertLine(visitor)).toContainText('School sign-in is not available');
    await expect(visitor.getByRole('button', { name: 'Continue with school sign-in', exact: true })).toBeEnabled();
    assert.equal(new URL(visitor.url()).origin, base.origin, 'No navigation to a provider');
    await labelsAndWidth(visitor); await shot(visitor, 'login-unconfigured');
  });
  await proc('A failed provider callback returns to the sign-in page with an explanation and no session', async () => {
    await go(visitor, '/api/auth/callback?code=forged-code&state=forged-state');
    await expect(visitor).toHaveURL(/\/login\?error=signin_failed$/);
    await expect(alertLine(visitor)).toContainText('School sign-in could not be completed');
    assert.equal((await anonymous.cookies()).some(cookie => cookie.name === '__Host-saha_session'), false, 'No session cookie on failure');
    assert.equal((await whoami(visitor)).status, 401);
    await go(visitor, '/login?reason=expired');
    await expect(visitor.getByText('Your session ended. Sign in again to continue.', { exact: true })).toBeVisible();
    await expect(alertLine(visitor)).toHaveCount(0);
  });
  await proc('Anonymous visitors and forged role cookies cannot use account or administration routes', async () => {
    for (const path of ['/api/account', '/api/session', '/api/admin/users', '/api/admin/users/changes', '/api/admin/users/teacher-a']) assert.equal((await api(anonymous, path)).status, 401, path);
    const forged = await anonymous.request.fetch(new URL('/api/admin/users', base).href, { headers: { cookie: 'saha_demo_role=admin', 'x-saha-role': 'admin' } });
    assert.equal(forged.status(), 401);
    await go(visitor, '/account'); await expect(visitor).toHaveURL(/\/login$/);
  });
  for (const [id, label, school, home] of [['teacher-a', 'Teacher', 'Synthetic school a', 'teacher'], ['guardian-a', 'Guardian', 'Synthetic school a', 'guardian'], ['student-user-a', 'Student', 'Synthetic school a', 'student'], ['admin-a', 'School administrator', 'Synthetic school a', 'admin']]) {
    await proc(`${label}: account page shows school sign-in, role and school without any synthetic-demo claim`, async () => {
      const context = await asRole(id); const page = await context.newPage();
      await go(page, '/dashboard/' + home);
      const link = page.getByRole('link', { name: 'Your account', exact: true }); await expect(link).toHaveAttribute('href', '/account'); await link.click();
      await expect(page.getByRole('heading', { name: 'Your account', exact: true })).toBeVisible();
      await expect(page.locator('dl')).toContainText(label); await expect(page.locator('dl')).toContainText(school); await expect(page.locator('dl')).toContainText('School sign-in');
      await expect(page.getByText('Synthetic demo', { exact: false })).toHaveCount(0);
      assert.equal(/identity\.example\.invalid|sub-/.test(await page.locator('main').innerText()), false, 'No issuer or subject on the account page');
      await page.setViewportSize({ width: 375, height: 800 }); await labelsAndWidth(page); await shot(page, 'account-' + id + '-mobile');
    });
  }
  await proc('Teacher, guardian and learner cannot administer accounts', async () => {
    for (const id of ['teacher-a', 'guardian-a', 'student-user-a']) {
      const context = await asRole(id), page = await context.newPage();
      await go(page, '/admin/users');
      await expect(page.getByText('This workspace is available to school administrators.')).toBeVisible();
      assert.equal((await api(context, '/api/admin/users')).status, 403, id);
      assert.equal((await api(context, '/api/admin/users/changes')).status, 403, id);
      assert.equal((await api(context, '/api/admin/users/teacher-a/role', 'PATCH', { clientRequestId: crypto.randomUUID(), expectedVersion: 0, role: 'student', reviewConfirmed: true, reason: why })).status, 403, id);
    }
  });
  const adminContext = await asRole('admin-a'); const admin = await adminContext.newPage();
  const goAdmin = async () => { await go(admin, '/admin/users'); await expect(admin.getByRole('heading', { name: 'Reviewed account administration', exact: true })).toBeVisible(); };
  const newcomer = 'Mounted Newcomer ' + suffix;
  async function review(reasonLabel, checkbox, submit) {
    await admin.getByLabel(reasonLabel, { exact: true }).fill(why);
    await admin.getByRole('checkbox', { name: checkbox }).check();
    await admin.getByRole('button', { name: submit, exact: true }).click();
  }
  await proc('Administrator lists only their school, searches and filters', async () => {
    await goAdmin();
    for (const name of ['teacher-a', 'guardian-a', 'student-user-a']) await expect(admin.getByRole('heading', { name, exact: true })).toBeVisible();
    for (const name of ['admin-b', 'teacher-b', 'guardian-b']) await expect(admin.getByRole('heading', { name, exact: true })).toHaveCount(0);
    await admin.getByLabel('Search accounts by name or email').fill('guardian-a'); await expect(admin.getByText(/Showing 1 of \d+ loaded accounts/)).toBeVisible();
    await admin.getByLabel('Search accounts by name or email').fill('no-such-person'); await expect(admin.getByText(/No loaded account matches/)).toBeVisible();
    await admin.getByLabel('Search accounts by name or email').fill(''); await admin.getByLabel('Filter by role').selectOption('student');
    await expect(admin.getByRole('heading', { name: 'student-user-a', exact: true })).toBeVisible(); await expect(admin.getByRole('heading', { name: 'teacher-a', exact: true })).toHaveCount(0);
    await admin.getByLabel('Filter by role').selectOption('all');
    await shot(admin, 'admin-desktop');
  });
  await proc('Administrator provisions a reviewed account, then changes its role (recorded, version-checked)', async () => {
    await goAdmin();
    for (const [label, value] of Object.entries({ Name: newcomer, Email: 'newcomer-' + suffix + '@example.invalid', 'Exact trusted identity issuer': provider, 'Exact provider identity subject': 'newcomer-sub-' + suffix, 'Reason and review reference': why })) await admin.getByLabel(label, { exact: true }).fill(value);
    await admin.getByRole('checkbox', { name: /I checked this person/ }).check();
    await admin.getByRole('button', { name: 'Provision reviewed account', exact: true }).click();
    await expect(admin.getByRole('status')).toContainText('Reviewed account saved');
    await admin.getByRole('button', { name: 'Manage account for ' + newcomer, exact: true }).click();
    await expect(admin.getByRole('heading', { name: 'Manage account', exact: true })).toBeVisible();
    await expect(admin.getByRole('button', { name: 'Change role', exact: true })).toBeDisabled();
    await admin.getByLabel('New role for this account').selectOption('guardian');
    await expect(admin.getByRole('button', { name: 'Change role', exact: true })).toBeDisabled();
    await review('Reason for the role change', /confirm this role change/, 'Change role');
    await expect(admin.getByRole('status')).toContainText(`Reviewed role change saved. ${newcomer} is now guardian.`);
    await expect(admin.getByText(`Role changed from teacher to guardian · ${newcomer}`)).toBeVisible();
    assert.equal((await api(adminContext, '/api/admin/users/changes')).body.filter(row => row.reason === why && row.action === 'change_role').length, 1, 'One immutable audit row');
  });
  await proc('Role change is refused in plain words for a teacher with classes, a linked profile, and the administrator’s own account', async () => {
    await goAdmin();
    await admin.getByRole('button', { name: 'Manage account for teacher-a', exact: true }).click();
    await admin.getByLabel('New role for this account').selectOption('student'); await review('Reason for the role change', /confirm this role change/, 'Change role');
    await expect(alertLine(admin)).toContainText('still has classes');
    await admin.getByRole('button', { name: 'Close account panel', exact: true }).click();
    await admin.getByRole('button', { name: 'Manage account for guardian-a', exact: true }).click();
    await admin.getByLabel('New role for this account').selectOption('teacher'); await review('Reason for the role change', /confirm this role change/, 'Change role');
    await expect(alertLine(admin)).toContainText('linked to a student or guardian profile');
    await admin.getByRole('button', { name: 'Close account panel', exact: true }).click();
    await admin.getByRole('button', { name: 'Manage account for admin-a', exact: true }).click();
    await expect(admin.getByText(/This is your own account/)).toBeVisible();
    await expect(admin.getByLabel('New role for this account')).toBeDisabled();
    await expect(admin.getByRole('button', { name: 'Remove sign-in link', exact: true })).toBeDisabled();
    const refused = await api(adminContext, '/api/admin/users/admin-a/role', 'PATCH', { clientRequestId: crypto.randomUUID(), expectedVersion: 0, role: 'teacher', reviewConfirmed: true, reason: why });
    assert.deepEqual([refused.status, refused.body.reason], [409, 'self'], 'The server refuses self-demotion too');
    assert.equal((await api(adminContext, '/api/admin/users')).body.find(user => user.id === 'admin-a').role, 'admin');
  });
  await proc('Administrator removes then re-links the sign-in identity; a held identity is refused', async () => {
    await goAdmin();
    await admin.getByRole('button', { name: 'Manage account for ' + newcomer, exact: true }).click();
    await expect(admin.getByRole('heading', { name: 'Remove school sign-in link', exact: true })).toBeVisible();
    await review('Reason for the sign-in change', /confirm this sign-in change/, 'Remove sign-in link');
    await expect(admin.getByRole('status')).toContainText('no longer has a school sign-in link');
    await expect(admin.getByText('Role changed from teacher to guardian · ' + newcomer)).toBeVisible();
    await expect(admin.getByText('School sign-in link removed · ' + newcomer)).toBeVisible();
    await admin.getByRole('button', { name: 'Manage account for ' + newcomer, exact: true }).click();
    await expect(admin.getByRole('heading', { name: 'Link school sign-in', exact: true })).toBeVisible();
    await admin.getByLabel('Provider issuer to link').fill(provider); await admin.getByLabel('Provider subject to link').fill('sub-guardian-a');
    await review('Reason for the sign-in change', /confirm this sign-in change/, 'Link sign-in identity');
    await expect(alertLine(admin)).toContainText('already uses that sign-in identity');
    await admin.getByLabel('Provider subject to link').fill('newcomer-relinked-' + suffix);
    await admin.getByRole('checkbox', { name: /confirm this sign-in change/ }).check();
    await admin.getByRole('button', { name: 'Link sign-in identity', exact: true }).click();
    await expect(admin.getByRole('status')).toContainText('is now linked to the school sign-in identity');
    await expect(admin.getByText('School sign-in linked · ' + newcomer)).toBeVisible();
    await admin.reload({ waitUntil: 'networkidle' });
    await expect(admin.getByText('School sign-in linked · ' + newcomer)).toBeVisible(); await expect(admin.getByText('School sign-in link removed · ' + newcomer)).toBeVisible();
    const rows = (await api(adminContext, '/api/admin/users/changes')).body.filter(row => row.reason === why).map(row => row.action).sort();
    assert.deepEqual(rows, ['change_role', 'link_identity', 'unlink_identity']);
    assert.equal(rows.length === 3 && (await api(adminContext, '/api/admin/users/changes')).body.every(row => row.requestHash === undefined && row.attemptId === undefined), true, 'Internal retry keys are never returned');
  });
  await proc('Another school’s accounts are out of reach for read and change', async () => {
    assert.equal((await api(adminContext, '/api/admin/users/admin-b')).status, 404);
    assert.equal((await api(adminContext, '/api/admin/users/teacher-b/role', 'PATCH', { clientRequestId: crypto.randomUUID(), expectedVersion: 0, role: 'student', reviewConfirmed: true, reason: why })).status, 404);
    assert.equal((await api(adminContext, '/api/admin/users/admin-b/identity', 'PATCH', { clientRequestId: crypto.randomUUID(), expectedVersion: 0, action: 'unlink', reviewConfirmed: true, reason: why })).status, 404);
    const list = (await api(adminContext, '/api/admin/users')).body; assert.equal(list.some(user => /-b$/.test(user.id)), false);
  });
  await proc('Phone width: account administration with the Manage panel open stays readable', async () => {
    await goAdmin(); await admin.setViewportSize({ width: 375, height: 800 });
    await admin.getByRole('button', { name: 'Manage account for ' + newcomer, exact: true }).click();
    await expect(admin.getByRole('heading', { name: 'Manage account', exact: true })).toBeVisible();
    await labelsAndWidth(admin); await shot(admin, 'admin-manage-mobile'); await admin.setViewportSize({ width: 1280, height: 900 });
  });
  await proc('Sign-out from the account page ends the opaque session', async () => {
    const context = await asRole('teacher-other'); const page = await context.newPage();
    await go(page, '/account');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await expect(page).toHaveURL(/\/login$/);
    assert.equal((await whoami(page)).status, 401);
  });
}

// ---------------------------------------------------------------------------------------------------------------------------
let fatal = null;
try {
  const probe = await newContext();
  const available = (await api(probe, '/api/demo')).body?.available === true;
  mode = available ? 'demo' : 'real';
  if (available) await demoSuite(); else await realSuite();
  await proc('The browser made no external request and raised no page error', async () => {
    assert.deepEqual(externalRequests, []); assert.deepEqual(pageErrors, []);
  });
} catch (error) { fatal = String(error?.message ?? error).slice(0, 300); console.log('fatal: ' + fatal); }
finally {
  const passed = procedures.filter(item => item.result === 'pass').length, failed = procedures.filter(item => item.result === 'fail').length, notExecuted = procedures.filter(item => item.result === 'not-executed').length;
  const result = { executedAt: new Date().toISOString(), mode, passed, failed, notExecuted, fatal, localApiRequests, navigationRetries, externalRequests: externalRequests.length, pageErrors: pageErrors.length,
    scope: 'Mounted local Chromium over an isolated built Worker and D1; synthetic data only; no real identity provider, ORF, paid AI or recipient; no UAT, accessibility-certification or business acceptance claim',
    procedures, screenshots, externalRequestDetails: externalRequests, pageErrorDetails: pageErrors };
  writeFileSync(`${outputDir}/identity-${mode}-results.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ mode, passed, failed, notExecuted, fatal, externalRequests: externalRequests.length, pageErrors: pageErrors.length, localApiRequests }));
  process.exitCode = failed || fatal ? 1 : 0;
  for (const value of contexts) await value.close().catch(() => {});
  await browser.close();
}
