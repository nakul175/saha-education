// Manual browser procedures over a fresh local Worker with the separate
// dashboard synthetic fixture. No provider login or attendance/grade policy.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';

const origin = process.env.SAHA_WORKER_TEST_URL,
  fixture = process.env.SAHA_WORKER_SESSION_FIXTURE,
  executablePath = process.env.SAHA_TEST_BROWSER;
if (!origin || !fixture || !executablePath)
  throw new Error('Supply a local built Worker, private dashboard sessions and browser executable.');
const base = new URL(origin);
if (
  !['127.0.0.1', 'localhost'].includes(base.hostname) ||
  !['http:', 'https:'].includes(base.protocol) ||
  base.username ||
  base.password ||
  base.pathname !== '/' ||
  base.search ||
  base.hash
)
  throw new Error('Dashboard browser checks require an exact localhost origin.');
const sessions = JSON.parse(readFileSync(fixture, 'utf8'));
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--disable-background-networking'],
});
const contexts = [],
  pageErrors = [],
  externalRequests = [],
  failedResources = [],
  checks = [],
  screenshots = [];
let passed = 0;
const suffix = crypto.randomUUID().slice(0, 8);
const check = async (name, action) => {
  await action();
  passed++;
  checks.push(name);
  console.log('ok - ' + name);
};
async function context(user) {
  if (user && typeof sessions[user] !== 'string')
    throw new Error('Missing a required dashboard synthetic session.');
  const value = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block',
    extraHTTPHeaders: user ? { cookie: sessions[user] } : {},
  });
  // Chrome uses its cookie jar on redirect hops; a manually supplied Cookie
  // header is dropped on a redirect. This is a stored synthetic session, not login.
  if (user) {
    const separator = sessions[user].indexOf('=');
    await value.addCookies([
      {
        name: sessions[user].slice(0, separator),
        value: sessions[user].slice(separator + 1),
        domain: base.hostname,
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
  }
  contexts.push(value);
  value.on('page', (page) => {
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400 && ['script', 'stylesheet'].includes(response.request().resourceType()))
        failedResources.push({ path: new URL(response.url()).pathname, status: response.status() });
    });
  });
  await value.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === base.origin) return route.continue();
    externalRequests.push({ origin: url.origin, pathname: url.pathname });
    return route.abort();
  });
  return value;
}
async function api(value, path, method = 'GET', data, expected = 200) {
  const url = new URL(path, base);
  if (url.origin !== base.origin || url.username || url.password)
    throw new Error('Synthetic API requests must remain local.');
  const response = await value.request.fetch(url.href, {
    method,
    timeout: 15000,
    maxRedirects: 0,
    headers: method === 'GET' ? {} : { Origin: base.origin },
    ...(data === undefined ? {} : { data }),
  });
  assert.equal(response.status(), expected, 'Local fixture API status: ' + path);
  return response.json();
}
const assessment = (page, kind) =>
  page.locator('article[data-dashboard-assessment="dashboard-assessment-' + kind + '"]');
const profile = (page, kind) => page.locator('[data-dashboard-profile="dashboard-learner-' + kind + '"]');
async function open(page, path, heading) {
  const response = await page.goto(base.origin + path, { waitUntil: 'networkidle', timeout: 20000 });
  assert.equal(response?.status(), 200, 'Authorized dashboard renders successfully');
  await expect(page.getByRole('heading', { name: heading, exact: true, level: 1 })).toBeVisible();
}
async function labelsAndWidth(page) {
  const missing = await page
    .locator('input:not([type=hidden]),select,textarea')
    .evaluateAll(
      (items) =>
        items.filter(
          (item) =>
            !item.labels?.length && !item.getAttribute('aria-label') && !item.getAttribute('aria-labelledby'),
        ).length,
    );
  assert.equal(missing, 0, 'Any native controls have accessible names');
  const width = await page.evaluate(() => ({
    viewport: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(width.scroll <= width.viewport + 1, 'No horizontal dashboard overflow: ' + JSON.stringify(width));
}
async function screenshot(page, name) {
  const path = '/private/tmp/saha-dashboard-ui-' + name + '.png';
  await page.screenshot({ path, fullPage: true });
  screenshots.push(path);
}
try {
  const admin = await context('admin-a'),
    teacher = await context('dashboard-teacher'),
    guardian = await context('dashboard-guardian'),
    student = await context('dashboard-student');
  const adminPage = await admin.newPage(),
    teacherPage = await teacher.newPage(),
    family = await guardian.newPage(),
    learner = await student.newPage();
  await open(adminPage, '/dashboard/admin', 'Admin Dashboard');
  await check('Administrator counts match actual current school records and mapped teachers', async () => {
    const [students, courses, classes, teachers] = await Promise.all([
      api(admin, '/api/students'),
      api(admin, '/api/courses'),
      api(admin, '/api/classes'),
      api(admin, '/api/users?role=teacher'),
    ]);
    for (const [name, expected] of [
      ['Students', students.length],
      ['Courses', courses.length],
      ['Classes', classes.length],
      ['Enabled teachers', teachers.length],
    ])
      await expect(adminPage.locator('[data-dashboard-count=' + JSON.stringify(name) + ']')).toHaveText(
        String(expected),
      );
    await expect(
      adminPage.getByText('Enabled accounts with a school sign-in mapping.', { exact: true }),
    ).toBeVisible();
    await expect(adminPage.getByText('Synthetic school b', { exact: true })).toHaveCount(0);
  });
  await check('Administrator dashboard has native useful school navigation', async () => {
    const link = adminPage.getByRole('link', { name: 'School details', exact: true });
    await expect(link).toHaveAttribute('href', '/schools');
    await link.click();
    await expect(adminPage).toHaveURL(base.origin + '/schools');
    await expect(adminPage.getByLabel('School name', { exact: true })).toBeEnabled();
  });
  await open(teacherPage, '/dashboard/teacher', 'Teacher Dashboard');
  await check('Teacher sees six assigned fixture classes and five separate assessments', async () => {
    await expect(teacherPage.locator('[data-dashboard-class]')).toHaveCount(6);
    await expect(teacherPage.locator('[data-dashboard-assessment]')).toHaveCount(5);
    await expect(teacherPage.locator('[data-dashboard-class="class-a"]')).toHaveCount(0);
    await expect(teacherPage.getByText('Assessments Needing Results', { exact: true })).toHaveCount(0);
  });
  await check('Complete roster counts a legitimate zero score as recorded', async () => {
    const item = assessment(teacherPage, 'complete');
    await expect(item).toHaveAttribute('data-coverage-state', 'recorded-for-current-roster');
    await expect(item.getByText('Results recorded for current roster', { exact: true })).toBeVisible();
    await expect(item).toContainText('Active students: 2. Recorded results: 2. Missing results: 0.');
    const saved = await api(teacher, '/api/assessments/dashboard-assessment-complete/results');
    assert.deepEqual(
      saved.map((row) => row.score).sort((a, b) => a - b),
      [0, 7],
    );
  });
  await check('Partial roster distinguishes recorded zero from a missing result', async () => {
    const item = assessment(teacherPage, 'missing');
    await expect(item).toHaveAttribute('data-coverage-state', 'missing-results');
    await expect(item).toContainText('Active students: 2. Recorded results: 1. Missing results: 1.');
    const saved = await api(teacher, '/api/assessments/dashboard-assessment-missing/results');
    assert.deepEqual(
      saved.map((row) => [row.studentId, row.score]),
      [['dashboard-learner-zero', 0]],
    );
  });
  await check('Duplicate legacy results are shown as review evidence without choosing a winner', async () => {
    const item = assessment(teacherPage, 'ambiguous');
    await expect(item).toHaveAttribute('data-coverage-state', 'needs-review');
    await expect(item).toContainText('Students with multiple stored result records: 1.');
    await expect(item).toContainText('Recorded results: 0.');
    const saved = await api(teacher, '/api/assessments/dashboard-assessment-ambiguous/results');
    assert.deepEqual(
      saved.map((row) => row.score).sort((a, b) => a - b),
      [3, 4],
    );
  });
  await check(
    'Invalid legacy score is review evidence rather than a missing or completed result',
    async () => {
      const item = assessment(teacherPage, 'invalid');
      await expect(item).toHaveAttribute('data-coverage-state', 'needs-review');
      await expect(item).toContainText('Students with a stored score requiring review: 1.');
      await expect(item).toContainText('Active students: 1. Recorded results: 0. Missing results: 0.');
    },
  );
  await check('No-roster assessment is explicit rather than labelled as needing results', async () => {
    const item = assessment(teacherPage, 'no-roster');
    await expect(item).toHaveAttribute('data-coverage-state', 'no-current-roster');
    await expect(
      item.getByText('No active students are available for result coverage.', { exact: true }),
    ).toBeVisible();
  });
  await check('Teacher can open the exact complete assessment with its saved zero', async () => {
    await assessment(teacherPage, 'complete')
      .getByRole('link', { name: 'Open saved results', exact: true })
      .click();
    await expect(teacherPage).toHaveURL(base.origin + '/assessments/dashboard-assessment-complete');
    await expect(
      teacherPage.getByText('Synthetic dashboard complete assessment', { exact: true }),
    ).toBeVisible();
    await expect(teacherPage.getByLabel('Score for Synthetic dashboard zero', { exact: true })).toHaveValue(
      '0',
    );
  });
  await open(teacherPage, '/dashboard/teacher', 'Teacher Dashboard');
  await check('Opening an ambiguous result editor fails closed and preserves both legacy rows', async () => {
    await assessment(teacherPage, 'ambiguous')
      .getByRole('link', { name: 'Open saved results', exact: true })
      .click();
    await expect(teacherPage).toHaveURL(base.origin + '/assessments/dashboard-assessment-ambiguous');
    await expect(teacherPage.getByRole('alert')).toContainText('Multiple saved results');
    await expect(teacherPage.getByRole('button', { name: 'Save Edited Results', exact: true })).toHaveCount(
      0,
    );
    assert.equal((await api(teacher, '/api/assessments/dashboard-assessment-ambiguous/results')).length, 2);
  });
  await open(teacherPage, '/dashboard/teacher', 'Teacher Dashboard');
  await check('Teacher class attendance link uses the exact assigned class', async () => {
    const item = teacherPage.locator('[data-dashboard-class="dashboard-class-complete"]');
    await item.getByRole('link', { name: 'Take attendance', exact: true }).click();
    await expect(teacherPage).toHaveURL(base.origin + '/classes/dashboard-class-complete/attendance');
    await expect(teacherPage.getByRole('heading', { name: /Take Attendance/ })).toBeVisible();
  });
  await open(family, '/dashboard/guardian', 'Guardian Dashboard');
  await check(
    'Guardian sees four explicitly linked profiles with no invented attendance percentage',
    async () => {
      await expect(family.locator('[data-dashboard-profile]')).toHaveCount(4);
      assert.equal(/\d(?:\.\d+)?%/.test(await family.locator('body').innerText()), false);
      await expect(family.locator('[data-dashboard-profile="dashboard-learner-recorded"]')).toHaveCount(0);
    },
  );
  await check('Family no-data state is explicit and does not claim zero-percent attendance', async () => {
    await expect(
      profile(family, 'none').getByText('No attendance records available.', { exact: true }),
    ).toBeVisible();
    await expect(
      profile(family, 'none').getByText('No published report cards available.', { exact: true }),
    ).toBeVisible();
    await expect(profile(family, 'none').getByText(/Recorded rows:/)).toHaveCount(0);
  });
  await check('Excused-only records retain counts and their valid recorded dates', async () => {
    const item = profile(family, 'excused');
    await expect(item).toContainText('Only excused attendance records are available.');
    await expect(item).toContainText('Recorded rows: 2');
    await expect(item.locator('dl')).toHaveText('Present0Absent0Late0Excused2');
    await expect(item).toContainText('First valid recorded date: 2026-10-01');
    await expect(item).toContainText('Latest valid recorded date: 2026-10-02');
  });
  await check(
    'Mixed attendance counts stored rows while excluding invalid dates from endpoints',
    async () => {
      const item = profile(family, 'attendance');
      await expect(item).toContainText('Recorded rows: 5');
      await expect(item.locator('dl')).toHaveText('Present2Absent1Late1Excused1');
      await expect(item).toContainText('First valid recorded date: 2026-10-01');
      await expect(item).toContainText('Latest valid recorded date: 2026-10-04');
      await expect(item).toContainText('Records with a date requiring review: 1.');
      await expect(item).not.toContainText('2026-02-30');
    },
  );
  await check(
    'Guardian report snapshot contains published school-entered text and no private draft',
    async () => {
      await expect(
        profile(family, 'zero').getByText('Synthetic published dashboard term', { exact: true }),
      ).toBeVisible();
      await expect(profile(family, 'zero')).toContainText('School supplied grade: School supplied');
      await expect(family.getByText(/PRIVATE dashboard|PRIVATE staff/)).toHaveCount(0);
    },
  );
  await check('Guardian can open the exact published report through a native link', async () => {
    const link = profile(family, 'zero').getByRole('link', {
      name: 'View report: Synthetic published dashboard term',
      exact: true,
    });
    await expect(link).toHaveAttribute('href', '/report-cards/dashboard-report-published');
    await link.click();
    await expect(family).toHaveURL(base.origin + '/report-cards/dashboard-report-published');
    await expect(family.getByRole('heading', { name: 'Report Card', exact: true })).toBeVisible();
    await expect(family.getByText('Synthetic published dashboard report', { exact: true })).toBeVisible();
  });
  await open(learner, '/dashboard/student', 'My progress');
  await check(
    'Student snapshot is only its own profile with published reports and stored attendance',
    async () => {
      await expect(learner.locator('[data-dashboard-profile]')).toHaveCount(1);
      await expect(profile(learner, 'zero')).toContainText('Recorded rows: 1');
      await expect(profile(learner, 'zero').locator('dl')).toHaveText('Present1Absent0Late0Excused0');
      await expect(profile(learner, 'zero')).toContainText('Synthetic published dashboard term');
      await expect(learner.getByText(/PRIVATE dashboard|PRIVATE staff/)).toHaveCount(0);
      await expect(learner.locator('[data-dashboard-assessment]')).toHaveCount(0);
    },
  );
  await check('Family accounts are denied unpublished report and private assessment results', async () => {
    for (const account of [guardian, student]) {
      await api(account, '/api/report-cards/dashboard-report-draft', 'GET', undefined, 404);
      await api(account, '/api/assessments/dashboard-assessment-complete/results', 'GET', undefined, 403);
    }
  });
  await check(
    'Wrong dashboard role resolves to the account dashboard without administrator totals',
    async () => {
      const denied = await teacher.request.get(base.origin + '/dashboard/admin', {
        maxRedirects: 0,
        timeout: 15000,
      });
      assert.equal(denied.status(), 307, 'Wrong-role response redirects before dashboard release');
      assert.equal(
        new URL(denied.headers().location, base).pathname,
        '/',
        'Wrong-role response points to account routing',
      );
      assert.equal(
        (await denied.text()).includes('data-dashboard-count'),
        false,
        'Wrong-role response does not contain administrator cards',
      );
      await teacherPage.goto(base.origin + '/dashboard/admin', { waitUntil: 'networkidle', timeout: 20000 });
      await expect(teacherPage).toHaveURL(base.origin + '/dashboard/teacher');
      await expect(teacherPage.locator('[data-dashboard-count]')).toHaveCount(0);
      await expect(
        teacherPage.getByRole('heading', { name: 'Teacher Dashboard', exact: true }),
      ).toBeVisible();
    },
  );
  const anonymous = await context(null),
    anonymousPage = await anonymous.newPage();
  await check(
    'Anonymous dashboard redirects to sign-in rather than displaying authorized zero totals',
    async () => {
      await anonymousPage.goto(base.origin + '/dashboard/admin', {
        waitUntil: 'networkidle',
        timeout: 20000,
      });
      await expect(anonymousPage).toHaveURL(base.origin + '/login');
      await expect(
        anonymousPage.locator('[data-dashboard-count],[data-dashboard-profile],[data-dashboard-assessment]'),
      ).toHaveCount(0);
    },
  );
  for (const [page, path, heading, role] of [
    [adminPage, '/dashboard/admin', 'Admin Dashboard', 'admin'],
    [teacherPage, '/dashboard/teacher', 'Teacher Dashboard', 'teacher'],
    [family, '/dashboard/guardian', 'Guardian Dashboard', 'guardian'],
    [learner, '/dashboard/student', 'My progress', 'student'],
  ]) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, path, heading);
    await check(role + ' desktop dashboard landmarks, labels and width', async () => {
      await expect(page.getByRole('main')).toHaveCount(1);
      await labelsAndWidth(page);
    });
    await screenshot(page, role + '-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, path, heading);
    await check(role + ' mobile dashboard wraps text and supports native refresh navigation', async () => {
      await labelsAndWidth(page);
      const refresh = page.getByRole('link', { name: 'Refresh dashboard', exact: true });
      await refresh.focus();
      await expect(refresh).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(base.origin + path);
      await expect(page.getByRole('heading', { name: heading, exact: true, level: 1 })).toBeVisible();
    });
    await screenshot(page, role + '-mobile');
  }
  // Exercise a visible bounded report list with real new synthetic records.
  // These explicit manual publications are restricted to the separate fixture.
  await check('Bounded family report list discloses its limit and full report path', async () => {
    for (let index = 0; index < 21; index++) {
      const created = await api(
        admin,
        '/api/report-cards',
        'POST',
        {
          studentId: 'dashboard-learner-zero',
          term: 'Bounded dashboard ' + suffix + ' ' + index,
          overallGrade: 'Manually supplied',
          summary: 'Synthetic bounded dashboard evidence.',
        },
        201,
      );
      await api(admin, '/api/report-cards/' + encodeURIComponent(created.id), 'PATCH', { publish: true });
    }
    await open(family, '/dashboard/guardian', 'Guardian Dashboard');
    const item = profile(family, 'zero');
    const total = (await api(guardian, '/api/report-cards?studentId=dashboard-learner-zero')).length;
    await expect(item.getByRole('link', { name: /^View report:/ })).toHaveCount(20);
    await expect(item.getByRole('status')).toContainText('Showing 20 of ' + total + ' published reports.');
    await expect(item.getByRole('link', { name: 'Report cards', exact: true })).toHaveAttribute(
      'href',
      '/report-cards',
    );
    assert.ok(total > 20);
  });
  await check('All browser scripts/styles load and no request leaves localhost', async () => {
    assert.deepEqual(failedResources, []);
    assert.deepEqual(externalRequests, []);
    assert.deepEqual(pageErrors, []);
  });
  const result = {
    executedAt: new Date().toISOString(),
    passed,
    failed: 0,
    skipped: 0,
    externalRequests: externalRequests.length,
    pageErrors: pageErrors.length,
    checks,
    screenshots,
    limits: [
      'Local built Worker and separate synthetic dashboard fixture only.',
      'Legacy duplicate/invalid results were seeded before the final guards; no confirmed records were deleted or merged.',
      'Only new fixture-scoped report drafts/publications were added; base roles/profiles were unchanged.',
      'No provider login, academic rate/grade/norm policy, accessibility certification or acceptance inferred.',
    ],
  };
  writeFileSync('/private/tmp/saha-dashboard-ui-results.json', JSON.stringify(result, null, 2) + '\n');
  console.log(
    JSON.stringify({
      passed,
      failed: 0,
      skipped: 0,
      externalRequests: externalRequests.length,
      pageErrors: pageErrors.length,
    }),
  );
} catch (error) {
  for (const value of contexts)
    for (const page of value.pages())
      if (page.url().startsWith(base.origin))
        console.error(
          'Local screen: ' +
            new URL(page.url()).pathname +
            '\n' +
            (await page.locator('body').innerText()).slice(0, 1800),
        );
  console.log(
    JSON.stringify({
      passed,
      failed: 1,
      skipped: 0,
      externalRequests: externalRequests.length,
      pageErrors: pageErrors.length,
    }),
  );
  throw error;
} finally {
  for (const value of contexts) await value.close();
  await browser.close();
}
