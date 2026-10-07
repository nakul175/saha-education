// Manual real-browser journeys over an isolated built local Worker, synthetic sessions only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';

const origin = process.env.SAHA_WORKER_TEST_URL, fixture = process.env.SAHA_WORKER_SESSION_FIXTURE, executablePath = process.env.SAHA_TEST_BROWSER;
if (!origin || !fixture || !executablePath) throw new Error('Local origin, synthetic sessions and browser executable are required.');
const base = new URL(origin);
if (!['localhost', '127.0.0.1'].includes(base.hostname) || !['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/') throw new Error('Browser fixture checks only run against localhost.');
const sessions = JSON.parse(readFileSync(fixture, 'utf8'));
const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-background-networking'] });
const contexts = [], pageErrors = [];
let passed = 0, blockedExternalRequests = 0, withdrawn = false;
const check = async (name, action) => { await action(); passed++; console.log('ok - ' + name); };
const suffix = crypto.randomUUID().slice(0, 8), title = 'Browser reference ' + suffix;
const sourceText = 'Synthetic browser reference text. <script>window.SAHA_INJECTED=true</script><img src=x onerror="window.SAHA_INJECTED=true">';
async function context(user) {
  if (typeof sessions[user] !== 'string') throw new Error('Missing required synthetic session: ' + user);
  const value = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { cookie: sessions[user] } });
  contexts.push(value);
  value.on('page', page => page.on('pageerror', error => pageErrors.push(error.message)));
  await value.route('**/*', route => {
    if (new URL(route.request().url()).origin === base.origin) return route.continue();
    blockedExternalRequests++; return route.abort();
  });
  return value;
}
async function api(value, path, method = 'GET', data, expected = 200) {
  let response;
  try { response = await value.request.fetch(new URL(path, base).href, { method, headers: method === 'GET' ? {} : { Origin: base.origin }, ...(data === undefined ? {} : { data }), timeout: 10000 }); }
  catch { throw new Error('Local fixture API request could not complete: ' + path); }
  assert.equal(response.status(), expected, 'Local fixture API status: ' + path);
  return response.json();
}
async function labelsAndOverflow(page) {
  const invalid = await page.locator('main input:not([type=hidden]), main select, main textarea').evaluateAll(items => items.filter(item => !item.labels?.length && !item.getAttribute('aria-label') && !item.getAttribute('aria-labelledby')).length);
  assert.equal(invalid, 0, 'Native form controls have accessible labels');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'Viewport has no horizontal page overflow');
}
let admin;
try {
  admin = await context('admin-a');
  const adminPage = await admin.newPage();
  await adminPage.goto(base.origin + '/admin/users');
  await check('Account page requires explicit provisioning review', async () => { await expect(adminPage.getByRole('heading', { name: 'Reviewed account administration' })).toBeVisible(); await expect(adminPage.getByRole('button', { name: 'Provision reviewed account', exact: true })).toBeDisabled(); });
  const accountName = 'Synthetic browser educator ' + suffix;
  for (const [label, value] of Object.entries({ Name: accountName, Email: 'browser-' + suffix + '@example.invalid', 'Exact trusted identity issuer': 'https://identity.example.invalid', 'Exact provider identity subject': 'browser-subject-' + suffix, 'Reason and review reference': 'Synthetic browser account mapping review.' })) await adminPage.getByLabel(label, { exact: true }).fill(value);
  await adminPage.getByRole('combobox', { name: /^School role/ }).selectOption('teacher');
  await adminPage.getByRole('checkbox', { name: /I checked this person/ }).check();
  await adminPage.getByRole('combobox', { name: /^School role/ }).selectOption('student');
  await check('Changing account role clears the earlier provisioning review', async () => { await expect(adminPage.getByRole('checkbox', { name: /I checked this person/ })).not.toBeChecked(); await expect(adminPage.getByRole('button', { name: 'Provision reviewed account', exact: true })).toBeDisabled(); });
  await adminPage.getByRole('combobox', { name: /^School role/ }).selectOption('teacher');
  await adminPage.getByRole('checkbox', { name: /I checked this person/ }).check();
  await adminPage.getByLabel('Reason and review reference', { exact: false }).fill('Synthetic browser account mapping review updated.');
  await check('Changing provisioning reason clears the earlier confirmation', async () => expect(adminPage.getByRole('checkbox', { name: /I checked this person/ })).not.toBeChecked());
  await adminPage.getByRole('checkbox', { name: /I checked this person/ }).check();
  await adminPage.getByRole('button', { name: 'Provision reviewed account', exact: true }).click();
  await check('Reviewed account provision appears in local inventory', async () => { await expect(adminPage.getByRole('status')).toContainText('Reviewed account saved'); await expect(adminPage.getByRole('heading', { name: accountName, exact: true })).toBeVisible(); });
  await adminPage.getByRole('button', { name: 'Disable access for ' + accountName, exact: true }).click();
  await check('Account disablement requires a separate review', async () => { await expect(adminPage.getByRole('heading', { name: 'Review disablement', exact: true })).toBeVisible(); await expect(adminPage.getByRole('button', { name: 'Disable reviewed account', exact: true })).toBeDisabled(); });
  await adminPage.getByLabel('Reason for this access change', { exact: false }).fill('Synthetic browser reviewed disablement.');
  await adminPage.getByRole('checkbox', { name: /I reviewed this account and confirm this disable/ }).check();
  await adminPage.getByLabel('Reason for this access change', { exact: false }).fill('Synthetic browser reviewed disablement updated.');
  await check('Changing access-review reason requires renewed confirmation', async () => { await expect(adminPage.getByRole('checkbox', { name: /I reviewed this account and confirm this disable/ })).not.toBeChecked(); await expect(adminPage.getByRole('button', { name: 'Disable reviewed account', exact: true })).toBeDisabled(); });
  await adminPage.getByRole('checkbox', { name: /I reviewed this account and confirm this disable/ }).check();
  await adminPage.getByRole('button', { name: 'Disable reviewed account', exact: true }).click();
  await check('Reviewed disablement updates account state', async () => expect(adminPage.getByRole('status')).toContainText('currently disabled'));
  await adminPage.getByRole('button', { name: 'Enable access for ' + accountName, exact: true }).click();
  await adminPage.getByLabel('Reason for this access change', { exact: false }).fill('Synthetic browser reviewed enablement.');
  await adminPage.getByRole('checkbox', { name: /I reviewed this account and confirm this enable/ }).check();
  await adminPage.getByRole('button', { name: 'Enable reviewed account', exact: true }).click();
  await check('Reviewed enablement updates account and preserves reviews', async () => { await expect(adminPage.getByRole('status')).toContainText('currently enabled'); await expect(adminPage.getByRole('heading', { name: 'Recent administration reviews' })).toBeVisible(); });

  const teacher = await context('teacher-a'), page = await teacher.newPage();
  await page.goto(base.origin + '/curriculum');
  await expect(page.getByRole('heading', { name: 'Curriculum references', exact: true })).toBeVisible();
  await check('Curriculum fields support basic keyboard navigation', async () => { await expect(page.getByLabel('Reference title', { exact: false })).toBeEnabled(); await page.getByLabel('Reference title', { exact: false }).focus(); await expect(page.getByLabel('Reference title', { exact: false })).toBeFocused(); await page.keyboard.press('Tab'); await expect(page.getByLabel('Curriculum or framework', { exact: false })).toBeFocused(); });
  const referenceFields = { 'Reference title': title, 'Curriculum or framework': 'Synthetic browser curriculum', 'Grade or level': '8', Subject: 'Mathematics', 'Language tag': 'en-IN', 'Learning objectives': 'Explain equal fractions.', 'Reference text': sourceText, 'Rights and permission statement': 'Original synthetic browser test content; copying within this school permitted.', 'Source reference (optional)': 'BROWSER-' + suffix, 'HTTPS source URL (optional)': 'https://sources.example.invalid/browser-' + suffix };
  for (const [label, value] of Object.entries(referenceFields)) await page.getByLabel(label, { exact: false }).fill(value);
  await page.getByRole('button', { name: 'Save private reference draft', exact: true }).click();
  await check('Curriculum draft saves before review', async () => { await expect(page.getByRole('status')).toContainText('Reference saved'); await page.getByRole('link', { name: 'Open saved reference', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Edit latest reference', exact: true })).toBeVisible(); });
  const curriculumUrl = page.url();
  await check('Reference approval requires exact-version educator confirmation', async () => expect(page.getByRole('button', { name: 'Review and approve saved version 1', exact: true })).toBeDisabled());
  await check('Source HTML renders as escaped text with safe attribution link', async () => {
    await expect(page.locator('article').getByText(sourceText, { exact: true })).toBeVisible();
    assert.equal(await page.locator('article img, article script').count(), 0);
    assert.equal(await page.evaluate(() => window.SAHA_INJECTED === true), false);
    assert.match(await page.getByRole('link', { name: 'Open source attribution URL in a new tab' }).getAttribute('rel'), /noopener/);
    assert.match(await page.getByRole('link', { name: 'Open source attribution URL in a new tab' }).getAttribute('rel'), /noreferrer/);
  });
  await page.getByRole('checkbox', { name: /I reviewed saved version 1 above/ }).check();
  await page.getByRole('button', { name: 'Review and approve saved version 1', exact: true }).click();
  await check('Reviewed reference enables an explicit provisional copy', async () => expect(page.getByRole('button', { name: 'Copy reviewed version 1 to a new draft', exact: true })).toBeVisible());
  await page.getByLabel('Teaching resource type', { exact: false }).selectOption('worksheet');
  await page.getByRole('button', { name: 'Copy reviewed version 1 to a new draft', exact: true }).click();
  await check('Approved source copies without automatic resource approval', async () => { await expect(page.getByRole('status')).toContainText('Provisional worksheet draft created'); await page.getByRole('link', { name: 'Open provisional teaching draft', exact: true }).click(); await expect(page.getByRole('button', { name: 'Approve version 1', exact: true })).toBeDisabled(); });
  const resourceUrl = page.url(), resourceId = new URL(resourceUrl).pathname.split('/').at(-1);
  await page.getByRole('checkbox', { name: /I reviewed this saved version for accuracy/ }).check();
  await page.getByRole('button', { name: 'Approve version 1', exact: true }).click();
  await page.getByLabel('Assign this approved version to a class', { exact: false }).selectOption('class-a');
  await page.getByRole('button', { name: 'Assign version 1', exact: true }).click();
  await check('Teacher separately approves and assigns reviewed teaching content', async () => expect(page.getByRole('status')).toContainText('assigned to the selected class'));
  const feed = await api(teacher, '/api/resource-assignments');
  const assignment = feed.find(item => item.resourceId === resourceId);
  assert.ok(assignment, 'Synthetic browser-created assignment exists');
  await page.getByLabel('Student material', { exact: false }).fill('Later unreviewed browser teaching revision.');
  await page.getByLabel('Teacher notes (staff only)', { exact: false }).fill('BROWSER_PRIVATE_NOTE');
  await page.getByLabel('Answer key (staff only)', { exact: false }).fill('BROWSER_PRIVATE_KEY');
  await page.getByRole('button', { name: 'Save new version', exact: true }).click();
  await check('Later resource revision remains unapproved', async () => expect(page.getByRole('button', { name: 'Approve version 2', exact: true })).toBeDisabled());

  const student = await context('student-user-a'), learner = await student.newPage();
  await learner.goto(base.origin + '/learning');
  await learner.locator('summary').filter({ hasText: title }).click();
  await check('Assigned learning links to the exact response screen', async () => { await learner.locator('details').filter({ hasText: title }).getByRole('link', { name: 'Submit a response and view reviewed feedback', exact: true }).click(); await expect(learner.getByRole('heading', { name: 'Assignment responses and feedback', exact: true })).toBeVisible(); await expect(learner.getByText(sourceText, { exact: true })).toBeVisible(); });
  await check('Learner sees approved assigned version without private staff fields', async () => { assert.equal((await learner.locator('body').innerText()).includes('BROWSER_PRIVATE_'), false); await expect(learner.getByText('Later unreviewed browser teaching revision.', { exact: true })).toHaveCount(0); assert.equal(await learner.evaluate(() => window.SAHA_INJECTED === true), false); });
  const assignmentUrl = learner.url(), submissionsPath = '/api/assignments/' + assignment.id + '/submissions';
  let firstRequestId = null, postRequests = 0, loseRefresh = true;
  await learner.route(base.origin + submissionsPath, async route => {
    if (route.request().method() === 'POST') {
      postRequests++; const input = route.request().postDataJSON();
      if (postRequests === 1) { firstRequestId = input.clientSubmissionId; let committed; try { committed = await route.fetch({ timeout: 10000, headers: await route.request().allHeaders() }); } catch { throw new Error('Synthetic submission could not be confirmed before response-loss injection.'); } assert.equal(committed.status(), 201); await committed.body(); return route.abort('failed'); }
      assert.equal(input.clientSubmissionId, firstRequestId, 'Pending submission retry reuses UUID');
      return route.continue();
    }
    if (postRequests >= 2 && loseRefresh) { loseRefresh = false; return route.abort('failed'); }
    return route.continue();
  });
  await learner.getByRole('textbox', { name: /^Your response/ }).fill('Synthetic browser response: one half has fewer equal parts than one quarter.');
  await learner.getByRole('button', { name: 'Save response attempt 1', exact: true }).click();
  await check('Lost response preserves learner input for a safe retry', async () => { await expect(learner.getByRole('alert')).toContainText('original request is kept exactly as it was'); await expect(learner.getByRole('textbox', { name: /^Your response/ })).toBeDisabled(); await expect(learner.getByRole('textbox', { name: /^Your response/ })).toHaveValue('Synthetic browser response: one half has fewer equal parts than one quarter.'); });
  await learner.getByRole('button', { name: 'Refresh saved history (keep text)', exact: true }).click();
  await expect(learner.getByRole('button', { name: 'Retry pending response', exact: true })).toBeEnabled();
  await learner.getByRole('button', { name: 'Retry pending response', exact: true }).click();
  await check('Confirmed retry saves once and reports refresh failure accurately', async () => { await expect(learner.getByRole('status').filter({ hasText: 'The original save was confirmed.' })).toContainText('Current history could not refresh'); await expect(learner.locator('[data-confirmed-original-save=' + JSON.stringify(firstRequestId) + ']')).toContainText('Response attempt 1'); assert.equal(postRequests, 2); const history = await api(student, submissionsPath); assert.equal(history.length, 1); assert.equal(history[0].id, firstRequestId); });
  await learner.unroute(base.origin + submissionsPath);
  const firstAttempt = (await api(student, submissionsPath))[0];
  await page.goto(assignmentUrl);
  await expect(page.getByLabel('Saved response to review', { exact: false })).toContainText('Attempt 1');
  await page.getByRole('textbox', { name: /^Formative feedback/ }).fill('Explain equal-sized parts more clearly in your next response.');
  await check('Staff feedback requires explicit review of selected attempt', async () => expect(page.getByRole('button', { name: 'Save reviewed feedback revision 1', exact: true })).toBeDisabled());
  await page.getByRole('checkbox', { name: /I reviewed this feedback against/ }).check();
  await page.getByRole('button', { name: 'Save reviewed feedback revision 1', exact: true }).click();
  await check('Reviewed formative feedback saves to the selected attempt', async () => expect(page.locator('[data-confirmed-original-save]')).toContainText('Feedback revision 1 · Response attempt 1'));
  await learner.getByRole('button', { name: 'Refresh saved history (keep text)', exact: true }).click();
  await check('Learner receives educator-reviewed feedback', async () => expect(learner.getByText('Explain equal-sized parts more clearly in your next response.', { exact: true })).toBeVisible());
  await learner.getByRole('textbox', { name: /^Your response/ }).fill('Synthetic revised browser explanation: halves are larger equal parts than quarters.');
  await learner.getByRole('button', { name: 'Save response attempt 2', exact: true }).click();
  await check('Revised learner response appends immutable attempt history', async () => { await expect(learner.locator('[data-confirmed-original-save]')).toContainText('Response attempt 2'); const history = await api(student, submissionsPath); assert.equal(history.length, 2); assert.equal(history.find(item => item.id === firstAttempt.id).feedback.length, 1); assert.equal(history.find(item => item.attempt === 2).feedback.length, 0); });
  await page.getByRole('button', { name: 'Refresh saved history (keep text)', exact: true }).click();
  await page.getByLabel('Saved response to review', { exact: false }).selectOption(firstAttempt.id);
  await page.getByRole('textbox', { name: /^New formative feedback revision/ }).fill('Second reviewed guidance for the earlier saved response only.');
  await page.getByRole('checkbox', { name: /I reviewed this feedback against/ }).check();
  await page.getByRole('button', { name: 'Save reviewed feedback revision 2', exact: true }).click();
  await check('Feedback revisions remain bound to the earlier exact attempt', async () => { await expect(page.locator('[data-confirmed-original-save]')).toContainText('Feedback revision 2 · Response attempt 1'); const history = await api(teacher, submissionsPath); assert.equal(history.find(item => item.id === firstAttempt.id).feedback.length, 2); assert.equal(history.find(item => item.attempt === 2).feedback.length, 0); });
  await page.screenshot({ path: '/tmp/saha-next-ui-desktop.png', fullPage: true });

  const passage = 'BROWSER-READING-' + suffix;
  const readingInput = { classId: 'class-a', studentId: 'student-a', language: 'en-IN', passageReference: passage, readingDate: '2026-10-04', durationSeconds: 60, wordsAttempted: 100, wordsCorrect: 90, clientCheckId: crypto.randomUUID() };
  const reading = await api(teacher, '/api/reading-checks', 'POST', readingInput, 201);
  await api(teacher, '/api/reading-checks', 'POST', { ...readingInput, readingDate: '2026-10-05', wordsCorrect: 92, clientCheckId: crypto.randomUUID() }, 201);
  await page.goto(base.origin + '/reading-review');
  await page.getByLabel('Class', { exact: false }).selectOption('class-a');
  const observation = page.locator('article').filter({ hasText: 'Observation ID ' + reading.id });
  await expect(observation).toBeVisible();
  await observation.getByRole('button', { name: 'Review a correction', exact: true }).click();
  const editor = observation.getByRole('form', { name: 'Append a reviewed correction', exact: true });
  await editor.getByLabel('Reason for correction', { exact: true }).fill('Synthetic browser count transcription review.');
  await editor.getByLabel('Words correct', { exact: true }).fill('101');
  await editor.getByRole('checkbox').check();
  await check('Invalid reading counts cannot be saved', async () => expect(editor.getByRole('button', { name: 'Save reviewed correction', exact: true })).toBeDisabled());
  await editor.getByLabel('Words correct', { exact: true }).fill('94');
  await editor.getByRole('checkbox').check();
  await expect(editor.getByRole('button', { name: 'Save reviewed correction', exact: true })).toBeEnabled();
  await editor.getByLabel('Words correct', { exact: true }).fill('93');
  await check('Changing reading values clears prior review confirmation', async () => { await expect(editor.getByRole('checkbox')).not.toBeChecked(); await expect(editor.getByRole('button', { name: 'Save reviewed correction', exact: true })).toBeDisabled(); });
  await editor.getByLabel('Words correct', { exact: true }).fill('94');
  await editor.getByRole('checkbox').check();
  await editor.getByRole('button', { name: 'Save reviewed correction', exact: true }).click();
  await check('Reviewed correction preserves original and effective numeric evidence', async () => { await expect(page.getByText('Correction saved · revision 1', { exact: true })).toBeVisible(); await expect(observation.getByRole('region', { name: 'Original manually recorded evidence', exact: true }).getByText('90 / 100', { exact: true })).toBeVisible(); await expect(observation.getByRole('region', { name: 'Effective reviewed reading', exact: true }).getByText('94 / 100', { exact: true })).toBeVisible(); });
  await observation.locator('summary').click();
  await check('Reading correction history retains reason and revision', async () => { await expect(observation.getByText('Reason: Synthetic browser count transcription review.', { exact: true })).toBeVisible(); await expect(observation.getByRole('heading', { name: 'Revision 1', exact: true })).toBeVisible(); });
  const comparable = page.getByText('Passage reference: ' + passage, { exact: true }).locator('..');
  await check('Comparable reading table keeps same task and duration points', async () => expect(comparable.locator('tbody tr')).toHaveCount(2));
  withdrawn = true; // Restore even if a committed synthetic withdrawal loses its reply.
  await api(admin, '/api/enrolments', 'PATCH', { id: 'student-a-enrolment', status: 'withdrawn' });
  await page.goto(base.origin + '/reading-review');
  await page.getByLabel('Class', { exact: false }).selectOption('class-a');
  await check('Withdrawn learner remains selectable in authorized reading history', async () => { await expect(page.getByRole('combobox', { name: /^Student/ }).getByRole('option', { name: 'student-a Synthetic (not currently enrolled; retained reading history)', exact: true })).toHaveCount(1); await page.getByRole('combobox', { name: /^Student/ }).selectOption('student-a'); await expect(page.locator('article').filter({ hasText: 'Observation ID ' + reading.id })).toBeVisible(); });
  await api(admin, '/api/enrolments', 'PATCH', { id: 'student-a-enrolment', status: 'active' }); withdrawn = false;

  await page.setViewportSize({ width: 390, height: 844 });
  for (const [url, heading] of [[curriculumUrl, 'Review a curriculum reference'], [assignmentUrl, 'Assignment responses and feedback'], [base.origin + '/reading-review', 'Reading review and history']]) {
    await page.goto(url); await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    if (url.endsWith('/reading-review')) { await page.getByLabel('Class', { exact: false }).selectOption('class-a'); await expect(page.locator('article').first()).toBeVisible(); }
    await check('Mobile native labels and page width: ' + heading, async () => labelsAndOverflow(page));
  }
  await page.screenshot({ path: '/tmp/saha-next-ui-mobile.png', fullPage: true });
  await adminPage.setViewportSize({ width: 390, height: 844 });
  await check('Mobile account administration labels and page width', async () => labelsAndOverflow(adminPage));
  const guardian = await context('guardian-a'), family = await guardian.newPage();
  await family.goto(assignmentUrl);
  await check('Guardian cannot enter raw assignment response UI', async () => { await expect(family.getByText(/Guardian access is not available/)).toBeVisible(); await expect(family.getByRole('textbox')).toHaveCount(0); });
  await learner.goto(base.origin + '/curriculum');
  await check('Learner cannot enter staff curriculum editor', async () => { await expect(learner.getByText(/This library is available to school staff/)).toBeVisible(); await expect(learner.getByRole('button', { name: 'Save private reference draft', exact: true })).toHaveCount(0); });
  await check('Browser application makes no external requests or unhandled page errors', async () => { assert.equal(blockedExternalRequests, 0); assert.deepEqual(pageErrors, []); });
  console.log(JSON.stringify({ passed, failed: 0, skipped: 0, blockedExternalRequests }));
} catch (error) {
  for (const value of contexts) for (const page of value.pages()) console.error('Local screen: ' + new URL(page.url()).pathname + '\n' + (await page.locator('body').innerText()).slice(0, 1500));
  console.log(JSON.stringify({ passed, failed: 1, skipped: 0, blockedExternalRequests }));
  throw error;
} finally {
  if (withdrawn && admin) {
    try { await api(admin, '/api/enrolments', 'PATCH', { id: 'student-a-enrolment', status: 'active' }); }
    catch { console.error('Synthetic enrollment restoration failed; root must restore active status before further checks.'); }
  }
  for (const value of contexts) await value.close();
  await browser.close();
}
