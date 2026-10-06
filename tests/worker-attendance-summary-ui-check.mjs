// Manual browser procedures over a built localhost Worker and private synthetic sessions.
// UI-intercepted failures exercise rendering/cancellation only; access rules use real APIs.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
const origin = process.env.SAHA_WORKER_TEST_URL, fixture = process.env.SAHA_WORKER_SESSION_FIXTURE, executablePath = process.env.SAHA_TEST_BROWSER;
if (!origin || !fixture || !executablePath) throw new Error('Supply localhost Worker, synthetic sessions and browser executable.');
const base = new URL(origin);
if (!['127.0.0.1', 'localhost'].includes(base.hostname) || !['http:', 'https:'].includes(base.protocol) || base.pathname !== '/' || base.search || base.hash || base.username || base.password) throw new Error('An exact localhost origin is required.');
const sessions = JSON.parse(readFileSync(fixture, 'utf8'));
const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-background-networking'] });
const contexts = [], checks = [], captures = [], pageErrors = [], externalRequests = [], failedResources = [];
const check = async (name, action) => { await action(); checks.push(name); console.log('ok - ' + name); };
async function context(user) {
  if (user) assert.equal(typeof sessions[user], 'string');
  const value = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'America/Los_Angeles', serviceWorkers: 'block', extraHTTPHeaders: user ? { cookie: sessions[user] } : {} });
  if (user) {
    const index = sessions[user].indexOf('=');
    await value.addCookies([{ name: sessions[user].slice(0, index), value: sessions[user].slice(index + 1), domain: base.hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]);
  }
  contexts.push(value);
  value.on('page', page => {
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && ['script', 'stylesheet'].includes(response.request().resourceType())) failedResources.push({ path: new URL(response.url()).pathname, status: response.status() }); });
  });
  await value.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === base.origin) return route.continue();
    externalRequests.push({ origin: url.origin, path: url.pathname }); return route.abort();
  });
  return value;
}
const pupil = (page, kind) => page.locator('[data-attendance-pupil="dashboard-learner-' + kind + '"]');
async function open(page) {
  const response = await page.goto(base.origin + '/attendance', { waitUntil: 'networkidle' });
  assert.equal(response?.status(), 200);
  await expect(page.getByRole('heading', { name: 'Attendance Summary', exact: true, level: 1 })).toBeVisible();
  await expect(page.getByLabel('Select Class', { exact: true })).toBeEnabled();
}
async function choose(page, id) {
  await page.getByLabel('Select Class', { exact: true }).selectOption(id);
  await expect(page.locator('#attendance-class-heading')).toBeVisible();
  await expect(page.getByLabel('Select Class', { exact: true })).toHaveValue(id);
}
async function widthAndLabels(page) {
  assert.equal(await page.locator('input:not([type=hidden]),select,textarea').evaluateAll(items => items.filter(item => !item.labels?.length && !item.getAttribute('aria-label') && !item.getAttribute('aria-labelledby')).length), 0);
  const width = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(width.scroll <= width.viewport + 1, 'No horizontal overflow: ' + JSON.stringify(width));
}
async function capture(page, label) {
  await expect(page.getByRole('heading', { name: 'Attendance Summary', exact: true, level: 1 })).toHaveCount(1);
  await expect(page.getByRole('banner')).toHaveCount(1); await expect(page.getByRole('main')).toHaveCount(1);
  // Chrome can capture an old compositor tile immediately after a viewport
  // change. Settle fonts/layout and render the entire page before the capture.
  await page.evaluate(async () => {
    await document.fonts.ready;
    const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    document.documentElement.getBoundingClientRect(); await frames();
    scrollTo(0, document.documentElement.scrollHeight); await frames();
    scrollTo(0, 0); document.documentElement.getBoundingClientRect(); await frames();
  });
  const path = '/private/tmp/saha-attendance-summary-' + label + '.png';
  await page.screenshot({ path, fullPage: true }); captures.push(path);
}
try {
  const teacher = await context('dashboard-teacher'), guardian = await context('dashboard-guardian'), student = await context('dashboard-student'), generalTeacher = await context('teacher-a');
  const staff = await teacher.newPage(), family = await guardian.newPage(), learner = await student.newPage(), capped = await generalTeacher.newPage();
  await open(staff); await choose(staff, 'dashboard-class-family');
  await check('Teacher summary uses the selected real class and distinct active roster', async () => {
    await expect(staff.locator('#attendance-class-heading')).toHaveText('Synthetic dashboard family');
    await expect(staff.locator('[data-attendance-pupil]')).toHaveCount(3);
    await expect(staff.getByText('Current active enrolment', { exact: true })).toHaveCount(3);
  });
  await check('Unrecorded learner is explicit without an invented mark or percentage', async () => {
    await expect(pupil(staff, 'none')).toContainText('No attendance has been recorded for this learner in this class.');
    await expect(pupil(staff, 'none').locator('dl')).toHaveCount(0);
    assert.equal(/\d(?:\.\d+)?%/.test(await staff.locator('body').innerText()), false);
  });
  await check('Excused-only saved rows retain their exact counts', async () => {
    await expect(pupil(staff, 'excused')).toContainText('2 saved rows.');
    await expect(pupil(staff, 'excused').locator('dl')).toHaveText('present0absent0late0excused2Other saved status0');
  });
  await check('Mixed raw rows retain invalid date evidence without including it in coverage', async () => {
    const item = pupil(staff, 'attendance');
    await expect(item).toContainText('5 saved rows.');
    await expect(item.locator('dl')).toHaveText('present2absent1late1excused1Other saved status0');
    await expect(item).toContainText('1 saved row has an invalid date');
    await expect(item).not.toContainText('2026-02-30');
  });
  await check('Calendar dates do not shift in a browser west of UTC', async () => {
    await expect(pupil(staff, 'attendance').locator('time')).toHaveText(['2026-10-01', '2026-10-04']);
    await expect(pupil(staff, 'excused').locator('time')).toHaveText(['2026-10-01', '2026-10-02']);
  });
  await check('Staff review action is a native link for the exact selected class', async () => {
    await expect(staff.getByRole('link', { name: 'Review attendance marks', exact: true })).toHaveAttribute('href', '/classes/dashboard-class-family/attendance');
  });
  await check('Reselecting the current class preserves its loaded snapshot', async () => {
    await staff.getByLabel('Select Class').selectOption('dashboard-class-family');
    await expect(staff.locator('[data-attendance-pupil]')).toHaveCount(3);
    await expect(staff.locator('#attendance-class-heading')).toHaveText('Synthetic dashboard family');
  });
  await check('Refresh reloads the real class choices and preserves the selection', async () => {
    const loaded = staff.waitForResponse(response => new URL(response.url()).pathname === '/api/classes/dashboard-class-family/attendance-summary');
    await staff.getByRole('button', { name: 'Refresh', exact: true }).click();
    assert.equal((await loaded).status(), 200);
    await expect(staff.getByLabel('Select Class')).toHaveValue('dashboard-class-family');
    await expect(staff.locator('[data-attendance-pupil]')).toHaveCount(3);
  });
  await check('Clearing selection immediately removes the old pupil snapshot', async () => {
    await staff.getByLabel('Select Class').selectOption('');
    await expect(staff.locator('[data-attendance-pupil]')).toHaveCount(0);
    await expect(staff.getByText('Choose a class to view its available records.', { exact: true })).toBeVisible();
  });
  await check('An actual no-roster class is displayed as an empty available class', async () => {
    await choose(staff, 'dashboard-class-no-roster');
    await expect(staff.getByText('No learner profiles or saved attendance rows are currently available for this class.', { exact: true })).toBeVisible();
  });
  await check('A failed summary request clears old rows and exposes a focused retry message', async () => {
    await staff.route('**/api/classes/dashboard-class-family/attendance-summary', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Synthetic unavailable"}' }), { times: 1 });
    await staff.getByLabel('Select Class').selectOption('dashboard-class-family');
    await expect(staff.getByRole('alert')).toContainText('Attendance could not be loaded');
    await expect(staff.getByRole('alert')).toBeFocused();
    await expect(staff.locator('[data-attendance-pupil]')).toHaveCount(0);
    await staff.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(staff.locator('[data-attendance-pupil]')).toHaveCount(3);
    await expect(staff.getByRole('alert')).toHaveCount(0);
  });
  await check('A late old-class response cannot replace a newly selected snapshot', async () => {
    await choose(staff, 'dashboard-class-complete');
    let release; const gate = new Promise(resolve => { release = resolve; });
    let started; const captured = new Promise(resolve => { started = resolve; });
    await staff.route('**/api/classes/dashboard-class-family/attendance-summary', async route => {
      const response = await route.fetch({ timeout: 15000, maxRedirects: 0, headers: { ...await route.request().allHeaders(), cookie: sessions['dashboard-teacher'] } });
      assert.equal(response.status(), 200, 'Held response contains an actual authorized older snapshot');
      const body = await response.body(); started(); await gate;
      try { await route.fulfill({ response, body }); } catch { /* Expected cancellation of the obsolete request. */ }
    }, { times: 1 });
    await staff.getByLabel('Select Class').selectOption('dashboard-class-family'); await captured;
    await staff.getByLabel('Select Class').selectOption('dashboard-class-complete');
    await expect(pupil(staff, 'zero')).toBeVisible(); release();
    await expect(staff.locator('#attendance-class-heading')).toHaveText('Synthetic dashboard complete');
    await expect(staff.locator('[data-attendance-pupil]')).toHaveCount(2);
    await expect(pupil(staff, 'attendance')).toHaveCount(0);
  });
  await open(family); await choose(family, 'dashboard-class-family');
  await check('Guardian uses only currently linked real pupil records', async () => {
    await expect(family.locator('[data-attendance-pupil]')).toHaveCount(3);
    await expect(pupil(family, 'none')).toBeVisible(); await expect(pupil(family, 'attendance')).toBeVisible();
    await expect(pupil(family, 'recorded')).toHaveCount(0);
    assert.equal(await family.getByLabel('Select Class').locator('option[value="class-b"]').count(), 0);
  });
  await check('Family summary has no staff editing link or private record notes', async () => {
    await expect(family.getByRole('link', { name: 'Review attendance marks', exact: true })).toHaveCount(0);
    await expect(family.getByRole('button', { name: /Save|Review|Retry pending/ })).toHaveCount(0);
    await expect(family.getByText(/PRIVATE staff|identity\.example\.invalid/)).toHaveCount(0);
  });
  await open(learner); await choose(learner, 'dashboard-class-complete');
  await check('Student sees only its own saved rows in the authorized class', async () => {
    await expect(learner.locator('[data-attendance-pupil]')).toHaveCount(1);
    await expect(pupil(learner, 'zero')).toContainText('1 saved row.');
    await expect(pupil(learner, 'zero').locator('time')).toHaveText(['2026-10-01', '2026-10-01']);
    await expect(learner.getByRole('link', { name: 'Review attendance marks', exact: true })).toHaveCount(0);
    assert.equal(await learner.getByLabel('Select Class').locator('option[value="dashboard-class-family"]').count(), 0);
  });
  await open(capped); await choose(capped, 'attendance-review-cap-class');
  await check('Large roster discloses exact total and display cap without false empty claims', async () => {
    await expect(capped.locator('[data-attendance-pupil]')).toHaveCount(100);
    await expect(capped.getByText(/Showing 100 of 101 available learners/)).toBeVisible();
    await expect(capped.getByText(/omitted learners are not counted as having no records/)).toBeVisible();
  });
  for (const [page, role] of [[staff, 'teacher'], [family, 'guardian'], [learner, 'student']]) {
    await check(role + ' desktop controls have names and fit the viewport', async () => { await widthAndLabels(page); await capture(page, role + '-desktop'); });
    await check(role + ' mobile cards wrap and keep native keyboard class selection', async () => {
      await page.setViewportSize({ width: 390, height: 900 }); await widthAndLabels(page);
      const select = page.getByLabel('Select Class'); await select.focus(); await expect(select).toBeFocused();
      await capture(page, role + '-mobile');
    });
  }
  const anonymous = await context(), anon = await anonymous.newPage();
  await check('Anonymous attendance view redirects to sign in', async () => {
    await anon.goto(base.origin + '/attendance', { waitUntil: 'networkidle' });
    assert.equal(new URL(anon.url()).pathname, '/login');
  });
  assert.equal(pageErrors.length, 0); assert.equal(externalRequests.length, 0); assert.equal(failedResources.length, 0);
  const result = { executedAt: new Date().toISOString(), passed: checks.length, failed: 0, skipped: 0, checks, captures, externalRequests: 0, pageErrors: 0, failedResources: 0,
    scope: 'Built localhost Worker, real synthetic sessions and records; intercepted failure/late-response procedures cover UI cancellation only. No formal accessibility/UAT/hosted acceptance.' };
  if (process.env.SAHA_ATTENDANCE_SUMMARY_UI_RESULTS) writeFileSync(process.env.SAHA_ATTENDANCE_SUMMARY_UI_RESULTS, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally { for (const value of contexts) await value.close(); await browser.close(); }
