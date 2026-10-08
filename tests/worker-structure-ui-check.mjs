// Manual browser procedures for a freshly built local Worker and synthetic
// session fixture. Failure injections remain local and do not claim UAT.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';

const origin = process.env.SAHA_WORKER_TEST_URL;
const fixture = process.env.SAHA_WORKER_SESSION_FIXTURE;
const executablePath = process.env.SAHA_TEST_BROWSER;
if (!origin || !fixture || !executablePath)
  throw new Error('A local built Worker, synthetic sessions and browser executable are required.');
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
  throw new Error('Structure checks only run against an exact localhost origin.');
const sessions = JSON.parse(readFileSync(fixture, 'utf8'));
const resultPath = process.env.SAHA_STRUCTURE_UI_RESULTS ?? '/private/tmp/saha-structure-ui-results.json';
if (!resultPath.startsWith('/private/tmp/'))
  throw new Error('Use a private temporary structure-results path.');
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
let passed = 0,
  originalSchool,
  admin;
const suffix = crypto.randomUUID().slice(0, 8);
const check = async (name, action) => {
  await action();
  passed++;
  checks.push(name);
  console.log('ok - ' + name);
};
async function context(user) {
  if (typeof sessions[user] !== 'string') throw new Error('Missing a required synthetic session.');
  const value = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block',
    extraHTTPHeaders: { cookie: sessions[user] },
  });
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
    throw new Error('Fixture requests must stay local.');
  const response = await value.request.fetch(url.href, {
    method,
    headers: method === 'GET' ? {} : { Origin: base.origin },
    ...(data === undefined ? {} : { data }),
    timeout: 15000,
    maxRedirects: 0,
  });
  assert.equal(response.status(), expected, 'Synthetic local API status: ' + path);
  return response.json();
}
async function courseForm(page, code, title) {
  await expect(page.getByLabel('Course code', { exact: true })).toBeEnabled();
  await page.getByLabel('Course code', { exact: true }).fill(code);
  await page.getByLabel('Course title', { exact: true }).fill(title);
  await page
    .getByLabel('Description (optional)', { exact: true })
    .fill('Synthetic manually entered course description.');
  await page.getByLabel('Grade level', { exact: true }).fill('8');
}
async function classForm(page, courseId, name) {
  await expect(page.getByLabel('Course', { exact: true })).toBeEnabled();
  await page.getByLabel('Course', { exact: true }).selectOption(courseId);
  await page.getByLabel('Teacher', { exact: true }).selectOption('teacher-a');
  await page.getByLabel('Class name', { exact: true }).fill(name);
  await page.getByLabel('Term', { exact: true }).fill('Synthetic browser term');
  await page.getByLabel('Schedule (optional)', { exact: true }).fill('Synthetic schedule');
}
async function labelsAndWidth(page) {
  const missing = await page
    .locator('input:not([type=hidden]), select, textarea')
    .evaluateAll(
      (items) =>
        items.filter(
          (item) =>
            !item.labels?.length && !item.getAttribute('aria-label') && !item.getAttribute('aria-labelledby'),
        ).length,
    );
  assert.equal(missing, 0, 'Every native form control has an accessible label');
  const widths = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(
    widths.scroll <= widths.width + 1,
    'No horizontal page overflow at the tested width: ' + JSON.stringify(widths),
  );
}
async function shot(page, name) {
  const path = '/private/tmp/saha-structure-ui-' + name + '.png';
  await page.screenshot({ path, fullPage: true });
  screenshots.push(path);
}
try {
  admin = await context('admin-a');
  const page = await admin.newPage();
  originalSchool = (await api(admin, '/api/schools')).find((row) => row.id === 'a');
  assert.ok(originalSchool, 'Synthetic school fixture exists');
  const courseTitle = '<img src=x onerror=alert(1)> Synthetic course ' + suffix;
  const courseCode = 'STRUCT-' + suffix;
  await page.goto(base.origin + '/courses');
  await check('Course creation uses the verified school without a typed school ID', async () => {
    await expect(page.getByLabel('Course code', { exact: true })).toBeEnabled();
    await expect(page.getByText('School: ' + originalSchool.name, { exact: true })).toBeVisible();
    await expect(page.getByLabel('School ID', { exact: true })).toHaveCount(0);
    await courseForm(page, courseCode, courseTitle);
  });
  await check('Administrator creates a real scoped course through the native form', async () => {
    const saved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/courses' && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Create course', exact: true }).click();
    assert.equal((await saved).status(), 201);
    await expect(page.getByRole('status').filter({ hasText: 'Course created.' })).toContainText(
      'Course created.',
    );
    await expect(page.getByRole('heading', { name: courseTitle, exact: true })).toBeVisible();
    await expect(page.getByLabel('Course code', { exact: true })).toHaveValue('');
  });
  const newCourse = (await api(admin, '/api/courses')).find((row) => row.code === courseCode);
  await check('Saved course HTML is escaped as text and stays inside current school', async () => {
    assert.equal(newCourse.schoolId, 'a');
    assert.equal(newCourse.title, courseTitle);
    await expect(page.locator('img[src=x]')).toHaveCount(0);
  });
  await check(
    'Rejected creation hides private inputs, focuses feedback and permits fresh original-account comparison',
    async () => {
      await courseForm(page, 'REJECT-' + suffix, 'Rejected synthetic course ' + suffix);
      const reject = (route) =>
        route.request().method() === 'POST'
          ? route.fulfill({
              status: 403,
              contentType: 'application/json',
              body: JSON.stringify({ error: 'Forbidden' }),
            })
          : route.continue();
      await page.route('**/api/courses', reject);
      try {
        await page.getByRole('button', { name: 'Create course', exact: true }).click();
        await expect(page.getByRole('alert')).toContainText('The course save could not be confirmed.');
        await expect(page.getByRole('alert').locator('..')).toBeFocused();
        await expect(page.getByLabel('Course code', { exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Create course', exact: true })).toHaveCount(0);
      } finally {
        await page.unroute('**/api/courses', reject);
      }
      assert.equal(
        (await api(admin, '/api/courses')).filter((row) => row.code === 'REJECT-' + suffix).length,
        0,
      );
      await page.getByRole('button', { name: 'Reload courses and check saved records', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Uncertain course creation' })).toContainText(
        'REJECT-' + suffix,
      );
      await expect(
        page.getByRole('button', { name: 'Finish comparison and start a new draft', exact: true }),
      ).toBeDisabled();
      await page
        .getByLabel(
          'I checked the saved list against the original details and will start a new draft deliberately.',
          { exact: true },
        )
        .check();
      await page
        .getByRole('button', { name: 'Finish comparison and start a new draft', exact: true })
        .click();
      await expect(page.getByLabel('Course code', { exact: true })).toHaveValue('');
      await expect(page.getByRole('button', { name: 'Create course', exact: true })).toBeEnabled();
      assert.equal(
        (await api(admin, '/api/courses')).filter((row) => row.code === 'REJECT-' + suffix).length,
        0,
      );
    },
  );
  await check('Confirmed course save with failed refresh reports success and requires reload', async () => {
    const code = 'REFRESH-' + suffix;
    await courseForm(page, code, 'Confirmed refresh failure ' + suffix);
    let committed = false;
    const intercept = async (route) => {
      if (route.request().method() === 'POST') {
        const response = await route.fetch({ timeout: 15000, maxRedirects: 0 });
        assert.equal(response.status(), 201);
        await response.body();
        committed = true;
        return route.fulfill({ response });
      }
      return committed
        ? route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Synthetic refresh failure' }),
          })
        : route.continue();
    };
    await page.route('**/api/courses', intercept);
    try {
      await page.getByRole('button', { name: 'Create course', exact: true }).click();
      await expect(
        page.getByRole('status').filter({ hasText: 'Course created, but the list could not be refreshed.' }),
      ).toContainText('Course created, but the list could not be refreshed.');
      await expect(page.getByRole('alert')).toContainText('Could not reload current courses.');
      await expect(
        page
          .getByRole('status')
          .filter({ hasText: 'The school system acknowledged the original course creation.' }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Create course', exact: true })).toHaveCount(0);
      await expect(page.getByLabel('Course code', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('region', { name: 'Acknowledged course creation' })).toHaveCount(0);
      assert.equal((await api(admin, '/api/courses')).filter((row) => row.code === code).length, 1);
    } finally {
      await page.unroute('**/api/courses', intercept);
    }
    await page.getByRole('button', { name: 'Reload courses and check saved records', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Create course', exact: true })).toBeEnabled();
    await expect(page.getByText('Code: ' + code, { exact: true })).toBeVisible();
  });
  await check(
    'Lost successful course response retains entries and prevents a blind second create',
    async () => {
      const code = 'UNKNOWN-' + suffix;
      await courseForm(page, code, 'Uncertain save ' + suffix);
      let postCount = 0;
      const lose = async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        postCount++;
        const response = await route.fetch({ timeout: 15000, maxRedirects: 0 });
        assert.equal(response.status(), 201);
        await response.body();
        return route.abort('failed');
      };
      await page.route('**/api/courses', lose);
      try {
        await page.getByRole('button', { name: 'Create course', exact: true }).click();
        await expect(page.getByRole('alert')).toContainText('The course save could not be confirmed.');
        await expect(page.getByLabel('Course code', { exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Create course', exact: true })).toHaveCount(0);
        await expect(page.getByRole('region', { name: 'Uncertain course creation' })).not.toContainText(code);
        assert.equal(postCount, 1);
        assert.equal((await api(admin, '/api/courses')).filter((row) => row.code === code).length, 1);
      } finally {
        await page.unroute('**/api/courses', lose);
      }
      await page.getByRole('button', { name: 'Reload courses and check saved records', exact: true }).click();
      await expect(page.getByText('Code: ' + code, { exact: true })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Uncertain course creation' })).toContainText(code);
      await expect(page.getByRole('button', { name: 'Create course', exact: true })).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Finish comparison and start a new draft', exact: true }),
      ).toBeDisabled();
      await page
        .getByLabel(
          'I checked the saved list against the original details and will start a new draft deliberately.',
          { exact: true },
        )
        .check();
      await page
        .getByRole('button', { name: 'Finish comparison and start a new draft', exact: true })
        .click();
      await expect(page.getByRole('button', { name: 'Create course', exact: true })).toBeEnabled();
      await expect(page.getByLabel('Course code', { exact: true })).toHaveValue('');
      assert.equal(postCount, 1);
      assert.equal((await api(admin, '/api/courses')).filter((row) => row.code === code).length, 1);
    },
  );
  await check('An in-flight course save disables controls and ignores a second submit', async () => {
    await courseForm(page, 'LOCK-' + suffix, 'Double submit control ' + suffix);
    let release, entered;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    const captured = new Promise((resolve) => {
      entered = resolve;
    });
    let postCount = 0;
    const delay = async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      postCount++;
      entered();
      await held;
      const response = await route.fetch({ timeout: 15000, maxRedirects: 0 });
      await response.body();
      return route.fulfill({ response });
    };
    await page.route('**/api/courses', delay);
    try {
      await page.getByRole('button', { name: 'Create course', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
      await captured; // The verified-account preflight completes before the held original POST starts.
      await page.locator('form').dispatchEvent('submit');
      assert.equal(postCount, 1);
      release();
      await expect(page.getByRole('status').filter({ hasText: 'Course created.' })).toContainText(
        'Course created.',
      );
      assert.equal(postCount, 1);
    } finally {
      release();
      await page.unroute('**/api/courses', delay);
    }
  });
  await page.goto(base.origin + '/classes');
  await check(
    'Class choices use the current course and eligible teacher with native keyboard labels',
    async () => {
      await classForm(page, newCourse.id, 'Synthetic class ' + suffix);
      const course = page.getByLabel('Course', { exact: true });
      await course.focus();
      await expect(course).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByLabel('Teacher', { exact: true })).toBeFocused();
      await expect(page.getByLabel('Course', { exact: true })).toHaveValue(newCourse.id);
      await expect(page.getByLabel('Teacher', { exact: true })).toHaveValue('teacher-a');
    },
  );
  await check('Administrator creates a real class with controlled verified references', async () => {
    const saved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/classes' && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Create class', exact: true }).click();
    assert.equal((await saved).status(), 201);
    await expect(page.getByRole('status')).toContainText('Class created.');
    await expect(page.getByRole('link', { name: 'Synthetic class ' + suffix, exact: true })).toBeVisible();
    const row = (await api(admin, '/api/classes')).find((item) => item.name === 'Synthetic class ' + suffix);
    assert.deepEqual([row.schoolId, row.courseId, row.teacherId], ['a', newCourse.id, 'teacher-a']);
    await expect(page.getByLabel('Course', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Teacher', { exact: true })).toHaveValue('');
  });
  await check('Class conflict preserves text and selections until explicit inventory reload', async () => {
    await classForm(page, newCourse.id, 'Retained class conflict ' + suffix);
    const reject = (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Conflict' }),
          })
        : route.continue();
    await page.route('**/api/classes', reject);
    try {
      await page.getByRole('button', { name: 'Create class', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('Class choices or access changed.');
      await expect(page.getByLabel('Class name', { exact: true })).toHaveValue(
        'Retained class conflict ' + suffix,
      );
      await expect(page.getByLabel('Course', { exact: true })).toHaveValue(newCourse.id);
      await expect(page.getByRole('button', { name: 'Create class', exact: true })).toBeDisabled();
    } finally {
      await page.unroute('**/api/classes', reject);
    }
    await page.getByRole('button', { name: 'Reload classes and check saved records', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Create class', exact: true })).toBeEnabled();
    await expect(page.getByLabel('Class name', { exact: true })).toHaveValue(
      'Retained class conflict ' + suffix,
    );
  });
  await page.goto(base.origin + '/schools');
  await check(
    'School screen edits only the existing school and offers no bootstrap or duplicate shell',
    async () => {
      await expect(page.getByLabel('School name', { exact: true })).toBeEnabled();
      await expect(page.getByRole('button', { name: /Create.*school/i })).toHaveCount(0);
      assert.ok((await page.getByRole('banner').count()) <= 1, 'No duplicated application banner');
      await page.getByLabel('School name', { exact: true }).fill('Synthetic updated school ' + suffix);
      await page.getByRole('button', { name: 'Save school details', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('School details saved.');
      assert.equal(
        (await api(admin, '/api/schools')).find((row) => row.id === 'a').name,
        'Synthetic updated school ' + suffix,
      );
    },
  );
  await check(
    'School update rejection hides entries until fresh original-account reload and retains visible feedback',
    async () => {
      await page.getByLabel('School name', { exact: true }).fill('Retained school rejection ' + suffix);
      const reject = (route) =>
        route.request().method() === 'PATCH'
          ? route.fulfill({
              status: 403,
              contentType: 'application/json',
              body: JSON.stringify({ error: 'Forbidden' }),
            })
          : route.continue();
      await page.route('**/api/schools/a', reject);
      try {
        await page.getByRole('button', { name: 'Save school details', exact: true }).click();
        await expect(page.getByRole('alert')).toContainText('This update was rejected.');
        await expect(page.getByLabel('School name', { exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Save school details', exact: true })).toHaveCount(0);
      } finally {
        await page.unroute('**/api/schools/a', reject);
      }
      await page.getByRole('button', { name: 'Reload saved school details', exact: true }).click();
      await expect(page.getByLabel('School name', { exact: true })).toHaveValue(
        'Retained school rejection ' + suffix,
      );
      await expect(page.getByRole('button', { name: 'Save school details', exact: true })).toBeEnabled();
    },
  );
  await check('School confirmed save followed by refresh failure remains a success', async () => {
    await page.getByLabel('School name', { exact: true }).fill('Synthetic confirmed school ' + suffix);
    let committed = false;
    const mark = async (route) => {
      const response = await route.fetch({ timeout: 15000, maxRedirects: 0 });
      assert.equal(response.status(), 200);
      await response.body();
      committed = true;
      return route.fulfill({ response });
    };
    const failRead = (route) =>
      committed
        ? route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Synthetic refresh failure' }),
          })
        : route.continue();
    await page.route('**/api/schools/a', mark);
    await page.route('**/api/schools', failRead);
    try {
      await page.getByRole('button', { name: 'Save school details', exact: true }).click();
      await expect(page.getByRole('status')).toContainText(
        'School details saved. The submitted update was acknowledged',
      );
      await expect(page.getByRole('alert')).toContainText('School details could not be verified.');
      await expect(page.getByRole('button', { name: 'Save school details', exact: true })).toHaveCount(0);
      await expect(page.getByRole('region', { name: 'Acknowledged school update' })).toHaveCount(0);
      assert.equal(
        (await api(admin, '/api/schools')).find((row) => row.id === 'a').name,
        'Synthetic confirmed school ' + suffix,
      );
    } finally {
      await page.unroute('**/api/schools/a', mark);
      await page.unroute('**/api/schools', failRead);
    }
    await page.getByRole('button', { name: 'Reload saved school details', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save school details', exact: true })).toBeEnabled();
  });
  for (const user of ['teacher-a', 'guardian-a', 'student-user-a']) {
    const roleContext = await context(user),
      rolePage = await roleContext.newPage();
    const requests = [];
    rolePage.on('request', (request) => requests.push(new URL(request.url()).pathname));
    for (const [path, heading] of [
      ['/classes', 'Classes'],
      ['/courses', 'Course catalog'],
      ['/schools', 'School'],
    ]) {
      await check(
        user + ' sees scoped ' + path + ' without administrator controls or account lookups',
        async () => {
          await rolePage.goto(base.origin + path);
          await expect(rolePage.getByRole('heading', { name: heading, exact: true, level: 1 })).toBeVisible();
          await expect(
            rolePage
              .getByRole('status')
              .filter({ hasText: /Loading (school details|current courses|class)/i }),
          ).toHaveCount(0);
          if (path === '/courses')
            await expect(
              rolePage.getByRole('status').filter({ hasText: /courses in the current authorised catalog/ }),
            ).toBeVisible();
          if (path === '/schools')
            await expect(rolePage.getByRole('region', { name: 'Saved school details' })).toBeVisible();
          await expect(rolePage.getByRole('button', { name: /^Create (class|course)$/ })).toHaveCount(0);
          await expect(
            rolePage.getByRole('button', { name: 'Save school details', exact: true }),
          ).toHaveCount(0);
          await expect(rolePage.getByRole('alert')).toHaveCount(0);
          assert.deepEqual(
            requests.filter((path) => path === '/api/users' || path === '/api/admin/users'),
            [],
          );
        },
      );
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [path, control] of [
    ['/classes', 'Class name'],
    ['/courses', 'Course code'],
    ['/schools', 'School name'],
  ]) {
    await check(path + ' labels and page width remain usable at 390 pixels', async () => {
      await page.goto(base.origin + path);
      await expect(page.getByLabel(control, { exact: true })).toBeEnabled();
      await labelsAndWidth(page);
    });
    await shot(page, path.slice(1) + '-mobile');
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(base.origin + '/classes');
  await expect(page.getByLabel('Class name', { exact: true })).toBeEnabled();
  await shot(page, 'classes-desktop');
  await check('Built scripts and styles load and all browser requests stay local', async () => {
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
      'Fresh local built Worker and synthetic fixtures only.',
      'Local response rejection/loss/refresh injections validate UI recovery, not real provider behavior.',
      'Labels, native keyboard and 390 pixel geometry are smoke checks, not accessibility or UAT certification.',
      'New suffix-owned synthetic course/class rows remain; shared school name/string address are restored in finally. Name-only writes omit nullable addresses; no null address restoration or timestamp rollback is claimed.',
      'Retained26 procedures now follow intentional private hiding and explicit original-account comparison; known save fact remains separate from a failed current read.',
    ],
  };
  writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n');
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
            (await page.locator('body').innerText()).slice(0, 2000),
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
  try {
    if (admin && originalSchool)
      await api(admin, '/api/schools/' + encodeURIComponent(originalSchool.id), 'PATCH', {
        name: originalSchool.name,
        ...(originalSchool.address == null ? {} : { address: originalSchool.address }),
      });
  } finally {
    for (const value of contexts) await value.close();
    await browser.close();
  }
}
