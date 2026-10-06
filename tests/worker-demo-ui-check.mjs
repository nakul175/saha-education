// Manual mounted-browser procedures against a separately provisioned local demo.
// The operator supplies a pristine migrated synthetic database with demo ON and
// every OIDC setting absent. No injected session fixture or real record is used.
// One session-read delivery is delayed without changing its saved response;
// one committed DELETE acknowledgement is deliberately lost at transport time.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';

const suppliedOrigin = process.env.SAHA_WORKER_TEST_URL;
const executablePath = process.env.SAHA_TEST_BROWSER;
if (!suppliedOrigin || !executablePath) throw new Error('Supply a local demo Worker URL and browser executable; no session fixture is needed.');
const base = new URL(suppliedOrigin);
if (!['127.0.0.1', 'localhost'].includes(base.hostname) || !['http:', 'https:'].includes(base.protocol) || base.pathname !== '/' || base.search || base.hash || base.username || base.password) throw new Error('Demo procedures require an exact localhost origin.');
const resultPath = process.env.SAHA_DEMO_UI_RESULTS ?? '/private/tmp/saha-demo-ui-results.json';
if (!resultPath.startsWith('/private/tmp/')) throw new Error('Use a private temporary results path.');
const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-background-networking'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', timezoneId: 'Asia/Kolkata' });
context.setDefaultTimeout(15000);
context.setDefaultNavigationTimeout(20000);
const page = await context.newPage();
const checks = [], screenshots = [], externalRequests = [], pageErrors = [], deliveryErrors = [];
let passed = 0, failed = 0, localApiRequests = 0, activeProcedure = 'local demo setup';
let activeCheckpoint = 'initial local setup', failure = null;
const checkpoint = label => { activeCheckpoint = label; };
const plannedProcedures = 26;
page.on('pageerror', () => { pageErrors.push('Client page error occurred'); });
context.on('request', request => { const url = new URL(request.url()); if (url.origin === base.origin && url.pathname.startsWith('/api/')) localApiRequests++; });
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.origin === base.origin) return route.continue();
  externalRequests.push({ origin: url.origin, path: url.pathname });
  return route.abort();
});
const roles = [
  { role: 'admin', label: 'administrator', title: 'Admin Dashboard', paths: ['/', '/admin/users', '/admin/profile-links', '/curriculum', '/reading-practice', '/reading-review', '/reading-imports', '/resources', '/learning', '/external-apps', '/students', '/guardians', '/schools', '/classes', '/courses', '/enrolments', '/attendance', '/assessments', '/report-cards', '/notifications'] },
  { role: 'teacher', label: 'teacher', title: 'Teacher Dashboard', paths: ['/', '/curriculum', '/reading-practice', '/reading-review', '/reading-imports', '/resources', '/learning', '/external-apps', '/students', '/classes', '/courses', '/enrolments', '/attendance', '/assessments', '/report-cards', '/notifications'] },
  { role: 'guardian', label: 'guardian', title: 'Guardian Dashboard', paths: ['/', '/students', '/classes', '/attendance', '/assessments', '/report-cards', '/notifications'] },
  { role: 'student', label: 'learner', title: 'My progress', paths: ['/', '/learning', '/students', '/classes', '/attendance', '/assessments', '/report-cards', '/notifications'] },
];
async function check(name, action) {
  activeProcedure = name; checkpoint('procedure start'); await action();
  assert.equal(deliveryErrors.length, 0, 'Local delivery handler completed without transport setup failures');
  checks.push(name); passed++; console.log('ok - ' + name);
}
async function session() {
  return page.evaluate(async () => {
    const response = await fetch('/api/session', { cache: 'no-store' });
    const text = await response.text();
    return { status: response.status, cacheControl: response.headers.get('cache-control'), value: JSON.parse(text) };
  });
}
async function loginPage() {
  const response = await page.goto(new URL('/login', base).href, { waitUntil: 'networkidle', timeout: 20000 });
  assert.equal(response?.status(), 200, 'Local login page is served');
  await expect(page.getByRole('heading', { name: 'Explore Saha Education', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /exploring fictional records/ })).toBeVisible();
}
async function labelledControls() {
  assert.equal(await page.locator('input:not([type=hidden]),select,textarea').evaluateAll(items => items.filter(item => !item.labels?.length && !item.getAttribute('aria-label') && !item.getAttribute('aria-labelledby')).length), 0, 'Visible native form controls have associated labels');
  assert.equal(await page.locator('button a,a button').count(), 0, 'The sampled page does not nest buttons and links');
}
async function phoneWidth() {
  await page.setViewportSize({ width: 390, height: 900 });
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
  assert.ok(dimensions.page <= dimensions.viewport + 1, 'The sampled phone page does not overflow horizontally');
  await labelledControls();
}
async function shot(name) {
  await page.bringToFront();
  await page.evaluate(async () => { await document.fonts.ready; scrollTo(0, 0); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  const path = '/private/tmp/saha-demo-ui-' + name + '.png';
  await page.screenshot({ path, fullPage: true }); screenshots.push(path);
}
async function signIn(role, sameFrame = false) {
  checkpoint('fictional acknowledgement control');
  await page.getByRole('checkbox', { name: /exploring fictional records/ }).check();
  const button = page.getByRole('button', { name: 'Explore as ' + role.label, exact: true });
  let sent = 0;
  const captures = [];
  const match = url => url.pathname === '/api/demo';
  const capture = async route => {
    if (route.request().method() !== 'POST') return route.continue();
    try {
      const actual = await route.fetch({ timeout: 15000, maxRedirects: 0 });
      const body = await actual.text();
      const cookie = actual.headers()['set-cookie'] ?? '';
      let dto, bodyParsed = false;
      try { dto = JSON.parse(body); bodyParsed = true; } catch { /* Only the safe parsed/not-parsed fact leaves this capture. */ }
      captures.push({ status: actual.status(), payload: JSON.parse(route.request().postData()), bodyParsed, dto,
        cookieShape: /^__Host-saha_session=[A-Za-z0-9_-]{43};/.test(cookie),
        cookieAttributes: ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/'].map(attribute => cookie.includes(attribute)) });
      // The original real body, headers and Set-Cookie are fulfilled unchanged.
      // Capturing before delivery avoids querying a response body after its
      // document has already navigated away. No session or success is injected.
      return route.fulfill({ response: actual });
    } catch { deliveryErrors.push('Actual demo response could not be captured before unchanged delivery'); return route.abort(); }
  };
  const listener = request => { if (new URL(request.url()).pathname === '/api/demo' && request.method() === 'POST') sent++; };
  page.on('request', listener);
  await context.route(match, capture);
  try {
    checkpoint('fixed role action dispatch');
    const delivery = page.waitForResponse(response => new URL(response.url()).pathname === '/api/demo' && response.request().method() === 'POST');
    if (sameFrame) await button.evaluate(element => { element.click(); element.click(); }); else await button.click();
    checkpoint('actual demo POST response arrival');
    const response = await delivery;
    checkpoint('actual demo POST response status');
    assert.equal(response.status(), 200, 'Actual demo entry succeeds');
    assert.equal(captures.length, 1, 'One actual demo response is captured before unchanged delivery');
    const actual = captures[0];
    assert.equal(actual.status, 200, 'Original captured server status agrees with browser delivery');
    checkpoint('fixed acknowledged role request payload');
    assert.deepEqual(actual.payload, { role: role.role, syntheticAcknowledged: true }, 'The role chooser submits only its fixed acknowledged role');
    checkpoint('saved native destination and synthetic acknowledgement DTO');
    assert.equal(actual.bodyParsed, true, 'The original server reply is valid JSON');
    assert.deepEqual(actual.dto, { destination: '/', synthetic: true }, 'Actual entry acknowledges the native application destination');
    checkpoint('opaque host cookie shape');
    assert.equal(actual.cookieShape, true, 'Actual entry returns an opaque host session');
    for (const [index, label] of ['opaque cookie HttpOnly attribute', 'opaque cookie Secure attribute', 'opaque cookie SameSite attribute', 'opaque cookie host path attribute'].entries()) { checkpoint(label); assert.equal(actual.cookieAttributes[index], true, 'The opaque cookie retains its security attribute'); }
    checkpoint('native selected-role dashboard destination');
    await expect(page).toHaveURL(new RegExp('/dashboard/' + role.role + '$'));
    checkpoint('selected-role dashboard heading');
    await expect(page.getByRole('heading', { name: role.title, exact: true })).toBeVisible();
    checkpoint('same-frame single role POST count');
    assert.equal(sent, 1, 'The requested ordinary role action emits one actual POST');
    checkpoint('fresh opaque session public DTO');
    assert.deepEqual(await session(), { status: 200, cacheControl: 'no-store', value: { id: 'saha-demo-' + role.role, role: role.role, schoolId: 'saha-demo-school' } }, 'The browser uses the real server-created session for the selected role');
  } finally { page.off('request', listener); await context.unroute(match, capture); }
}
async function signOut(buttonName = 'Sign out', sameFrame = true) {
  checkpoint('ordinary sign-out action readiness');
  const button = page.getByRole('button', { name: buttonName, exact: true });
  let sent = 0; const captures = [];
  const match = url => url.pathname === '/api/session';
  const capture = async route => {
    if (route.request().method() !== 'DELETE') return route.continue();
    try {
      const actual = await route.fetch({ timeout: 15000, maxRedirects: 0 });
      const body = await actual.text(); let dto, bodyParsed = false;
      try { dto = JSON.parse(body); bodyParsed = true; } catch { /* Safe parsed fact only. */ }
      captures.push({ status: actual.status(), bodyParsed, dto });
      return route.fulfill({ response: actual });
    } catch { deliveryErrors.push('Actual sign-out response could not be captured before unchanged delivery'); return route.abort(); }
  };
  const listener = request => { if (new URL(request.url()).pathname === '/api/session' && request.method() === 'DELETE') sent++; };
  page.on('request', listener); await context.route(match, capture);
  try {
    const delivery = page.waitForResponse(response => new URL(response.url()).pathname === '/api/session' && response.request().method() === 'DELETE');
    if (sameFrame) await button.evaluate(element => { element.click(); element.click(); }); else await button.click();
    checkpoint('actual ordinary DELETE arrival');
    const response = await delivery;
    assert.equal(response.status(), 200, 'Actual server sign-out is acknowledged');
    checkpoint('original saved DELETE acknowledgement');
    assert.equal(captures.length, 1, 'One unchanged original DELETE reply is captured');
    assert.equal(captures[0].status, 200); assert.equal(captures[0].bodyParsed, true);
    assert.deepEqual(captures[0].dto, { message: 'Logged out' }, 'The original saved sign-out response is used');
    checkpoint('native sign-in destination after sign-out');
    await expect(page).toHaveURL(new RegExp('/login$'));
    await expect(page.getByRole('heading', { name: 'Explore Saha Education', exact: true })).toBeVisible();
    assert.equal(sent, 1, 'The requested sign-out action produces one actual DELETE');
    checkpoint('fresh browser confirms signed-out session');
    assert.deepEqual(await session(), { status: 401, cacheControl: 'no-store', value: { error: 'Not authenticated' } }, 'A fresh browser session request confirms sign-out');
  } finally { page.off('request', listener); await context.unroute(match, capture); }
}

try {
  await loginPage();
  await check('Separate configured demo is available and this fresh browser starts signed out', async () => {
    const discovery = await page.evaluate(async () => { const response = await fetch('/api/demo', { cache: 'no-store' }); return { status: response.status, value: await response.json() }; });
    assert.deepEqual(discovery, { status: 200, value: { available: true, synthetic: true } });
    assert.equal((await session()).status, 401, 'No fixture or pre-existing browser session is injected');
  });
  await check('All four role choices require the labelled fictional-data acknowledgement', async () => {
    await expect(page.getByRole('checkbox', { name: /exploring fictional records/ })).not.toBeChecked();
    for (const role of roles) await expect(page.getByRole('button', { name: 'Explore as ' + role.label, exact: true })).toBeDisabled();
    await labelledControls();
    assert.equal(await page.locator('main').getAttribute('aria-labelledby'), await page.getByRole('heading', { name: 'Explore Saha Education', exact: true }).getAttribute('id'));
  });
  await check('Phone login retains labelled controls without horizontal overflow', async () => { await phoneWidth(); await shot('login-mobile'); });
  for (const role of roles) {
    await page.setViewportSize({ width: 1280, height: 900 });
    if (new URL(page.url()).pathname !== '/login') await loginPage();
    await check(role.label + ': same-frame real role entry opens the appropriate scoped dashboard', () => signIn(role, true));
    await check(role.label + ': synthetic banner and native role navigation are clear', async () => {
      await expect(page.getByRole('complementary', { name: 'Synthetic demo', exact: true })).toContainText('Fictional records only');
      await expect(page.getByRole('link', { name: 'Switch demo role', exact: true })).toHaveAttribute('href', '/login');
      const nav = page.getByRole('navigation', { name: 'School navigation', exact: true }); await expect(nav).toBeVisible();
      assert.deepEqual((await nav.locator('a').evaluateAll(items => items.map(item => item.getAttribute('href')))).sort(), [...role.paths].sort());
      assert.equal(await nav.locator('a').evaluateAll(items => items.every(item => new URL(item.href).origin === location.origin)), true);
      await labelledControls();
    });
    if (role.role === 'admin') await check('Transient anonymous shared-header Login is one native anchor, without an interactive parent', async () => {
      let release, signal; const gate = new Promise(resolve => { release = resolve; }); const held = new Promise(resolve => { signal = resolve; });
      const match = url => url.pathname === '/api/session';
      const delay = async route => {
        if (route.request().method() !== 'GET') return route.continue();
        try { const response = await route.fetch({ timeout: 15000, maxRedirects: 0 }); assert.equal(response.status(), 200); signal(); await gate; return route.fulfill({ response }); }
        catch { deliveryErrors.push('Delayed actual session response could not be delivered'); return route.abort(); }
      };
      await context.route(match, delay);
      try {
        await page.goto(new URL('/students', base).href, { waitUntil: 'domcontentloaded' });
        let timer;
        try { await Promise.race([held, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Local session delivery did not arrive')), 15000); })]); }
        finally { clearTimeout(timer); }
        const login = page.getByRole('link', { name: 'Login', exact: true }); await expect(login).toBeVisible();
        await expect(login).toHaveAttribute('href', '/login'); assert.equal(await login.evaluate(element => element.closest('button') === null), true);
        release(); await expect(page.getByRole('navigation', { name: 'School navigation', exact: true })).toBeVisible();
      } finally { release(); await context.unroute(match, delay); }
      await page.goto(new URL('/dashboard/admin', base).href, { waitUntil: 'networkidle' });
      await expect(page.getByRole('heading', { name: role.title, exact: true })).toBeVisible();
    });
    await check(role.label + ': keyboard skip link focuses the main content', async () => {
      const skip = page.getByRole('link', { name: 'Skip to main content', exact: true }); await skip.focus(); await expect(skip).toBeVisible(); await skip.press('Enter');
      assert.equal(await page.locator('#main-content').evaluate(element => document.activeElement === element), true, 'Native keyboard activation moves focus to the main landmark');
      await expect(page.locator('#main-content')).toBeFocused();
    });
    await check(role.label + ': phone shared header and dashboard remain readable and labelled', async () => {
      await phoneWidth(); await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
      await expect(page.getByText('saha-demo-' + role.role, { exact: true })).toBeVisible(); await shot(role.role + '-mobile');
    });
    await check(role.label + ': same-frame actual sign-out ends the opaque session once', signOut);
  }
  await loginPage(); await signIn(roles[0]);
  let committedDelete = false, deleteRequests = 0;
  const countDeletes = request => { if (new URL(request.url()).pathname === '/api/session' && request.method() === 'DELETE') deleteRequests++; };
  page.on('request', countDeletes);
  const matchDelete = url => url.pathname === '/api/session';
  const loseDelete = async route => {
    if (route.request().method() !== 'DELETE') return route.continue();
    try {
      const response = await route.fetch({ timeout: 15000, maxRedirects: 0 });
      assert.equal(response.status(), 200); assert.deepEqual(JSON.parse(await response.text()), { message: 'Logged out' });
      committedDelete = true; return route.abort('failed');
    } catch { deliveryErrors.push('Committed synthetic sign-out reply could not be inspected'); return route.abort(); }
  };
  await context.route(matchDelete, loseDelete);
  try {
    await check('Deliberately lost committed sign-out delivery hides previous page and offers a clear retry', async () => {
      await expect(page.getByRole('heading', { name: 'Admin Dashboard', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('Sign out could not be confirmed');
      assert.equal(committedDelete, true, 'Injected transport failure follows an actual committed DELETE acknowledgement');
      await expect(page.getByRole('heading', { name: 'Confirming sign out', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Admin Dashboard', exact: true })).toHaveCount(0);
      await expect(page.getByRole('navigation')).toHaveCount(0); await expect(page.getByText('saha-demo-admin', { exact: true })).toHaveCount(0);
      await expect(page.getByText('River School — synthetic demo', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Retry sign out', exact: true })).toBeEnabled();
      await expect(page.getByRole('link', { name: 'Continue to sign-in', exact: true })).toHaveAttribute('href', '/login');
      assert.equal(deleteRequests, 1, 'Unknown reply triggers no automatic repeat');
      assert.equal((await session()).status, 401, 'Actual server session is gone despite the lost delivery');
      await phoneWidth(); await shot('sign-out-recovery-mobile');
    });
  } finally { await context.unroute(matchDelete, loseDelete); }
  await check('Explicit ordinary sign-out retry acknowledges the already-signed-out state and returns to login', async () => {
    await signOut('Retry sign out', false);
    assert.equal(deleteRequests, 2, 'Only one explicit retry follows the original ordinary action');
    assert.equal((await session()).status, 401, 'Fresh session lookup still confirms signed-out state');
  });
  page.off('request', countDeletes);
  assert.equal(passed, plannedProcedures, 'All planned mounted procedures completed');
  assert.equal(externalRequests.length, 0, 'Page requests stay local'); assert.equal(pageErrors.length, 0, 'No client page error occurred');
} catch (error) {
  failed = 1; checks.push('FAILED: ' + activeProcedure); console.log('not ok - ' + activeProcedure);
  failure = { checkpoint: activeCheckpoint, errorName: error instanceof Error ? error.name : 'UnknownThrownValue' };
  // Do not expose browser transport error causes, response headers or tokens.
  if (!(error instanceof Error)) console.log('A local demo procedure was interrupted.');
} finally {
  const notRun = Math.max(0, plannedProcedures - passed - failed);
  const result = { executedAt: new Date().toISOString(), passed, failed, skipped: 0, notRun, plannedProcedures, localApiRequests,
    externalRequests: externalRequests.length, pageErrors: pageErrors.length, deliveryErrors: deliveryErrors.length,
    setup: 'Separate local pristine migrated synthetic database; SAHA_DEMO_ENABLED=true, UUID installation ID and all OIDC settings absent; no session fixture.',
    scope: 'Mounted local browser with real demo/session responses; delayed unaltered session-read delivery and one deliberately lost committed DELETE reply; no provider/real-record/hosted/UAT/accessibility-certification claim.',
    checks, screenshots, failure, externalRequestDetails: externalRequests, pageErrorDetails: pageErrors };
  writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ passed, failed, skipped: 0, notRun, plannedProcedures, externalRequests: externalRequests.length, pageErrors: pageErrors.length, failure, results: resultPath, screenshots }));
  process.exitCode = failed ? 1 : 0;
  await context.close(); await browser.close();
}
