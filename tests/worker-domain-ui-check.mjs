// Manual browser journeys over an isolated built localhost Worker, synthetic sessions only.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';

const origin = process.env.SAHA_WORKER_TEST_URL,
  fixture = process.env.SAHA_WORKER_SESSION_FIXTURE,
  executablePath = process.env.SAHA_TEST_BROWSER;
if (!origin || !fixture || !executablePath)
  throw new Error('Supply a local built Worker, private synthetic session fixture and browser executable.');
const base = new URL(origin);
if (
  !['localhost', '127.0.0.1'].includes(base.hostname) ||
  !['http:', 'https:'].includes(base.protocol) ||
  base.username ||
  base.password ||
  base.pathname !== '/' ||
  base.search ||
  base.hash
)
  throw new Error('These browser checks require an exact localhost origin.');
const sessions = JSON.parse(readFileSync(fixture, 'utf8'));
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--disable-background-networking'],
});
const contexts = [],
  pageErrors = [],
  externalRequests = [],
  resourceFailures = [],
  checks = [],
  screenshots = [],
  mobileFailures = [],
  deliveryErrors = [];
const suffix = crypto.randomUUID().slice(0, 8);
let passed = 0,
  activeProcedure = 'Synthetic account and report setup',
  activeCheckpoint = 'initial local setup';
const checkpoint = (name) => {
  activeCheckpoint = name;
};
const check = async (name, action) => {
  activeProcedure = name;
  checkpoint('procedure assertions');
  await action();
  assert.deepEqual(deliveryErrors, [], 'Local delivery setup completed');
  checks.push(name);
  passed++;
  console.log('ok - ' + name);
};
async function context(user) {
  if (typeof sessions[user] !== 'string') throw new Error('A required synthetic account session is missing.');
  const result = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    timezoneId: 'Asia/Kolkata',
    serviceWorkers: 'block',
    extraHTTPHeaders: { cookie: sessions[user] },
  });
  contexts.push(result);
  result.on('page', (page) => {
    page.on('pageerror', () => pageErrors.push('Unhandled application error occurred'));
    page.on('response', (response) => {
      if (response.status() >= 400)
        resourceFailures.push({
          path: new URL(response.url()).pathname,
          status: response.status(),
          type: response.request().resourceType(),
        });
    });
  });
  await result.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === base.origin) return route.continue();
    externalRequests.push({ origin: url.origin, path: url.pathname });
    return route.abort();
  });
  return result;
}
async function api(value, path, method = 'GET', data, status = 200) {
  const url = new URL(path, base);
  if (url.origin !== base.origin || url.username || url.password)
    throw new Error('Synthetic API requests must remain local.');
  const response = await value.request.fetch(url.href, {
    method,
    maxRedirects: 0,
    timeout: 15000,
    headers: method === 'GET' ? {} : { Origin: base.origin },
    ...(data === undefined ? {} : { data }),
  });
  assert.equal(response.status(), status, 'Local API contract: ' + path);
  return response.json();
}
const card = (page, term) => page.locator('[aria-label=' + JSON.stringify('Report ' + term) + ']');
const reportResponse = (response, studentId) =>
  new URL(response.url()).pathname === '/api/report-cards' &&
  new URL(response.url()).searchParams.get('studentId') === studentId &&
  response.request().method() === 'GET';
async function reportsReady(page, studentId) {
  await expect(page.getByLabel('Student', { exact: true })).toHaveValue(studentId);
  await expect(page.getByRole('status').filter({ hasText: /^Loading current reports…$/ })).toHaveCount(0);
}
async function selectStudent(page, studentId) {
  activeProcedure = 'Select learner and await verified current reports';
  await expect(page.getByLabel('Student', { exact: true })).toBeEnabled();
  const response = page.waitForResponse((value) => reportResponse(value, studentId));
  await page.getByLabel('Student', { exact: true }).selectOption(studentId);
  const saved = await response;
  assert.equal(saved.status(), 200, 'Selected learner reports load successfully');
  await saved.body();
  await reportsReady(page, studentId);
}
async function reloadReports(page, studentId) {
  activeProcedure = 'Explicit reload and current report access verification';
  const response = page.waitForResponse((value) => reportResponse(value, studentId));
  await page.getByRole('button', { name: 'Reload current reports', exact: true }).click();
  const saved = await response;
  assert.equal(saved.status(), 200, 'Explicit report reload succeeds');
  await saved.body();
  await reportsReady(page, studentId);
}
async function screenshot(page, name) {
  const path = '/private/tmp/saha-domain-ui-' + name + '.png';
  await page.screenshot({ path, fullPage: true });
  screenshots.push(path);
}
async function labelsAndWidth(page) {
  const unnamed = await page
    .locator('input:not([type=hidden]),select,textarea')
    .evaluateAll(
      (items) =>
        items.filter(
          (item) =>
            !item.labels?.length && !item.getAttribute('aria-label') && !item.getAttribute('aria-labelledby'),
        ).length,
    );
  assert.equal(unnamed, 0, 'Native controls have accessible labels');
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    outside: [...document.querySelectorAll('body *')]
      .map((element) => ({
        tag: element.tagName,
        right: Math.round(element.getBoundingClientRect().right),
        text: (element.textContent ?? '').slice(0, 90),
      }))
      .filter((element) => element.right > innerWidth + 1)
      .slice(0, 10),
  }));
  assert.ok(layout.scrollWidth <= layout.viewport + 1, 'Page fits its viewport: ' + JSON.stringify(layout));
}
async function loseResponse(page, pattern, method, status, predicate = () => true) {
  const records = [];
  let dropped = false,
    committedResult;
  const handler = async (route) => {
    if (route.request().method() !== method || !predicate(new URL(route.request().url())))
      return route.continue();
    records.push({
      path: new URL(route.request().url()).pathname,
      search: new URL(route.request().url()).search,
      payload: route.request().postData(),
    });
    if (dropped) return route.continue();
    try {
      const response = await route.fetch({ maxRedirects: 0, timeout: 15000 });
      assert.equal(response.status(), status, 'A lost acknowledgement follows a real committed save');
      await response.body();
      committedResult = await response.json();
      dropped = true;
      return route.abort('failed');
    } catch {
      deliveryErrors.push('Actual committed acknowledgement could not be captured');
      return route.abort();
    }
  };
  await page.route(pattern, handler);
  return { records, result: () => committedResult, remove: () => page.unroute(pattern, handler) };
}
try {
  const admin = await context('admin-a'),
    teacher = await context('teacher-a'),
    guardian = await context('guardian-a'),
    student = await context('student-user-a');
  const adminPage = await admin.newPage(),
    teacherPage = await teacher.newPage(),
    family = await guardian.newPage(),
    learner = await student.newPage();
  const other = await api(
    admin,
    '/api/students',
    'POST',
    {
      schoolId: 'a',
      firstName: 'ReportBrowser' + suffix,
      lastName: 'Learner',
      dateOfBirth: '2012-01-01',
      admissionNumber: 'REPORT-BROWSER-' + suffix,
      gradeLevel: '8',
    },
    201,
  );
  await api(admin, '/api/enrolments', 'POST', { studentId: other.id, classId: 'class-a' }, 201);
  const otherTerm = 'Other learner ' + suffix;
  await api(
    admin,
    '/api/report-cards',
    'POST',
    {
      studentId: other.id,
      term: otherTerm,
      overallGrade: 'Supplied C',
      summary: 'Separate synthetic learner report.',
    },
    201,
  );
  const term = 'Browser report ' + suffix,
    lostTerm = 'Uncertain draft ' + suffix;
  const summary =
    'Original synthetic school report. <script>globalThis.SAHA_REPORT_EXECUTED=true</script>\n' +
    'SYNTHETIC'.repeat(12);
  await adminPage.goto(base.origin + '/report-cards');
  await selectStudent(adminPage, 'student-a');
  await check('Administrator can create a report draft after learner selection', async () => {
    await expect(adminPage.getByText('Create Draft Report Card', { exact: true })).toBeVisible();
    await expect(adminPage.getByLabel('Term', { exact: true })).toBeEnabled();
  });
  activeProcedure = 'Same-frame native draft creation';
  checkpoint('fill explicitly supplied draft fields');
  await adminPage.getByLabel('Term', { exact: true }).fill(term);
  await adminPage.getByLabel('Overall Grade', { exact: true }).fill('School supplied B');
  await adminPage.getByLabel('Summary', { exact: true }).fill(summary);
  const creationRequests = [];
  let releaseCreation, creationArrived;
  const creationGate = new Promise((resolve) => {
      releaseCreation = resolve;
    }),
    firstCreation = new Promise((resolve) => {
      creationArrived = resolve;
    });
  const creationHandler = async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    creationRequests.push(route.request().postDataJSON());
    creationArrived();
    await creationGate;
    return route.continue();
  };
  await adminPage.route('**/api/report-cards', creationHandler);
  try {
    // Both native submit events run in the same browser frame, before a React
    // state render can disable the button. This tests the synchronous UI lock.
    checkpoint('dispatch two native submit events in one frame');
    await adminPage.locator('form').evaluate((form) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    checkpoint('wait for actual intercepted draft POST');
    await firstCreation;
    releaseCreation();
    checkpoint('saved exact draft card becomes visible after acknowledgement');
    await expect(card(adminPage, term)).toBeVisible();
    await reportsReady(adminPage, 'student-a');
    await check('Two same-frame native submissions create one request and one durable draft', async () => {
      assert.equal(creationRequests.length, 1);
      assert.equal(
        (await api(admin, '/api/report-cards?studentId=student-a')).filter((row) => row.term === term).length,
        1,
      );
    });
  } finally {
    releaseCreation();
    await adminPage.unroute('**/api/report-cards', creationHandler);
  }
  await check('Saved report shows supplied details and remains unpublished', async () => {
    await expect(adminPage.getByRole('status')).toContainText('Draft saved');
    await expect(card(adminPage, term).getByText('Unpublished draft', { exact: true })).toBeVisible();
    await expect(card(adminPage, term).getByText(summary, { exact: true })).toBeVisible();
    await expect(card(adminPage, term).getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
  });
  const primary = (await api(admin, '/api/report-cards?studentId=student-a')).find(
    (row) => row.term === term,
  );
  assert.ok(primary);
  await check('Report summary is escaped and cannot execute markup', async () => {
    assert.equal(await card(adminPage, term).locator('script,img').count(), 0);
    assert.equal(await adminPage.evaluate(() => globalThis.SAHA_REPORT_EXECUTED === true), false);
  });
  for (const [target, role] of [
    [teacherPage, 'assigned teacher'],
    [family, 'guardian'],
    [learner, 'learner'],
  ]) {
    await target.goto(base.origin + '/report-cards');
    await selectStudent(target, 'student-a');
    await check(role + ' has no draft creation or publication controls', async () => {
      await expect(target.getByRole('button', { name: 'Create Draft', exact: true })).toHaveCount(0);
      await expect(target.getByRole('button', { name: 'Publish', exact: true })).toHaveCount(0);
      await expect(target.getByRole('checkbox')).toHaveCount(0);
    });
    await check(role + ' sees the correct draft boundary', async () =>
      role === 'assigned teacher'
        ? expect(card(target, term)).toBeVisible()
        : expect(card(target, term)).toHaveCount(0),
    );
  }
  const publishLoss = await loseResponse(adminPage, '**/api/report-cards/' + primary.id, 'PATCH', 200);
  await card(adminPage, term).getByRole('checkbox').check();
  await card(adminPage, term).getByRole('button', { name: 'Publish', exact: true }).click();
  await check('Lost publication acknowledgement hides old content and requires explicit reload', async () => {
    await expect(adminPage.getByRole('alert')).toContainText(
      'retry publication of the exact original report',
    );
    await expect(card(adminPage, term)).toHaveCount(0);
    await expect(adminPage.getByLabel('Student', { exact: true })).toHaveCount(0);
    await expect(adminPage.getByRole('button', { name: 'Create Draft', exact: true })).toHaveCount(0);
    await expect(
      adminPage.getByRole('region', { name: 'Unconfirmed report action', exact: true }),
    ).toBeVisible();
    assert.equal(publishLoss.records.length, 1);
  });
  await reloadReports(adminPage, 'student-a');
  await check(
    'Explicit reload recovers the same published report and removes publication controls',
    async () => {
      await expect(card(adminPage, term).getByText(/Published on:/)).toBeVisible();
      await expect(card(adminPage, term).getByRole('button', { name: 'Publish', exact: true })).toHaveCount(
        0,
      );
      await expect(card(adminPage, term).getByRole('checkbox')).toHaveCount(0);
      assert.equal(publishLoss.records.length, 1);
      assert.equal(publishLoss.result().id, primary.id);
    },
  );
  await check('Explicit original publication retry uses the same endpoint and exact body', async () => {
    const delivery = adminPage.waitForResponse(
      (value) =>
        new URL(value.url()).pathname === '/api/report-cards/' + primary.id &&
        value.request().method() === 'PATCH',
    );
    await adminPage.getByRole('button', { name: 'Retry original report publication', exact: true }).click();
    const response = await delivery;
    assert.equal(response.status(), 200);
    const original = await response.json();
    await reportsReady(adminPage, 'student-a');
    await expect(adminPage.getByRole('status')).toContainText(
      'Publication confirmed for the original report',
    );
    assert.equal(publishLoss.records.length, 2);
    assert.deepEqual(publishLoss.records[1], publishLoss.records[0]);
    assert.equal(original.id, primary.id);
    assert.equal(original.publishedAt, publishLoss.result().publishedAt);
    await expect(
      adminPage.getByRole('button', { name: 'Retry original report publication', exact: true }),
    ).toHaveCount(0);
  });
  await publishLoss.remove();
  const publication = await api(admin, '/api/report-cards/' + primary.id, 'PATCH', { publish: true });
  const noticeId = 'report-card-published:' + primary.id + ':guardian-a';
  await check('Same-record publication recovery preserves first time and one guardian notice', async () => {
    assert.equal(publication.publishedAt, publishLoss.result().publishedAt);
    assert.equal((await api(guardian, '/api/notifications')).filter((row) => row.id === noticeId).length, 1);
  });
  for (const [target, role] of [
    [family, 'guardian'],
    [learner, 'learner'],
  ]) {
    await reloadReports(target, 'student-a');
    await check(role + ' can view the newly published saved report', async () => {
      await expect(card(target, term)).toBeVisible();
      await expect(card(target, term).getByText(summary, { exact: true })).toBeVisible();
      await expect(card(target, term).getByRole('button', { name: 'Publish', exact: true })).toHaveCount(0);
    });
  }
  await card(family, term).getByRole('link', { name: 'Open report', exact: true }).click();
  await check('Family can open the exact published report from its card', async () => {
    await expect(family).toHaveURL(base.origin + '/report-cards/' + primary.id);
    await expect(family.getByRole('heading', { name: 'Report Card', exact: true })).toBeVisible();
    await expect(family.getByText(summary, { exact: true })).toBeVisible();
  });

  // A plain draft API has no client UUID. On uncertainty the UI must stop and
  // reload evidence before another create, rather than silently retrying POST.
  await adminPage.getByLabel('Term', { exact: true }).fill(lostTerm);
  await adminPage.getByLabel('Overall Grade', { exact: true }).fill('School supplied pending');
  await adminPage
    .getByLabel('Summary', { exact: true })
    .fill('Uncertain draft text is retained until explicit report reload.');
  const draftLoss = await loseResponse(adminPage, '**/api/report-cards', 'POST', 201);
  await adminPage.getByRole('button', { name: 'Create Draft', exact: true }).click();
  await check('Lost draft acknowledgement hides cached records and prevents duplicate creation', async () => {
    await expect(adminPage.getByRole('alert')).toContainText(
      'compare saved reports before creating another draft',
    );
    await expect(adminPage.getByLabel('Term', { exact: true })).toHaveCount(0);
    await expect(adminPage.getByLabel('Summary', { exact: true })).toHaveCount(0);
    await expect(adminPage.getByRole('button', { name: 'Create Draft', exact: true })).toHaveCount(0);
    await expect(
      adminPage.getByRole('region', { name: 'Unconfirmed report action', exact: true }),
    ).toBeVisible();
    assert.equal(draftLoss.records.length, 1);
  });
  await draftLoss.remove();
  await reloadReports(adminPage, 'student-a');
  await check('Explicit reload recovers one original draft without sending another create', async () => {
    await expect(card(adminPage, lostTerm)).toBeVisible();
    await expect(card(adminPage, lostTerm).getByRole('checkbox')).not.toBeChecked();
    await expect(adminPage.getByLabel('Term', { exact: true })).toHaveValue(lostTerm);
    await expect(adminPage.getByLabel('Summary', { exact: true })).toHaveValue(
      'Uncertain draft text is retained until explicit report reload.',
    );
    await expect(adminPage.getByRole('button', { name: 'Create Draft', exact: true })).toBeDisabled();
    assert.equal(
      (await api(admin, '/api/report-cards?studentId=student-a')).filter((row) => row.term === lostTerm)
        .length,
      1,
    );
    assert.equal(draftLoss.result().studentId, 'student-a');
  });
  await check('Manual saved-draft comparison starts a blank draft without retrying creation', async () => {
    let sent = 0;
    const observe = (request) => {
      if (new URL(request.url()).pathname === '/api/report-cards' && request.method() === 'POST') sent++;
    };
    adminPage.on('request', observe);
    try {
      await adminPage
        .getByRole('checkbox', {
          name: 'I compared the saved reports with the submitted draft before starting another draft.',
          exact: true,
        })
        .check();
      await adminPage.getByRole('button', { name: 'Finish comparing saved reports', exact: true }).click();
      await expect(adminPage.getByLabel('Term', { exact: true })).toHaveValue('');
      await expect(adminPage.getByLabel('Summary', { exact: true })).toHaveValue('');
      await expect(
        adminPage.getByRole('button', { name: 'Finish comparing saved reports', exact: true }),
      ).toHaveCount(0);
      assert.equal(sent, 0);
      assert.equal(
        (await api(admin, '/api/report-cards?studentId=student-a')).filter((row) => row.term === lostTerm)
          .length,
        1,
      );
    } finally {
      adminPage.off('request', observe);
    }
  });
  await card(adminPage, lostTerm).getByRole('checkbox').check();
  await reloadReports(adminPage, 'student-a');
  await check('Reloading stored reports clears publication review confirmation', async () => {
    await expect(card(adminPage, lostTerm).getByRole('checkbox')).not.toBeChecked();
    await expect(
      card(adminPage, lostTerm).getByRole('button', { name: 'Publish', exact: true }),
    ).toBeDisabled();
  });

  await selectStudent(adminPage, other.id);
  await expect(card(adminPage, otherTerm)).toBeVisible();
  let release, arrived, settled;
  const gate = new Promise((resolve) => {
      release = resolve;
    }),
    arrival = new Promise((resolve) => {
      arrived = resolve;
    }),
    obsoleteSettled = new Promise((resolve) => {
      settled = resolve;
    });
  let delayed = false;
  const delayHandler = async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET' || url.searchParams.get('studentId') !== 'student-a' || delayed)
      return route.continue();
    delayed = true;
    try {
      const response = await route.fetch({ maxRedirects: 0, timeout: 15000 });
      assert.equal(response.status(), 200);
      await response.body();
      arrived();
      await gate;
      try {
        await route.fulfill({ response });
      } catch {
        /* The superseding reload intentionally aborts this obsolete read. */
      }
    } catch {
      deliveryErrors.push('Actual delayed report list could not be captured');
      arrived();
    } finally {
      settled();
    }
  };
  await adminPage.route('**/api/report-cards?*', delayHandler);
  try {
    await adminPage.getByLabel('Student', { exact: true }).selectOption('student-a');
    await arrival;
    await check(
      'Changing learner clears former cards and controls while another list is pending',
      async () => {
        await expect(card(adminPage, otherTerm)).toHaveCount(0);
        await expect(card(adminPage, term)).toHaveCount(0);
        await expect(adminPage.getByLabel('Term', { exact: true })).toHaveCount(0);
        await expect(adminPage.getByLabel('Student', { exact: true })).toHaveCount(0);
        await expect(adminPage.getByRole('status')).toContainText('Loading current reports');
      },
    );
    await reloadReports(adminPage, 'student-a');
    await expect(card(adminPage, term)).toBeVisible();
    await selectStudent(adminPage, other.id);
    await expect(card(adminPage, otherTerm)).toBeVisible();
    release();
    await obsoleteSettled;
    await check('A superseded saved learner response cannot replace the current selected list', async () => {
      await expect(adminPage.getByLabel('Student', { exact: true })).toHaveValue(other.id);
      await expect(card(adminPage, otherTerm)).toBeVisible();
      await expect(card(adminPage, term)).toHaveCount(0);
      await expect(
        adminPage.getByText('Reports for ' + other.firstName + ' ' + other.lastName, { exact: true }),
      ).toBeVisible();
    });
  } finally {
    release();
    await adminPage.unroute('**/api/report-cards?*', delayHandler);
  }
  const failureHandler = (route) =>
    new URL(route.request().url()).searchParams.get('studentId') === 'student-a'
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Synthetic report list failure' }),
        })
      : route.continue();
  await adminPage.route('**/api/report-cards?*', failureHandler);
  await adminPage.getByLabel('Student', { exact: true }).selectOption('student-a');
  await check('Failed learner list shows an alert without former cards or write access', async () => {
    await expect(adminPage.getByRole('alert')).toContainText(
      'Current students and reports could not be verified',
    );
    await expect(card(adminPage, otherTerm)).toHaveCount(0);
    await expect(card(adminPage, term)).toHaveCount(0);
    await expect(adminPage.getByRole('button', { name: 'Create Draft', exact: true })).toHaveCount(0);
    await expect(adminPage.getByLabel('Student', { exact: true })).toHaveCount(0);
  });
  await adminPage.unroute('**/api/report-cards?*', failureHandler);
  await reloadReports(adminPage, 'student-a');
  await check('Explicit report reload restores current evidence after list failure', async () => {
    await expect(card(adminPage, term)).toBeVisible();
    await expect(adminPage.getByRole('alert')).toHaveCount(0);
    await expect(card(adminPage, lostTerm).getByRole('checkbox')).not.toBeChecked();
  });
  await check('Report draft controls support labeled keyboard navigation', async () => {
    const termInput = adminPage.getByLabel('Term', { exact: true });
    await termInput.focus();
    await expect(termInput).toBeFocused();
    await adminPage.keyboard.press('Tab');
    await expect(adminPage.getByLabel('Overall Grade', { exact: true })).toBeFocused();
  });
  await check('Desktop admin report labels and width', async () => labelsAndWidth(adminPage));
  await screenshot(adminPage, 'reports-desktop');

  await family.goto(base.origin + '/notifications');
  const ownNotice = family.locator('article[data-notification-id=' + JSON.stringify(noticeId) + ']');
  await expect(ownNotice).toBeVisible();
  const readLoss = await loseResponse(
    family,
    '**/api/notifications?*',
    'PATCH',
    200,
    (url) => url.searchParams.get('id') === noticeId,
  );
  await ownNotice.getByRole('button', { name: 'Mark as Read', exact: true }).click();
  await check('Lost read acknowledgement retains exact recovery and hides the unverified inbox', async () => {
    await expect(family.getByRole('alert')).toContainText('retry the exact original notice');
    await expect(ownNotice).toHaveCount(0);
    await expect(
      family.getByRole('region', { name: 'Unconfirmed notice read status', exact: true }),
    ).toBeVisible();
    assert.equal(readLoss.records.length, 1, 'No automatic retry after the lost acknowledgement');
  });
  const firstRead = (await api(guardian, '/api/notifications')).find((row) => row.id === noticeId);
  assert.ok(firstRead.readAt);
  await family.getByRole('button', { name: 'Reload my inbox', exact: true }).click();
  await check('Fresh original-owner reload retains explicit exact-notice recovery', async () => {
    await expect(ownNotice).toBeVisible();
    await expect(
      family.getByRole('region', { name: 'Unconfirmed notice read status', exact: true }),
    ).toContainText(firstRead.title);
    await expect(
      family.getByRole('button', { name: 'Retry original notice read status', exact: true }),
    ).toBeEnabled();
    assert.equal(readLoss.records.length, 1, 'Reload performs no repeated write');
  });
  checkpoint('await exact original notice PATCH and confirmed saved inbox');
  const recoveredRead = family.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/notifications' &&
      new URL(response.url()).searchParams.get('id') === noticeId &&
      response.request().method() === 'PATCH',
  );
  await family.getByRole('button', { name: 'Retry original notice read status', exact: true }).click();
  const recoveredReadResponse = await recoveredRead;
  assert.equal(recoveredReadResponse.status(), 200);
  await recoveredReadResponse.body();
  await check('Same-record read retry recovers status and preserves original read evidence', async () => {
    await expect(
      family.getByRole('region', { name: 'Unconfirmed notice read status', exact: true }),
    ).toHaveCount(0);
    await expect(ownNotice.getByRole('button', { name: 'Mark as Read', exact: true })).toHaveCount(0);
    assert.equal(readLoss.records.length, 2);
    assert.deepEqual(readLoss.records[1], readLoss.records[0]);
    const saved = (await api(guardian, '/api/notifications')).find((row) => row.id === noticeId);
    assert.equal(saved.readAt, firstRead.readAt);
    assert.equal(saved.updatedAt, firstRead.updatedAt);
    await expect(family.getByRole('alert')).toHaveCount(0);
  });
  await readLoss.remove();
  await check('Desktop notification width and labels', async () => labelsAndWidth(family));
  await screenshot(family, 'notifications-desktop');
  await learner.goto(base.origin + '/notifications');
  await check('Guardian publication notice stays out of learner personal inbox', async () => {
    await expect(learner.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible();
    await expect(
      learner.locator('article[data-notification-id=' + JSON.stringify(noticeId) + ']'),
    ).toHaveCount(0);
  });

  const detailUrl = base.origin + '/report-cards/' + primary.id;
  for (const [target, path, name, prepare] of [
    [
      adminPage,
      base.origin + '/report-cards',
      'admin-reports-mobile',
      () => selectStudent(adminPage, 'student-a'),
    ],
    [
      teacherPage,
      base.origin + '/report-cards',
      'teacher-reports-mobile',
      () => selectStudent(teacherPage, 'student-a'),
    ],
    [
      family,
      base.origin + '/report-cards',
      'family-reports-mobile',
      () => selectStudent(family, 'student-a'),
    ],
    [
      learner,
      detailUrl,
      'published-report-mobile',
      async () => expect(learner.getByRole('heading', { name: 'Report Card', exact: true })).toBeVisible(),
    ],
    [
      family,
      base.origin + '/notifications',
      'notifications-mobile',
      async () => expect(family.getByText('Notification Inbox', { exact: true })).toBeVisible(),
    ],
  ]) {
    await target.setViewportSize({ width: 390, height: 844 });
    await target.goto(path);
    await prepare();
    await screenshot(target, name);
    try {
      await check('Mobile labels and viewport: ' + name, async () => labelsAndWidth(target));
    } catch (error) {
      mobileFailures.push({ screen: name, errorName: error.name });
      console.error('Mobile issue: ' + JSON.stringify(mobileFailures.at(-1)));
    }
  }
  await check('Built scripts and stylesheets load without HTTP failures', async () =>
    assert.deepEqual(
      resourceFailures.filter((item) => ['script', 'stylesheet'].includes(item.type)),
      [],
    ),
  );
  assert.deepEqual(mobileFailures, [], 'All report and inbox mobile screens must fit their viewport.');
  await check('No external browser requests or unhandled application errors', async () => {
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
      'Built localhost Worker and synthetic accounts/data only.',
      'Delayed list,503 and lost acknowledgements deliberately injected; committed responses drained before abort.',
      'No provider activation, deployment, specification acceptance or full accessibility certification.',
    ],
  };
  writeFileSync('/private/tmp/saha-domain-ui-results.json', JSON.stringify(result, null, 2) + '\n');
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
  const observations = [];
  for (const value of contexts)
    for (const page of value.pages())
      if (page.url().startsWith(base.origin)) {
        try {
          observations.push({
            path: new URL(page.url()).pathname,
            alertCount: await page.getByRole('alert').count(),
            reportCardCount: await page.locator('[data-report-card-id]').count(),
            studentChoiceCount: await page.getByLabel('Student', { exact: true }).count(),
            draftFormCount: await page.getByLabel('Term', { exact: true }).count(),
            unconfirmedActionCount: await page
              .getByRole('region', { name: 'Unconfirmed report action', exact: true })
              .count(),
            loadingCount: await page
              .getByRole('status')
              .filter({ hasText: /^Loading current reports…$/ })
              .count(),
          });
          if (new URL(page.url()).pathname === '/report-cards') {
            const path = '/private/tmp/saha-domain-ui-stopped.png';
            await page.screenshot({ path, fullPage: true });
            screenshots.push(path);
          }
        } catch {
          /* A closed page contributes no raw browser error or transport cause. */
        }
      }
  const result = {
    executedAt: new Date().toISOString(),
    passed,
    failed: 1,
    skipped: 0,
    stopped: true,
    failure: { procedure: activeProcedure, checkpoint: activeCheckpoint, errorName: error.name },
    observations,
    externalRequests: externalRequests.length,
    pageErrors: pageErrors.length,
    checks,
    screenshots,
    limits: [
      'Stopped local synthetic browser run; remaining procedures were not executed.',
      'Error messages, transport causes, headers and session values are deliberately excluded.',
    ],
  };
  writeFileSync('/private/tmp/saha-domain-ui-results.json', JSON.stringify(result, null, 2) + '\n');
  console.log(
    JSON.stringify({
      passed,
      failed: 1,
      failure: result.failure,
      externalRequests: externalRequests.length,
      pageErrors: pageErrors.length,
    }),
  );
  process.exitCode = 1;
} finally {
  for (const value of contexts) await value.close();
  await browser.close();
}
