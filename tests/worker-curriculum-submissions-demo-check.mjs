// A real browser journey over an isolated built Worker for the curriculum reference library (FR-22) and
// learner submission and feedback (FR-24). Synthetic sessions only; every non-local request is blocked and counted.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';
const origin = process.env.SAHA_WORKER_TEST_URL;
const fixture = process.env.SAHA_WORKER_SESSION_FIXTURE;
const executablePath = process.env.SAHA_TEST_BROWSER;
const outputDir = process.env.SAHA_TEST_OUTPUT_DIR;
if (!origin || !fixture || !executablePath || !['localhost', '127.0.0.1'].includes(new URL(origin).hostname))
  throw new Error('Local origin, synthetic sessions and browser executable required.');
if (outputDir) mkdirSync(outputDir, { recursive: true });
const sessions = JSON.parse(readFileSync(fixture, 'utf8'));
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--disable-background-networking'],
});
let passed = 0;
const names = [];
const check = async (name, action) => {
  await action();
  passed++;
  names.push(name);
  console.log('ok - ' + name);
};
const external = [],
  pageErrors = [],
  consoleErrors = [],
  failedLoads = [];
const contexts = [];
async function context(user, width = 1200, height = 900) {
  const value = await browser.newContext({
    viewport: { width, height },
    extraHTTPHeaders: { cookie: sessions[user] },
  });
  await value.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === new URL(origin).origin) return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  contexts.push(value);
  return value;
}
async function open(ctx, label) {
  const page = await ctx.newPage();
  page.on('pageerror', (error) => pageErrors.push(label + ': ' + error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    (/Failed to load resource/.test(message.text()) ? failedLoads : consoleErrors).push(
      label + ': ' + message.text(),
    );
  });
  return page;
}
const headers = { origin: new URL(origin).origin, 'content-type': 'application/json' };
async function api(ctx, method, path, body) {
  const response = await ctx.request.fetch(origin + path, {
    method,
    headers: method === 'GET' ? undefined : headers,
    data: body === undefined ? undefined : JSON.stringify(body),
    timeout: 20000,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: response.status(), json, text };
}
const shot = async (page, name) => {
  if (outputDir) await page.screenshot({ path: join(outputDir, name + '.png'), fullPage: true });
};
const unique = crypto.randomUUID().slice(0, 8);
const fractions = {
  title: 'Browser fractions reference ' + unique,
  curriculum: 'Synthetic pilot framework',
  gradeLevel: '8',
  subject: 'Mathematics',
  language: 'en-IN',
  objectives: 'Describe equal parts of a whole.',
  body: 'A whole can be split into equal parts. Each part is a fraction of the whole.',
  rightsStatement:
    'Original synthetic text written for this demonstration; no third-party material is included.',
};
const plants = {
  title: 'Browser plants reference ' + unique,
  curriculum: 'Synthetic pilot framework',
  gradeLevel: '6',
  subject: 'Science',
  language: 'hi',
  objectives: 'Name the parts of a plant.',
  body: 'A plant has roots, a stem and leaves.',
  rightsStatement: 'Original synthetic text written for this demonstration only.',
};
const labels = {
  title: 'Reference title',
  curriculum: 'Curriculum or framework',
  gradeLevel: 'Grade or level',
  subject: 'Subject',
  language: 'Language tag',
  objectives: 'Learning objectives',
  body: 'Reference text',
  rightsStatement: 'Rights and permission statement',
};
const firstResponse = 'BROWSER_FIRST_RESPONSE: one half is two equal parts of a whole.';
const secondResponse = 'BROWSER_SECOND_RESPONSE: a quarter is one of four equal parts.';
const peerResponse = 'BROWSER_PEER_PRIVATE_RESPONSE: my own words.';
const firstFeedback = 'BROWSER_FEEDBACK_ONE: good start, name the whole you are splitting.';
const secondFeedback = 'BROWSER_FEEDBACK_TWO: clear and complete.';
async function noOverflow(page, name) {
  const result = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
  }));
  assert.ok(result.scroll <= result.inner + 1, name + ' overflows horizontally: ' + JSON.stringify(result));
}
async function allControlsNamed(page, name) {
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll('input:not([type=hidden]),select,textarea')]
      .filter(
        (element) =>
          element.getClientRects().length > 0 &&
          !(element.labels && element.labels.length) &&
          !element.getAttribute('aria-label') &&
          !element.getAttribute('aria-labelledby'),
      )
      .map((element) => element.outerHTML.slice(0, 80)),
  );
  assert.deepEqual(unnamed, [], name + ' has unlabelled controls');
}
let teacher, other, student, peer, guardian, foreign;
try {
  teacher = await context('teacher-a');
  const page = await open(teacher, 'teacher');
  await page.goto(origin + '/curriculum');
  async function createReference(content) {
    for (const [key, label] of Object.entries(labels))
      await page.getByLabel(label, { exact: false }).fill(content[key]);
    await page.getByRole('button', { name: 'Save private reference draft', exact: true }).click();
    await expect(
      page.getByText('Reference saved as a private draft.', { exact: false }).first(),
    ).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Curriculum references', exact: true })).toBeVisible();
  await check('FR-22 staff create two private reference drafts with declared rights', async () => {
    await createReference(fractions);
    await createReference(plants);
    await expect(page.getByRole('link', { name: fractions.title, exact: true })).toBeVisible();
    await expect(
      page
        .getByText('Rights as declared by the author (not independently verified)', { exact: false })
        .first(),
    ).toBeVisible();
    await expect(page.getByText('Author: teacher-a', { exact: false }).first()).toBeVisible();
  });
  const search = page.getByRole('search', { name: 'Find references in the library' });
  await check('FR-22 library search and filters narrow the list and clear again', async () => {
    await expect(page.getByText('2 references shown.', { exact: false })).toBeVisible();
    await search.getByLabel('Search the library').fill('roots');
    await search.getByRole('button', { name: 'Apply filters', exact: true }).click();
    await expect(page.getByText('1 reference shown.', { exact: false })).toBeVisible();
    await expect(page.getByRole('link', { name: plants.title, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: fractions.title, exact: true })).toHaveCount(0);
    await search.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(page.getByText('2 references shown.', { exact: false })).toBeVisible();
    await search.getByLabel('Area of study').selectOption('Mathematics');
    await search.getByRole('button', { name: 'Apply filters', exact: true }).click();
    await expect(page.getByText('1 reference shown.', { exact: false })).toBeVisible();
    await expect(page.getByRole('link', { name: fractions.title, exact: true })).toBeVisible();
    await search.getByLabel('Search the library').fill('no such words anywhere xyz');
    await search.getByRole('button', { name: 'Apply filters', exact: true }).click();
    await expect(page.getByText('No references match these filters.', { exact: false })).toBeVisible();
    await search.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(page.getByText('2 references shown.', { exact: false })).toBeVisible();
    await shot(page, 'curriculum-library-teacher');
  });
  await page.getByRole('link', { name: fractions.title, exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Review a curriculum reference', exact: true }),
  ).toBeVisible();
  const referenceId = decodeURIComponent(new URL(page.url()).pathname.split('/').pop());
  await check(
    'FR-22 reviewer approves the exact saved version; rights shown as declared, not verified',
    async () => {
      await expect(
        page.getByText('Private draft; not available for copying.', { exact: false }),
      ).toBeVisible();
      await expect(page.getByText('still an open decision', { exact: false })).toBeVisible();
      await page.getByRole('checkbox', { name: /I reviewed saved version 1/ }).check();
      await page.getByRole('button', { name: 'Review and approve saved version 1', exact: true }).click();
      await expect(page.getByText('Reviewed by teacher-a on', { exact: false })).toBeVisible();
    },
  );
  let resourceId, assignmentId;
  await check(
    'FR-22 reviewed reference is copied into a provisional teaching draft carrying its source',
    async () => {
      await page.getByLabel('Teaching resource type').selectOption('worksheet');
      await page.getByRole('button', { name: 'Copy reviewed version 1 to a new draft', exact: true }).click();
      const link = page.getByRole('link', { name: 'Open provisional teaching draft', exact: true });
      await expect(link).toBeVisible();
      resourceId = decodeURIComponent((await link.getAttribute('href')).split('/').pop());
      await link.click();
      await expect(page.getByRole('heading', { name: 'Curriculum source', exact: true })).toBeVisible();
      await expect(
        page.getByText('Rights as declared when the source was written (not independently verified)', {
          exact: false,
        }),
      ).toBeVisible();
      await expect(page.getByText('reference version 1', { exact: false }).first()).toBeVisible();
      await shot(page, 'resource-curriculum-source');
    },
  );
  await check(
    'FR-22 the copy is reviewed and assigned separately, then the library shows where it is used',
    async () => {
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: 'Approve version 1', exact: true }).click();
      await expect(page.getByRole('link', { name: 'Print approved version 1', exact: true })).toBeVisible();
      await page.getByLabel('Assign this approved version to a class').selectOption('class-a');
      await page.getByRole('button', { name: 'Assign version 1', exact: true }).click();
      await expect(page.getByText('assigned to the selected class', { exact: false })).toBeVisible();
      await page.goto(origin + '/curriculum/' + encodeURIComponent(referenceId));
      await expect(
        page.getByRole('heading', { name: 'Where this reference is used', exact: true }),
      ).toBeVisible();
      await expect(page.getByText('Assigned to class-a', { exact: false })).toBeVisible();
      await expect(page.getByText('copied from reviewed version 1', { exact: false })).toBeVisible();
      await shot(page, 'curriculum-usage');
    },
  );
  const assignments = await api(teacher, 'GET', '/api/resource-assignments');
  assignmentId = assignments.json.find((item) => item.resource?.title?.includes('Browser fractions'))?.id;
  await check('The synthetic class assignment exists for the learner journeys', async () =>
    assert.ok(assignmentId, 'assignment id found'),
  );

  other = await context('teacher-other');
  const otherPage = await open(other, 'other-teacher');
  await check(
    'FR-22 a retired reference leaves peer lists and cannot be opened by peers; existing copy keeps its source',
    async () => {
      await page
        .getByLabel('Why is this reference being retired?', { exact: false })
        .fill('Replaced by the revised school scheme.');
      await page.getByRole('checkbox', { name: /stops new copies/ }).check();
      await page.getByRole('button', { name: 'Retire this reference', exact: true }).click();
      await expect(page.getByText('Reference retired.', { exact: false })).toBeVisible();
      await expect(page.getByText('This reference is retired', { exact: false }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /Copy reviewed version/ })).toHaveCount(0);
      await expect(page.getByText('Retired', { exact: false }).first()).toBeVisible();
      await otherPage.goto(origin + '/curriculum');
      await expect(otherPage.getByText('0 references shown.', { exact: false })).toBeVisible();
      assert.equal(
        (await api(other, 'GET', '/api/curriculum/' + encodeURIComponent(referenceId))).status,
        404,
      );
      assert.equal(
        (
          await api(other, 'POST', '/api/curriculum/' + encodeURIComponent(referenceId) + '/draft', {
            versionId: 'x',
            type: 'lesson',
            clientResourceId: crypto.randomUUID(),
          })
        ).status >= 400,
        true,
      );
      await page.goto(origin + '/resources/' + encodeURIComponent(resourceId));
      await expect(page.getByText('This reference has since been retired', { exact: false })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Curriculum source', exact: true })).toBeVisible();
      await shot(page, 'resource-retired-source');
    },
  );
  await check(
    'FR-22 reinstatement is reasoned, recorded in history and restores reviewed visibility to peers',
    async () => {
      await page.goto(origin + '/curriculum/' + encodeURIComponent(referenceId));
      await page
        .getByLabel('Why is this reference being reinstated?', { exact: false })
        .fill('Scheme confirmed again by the department.');
      await page.getByRole('checkbox', { name: /available to school staff again/ }).check();
      await page.getByRole('button', { name: 'Reinstate this reference', exact: true }).click();
      await expect(page.getByText('Reference reinstated.', { exact: false })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Availability history', exact: true })).toBeVisible();
      await expect(page.getByText('Replaced by the revised school scheme.', { exact: true })).toBeVisible();
      await otherPage.goto(origin + '/curriculum');
      await expect(otherPage.getByRole('link', { name: fractions.title, exact: true })).toBeVisible();
      await expect(otherPage.getByRole('link', { name: plants.title, exact: true })).toHaveCount(0);
      await otherPage.getByRole('link', { name: fractions.title, exact: true }).click();
      await expect(
        otherPage.getByText('Showing teaching drafts you created from this reference.', { exact: false }),
      ).toBeVisible();
      await expect(
        otherPage.getByText('No teaching drafts have been created', { exact: false }),
      ).toBeVisible();
      await expect(otherPage.getByRole('heading', { name: 'Availability', exact: true })).toHaveCount(0);
      assert.equal(
        (await api(other, 'GET', '/api/resources/' + encodeURIComponent(resourceId) + '/source')).status,
        404,
      );
    },
  );

  student = await context('student-user-a');
  const learner = await open(student, 'learner');
  await learner.goto(origin + '/submissions');
  await check(
    'FR-24 learner sees the assignment under To do with window and informational due-date text',
    async () => {
      await expect(
        learner.getByRole('heading', { name: 'Submissions and feedback', exact: true }),
      ).toBeVisible();
      await expect(learner.getByRole('heading', { name: 'To do (1)', exact: true })).toBeVisible();
      await expect(learner.getByText('No response saved yet.', { exact: false })).toBeVisible();
      await expect(learner.getByText('Open for new responses.', { exact: false })).toBeVisible();
      await shot(learner, 'learner-submissions-todo');
    },
  );
  await learner.getByRole('link', { name: /Browser fractions/ }).click();
  await check('FR-24 learner submits a text response; files are stated to be out of scope', async () => {
    await expect(learner.getByText('File attachments are not supported', { exact: false })).toBeVisible();
    await learner.getByRole('textbox', { name: /Your response/ }).fill(firstResponse);
    await learner.getByRole('button', { name: 'Save response attempt 1', exact: true }).click();
    await expect(learner.getByText('Original save confirmed', { exact: false }).first()).toBeVisible();
    await expect(learner.getByText('You have not submitted a response yet.', { exact: false })).toHaveCount(
      0,
    );
  });
  await check(
    'FR-24 exact retry returns the original attempt; a changed retry conflicts; nothing duplicates',
    async () => {
      const list = await api(student, 'GET', `/api/assignments/${assignmentId}/submissions`);
      assert.equal(list.json.length, 1);
      const attempt = list.json[0];
      const same = await api(student, 'POST', `/api/assignments/${assignmentId}/submissions`, {
        response: firstResponse,
        expectedAttempt: 0,
        clientSubmissionId: attempt.id,
      });
      assert.ok([200, 201].includes(same.status), 'exact retry status ' + same.status);
      assert.equal(same.json.id, attempt.id);
      const changed = await api(student, 'POST', `/api/assignments/${assignmentId}/submissions`, {
        response: firstResponse + ' changed',
        expectedAttempt: 0,
        clientSubmissionId: attempt.id,
      });
      assert.equal(changed.status, 409);
      const stale = await api(student, 'POST', `/api/assignments/${assignmentId}/submissions`, {
        response: 'Stale second try',
        expectedAttempt: 0,
        clientSubmissionId: crypto.randomUUID(),
      });
      assert.equal(stale.status, 409);
      assert.equal(
        (await api(student, 'GET', `/api/assignments/${assignmentId}/submissions`)).json.length,
        1,
      );
    },
  );
  await learner.goto(origin + '/submissions');
  await check('FR-24 learner status moves to Waiting for feedback', async () => {
    await expect(
      learner.getByRole('heading', { name: 'Waiting for feedback (1)', exact: true }),
    ).toBeVisible();
    await expect(learner.getByRole('heading', { name: 'To do (0)', exact: true })).toBeVisible();
    await expect(learner.getByText('1 response saved.', { exact: false })).toBeVisible();
  });

  peer = await context('student-user-peer');
  const peerPage = await open(peer, 'peer');
  guardian = await context('guardian-a');
  const family = await open(guardian, 'guardian');
  foreign = await context('teacher-b');
  await check(
    'FR-24 no cross-learner, guardian or cross-school leakage of responses or progress',
    async () => {
      await peerPage.goto(origin + '/assignments/' + encodeURIComponent(assignmentId));
      await expect(
        peerPage.getByText('You have not submitted a response yet.', { exact: false }),
      ).toBeVisible();
      assert.equal((await peerPage.locator('body').innerText()).includes('BROWSER_FIRST_RESPONSE'), false);
      const mine = await api(peer, 'GET', `/api/assignments/${assignmentId}/submissions`);
      assert.deepEqual(mine.json, []);
      const attempt = (await api(student, 'GET', `/api/assignments/${assignmentId}/submissions`)).json[0];
      assert.ok(
        [403, 404].includes((await api(peer, 'GET', `/api/assignments/${assignmentId}/progress`)).status),
      );
      const overview = await api(peer, 'GET', '/api/assignment-progress');
      assert.equal(overview.json.role, 'student');
      assert.equal(JSON.stringify(overview.json).includes('student-a'), false);
      await family.goto(origin + '/submissions');
      await expect(family.getByText('Guardian access is not available yet.', { exact: false })).toBeVisible();
      assert.equal((await api(guardian, 'GET', '/api/assignment-progress')).status, 403);
      assert.ok((await api(guardian, 'GET', `/api/assignments/${assignmentId}/submissions`)).status >= 400);
      assert.equal((await api(foreign, 'GET', `/api/assignments/${assignmentId}/progress`)).status, 404);
      assert.equal((await api(other, 'GET', `/api/assignments/${assignmentId}/progress`)).status, 404);
      const feedbackTry = await api(
        peer,
        'POST',
        `/api/assignments/${assignmentId}/submissions/${attempt.id}/feedback`,
        {
          feedback: 'Peer should not review.',
          reviewed: true,
          expectedRevision: 0,
          clientFeedbackId: crypto.randomUUID(),
        },
      );
      assert.ok([403, 404].includes(feedbackTry.status), 'peer feedback status ' + feedbackTry.status);
    },
  );

  await page.goto(origin + '/assignments/' + encodeURIComponent(assignmentId));
  await check('FR-24 teacher reviews the saved response and publishes reviewed feedback', async () => {
    await expect(page.getByText(firstResponse, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /student-a Synthetic/ }).first()).toBeVisible();
    await page.getByRole('textbox', { name: /ormative feedback/ }).fill(firstFeedback);
    await page.getByRole('checkbox', { name: /I reviewed this feedback/ }).check();
    await page.getByRole('button', { name: 'Save reviewed feedback revision 1', exact: true }).click();
    await expect(page.getByText('Original save confirmed', { exact: false }).first()).toBeVisible();
  });
  await learner.goto(origin + '/assignments/' + encodeURIComponent(assignmentId));
  await check('FR-24 learner sees the reviewed feedback and the status Feedback received', async () => {
    await expect(learner.getByText(firstFeedback, { exact: true })).toBeVisible();
    await learner.goto(origin + '/submissions');
    await expect(learner.getByRole('heading', { name: 'Feedback received (1)', exact: true })).toBeVisible();
    await peerPage.goto(origin + '/assignments/' + encodeURIComponent(assignmentId));
    await expect(
      peerPage.getByText('You have not submitted a response yet.', { exact: false }),
    ).toBeVisible();
    assert.equal((await peerPage.locator('body').innerText()).includes('BROWSER_FEEDBACK_ONE'), false);
    await shot(learner, 'learner-feedback-received');
  });
  await check(
    'FR-24 learner resubmits; the earlier attempt and feedback are preserved; status returns to waiting',
    async () => {
      await learner.goto(origin + '/assignments/' + encodeURIComponent(assignmentId));
      await expect(
        learner.getByRole('heading', { name: 'Submit a revised response', exact: true }),
      ).toBeVisible();
      await learner.getByRole('textbox', { name: /Your response/ }).fill(secondResponse);
      await learner.getByRole('button', { name: 'Save response attempt 2', exact: true }).click();
      await expect(learner.getByText('Original save confirmed', { exact: false }).first()).toBeVisible();
      await expect(learner.getByText(firstFeedback, { exact: true })).toBeVisible();
      await expect(learner.getByText(firstResponse, { exact: true })).toBeVisible();
      await learner.goto(origin + '/submissions');
      await expect(
        learner.getByRole('heading', { name: 'Waiting for feedback (1)', exact: true }),
      ).toBeVisible();
    },
  );
  await check('FR-24 staff roster shows each learner status without exposing other classes', async () => {
    await page.goto(origin + '/submissions');
    await expect(page.getByText('1 of 2 students have responded', { exact: false })).toBeVisible();
    await page.getByRole('link', { name: 'Student progress', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Student progress', exact: true })).toBeVisible();
    const row = page.getByRole('row', { name: /student-a Synthetic/ });
    await expect(row).toContainText('Response waiting for feedback');
    await expect(row).toContainText('2');
    await expect(page.getByRole('row', { name: /Peer Learner/ })).toContainText('No response yet');
    await page.getByLabel('Show students').selectOption('not-submitted');
    await expect(page.getByRole('row', { name: /Peer Learner/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /student-a Synthetic/ })).toHaveCount(0);
    await shot(page, 'staff-learner-progress');
  });
  await check('FR-24 feedback on the resubmission is a separate revision on that attempt', async () => {
    await page.goto(origin + '/assignments/' + encodeURIComponent(assignmentId));
    await page.getByLabel('Saved response to review').selectOption({ index: 0 });
    await expect(page.getByText('Saved attempt 2', { exact: false }).first()).toBeVisible();
    await page.getByRole('textbox', { name: /ormative feedback/ }).fill(secondFeedback);
    await page.getByRole('checkbox', { name: /I reviewed this feedback/ }).check();
    await page.getByRole('button', { name: 'Save reviewed feedback revision 1', exact: true }).click();
    await expect(page.getByText('Original save confirmed', { exact: false }).first()).toBeVisible();
    await learner.goto(origin + '/assignments/' + encodeURIComponent(assignmentId));
    await expect(learner.getByText(secondFeedback, { exact: true })).toBeVisible();
    await expect(learner.getByText(firstFeedback, { exact: true })).toBeVisible();
  });

  async function reviewWindow(state, reason) {
    await page.goto(origin + '/assignments/' + encodeURIComponent(assignmentId));
    const form = page.getByRole('form', { name: 'Review submission window' });
    await form.getByRole('combobox', { name: /New response access/ }).selectOption(state);
    await form.getByRole('textbox', { name: /Reason for window change/ }).fill(reason);
    await form.getByRole('checkbox', { name: /I reviewed this change/ }).check();
    await form.getByRole('button', { name: 'Save reviewed submission window', exact: true }).click();
  }
  await check(
    'FR-24 closing the window stops new responses but keeps saved history and safe retry',
    async () => {
      await reviewWindow('closed', 'Closing for the term review in this demonstration.');
      await expect(
        page.getByText('Window review revision 1 saved. Responses are currently closed.', { exact: false }),
      ).toBeVisible();
      await peerPage.goto(origin + '/submissions');
      await expect(
        peerPage.getByRole('heading', { name: 'Closed without a response (1)', exact: true }),
      ).toBeVisible();
      await expect(peerPage.getByText('Submissions are closed.', { exact: false })).toBeVisible();
      await peerPage.goto(origin + '/assignments/' + encodeURIComponent(assignmentId));
      await expect(
        peerPage.getByRole('button', { name: 'Save response attempt 1', exact: true }),
      ).toBeDisabled();
      const refused = await api(peer, 'POST', `/api/assignments/${assignmentId}/submissions`, {
        response: peerResponse,
        expectedAttempt: 0,
        clientSubmissionId: crypto.randomUUID(),
      });
      assert.equal(refused.status, 409);
      assert.equal(refused.json?.code, 'submission-window-closed');
      const attempts = (await api(student, 'GET', `/api/assignments/${assignmentId}/submissions`)).json;
      assert.equal(attempts.length, 2);
      const first = attempts.find((item) => item.attempt === 1);
      const replay = await api(student, 'POST', `/api/assignments/${assignmentId}/submissions`, {
        response: firstResponse,
        expectedAttempt: 0,
        clientSubmissionId: first.id,
      });
      assert.ok(
        [200, 201].includes(replay.status) && replay.json.id === first.id,
        'replay after closure returns the original attempt',
      );
      await learner.goto(origin + '/assignments/' + encodeURIComponent(assignmentId));
      await expect(learner.getByText(firstResponse, { exact: true })).toBeVisible();
      await shot(peerPage, 'learner-window-closed');
    },
  );
  await check(
    'FR-24 reopening the window lets the peer learner respond; leakage checks still hold',
    async () => {
      await reviewWindow('open', 'Reopened for learners who missed the first slot.');
      await expect(
        page.getByText('Window review revision 2 saved. Responses are currently open.', { exact: false }),
      ).toBeVisible();
      await peerPage.goto(origin + '/assignments/' + encodeURIComponent(assignmentId));
      await peerPage.getByRole('textbox', { name: /Your response/ }).fill(peerResponse);
      await peerPage.getByRole('button', { name: 'Save response attempt 1', exact: true }).click();
      await expect(peerPage.getByText('Original save confirmed', { exact: false }).first()).toBeVisible();
      await learner.goto(origin + '/assignments/' + encodeURIComponent(assignmentId));
      assert.equal(
        (await learner.locator('body').innerText()).includes('BROWSER_PEER_PRIVATE_RESPONSE'),
        false,
      );
      assert.equal(
        (await api(student, 'GET', `/api/assignments/${assignmentId}/submissions`)).text.includes(
          'BROWSER_PEER_PRIVATE_RESPONSE',
        ),
        false,
      );
      assert.equal((await api(student, 'GET', '/api/assignment-progress')).text.includes('Peer'), false);
      await page.goto(origin + '/assignments/' + encodeURIComponent(assignmentId) + '/progress');
      await expect(page.getByText('2 of 2 enrolled students have responded', { exact: false })).toBeVisible();
      await expect(page.getByRole('row', { name: /Peer Learner/ })).toContainText(
        'Response waiting for feedback',
      );
      await expect(page.getByRole('row', { name: /student-a Synthetic/ })).toContainText(
        'Feedback given on the latest response',
      );
    },
  );
  await check(
    'Guardian visibility is unchanged: no response, feedback or progress is exposed to guardians',
    async () => {
      for (const path of [
        `/api/assignments/${assignmentId}/submissions`,
        `/api/assignments/${assignmentId}/progress`,
        '/api/assignment-progress',
      ]) {
        const reply = await api(guardian, 'GET', path);
        assert.ok(reply.status >= 400 && !reply.text.includes('BROWSER_'), path + ' status ' + reply.status);
      }
    },
  );

  await check(
    'Mobile width 375px: no horizontal overflow and every control has an accessible name',
    async () => {
      const phoneTeacher = await context('teacher-a', 375, 812),
        phoneLearner = await context('student-user-a', 375, 812);
      const staffPage = await open(phoneTeacher, 'phone-teacher'),
        childPage = await open(phoneLearner, 'phone-learner');
      const staffPaths = [
        '/curriculum',
        '/curriculum/' + encodeURIComponent(referenceId),
        '/resources/' + encodeURIComponent(resourceId),
        '/submissions',
        '/assignments/' + encodeURIComponent(assignmentId) + '/progress',
        '/assignments/' + encodeURIComponent(assignmentId),
      ];
      for (const path of staffPaths) {
        await staffPage.goto(origin + path);
        await expect(staffPage.getByRole('heading').first()).toBeVisible();
        await staffPage.waitForLoadState('networkidle');
        await noOverflow(staffPage, path);
        await allControlsNamed(staffPage, path);
      }
      for (const path of ['/submissions', '/assignments/' + encodeURIComponent(assignmentId)]) {
        await childPage.goto(origin + path);
        await expect(childPage.getByRole('heading').first()).toBeVisible();
        await childPage.waitForLoadState('networkidle');
        await noOverflow(childPage, path);
        await allControlsNamed(childPage, path);
      }
      await shot(staffPage, 'phone-assignment-teacher');
      await shot(childPage, 'phone-submissions-learner');
    },
  );
  await check('Offline and clean: zero external requests and zero page errors', async () => {
    assert.deepEqual(external, []);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
  });
  const summary = {
    passed,
    failed: 0,
    skipped: 0,
    externalRequests: external.length,
    pageErrors: pageErrors.length,
    consoleErrors: consoleErrors.length,
    expectedFailedLoads: failedLoads.length,
    checks: names,
  };
  if (outputDir)
    writeFileSync(
      join(outputDir, 'curriculum-submissions-browser.json'),
      JSON.stringify(summary, null, 2) + '\n',
    );
  console.log(JSON.stringify({ passed, failed: 0, skipped: 0 }));
} catch (error) {
  for (const context of contexts)
    for (const open of context.pages()) {
      try {
        console.error(
          'Local screen: ' + open.url() + '\n' + (await open.locator('body').innerText()).slice(0, 1500),
        );
      } catch {
        /* page closed */
      }
    }
  console.error(
    'external=' +
      external.length +
      ' pageErrors=' +
      JSON.stringify(pageErrors) +
      ' consoleErrors=' +
      JSON.stringify(consoleErrors),
  );
  console.log(JSON.stringify({ passed, failed: 1, skipped: 0 }));
  throw error;
} finally {
  for (const value of contexts) await value.close().catch(() => undefined);
  await browser.close();
}
