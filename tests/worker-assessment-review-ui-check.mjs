// Manual localhost-only browser procedures against the final migrated Worker.
// Real reviewed changes use suffix-only fixtures. Delivery/snapshot faults are named injections.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';

const origin = process.env.SAHA_WORKER_TEST_URL,
  fixture = process.env.SAHA_WORKER_SESSION_FIXTURE,
  executablePath = process.env.SAHA_TEST_BROWSER;
if (!origin || !fixture || !executablePath)
  throw new Error('Supply a local built Worker, private synthetic sessions and local browser.');
const base = new URL(origin);
// Screenshots and the result record go to SAHA_TEST_OUTPUT_DIR when set; the previous fixed location remains the default.
const outputDir = process.env.SAHA_TEST_OUTPUT_DIR || '/private/tmp';
mkdirSync(outputDir, { recursive: true });
if (
  !['127.0.0.1', 'localhost'].includes(base.hostname) ||
  !['http:', 'https:'].includes(base.protocol) ||
  base.username ||
  base.password ||
  base.pathname !== '/' ||
  base.search ||
  base.hash
)
  throw new Error('Assessment browser checks require an exact localhost origin.');
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
const suffix = crypto.randomUUID().slice(0, 8),
  date = '2026-10-05',
  reason = 'Synthetic reviewed results ' + suffix;
const check = async (name, action) => {
  await action();
  passed++;
  checks.push(name);
  console.log('ok - ' + name);
};
async function context(user) {
  if (user && typeof sessions[user] !== 'string') throw new Error('Missing a required synthetic session.');
  const value = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    timezoneId: 'Pacific/Kiritimati',
    serviceWorkers: 'block',
    extraHTTPHeaders: user ? { cookie: sessions[user] } : {},
  });
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
    throw new Error('Synthetic requests must remain local.');
  const response = await value.request.fetch(url.href, {
    method,
    timeout: 15000,
    maxRedirects: 0,
    headers: method === 'GET' ? {} : { Origin: base.origin },
    ...(data === undefined ? {} : { data }),
  });
  const body = await response.text();
  assert.equal(response.status(), expected, 'Local API status: ' + path);
  return JSON.parse(body);
}
async function localRouteFetch(route) {
  if (new URL(route.request().url()).origin !== base.origin)
    throw new Error('Injected requests must remain local.');
  // The API request jar omits secure cookies over HTTP; keep this local authorised request's cookie.
  return route.fetch({
    timeout: 15000,
    maxRedirects: 0,
    headers: { ...(await route.request().allHeaders()), cookie: sessions['teacher-a'] },
  });
}
const endpoint = (id) => '/api/assessments/' + encodeURIComponent(id) + '/result-editor';
const row = (page, student) => page.locator('[data-result-student=' + JSON.stringify(student.id) + ']');
const name = (student) => student.firstName + ' ' + student.lastName;
const score = (page, student) => page.getByLabel('Score for ' + name(student), { exact: true });
const grade = (page, student) =>
  page.getByLabel('School-supplied grade for ' + name(student), { exact: true });
const feedback = (page, student) => page.getByLabel('Feedback for ' + name(student), { exact: true });
const reviewBox = (page) =>
  page.getByRole('checkbox', {
    name: 'I reviewed the loaded assessment, saved results and these intended changes.',
    exact: true,
  });
const saveButton = (page) => page.getByRole('button', { name: 'Save reviewed results', exact: true });
const reloadButton = (page) => page.getByRole('button', { name: 'Reload current results', exact: true });
async function open(page, id) {
  const response = await page.goto(base.origin + '/assessments/' + encodeURIComponent(id), {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
  assert.equal(response?.status(), 200);
  await expect(
    page.getByRole('heading', { name: 'Review assessment results', exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('Current saved results and intended changes', { exact: true })).toBeVisible();
  await expect(page.getByText('Loading saved results and current roster…', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Loading review history…', { exact: true })).toHaveCount(0);
}
async function prepare(page, explanation = reason) {
  await page.getByLabel('Reason for result changes', { exact: true }).fill(explanation);
  await reviewBox(page).check();
  await expect(saveButton(page)).toBeEnabled();
}
async function submit(page, id, expected = 201) {
  const saved = page.waitForResponse(
    (response) => new URL(response.url()).pathname === endpoint(id) && response.request().method() === 'POST',
  );
  await saveButton(page).click();
  const response = await saved;
  assert.equal(response.status(), expected);
  const result = await response.json();
  await expect(
    page.getByRole('status').filter({ hasText: expected === 201 ? savedNotice : replayedNotice }),
  ).toBeVisible();
  await expect(page.getByText('Loading saved results and current roster…', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Loading review history…', { exact: true })).toHaveCount(0);
  await expect(
    page.locator('[data-confirmed-result-review=' + JSON.stringify(result.review.id) + ']'),
  ).toBeVisible();
  return result;
}
const savedNotice = 'Result review saved. The original reviewed update was acknowledged.',
  replayedNotice = 'Original result review confirmed.';
const privateViews = '[data-result-student],[data-confirmed-result-review],[data-result-review]';
const pendingRegion = (page) => page.getByRole('region', { name: 'Pending reviewed request', exact: true });
const retryButton = (page) => page.getByRole('button', { name: 'Retry pending save', exact: true });
const discardButton = (page) =>
  page.getByRole('button', { name: 'Discard pending request and review current results', exact: true });
// Explicit discard is read-only: it sends zero POST requests and never claims the started save was cancelled or confirmed.
async function discardPending(page) {
  let posts = 0;
  const observe = (request) => {
    if (request.method() === 'POST') posts++;
  };
  page.on('request', observe);
  const notice = page.getByRole('status').filter({ hasText: 'Pending request discarded from this page.' });
  try {
    await discardButton(page).click();
    await expect(notice).toBeVisible();
    await expect(pendingRegion(page)).toHaveCount(0);
    await expect(page.getByText('Loading saved results and current roster…', { exact: true })).toHaveCount(0);
  } finally {
    page.off('request', observe);
  }
  assert.equal(posts, 0, 'Explicit discard sends zero POST requests');
  assert.equal(
    await notice.innerText(),
    'Pending request discarded from this page. This does not cancel or confirm a started save. Review the current saved results and make a separate explicit review before another save.',
  );
  assert.doesNotMatch(
    await page.getByRole('main').innerText(),
    /was (?:cancelled|canceled)|save (?:was|is) (?:cancelled|canceled|confirmed)/i,
  );
}
// Real commit, then the acknowledgement is lost: the browser sees a failed request. afterCommit may add later legacy evidence.
async function loseAfterCommit(page, id, afterCommit) {
  const match = (url) => url.pathname === endpoint(id);
  let original, body, injectionError;
  const lose = async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    try {
      original = route.request().postDataJSON();
      body = route.request().postData();
      const response = await localRouteFetch(route);
      assert.equal(response.status(), 201);
      await response.body();
      if (afterCommit) await afterCommit();
      return route.abort('failed');
    } catch (error) {
      injectionError = error;
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"error":"Local injection failed"}',
      });
    }
  };
  await page.route(match, lose);
  try {
    await saveButton(page).click();
    await expect(page.getByRole('alert')).toContainText('The save outcome is not confirmed.');
  } finally {
    await page.unroute(match, lose);
  }
  if (injectionError) throw injectionError;
  assert.ok(original?.clientRequestId);
  await expect(page.locator(privateViews)).toHaveCount(0);
  await expect(retryButton(page)).toHaveCount(0);
  return { original, body };
}
async function legacyResults(value, id, results) {
  return api(value, '/api/assessments/' + id + '/results', 'POST', { results });
}
async function manualReview(value, id, changes, explanation) {
  const saved = await api(value, endpoint(id));
  const entries = changes.map((change) => {
    const pupil = saved.roster.items.find((item) => item.student.id === change.studentId);
    assert.ok(pupil);
    return {
      studentId: change.studentId,
      score: change.score,
      grade: change.grade === undefined ? (pupil.record?.grade ?? null) : change.grade,
      feedback: change.feedback === undefined ? (pupil.record?.feedback ?? null) : change.feedback,
      expectedRecord: pupil.record,
    };
  });
  return api(
    value,
    endpoint(id),
    'POST',
    {
      expectedAssessment: saved.assessment,
      clientRequestId: crypto.randomUUID(),
      reviewConfirmed: true,
      reason: explanation,
      entries,
    },
    201,
  );
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
  assert.equal(missing, 0);
  const width = await page.evaluate(() => ({
    viewport: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(width.scroll <= width.viewport + 1, 'No horizontal overflow: ' + JSON.stringify(width));
}
async function shot(page, name) {
  // Stabilise layout/compositor after resizing before full-page capture.
  await page.evaluate(async () => {
    await document.fonts.ready;
    const frames = () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    document.body.getBoundingClientRect();
    await frames();
    scrollTo(0, document.documentElement.scrollHeight);
    await frames();
    scrollTo(0, 0);
    document.body.getBoundingClientRect();
    await frames();
  });
  const path = join(outputDir, 'saha-assessment-review-ui-' + name + '.png');
  await page.screenshot({ path, fullPage: true });
  screenshots.push(path);
}
try {
  const admin = await context('admin-a'),
    teacher = await context('teacher-a'),
    family = await context('guardian-a'),
    learner = await context('student-user-a'),
    other = await context('teacher-other');
  const school = (await api(admin, '/api/schools')).find((item) => item.id === 'a'),
    course = (await api(admin, '/api/courses')).find((item) => item.id === 'course-a');
  assert.ok(school && course);
  const classroom = await api(
    admin,
    '/api/classes',
    'POST',
    {
      schoolId: school.id,
      courseId: course.id,
      teacherId: 'teacher-a',
      name: 'Synthetic assessment class ' + suffix,
      term: 'Synthetic reviewed result term',
    },
    201,
  );
  const pupils = [];
  for (const kind of ['zero', 'unrecorded', 'empty', 'withdrawn', 'completed']) {
    const pupil = await api(
      admin,
      '/api/students',
      'POST',
      {
        schoolId: school.id,
        firstName: 'Synthetic results',
        lastName: kind + ' ' + suffix,
        admissionNumber: 'RES-' + suffix + '-' + kind,
        gradeLevel: '8',
        dateOfBirth: '2012-01-01',
      },
      201,
    );
    const enrolment = await api(
      admin,
      '/api/enrolments',
      'POST',
      { classId: classroom.id, studentId: pupil.id },
      201,
    );
    if (kind === 'withdrawn' || kind === 'completed')
      await api(admin, '/api/enrolments', 'PATCH', { id: enrolment.id, status: kind });
    pupils.push(pupil);
  }
  const [zero, blank, empty] = pupils;
  const assessment = await api(
    teacher,
    '/api/assessments',
    'POST',
    {
      classId: classroom.id,
      title: '<img src=x onerror=alert(1)> Reviewed results ' + suffix,
      kind: 'quiz',
      maxScore: 10,
      date,
    },
    201,
  );
  const zeroMaximum = await api(
    teacher,
    '/api/assessments',
    'POST',
    { classId: classroom.id, title: 'Synthetic zero maximum ' + suffix, kind: 'quiz', maxScore: 0, date },
    201,
  );
  await legacyResults(teacher, assessment.id, [
    { studentId: zero.id, score: 0 },
    { studentId: empty.id, score: 3, grade: '', feedback: '' },
  ]);
  const page = await teacher.newPage();
  await open(page, assessment.id);
  await check(
    'Only active distinct learners are editable; withdrawn/completed learners are absent',
    async () => {
      await expect(page.locator('[data-result-student]')).toHaveCount(3);
      for (const pupil of pupils.slice(3)) await expect(row(page, pupil)).toHaveCount(0);
    },
  );
  await check('Saved zero/null and empty fields load exactly; missing scores stay blank', async () => {
    await expect(score(page, zero)).toHaveValue('0');
    await expect(row(page, zero)).toContainText('No grade');
    await expect(row(page, zero)).toContainText('No feedback');
    await expect(grade(page, zero)).toHaveValue('');
    await expect(score(page, empty)).toHaveValue('3');
    await expect(row(page, empty)).toContainText('Empty grade');
    await expect(row(page, empty)).toContainText('Empty feedback');
    await expect(score(page, blank)).toHaveValue('');
    await expect(row(page, blank).getByText('No saved result.', { exact: true })).toBeVisible();
  });
  await check('No-op/unreviewed form cannot save or default a missing learner to zero', async () => {
    await page.getByLabel('Reason for result changes', { exact: true }).fill(reason);
    await reviewBox(page).check();
    await expect(saveButton(page)).toBeDisabled();
    await score(page, blank).fill('0');
    await expect(reviewBox(page)).not.toBeChecked();
    await expect(saveButton(page)).toBeDisabled();
  });
  await check('Score, grade, feedback and reason changes reset explicit review', async () => {
    for (const [field, value] of [
      [grade(page, blank), 'School-entered grade'],
      [feedback(page, blank), 'Teacher-entered feedback'],
      [score(page, blank), '2'],
      [page.getByLabel('Reason for result changes', { exact: true }), reason + ' updated'],
    ]) {
      await reviewBox(page).check();
      await field.fill(value);
      await expect(reviewBox(page)).not.toBeChecked();
    }
    await score(page, blank).fill('0');
  });
  await check(
    'Reviewed save submits only the dirty missing learner and preserves untouched zero/null/empty',
    async () => {
      await prepare(page);
      const result = await submit(page, assessment.id);
      assert.equal(result.review.changes.length, 1);
      assert.equal(result.review.changes[0].studentId, blank.id);
      assert.equal(result.review.changes[0].beforeRecord, null);
      assert.equal(result.review.changes[0].afterRecord.score, 0);
      const actual = await api(teacher, endpoint(assessment.id));
      const z = actual.roster.items.find((item) => item.student.id === zero.id).record,
        e = actual.roster.items.find((item) => item.student.id === empty.id).record;
      assert.equal(z.score, 0);
      assert.equal(z.grade, null);
      assert.equal(z.feedback, null);
      assert.equal(e.grade, '');
      assert.equal(e.feedback, '');
      await expect(reviewBox(page)).not.toBeChecked();
      await expect(saveButton(page)).toBeDisabled();
    },
  );
  await check('Two same-frame native submits yield one POST and one durable review', async () => {
    await grade(page, zero).fill('School grade ' + suffix);
    await prepare(page, reason + ' same-frame');
    let posts = 0;
    const observe = (request) => {
      if (new URL(request.url()).pathname === endpoint(assessment.id) && request.method() === 'POST') posts++;
    };
    page.on('request', observe);
    const before = (await api(teacher, endpoint(assessment.id) + '/history')).total;
    try {
      await saveButton(page).evaluate((button) => {
        button.form.requestSubmit();
        button.form.requestSubmit();
      });
      await expect(page.getByRole('status').filter({ hasText: savedNotice })).toBeVisible();
    } finally {
      page.off('request', observe);
    }
    assert.equal(posts, 1);
    assert.equal((await api(teacher, endpoint(assessment.id) + '/history')).total, before + 1);
    await expect(score(page, zero)).toHaveValue('0');
  });
  await check('Saved title and feedback HTML remain escaped plain text', async () => {
    const html = '<script>window.__resultInjected=true</script> Feedback ' + suffix;
    await feedback(page, zero).fill(html);
    await prepare(page);
    await submit(page, assessment.id);
    await expect(page.getByText(assessment.title, { exact: true })).toBeVisible();
    await expect(row(page, zero)).toContainText(html);
    await expect(page.locator('img[src=x]')).toHaveCount(0);
    assert.equal(await page.evaluate(() => window.__resultInjected), undefined);
  });
  await check(
    'Real legacy feedback change invalidates full-record CAS; the rejected request is retained privately with its intended grade',
    async () => {
      await grade(page, zero).fill('Intended reviewed grade ' + suffix);
      await prepare(page, reason + ' feedback conflict');
      await legacyResults(teacher, assessment.id, [
        {
          studentId: zero.id,
          score: 0,
          grade: 'School grade ' + suffix,
          feedback: 'Concurrent saved feedback ' + suffix,
        },
        { studentId: empty.id, score: 4, grade: '', feedback: '' },
      ]);
      const saved = page.waitForResponse(
        (item) =>
          new URL(item.url()).pathname === endpoint(assessment.id) && item.request().method() === 'POST',
      );
      await saveButton(page).click();
      assert.equal((await saved).status(), 409);
      await expect(page.getByRole('alert')).toContainText(
        'The reviewed update was rejected because saved results, assessment details or access changed. No save acknowledgement was received.',
      );
      await expect(page.locator(privateViews)).toHaveCount(0);
      await expect(saveButton(page)).toHaveCount(0);
    },
  );
  await check(
    'Comparison reload shows current saved values separately from the retained original request; explicit discard posts nothing and a separate review keeps newer feedback',
    async () => {
      await reloadButton(page).click();
      await expect(pendingRegion(page)).toContainText(
        'The last review response rejected this request; no save was acknowledged.',
      );
      await expect(pendingRegion(page)).toContainText(
        'Original intended grade: Intended reviewed grade ' + suffix,
      );
      await expect(grade(page, zero)).toHaveValue('School grade ' + suffix);
      await expect(feedback(page, zero)).toHaveValue('Concurrent saved feedback ' + suffix);
      await expect(score(page, empty)).toHaveValue('4');
      await expect(grade(page, zero)).toBeDisabled();
      await expect(saveButton(page)).toBeDisabled();
      await discardPending(page);
      await expect(reviewBox(page)).not.toBeChecked();
      await expect(page.getByText('0 students with intended changes.', { exact: true })).toBeVisible();
      await expect(grade(page, zero)).toBeEnabled();
      await grade(page, zero).fill('Intended reviewed grade ' + suffix);
      await expect(page.getByText('1 student with intended changes.', { exact: true })).toBeVisible();
      await prepare(page, reason + ' separate review after conflict');
      const result = await submit(page, assessment.id);
      assert.equal(result.review.changes.length, 1);
      assert.equal(result.review.changes[0].afterRecord.feedback, 'Concurrent saved feedback ' + suffix);
      assert.equal(result.review.changes[0].afterRecord.score, 0);
    },
  );
  await check(
    'Explicitly stale loaded metadata injection is rejected; a fresh read and explicit discard require a separate new review',
    async () => {
      const match = (url) => url.pathname === endpoint(assessment.id);
      const stale = async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        const response = await localRouteFetch(route),
          data = await response.json();
        data.assessment.title = 'Stale loaded title ' + suffix;
        return route.fulfill({
          status: response.status(),
          contentType: 'application/json',
          body: JSON.stringify(data),
        });
      };
      await page.route(match, stale);
      try {
        await open(page, assessment.id);
        await expect(page.getByText('Stale loaded title ' + suffix, { exact: true })).toBeVisible();
        await score(page, blank).fill('6');
        await prepare(page, reason + ' stale source metadata');
        const saved = page.waitForResponse(
          (item) =>
            new URL(item.url()).pathname === endpoint(assessment.id) && item.request().method() === 'POST',
        );
        await saveButton(page).click();
        const response = await saved;
        assert.equal(response.status(), 409);
        assert.equal(
          response.request().postDataJSON().expectedAssessment.title,
          'Stale loaded title ' + suffix,
        );
        await expect(page.getByRole('alert')).toContainText(
          'The reviewed update was rejected because saved results, assessment details or access changed.',
        );
        await expect(page.locator(privateViews)).toHaveCount(0);
      } finally {
        await page.unroute(match, stale);
      }
      await reloadButton(page).click();
      await expect(pendingRegion(page)).toContainText('Original assessment: Stale loaded title ' + suffix);
      await expect(pendingRegion(page)).toContainText('Original intended score: 6');
      await expect(page.getByText(assessment.title, { exact: true })).toBeVisible();
      await expect(score(page, blank)).toBeDisabled();
      await discardPending(page);
      await expect(reviewBox(page)).not.toBeChecked();
      await expect(saveButton(page)).toBeDisabled();
      await score(page, blank).fill('6');
      await prepare(page, reason + ' separate review after stale metadata');
      await submit(page, assessment.id);
    },
  );
  await check(
    'Rejected delivery displays a truthful rejection, retains the exact request privately and saves nothing',
    async () => {
      await score(page, blank).fill('5');
      await prepare(page, reason + ' rejected');
      const match = (url) => url.pathname === endpoint(assessment.id);
      const reject = (route) =>
        route.request().method() === 'POST'
          ? route.fulfill({
              status: 400,
              contentType: 'application/json',
              body: '{"error":"Invalid request"}',
            })
          : route.continue();
      await page.route(match, reject);
      try {
        await saveButton(page).click();
        await expect(page.getByRole('alert')).toContainText(
          'The reviewed update was rejected. No save acknowledgement was received.',
        );
        await expect(page.locator(privateViews)).toHaveCount(0);
      } finally {
        await page.unroute(match, reject);
      }
      assert.equal(
        (await api(teacher, endpoint(assessment.id))).roster.items.find(
          (item) => item.student.id === blank.id,
        ).record.score,
        6,
      );
      await reloadButton(page).click();
      await expect(pendingRegion(page)).toContainText(
        'The last review response rejected this request; no save was acknowledged.',
      );
      await expect(pendingRegion(page)).toContainText('Original intended score: 5');
      await expect(score(page, blank)).toHaveValue('6');
      await expect(score(page, blank)).toBeDisabled();
      await discardPending(page);
      assert.equal(
        (await api(teacher, endpoint(assessment.id))).roster.items.find(
          (item) => item.student.id === blank.id,
        ).record.score,
        6,
      );
    },
  );
  let originalRequest, originalBody;
  await check(
    'Lost acknowledgement hides private evidence, then a fresh original-actor read shows the exact pending payload/UUID with editing locked',
    async () => {
      await score(page, blank).fill('5');
      await prepare(page, reason + ' lost acknowledgement');
      const lost = await loseAfterCommit(page, assessment.id, async () => {
        const record = (await api(teacher, endpoint(assessment.id))).roster.items.find(
          (item) => item.student.id === blank.id,
        ).record;
        await legacyResults(teacher, assessment.id, [
          {
            studentId: blank.id,
            score: 8,
            grade: record.grade ?? undefined,
            feedback: 'Later legacy feedback ' + suffix,
          },
        ]);
      });
      originalRequest = lost.original;
      originalBody = lost.body;
      await reloadButton(page).click();
      await expect(pendingRegion(page)).toContainText('The original save outcome is unconfirmed.');
      await expect(pendingRegion(page)).toContainText('Original intended score: 5');
      await expect(score(page, blank)).toHaveValue('8');
      await expect(score(page, blank)).toBeDisabled();
      await expect(retryButton(page)).toBeEnabled();
    },
  );
  await check(
    'Exact UUID replay returns original receipt without overwriting later legacy score/feedback',
    async () => {
      const saved = page.waitForResponse(
        (item) =>
          new URL(item.url()).pathname === endpoint(assessment.id) && item.request().method() === 'POST',
      );
      await page.getByRole('button', { name: 'Retry pending save', exact: true }).click();
      const response = await saved;
      assert.equal(response.status(), 200);
      assert.equal(response.request().postData(), originalBody, 'Exact original request bytes');
      assert.deepEqual(response.request().postDataJSON(), originalRequest);
      const result = await response.json();
      assert.equal(result.replayed, true);
      assert.equal(result.review.id, originalRequest.clientRequestId);
      assert.equal(result.review.changes[0].afterRecord.score, 5);
      await expect(
        page.getByRole('status').filter({ hasText: 'Original result review confirmed.' }),
      ).toBeVisible();
      await expect(score(page, blank)).toHaveValue('8');
      await expect(feedback(page, blank)).toHaveValue('Later legacy feedback ' + suffix);
      await expect(
        page.locator('[data-confirmed-result-review=' + JSON.stringify(result.review.id) + ']'),
      ).toContainText('5 (integer)');
    },
  );
  await check(
    'Confirmed save with a failed current read keeps only the generic fact, hides private evidence, then restores the immutable receipt after a fresh read',
    async () => {
      await score(page, zero).fill('1');
      await prepare(page, reason + ' refresh failure');
      let committed = false,
        receipt,
        injectionError;
      const match = (url) => url.pathname === endpoint(assessment.id);
      const failRefresh = async (route) => {
        try {
          if (route.request().method() === 'POST') {
            const response = await localRouteFetch(route);
            receipt = await response.json();
            committed = response.status() === 201;
            return route.fulfill({ response });
          }
          if (committed)
            return route.fulfill({
              status: 503,
              contentType: 'application/json',
              body: '{"error":"Unavailable"}',
            });
          return route.continue();
        } catch (error) {
          injectionError = error;
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: '{"error":"Local injection failed"}',
          });
        }
      };
      await page.route(match, failRefresh);
      try {
        await saveButton(page).click();
        await expect(page.getByRole('status').filter({ hasText: savedNotice })).toBeVisible();
        await expect(page.getByRole('alert')).toContainText('Saved results could not be verified.');
        if (injectionError) throw injectionError;
        await expect(page.locator(privateViews)).toHaveCount(0);
        await expect(retryButton(page)).toHaveCount(0);
      } finally {
        await page.unroute(match, failRefresh);
      }
      await reloadButton(page).click();
      await expect(
        page.locator('[data-confirmed-result-review=' + JSON.stringify(receipt.review.id) + ']'),
      ).toBeVisible();
      await expect(score(page, zero)).toHaveValue('1');
      await expect(score(page, zero)).toBeEnabled();
      await expect(page.getByText('0 students with intended changes.', { exact: true })).toBeVisible();
    },
  );
  await check('Null/empty grade and feedback remain deliberate distinct reviewed values', async () => {
    await grade(page, empty).fill('temporary grade');
    await grade(page, empty).fill('');
    await expect(page.getByText('0 students with intended changes.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Set no grade for ' + name(empty), exact: true }).click();
    await page.getByRole('button', { name: 'Set no feedback for ' + name(empty), exact: true }).click();
    await prepare(page);
    const result = await submit(page, assessment.id);
    const event = result.review.changes[0];
    assert.equal(event.beforeRecord.grade, '');
    assert.equal(event.beforeRecord.feedback, '');
    assert.equal(event.afterRecord.grade, null);
    assert.equal(event.afterRecord.feedback, null);
    await grade(page, empty).fill('temporary');
    await grade(page, empty).fill('');
    await feedback(page, empty).fill('temporary');
    await feedback(page, empty).fill('');
    await prepare(page);
    const restored = await submit(page, assessment.id);
    assert.equal(restored.review.changes[0].afterRecord.grade, '');
    assert.equal(restored.review.changes[0].afterRecord.feedback, '');
  });
  await check(
    'Unicode grade/feedback/reason limits count code points without silently truncating',
    async () => {
      await grade(page, zero).fill('🙂'.repeat(2000));
      await feedback(page, zero).fill('🙂'.repeat(2000));
      await prepare(page, '🙂'.repeat(10));
      await expect(
        page.getByText('Enter a single-line explanation of 10–500 characters. Current length: 10.', {
          exact: true,
        }),
      ).toBeVisible();
      const result = await submit(page, assessment.id);
      assert.equal(Array.from(result.review.reason).length, 10);
      assert.equal(Array.from(result.review.changes[0].afterRecord.grade).length, 2000);
      assert.equal(Array.from(result.review.changes[0].afterRecord.feedback).length, 2000);
      await feedback(page, zero).fill('🙂'.repeat(2001));
      await page.getByLabel('Reason for result changes', { exact: true }).fill(reason);
      await reviewBox(page).check();
      await expect(saveButton(page)).toBeDisabled();
      await expect(page.getByRole('alert')).toContainText('keep new grades/feedback within 2,000 characters');
      await feedback(page, zero).fill('🙂'.repeat(2000));
    },
  );
  await check(
    'Committed denied acknowledgements hide private evidence and retain exact retry after access recovery',
    async () => {
      for (const [denial, value] of [
        [403, '2'],
        [404, '3'],
        [401, '4'],
      ]) {
        await score(page, blank).fill(value);
        await prepare(page, reason + ' denied acknowledgement ' + denial);
        let original, injectionError;
        const match = (url) => url.pathname === endpoint(assessment.id);
        const deny = async (route) => {
          if (route.request().method() !== 'POST') return route.continue();
          try {
            original = route.request().postDataJSON();
            const response = await localRouteFetch(route);
            assert.equal(response.status(), 201);
            await response.body();
            return route.fulfill({
              status: denial,
              contentType: 'application/json',
              body: '{"error":"Unavailable"}',
            });
          } catch (error) {
            injectionError = error;
            return route.fulfill({
              status: 503,
              contentType: 'application/json',
              body: '{"error":"Local injection failed"}',
            });
          }
        };
        await page.route(match, deny);
        try {
          await saveButton(page).click();
          await expect(page.getByRole('alert')).toContainText('The save outcome is not confirmed');
          await expect(page.locator(privateViews)).toHaveCount(0);
          await expect(retryButton(page)).toHaveCount(0);
          if (denial === 401)
            await expect(
              page.getByRole('link', { name: 'Sign in again in another tab', exact: true }),
            ).toHaveAttribute('href', '/login');
        } finally {
          await page.unroute(match, deny);
        }
        if (injectionError) throw injectionError;
        const historyMatch = (url) => url.pathname === endpoint(assessment.id) + '/history',
          historyDeny = (route) =>
            route.fulfill({
              status: denial,
              contentType: 'application/json',
              body: '{"error":"Unavailable"}',
            });
        await page.route(historyMatch, historyDeny);
        try {
          await reloadButton(page).click();
          await expect(page.getByRole('alert')).toContainText(
            denial === 401
              ? 'Please sign in again in another tab, then reload current results.'
              : 'This assessment or review history is unavailable in your current school or teaching scope.',
          );
          await expect(page.locator(privateViews)).toHaveCount(0);
          await expect(retryButton(page)).toHaveCount(0);
          await expect(pendingRegion(page)).toContainText('The original save outcome is unconfirmed.');
          await expect(pendingRegion(page)).toContainText(
            'Return as the original reviewer in the original assessment and class',
          );
          await expect(pendingRegion(page)).not.toContainText('Original reason:');
        } finally {
          await page.unroute(historyMatch, historyDeny);
        }
        await reloadButton(page).click();
        await expect(pendingRegion(page)).toContainText(
          'Original reason: ' + reason + ' denied acknowledgement ' + denial,
        );
        const saved = page.waitForResponse(
          (item) =>
            new URL(item.url()).pathname === endpoint(assessment.id) && item.request().method() === 'POST',
        );
        await retryButton(page).click();
        const response = await saved;
        assert.equal(response.status(), 200);
        assert.deepEqual(response.request().postDataJSON(), original);
        const result = await response.json();
        assert.equal(result.review.id, original.clientRequestId);
        assert.equal(result.replayed, true);
        await expect(page.getByRole('status').filter({ hasText: replayedNotice })).toBeVisible();
        await expect(
          page.getByText('Loading saved results and current roster…', { exact: true }),
        ).toHaveCount(0);
      }
    },
  );
  await check(
    'History displays exact original before/after results separately from current records',
    async () => {
      const actual = await api(teacher, endpoint(assessment.id) + '/history');
      await expect(page.locator('[data-result-review]')).toHaveCount(actual.total);
      const earlier = actual.items.find((item) => item.reason.endsWith('lost acknowledgement'));
      assert.ok(earlier);
      const details = page.locator('[data-result-review=' + JSON.stringify(earlier.id) + ']');
      await details.locator('summary').click();
      await expect(details.getByRole('heading', { name: 'Before this review', exact: true })).toBeVisible();
      await expect(details.getByRole('heading', { name: 'After this review', exact: true })).toBeVisible();
      await expect(details).toContainText('5 (integer)');
      await expect(score(page, blank)).toHaveValue('4');
    },
  );
  await check(
    'Explicit discard of an unconfirmed started save sends zero POSTs, leaves the committed result and history intact and claims neither cancellation nor confirmation',
    async () => {
      const before = (await api(teacher, endpoint(assessment.id) + '/history')).total;
      await score(page, blank).fill('7');
      await prepare(page, reason + ' discard after lost acknowledgement');
      const lost = await loseAfterCommit(page, assessment.id);
      await reloadButton(page).click();
      await expect(pendingRegion(page)).toContainText('The original save outcome is unconfirmed.');
      await expect(pendingRegion(page)).toContainText('Original intended score: 7');
      await discardPending(page);
      assert.equal(
        (await api(teacher, endpoint(assessment.id) + '/history')).total,
        before + 1,
        'The started save remained committed after discard',
      );
      assert.equal(
        (await api(teacher, endpoint(assessment.id))).roster.items.find(
          (item) => item.student.id === blank.id,
        ).record.score,
        7,
      );
      await expect(page.locator('[data-confirmed-result-review]')).toHaveCount(0);
      await expect(retryButton(page)).toHaveCount(0);
      await expect(score(page, blank)).toHaveValue('7');
      await expect(score(page, blank)).toBeEnabled();
      await expect(
        page.locator('[data-result-review=' + JSON.stringify(lost.original.clientRequestId) + ']'),
      ).toHaveCount(1);
    },
  );
  await check(
    'Pending recovery is bound to the original actor: another current account sees only a generic notice, then the original actor retries the exact bytes',
    async () => {
      await score(page, blank).fill('9');
      await prepare(page, reason + ' original actor binding');
      const lost = await loseAfterCommit(page, assessment.id);
      await reloadButton(page).click();
      await expect(retryButton(page)).toBeEnabled();
      const asAdministrator = async (route) => {
        if (new URL(route.request().url()).origin !== base.origin)
          throw new Error('Injected requests must remain local.');
        return route.fulfill({
          response: await route.fetch({
            timeout: 15000,
            maxRedirects: 0,
            headers: { ...(await route.request().allHeaders()), cookie: sessions['admin-a'] },
          }),
        });
      };
      const apiRoutes = (url) => url.origin === base.origin && url.pathname.startsWith('/api/');
      let posts = 0;
      const observe = (request) => {
        if (request.method() === 'POST') posts++;
      };
      page.on('request', observe);
      await page.route(apiRoutes, asAdministrator);
      try {
        // Gate every assertion on the other account's view having fully loaded: while loading, the page also hides its view and shows this generic text.
        await reloadButton(page).click();
        await expect(page.locator('header').first()).toContainText('admin-a');
        await expect(
          page.getByText('Loading saved results and current roster…', { exact: true }),
        ).toHaveCount(0);
        await expect(page.locator('[data-result-student]')).toHaveCount(3);
        await expect(pendingRegion(page)).toContainText(
          'Return as the original reviewer in the original assessment and class',
        );
        await expect(pendingRegion(page)).not.toContainText('Original reason:');
        await expect(pendingRegion(page)).not.toContainText('Original intended score');
        await expect(retryButton(page)).toHaveCount(0);
        await expect(discardButton(page)).toHaveCount(0);
        await expect(score(page, blank)).toBeDisabled();
      } finally {
        await page.unroute(apiRoutes, asAdministrator);
        page.off('request', observe);
      }
      assert.equal(posts, 0, 'A different current account sends no POST');
      await reloadButton(page).click();
      await expect(page.locator('header').first()).toContainText('teacher-a');
      await expect(pendingRegion(page)).toContainText('Original intended score: 9');
      const saved = page.waitForResponse(
        (item) =>
          new URL(item.url()).pathname === endpoint(assessment.id) && item.request().method() === 'POST',
      );
      await retryButton(page).click();
      const response = await saved;
      assert.equal(response.status(), 200);
      assert.equal(response.request().postData(), lost.body, 'Exact original request bytes');
      const result = await response.json();
      assert.equal(result.replayed, true);
      assert.equal(result.review.id, lost.original.clientRequestId);
      await expect(page.getByRole('status').filter({ hasText: replayedNotice })).toBeVisible();
      await expect(score(page, blank)).toHaveValue('9');
    },
  );
  await open(page, 'assessment-review-long-text-assessment');
  await check(
    'Score-only correction retains exact long legacy grade/feedback without truncation',
    async () => {
      const original = await api(teacher, endpoint('assessment-review-long-text-assessment')),
        pupil = original.roster.items[0].student,
        record = original.roster.items[0].record;
      assert.ok(Number.isSafeInteger(record.score));
      assert.ok(Array.from(record.grade).length > 2000 && Array.from(record.feedback).length > 2000);
      await expect(grade(page, pupil)).toHaveValue(record.grade);
      await expect(feedback(page, pupil)).toHaveValue(record.feedback);
      await score(page, pupil).fill(record.score === 0 ? '1' : '0');
      await prepare(page, reason + ' retain long saved values');
      const result = await submit(page, original.assessment.id);
      assert.equal(result.review.changes[0].afterRecord.grade, record.grade);
      assert.equal(result.review.changes[0].afterRecord.feedback, record.feedback);
    },
  );
  await open(page, 'assessment-review-legacy-result-assessment');
  await check(
    'Retained current duplicate result pairs block the entire roster without selecting a winner',
    async () => {
      const original = await api(teacher, endpoint('assessment-review-legacy-result-assessment'));
      assert.equal(original.canReview, false);
      assert.ok(original.roster.items.some((item) => item.resultRows === 2));
      await expect(page.getByRole('alert')).toContainText('Multiple saved results exist for a student.');
      await expect(saveButton(page)).toBeDisabled();
      const duplicate = original.roster.items.find((item) => item.resultRows === 2);
      await expect(score(page, duplicate.student)).toHaveValue('');
      await expect(row(page, duplicate.student)).toContainText('2 stored result records.');
      assert.equal(
        (await api(teacher, '/api/assessments/' + original.assessment.id + '/results')).filter(
          (item) => item.studentId === duplicate.student.id,
        ).length,
        2,
      );
    },
  );
  await open(page, 'assessment-review-historical-result-assessment');
  await check(
    'Historical withdrawn duplicate results are retained while current distinct active roster remains reviewable',
    async () => {
      const original = await api(teacher, endpoint('assessment-review-historical-result-assessment'));
      assert.equal(original.canReview, true);
      assert.equal(original.roster.total, 1);
      await expect(page.locator('[data-result-student]')).toHaveCount(1);
      const before = await api(admin, '/api/assessments/' + original.assessment.id + '/results'),
        current = original.roster.items[0];
      const historical = before.filter((item) => item.studentId !== current.student.id);
      assert.equal(historical.length, 2);
      assert.equal(
        (await api(teacher, '/api/assessments/' + original.assessment.id + '/results')).some(
          (item) => item.studentId !== current.student.id,
        ),
        false,
      );
      await score(page, current.student).fill(current.record?.score === 0 ? '1' : '0');
      await prepare(page);
      await submit(page, original.assessment.id);
      const after = await api(admin, '/api/assessments/' + original.assessment.id + '/results');
      assert.deepEqual(
        after.filter((item) => item.studentId !== current.student.id),
        historical,
      );
    },
  );
  await open(page, 'assessment-review-legacy-enrolment-assessment');
  await check(
    'Actual duplicate enrolment evidence blocks review without removing confirmed rows',
    async () => {
      const original = await api(teacher, endpoint('assessment-review-legacy-enrolment-assessment'));
      assert.equal(original.canReview, false);
      assert.equal(original.roster.items[0].enrolmentRows, 2);
      await expect(page.getByRole('alert')).toContainText('Multiple enrolment records require review.');
      await expect(saveButton(page)).toBeDisabled();
    },
  );
  await open(page, 'assessment-review-cap-assessment');
  await check('Actual 101-pupil roster discloses the 100-row bound and forbids partial review', async () => {
    await expect(page.locator('[data-result-student]')).toHaveCount(100);
    await expect(page.getByRole('alert')).toContainText('Showing 100 of 101 active students.');
    await expect(saveButton(page)).toBeDisabled();
  });
  await open(page, 'assessment-review-invalid-max-assessment');
  await check('Actual malformed legacy maximum is disclosed and blocks all saves', async () => {
    const original = await api(teacher, endpoint('assessment-review-invalid-max-assessment'));
    assert.equal(original.invalidMaximum, true);
    assert.equal(original.assessment.maxScoreType, 'text');
    await expect(page.getByRole('alert')).toContainText('The stored maximum score requires review.');
    await expect(saveButton(page)).toBeDisabled();
  });
  await check(
    'Raw malformed and impossible legacy dates display unchanged without RangeError/timezone shift',
    async () => {
      for (const [id, raw] of [
        ['assessment-review-invalid-date-assessment', 'not-a-calendar-date'],
        ['assessment-review-impossible-date-assessment', '2026-02-30'],
      ]) {
        await open(page, id);
        const original = await api(teacher, endpoint(id));
        assert.equal(original.invalidDate, true);
        assert.equal(original.canReview, true);
        await expect(page.getByText('Stored assessment date: ' + raw, { exact: true })).toBeVisible();
        await expect(page.getByRole('alert')).toContainText('The stored assessment date requires review.');
      }
    },
  );
  await check(
    'Unsafe INTEGER and nonfinite REAL score/maximum remain exact literal text and read-only',
    async () => {
      for (const id of [
        'assessment-review-unsafe-score-assessment',
        'assessment-review-unsafe-max-assessment',
        'assessment-review-nonfinite-score-assessment',
        'assessment-review-nonfinite-max-assessment',
      ]) {
        await open(page, id);
        const original = await api(teacher, endpoint(id));
        assert.equal(original.canReview, false);
        await expect(saveButton(page)).toBeDisabled();
        const literal = id.includes('nonfinite') ? 'Inf' : '9007199254740993',
          storage = id.includes('nonfinite') ? 'real' : 'integer';
        if (id.includes('-score-')) {
          const pupil = original.roster.items.find((item) => item.student.id === 'student-a');
          assert.equal(pupil.record.score, literal);
          assert.equal(pupil.record.scoreType, storage);
          assert.equal(pupil.needsReview, true);
          await expect(row(page, pupil.student)).toContainText(literal + ' (' + storage + ')');
          await expect(score(page, pupil.student)).toBeDisabled();
          await expect(row(page, pupil.student).getByRole('alert')).toContainText('This roster is read-only');
        } else {
          assert.equal(original.assessment.maxScore, literal);
          assert.equal(original.assessment.maxScoreType, storage);
          assert.equal(original.invalidMaximum, true);
          await expect(
            page.getByText('Stored maximum score: ' + literal + ' (' + storage + ')', { exact: true }),
          ).toBeVisible();
        }
      }
    },
  );
  await check(
    'Actual TEXT/REAL legacy scores require explicit whole-number repair and become integer zero',
    async () => {
      for (const [id, storage] of [
        ['assessment-review-invalid-score-assessment', 'text'],
        ['assessment-review-real-score-assessment', 'real'],
      ]) {
        await open(page, id);
        const original = await api(teacher, endpoint(id)),
          pupil = original.roster.items.find((item) => item.student.id === 'student-a').student;
        assert.equal(
          original.roster.items.find((item) => item.student.id === pupil.id).record.scoreType,
          storage,
        );
        await expect(row(page, pupil).getByRole('alert')).toContainText('The stored score requires review.');
        await grade(page, pupil).fill('Explicit legacy repair ' + suffix);
        await page.getByLabel('Reason for result changes', { exact: true }).fill(reason);
        await reviewBox(page).check();
        await expect(saveButton(page)).toBeDisabled();
        await score(page, pupil).fill('0');
        await prepare(page);
        const result = await submit(page, id);
        assert.equal(result.review.changes[0].beforeRecord.scoreType, storage);
        assert.equal(result.review.changes[0].afterRecord.scoreType, 'integer');
        assert.equal(result.review.changes[0].afterRecord.score, 0);
      }
    },
  );
  await check('Failed initial load exposes an error and cannot submit an unverified roster', async () => {
    const screen = await teacher.newPage(),
      match = (url) => url.pathname === endpoint(assessment.id),
      fail = (route) =>
        route.request().method() === 'GET'
          ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}' })
          : route.continue();
    await screen.route(match, fail);
    try {
      await screen.goto(base.origin + '/assessments/' + assessment.id, { waitUntil: 'domcontentloaded' });
      await expect(screen.getByRole('alert')).toContainText('Saved results could not be verified.');
      await expect(screen.locator('[data-result-student]')).toHaveCount(0);
      await expect(saveButton(screen)).toHaveCount(0);
    } finally {
      await screen.unroute(match, fail);
    }
    await reloadButton(screen).click();
    await expect(screen.locator('[data-result-student]')).toHaveCount(3);
    await screen.close();
  });
  await check(
    'Known history access denial clears already-loaded private roster/evidence and blocks edits',
    async () => {
      const unavailable =
        'This assessment or review history is unavailable in your current school or teaching scope.';
      for (const denial of [403, 404]) {
        const screen = await teacher.newPage(),
          match = (url) => url.pathname === endpoint(assessment.id) + '/history',
          deny = (route) =>
            route.fulfill({
              status: denial,
              contentType: 'application/json',
              body: '{"error":"Unavailable"}',
            });
        await screen.route(match, deny);
        try {
          await screen.goto(base.origin + '/assessments/' + assessment.id, { waitUntil: 'domcontentloaded' });
          await expect(screen.getByRole('alert')).toContainText(unavailable);
          await expect(screen.locator(privateViews)).toHaveCount(0);
          await expect(saveButton(screen)).toHaveCount(0);
        } finally {
          await screen.unroute(match, deny);
        }
        await reloadButton(screen).click();
        await expect(screen.locator('[data-result-student]')).toHaveCount(3);
        await expect(score(screen, zero)).toBeEnabled();
        await screen.close();
      }
      const screen = await teacher.newPage();
      await open(screen, assessment.id);
      await score(screen, blank).fill('5');
      await prepare(screen, reason + ' committed history denial');
      // The save preflight re-reads current access including history before any POST, so history is denied only once the POST has been issued.
      let committed = false;
      const match = (url) => url.pathname === endpoint(assessment.id) + '/history',
        deny = (route) =>
          committed
            ? route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"Unavailable"}' })
            : route.continue();
      const editor = (url) => url.pathname === endpoint(assessment.id),
        mark = (route) => {
          if (route.request().method() === 'POST') committed = true;
          return route.continue();
        };
      await screen.route(match, deny);
      await screen.route(editor, mark);
      try {
        const saved = screen.waitForResponse(
          (item) =>
            new URL(item.url()).pathname === endpoint(assessment.id) && item.request().method() === 'POST',
        );
        await saveButton(screen).click();
        const response = await saved;
        assert.equal(response.status(), 201);
        await response.body();
        await expect(screen.getByRole('status').filter({ hasText: savedNotice })).toBeVisible();
        await expect(screen.getByRole('alert')).toContainText(unavailable);
        await expect(screen.locator(privateViews)).toHaveCount(0);
      } finally {
        await screen.unroute(match, deny);
        await screen.unroute(editor, mark);
      }
      await reloadButton(screen).click();
      await expect(score(screen, blank)).toHaveValue('5');
      await expect(screen.getByText('0 students with intended changes.', { exact: true })).toBeVisible();
      await expect(screen.locator('[data-confirmed-result-review]')).toHaveCount(1);
      await screen.close();
    },
  );
  await check(
    'History server failure remains a history error while valid current marks stay available',
    async () => {
      const screen = await teacher.newPage(),
        match = (url) => url.pathname === endpoint(assessment.id) + '/history',
        fail = (route) =>
          route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}' });
      await screen.route(match, fail);
      try {
        await screen.goto(base.origin + '/assessments/' + assessment.id, { waitUntil: 'domcontentloaded' });
        await expect(screen.getByRole('alert')).toContainText('Review history could not be loaded.');
        await expect(screen.locator('[data-result-student]')).toHaveCount(3);
        await expect(score(screen, zero)).toBeEnabled();
        await expect(score(screen, zero)).toHaveValue('1');
        await expect(screen.getByText('0 students with intended changes.', { exact: true })).toBeVisible();
      } finally {
        await screen.unroute(match, fail);
        await screen.close();
      }
    },
  );
  await check(
    'Family accounts receive staff-only denial without editor requests or private result data',
    async () => {
      for (const value of [family, learner]) {
        const screen = await value.newPage();
        let editorRequests = 0;
        screen.on('request', (request) => {
          if (new URL(request.url()).pathname.startsWith(endpoint(assessment.id))) editorRequests++;
        });
        await screen.goto(base.origin + '/assessments/' + assessment.id, { waitUntil: 'domcontentloaded' });
        await expect(screen.getByRole('alert')).toContainText(
          'Assessment result review is available to authorised school staff.',
        );
        await expect(screen.locator('[data-result-student]')).toHaveCount(0);
        assert.equal(editorRequests, 0);
        await api(value, endpoint(assessment.id), 'GET', undefined, 403);
        await screen.close();
      }
    },
  );
  await check('Unassigned staff and anonymous users cannot see the private roster', async () => {
    const screen = await other.newPage();
    await screen.goto(base.origin + '/assessments/' + assessment.id, { waitUntil: 'domcontentloaded' });
    await expect(screen.getByRole('alert')).toContainText(
      'This assessment or review history is unavailable in your current school or teaching scope.',
    );
    await expect(screen.locator('[data-result-student]')).toHaveCount(0);
    await screen.close();
    const anonymous = await context(null),
      signedOut = await anonymous.newPage();
    await signedOut.goto(base.origin + '/assessments/' + assessment.id, { waitUntil: 'domcontentloaded' });
    await expect(signedOut).toHaveURL(base.origin + '/login');
    await expect(signedOut.locator('[data-result-student]')).toHaveCount(0);
    await signedOut.close();
  });
  await check(
    'Actual 101-review history displays exactly 100 immutable records and discloses the total',
    async () => {
      const capped = await api(
        teacher,
        '/api/assessments',
        'POST',
        { classId: classroom.id, title: 'Synthetic history cap ' + suffix, kind: 'quiz', maxScore: 10, date },
        201,
      );
      for (let index = 0; index < 101; index++)
        await manualReview(
          teacher,
          capped.id,
          [{ studentId: zero.id, score: index % 2 }],
          reason + ' capped history ' + index,
        );
      await open(page, capped.id);
      await expect(
        page.getByRole('status').filter({ hasText: 'Showing 100 of 101 saved reviews (limit 100).' }),
      ).toBeVisible();
      await expect(page.locator('[data-result-review]')).toHaveCount(100);
      const actual = await api(teacher, endpoint(capped.id) + '/history');
      assert.equal(actual.total, 101);
      assert.equal(actual.items.length, 100);
      assert.equal(actual.truncated, true);
    },
  );
  await open(page, assessment.id);
  await check('Desktop editor has labelled controls, raw exact date and one scoped main', async () => {
    await labelsAndWidth(page);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByText('Stored assessment date: ' + date, { exact: true })).toBeVisible();
  });
  await shot(page, 'desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await check('390px saved text/history wrap and native controls support keyboard focus', async () => {
    await labelsAndWidth(page);
    await score(page, blank).focus();
    await expect(score(page, blank)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(grade(page, blank)).toBeFocused();
    const link = page.getByRole('link', { name: 'Assessments', exact: true }).last();
    await link.focus();
    await expect(link).toBeFocused();
  });
  await shot(page, 'mobile');
  await check(
    'Native assessment link opens the actual permitted list without client-transition failure',
    async () => {
      await page.getByRole('link', { name: 'Assessments', exact: true }).last().click();
      await expect(page).toHaveURL(base.origin + '/assessments');
      await expect(page.getByRole('heading', { name: 'Assessments', exact: true, level: 1 })).toBeVisible();
    },
  );
  const maximumCell = (id) =>
    page
      .locator('[data-assessment-list-item=' + JSON.stringify(id) + ']')
      .getByRole('cell')
      .nth(3);
  await check('Assessment list retains legitimate numeric zero and normal positive maximum', async () => {
    await expect(page.getByLabel('Filter by Class', { exact: true })).toBeEnabled();
    await expect(maximumCell(zeroMaximum.id)).toHaveText('0');
    await expect(maximumCell(assessment.id)).toHaveText('10');
  });
  await check(
    'Assessment list replaces unsafe legacy INTEGER maximum with explicit review status',
    async () => {
      const cell = maximumCell('assessment-review-unsafe-max-assessment');
      await expect(cell.getByRole('status')).toHaveText('Stored maximum requires review.');
      await expect(cell).not.toContainText('9007199254740992');
    },
  );
  await check(
    'Assessment list replaces nonfinite legacy REAL maximum with explicit review status',
    async () => {
      await expect(maximumCell('assessment-review-nonfinite-max-assessment').getByRole('status')).toHaveText(
        'Stored maximum requires review.',
      );
    },
  );
  await check(
    'Assessment list replaces malformed legacy TEXT maximum with explicit review status',
    async () => {
      await expect(maximumCell('assessment-review-invalid-max-assessment').getByRole('status')).toHaveText(
        'Stored maximum requires review.',
      );
    },
  );
  await check('Observed browser assets succeed and every request remains local', async () => {
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(externalRequests, []);
    assert.deepEqual(failedResources, []);
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
    priorDiagnostic: {
      executedAt: '2026-10-05T10:11:25.907Z',
      outcome:
        'Before the coordinated fix, editor200/history403 left one private roster row and enabled score/reason controls. This read-only injection is separate diagnostic evidence and contributes zero passing credit.',
    },
    limits: [
      'Final built localhost Worker and fully migrated synthetic data only.',
      'Rejected/uncertain acknowledgements, history denial/failure and failed refreshes are explicitly local delivery injections; stale expected metadata is a named loaded-source injection, not a server metadata mutation.',
      'Real legacy feedback changes, exact UUID replay after later legacy save, current/historical duplicate preservation and storage-type repair are exercised.',
      'Suffix-only normal fixtures plus dedicated malformed/long legacy fixtures were reviewed; base actor/profile/enrolment states were unchanged.',
      'Adapted to the assessment-detail page: a known save is separated from failed current reads, private views stay hidden until a fresh original-actor read, original request bytes/UUID are replayed only by the original actor, and explicit discard is verified to send zero POST requests without claiming cancellation or confirmation.',
      'No providers, external messages, grading policy, accessibility certification, hosted deployment or UAT acceptance were exercised.',
    ],
  };
  writeFileSync(
    join(outputDir, 'saha-assessment-review-ui-results.json'),
    JSON.stringify(result, null, 2) + '\n',
  );
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
  const result = {
    executedAt: new Date().toISOString(),
    passed,
    failed: 1,
    skipped: 0,
    externalRequests: externalRequests.length,
    pageErrors: pageErrors.length,
    checks,
    screenshots,
    failure: error instanceof Error ? error.message : String(error),
  };
  writeFileSync(
    join(outputDir, 'saha-assessment-review-ui-results.json'),
    JSON.stringify(result, null, 2) + '\n',
  );
  for (const value of contexts)
    for (const page of value.pages())
      if (page.url().startsWith(base.origin))
        console.error(
          'Local screen: ' +
            new URL(page.url()).pathname +
            '\n' +
            (await page.locator('body').innerText()).slice(0, 1600),
        );
  console.log(
    JSON.stringify({
      passed,
      failed: 1,
      externalRequests: externalRequests.length,
      pageErrors: pageErrors.length,
    }),
  );
  throw error;
} finally {
  for (const value of contexts) await value.close();
  await browser.close();
}
