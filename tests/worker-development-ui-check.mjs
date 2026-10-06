// Manual browser checks over a built local Worker. All records and sessions are synthetic.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';

const origin = process.env.SAHA_WORKER_TEST_URL;
const fixture = process.env.SAHA_WORKER_SESSION_FIXTURE;
const executablePath = process.env.SAHA_TEST_BROWSER;
if (!origin || !fixture || !executablePath) throw new Error('A local Worker, synthetic session file and browser executable are required.');
const base = new URL(origin);
if (!['127.0.0.1', 'localhost'].includes(base.hostname) || !['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('Browser checks only run against an exact localhost origin.');
const sessions = JSON.parse(readFileSync(fixture, 'utf8'));
const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-background-networking'] });
const contexts = [], pageErrors = [], externalRequests = [], failedResources = [], checks = [], screenshots = [], deliveryErrors = [];
const mobileFailures = [];
const suffix = crypto.randomUUID().slice(0, 8);
let passed = 0, activeProcedure = 'Synthetic profiles and accounts setup';
const check = async (name, action) => { activeProcedure = name; await action(); assert.deepEqual(deliveryErrors, [], 'Local delivery setup completed'); passed++; checks.push(name); console.log('ok - ' + name); };
async function context(user) {
  if (typeof sessions[user] !== 'string') throw new Error('Missing a required synthetic session.');
  const value = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Kolkata', serviceWorkers: 'block', extraHTTPHeaders: { cookie: sessions[user] } });
  contexts.push(value);
  value.on('page', page => {
    page.on('pageerror', () => pageErrors.push('Unhandled application error occurred'));
    page.on('response', response => {
      if (response.status() >= 400) failedResources.push({ path: new URL(response.url()).pathname, status: response.status(), type: response.request().resourceType() });
    });
    page.on('requestfailed', request => failedResources.push({ path: new URL(request.url()).pathname, failure: 'Local request delivery failed', type: request.resourceType() }));
  });
  await value.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === base.origin) return route.continue();
    externalRequests.push({ origin: url.origin, pathname: url.pathname });
    return route.abort();
  });
  return value;
}
async function api(value, path, method = 'GET', data, expected = 200) {
  const url = new URL(path, base);
  if (url.origin !== base.origin || url.username || url.password) throw new Error('A synthetic API request must remain local.');
  let response;
  try { response = await value.request.fetch(url.href, { method, headers: method === 'GET' ? {} : { Origin: base.origin }, ...(data === undefined ? {} : { data }), timeout: 15000, maxRedirects: 0 }); }
  catch { throw new Error('Local fixture API transport failed: ' + url.pathname); }
  assert.equal(response.status(), expected, 'Local fixture API status: ' + path);
  return response.json();
}
async function labelsAndOverflow(page) {
  const invalid = await page.locator('input:not([type=hidden]), select, textarea').evaluateAll(items => items.filter(item => !item.labels?.length && !item.getAttribute('aria-label') && !item.getAttribute('aria-labelledby')).length);
  assert.equal(invalid, 0, 'Native controls have accessible names');
  const geometry = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, outside: [...document.querySelectorAll('main *, [role=combobox], button')].map(item => ({ tag: item.tagName, text: (item.textContent ?? '').slice(0, 80), right: Math.round(item.getBoundingClientRect().right), width: Math.round(item.getBoundingClientRect().width) })).filter(item => item.right > innerWidth + 1).slice(0, 12) }));
  assert.ok(geometry.scrollWidth <= geometry.width + 1, 'No horizontal page overflow: ' + JSON.stringify(geometry));
}
async function screenshot(page, name) {
  const path = '/private/tmp/saha-development-ui-' + name + '.png';
  await page.screenshot({ path, fullPage: true }); screenshots.push(path);
}
const enrolmentResponse = (response, classId) => new URL(response.url()).pathname === '/api/enrolments' && new URL(response.url()).searchParams.get('classId') === classId && response.request().method() === 'GET';
async function enrolmentsReady(page, classId) {
  await expect(page.getByRole('combobox', { name: 'Select Class', exact: true })).toHaveValue(classId);
  await expect(page.getByRole('status').filter({ hasText: /^Loading current enrolments…$/ })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Select Student', exact: true })).toBeEnabled();
}
async function selectClass(page, classId) {
  activeProcedure = 'Select class and await verified current enrolments';
  const selector = page.getByRole('combobox', { name: 'Select Class', exact: true });
  await expect(selector).toBeEnabled();
  if (await selector.inputValue() !== classId) {
    const delivery = page.waitForResponse(response => enrolmentResponse(response, classId));
    await selector.selectOption(classId); const saved = await delivery; assert.equal(saved.status(), 200); await saved.body();
  }
  await enrolmentsReady(page, classId);
}
// Drain a committed response before dropping its delivery. The next request recovers the same UUID.
async function loseResponse(page, pattern, expected) {
  const payloads = []; let dropped = false;
  const handler = async route => {
    if (route.request().method() !== 'POST') return route.continue();
    payloads.push(route.request().postDataJSON());
    if (dropped) return route.continue();
    try {
      const committed = await route.fetch({ timeout: 15000, maxRedirects: 0, headers: await route.request().allHeaders() });
      assert.equal(committed.status(), expected, 'Response-loss injection only follows a committed save');
      await committed.body(); dropped = true; return route.abort('failed');
    } catch { deliveryErrors.push('Actual response-loss setup could not confirm the expected save'); return route.abort(); }
  };
  await page.route(pattern, handler);
  return { payloads, remove: () => page.unroute(pattern, handler) };
}
let admin, teacher, student;
try {
  admin = await context('admin-a'); teacher = await context('teacher-a'); student = await context('student-user-a');
  const adminPage = await admin.newPage(), page = await teacher.newPage(), learner = await student.newPage();
  const firstName = 'BrowserQA' + suffix, lastName = 'Learner';
  const ownStudent = await api(admin, '/api/students', 'POST', { schoolId: 'a', firstName, lastName, dateOfBirth: '2012-01-01', admissionNumber: 'BROWSER-' + suffix, gradeLevel: '8' }, 201);
  const ownGuardian = await api(admin, '/api/guardians', 'POST', { name: 'Browser guardian ' + suffix, relationship: 'parent' }, 201);
  const provision = async role => (await api(admin, '/api/admin/users', 'POST', { name: 'Browser ' + role + ' ' + suffix, email: role + '-' + suffix + '@example.invalid', role, identityIssuer: 'https://identity.example.invalid', identitySubject: 'browser-' + role + '-' + suffix, clientRequestId: crypto.randomUUID(), reviewConfirmed: true, reason: 'Synthetic exact account review for browser verification.' }, 201)).user;
  const ownAccount = await provision('student'), guardianAccount = await provision('guardian');
  await check('Isolated profiles and accounts begin unlinked', async () => { assert.equal(ownStudent.userId, null); assert.equal(ownGuardian.userId, null); assert.notEqual(ownAccount.id, 'student-user-a'); assert.notEqual(guardianAccount.id, 'guardian-a'); });

  // Controlled enrolment selectors create this script's independent second active learner.
  const classes = await api(admin, '/api/classes');
  const targetClass = classes.find(item => item.id === 'class-a'); assert.ok(targetClass);
  const alternateClass = classes.find(item => item.id !== 'class-a'); assert.ok(alternateClass);
  await adminPage.goto(base.origin + '/enrolments');
  const classSelector = adminPage.getByRole('combobox', { name: 'Select Class', exact: true });
  const studentSelector = adminPage.getByRole('combobox', { name: 'Select Student', exact: true });
  await expect(classSelector).toBeVisible();
  await selectClass(adminPage, targetClass.id);
  await studentSelector.selectOption(ownStudent.id);
  await check('Selecting a learner enables the enrolment action', async () => expect(adminPage.getByRole('button', { name: 'Enrol Student', exact: true })).toBeEnabled());
  await selectClass(adminPage, alternateClass.id);
  await check('Changing class clears the controlled learner selection', async () => { await expect(studentSelector).toHaveValue(''); await expect(adminPage.getByRole('button', { name: 'Enrol Student', exact: true })).toBeDisabled(); });
  await selectClass(adminPage, targetClass.id);
  await studentSelector.selectOption(ownStudent.id);
  await adminPage.getByRole('button', { name: 'Enrol Student', exact: true }).click();
  await check('Confirmed enrolment clears selection and retains an active record', async () => { await enrolmentsReady(adminPage, targetClass.id); await expect(studentSelector).toHaveValue(''); await expect(adminPage.getByRole('heading', { name: firstName + ' ' + lastName, exact: true })).toBeVisible(); assert.equal((await api(admin, '/api/enrolments?classId=class-a')).find(item => item.studentId === ownStudent.id)?.status, 'active'); });
  await check('Enrolment selector can receive keyboard focus', async () => { await studentSelector.focus(); await expect(studentSelector).toBeFocused(); await adminPage.keyboard.press('Tab'); await expect(adminPage.getByRole('button', { name: 'Enrol Student', exact: true })).not.toBeFocused(); });
  // Delay an actual saved class response, then explicitly supersede that load.
  // The current UI hides selectors while loading, so another class can only be
  // selected after an authorized reload restores the choices.
  let releaseClass, classArrived, classSettled, classDelayed = false;
  const classGate = new Promise(resolve => { releaseClass = resolve; }), classArrival = new Promise(resolve => { classArrived = resolve; }), obsoleteClassSettled = new Promise(resolve => { classSettled = resolve; });
  const classDelay = async route => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET' || url.searchParams.get('classId') !== alternateClass.id || classDelayed) return route.continue();
    classDelayed = true;
    try { const response = await route.fetch({ timeout: 15000, maxRedirects: 0 }); assert.equal(response.status(), 200); await response.body(); classArrived(); await classGate; try { await route.fulfill({ response }); } catch { /* An explicit newer reload intentionally aborts this read. */ } }
    catch { deliveryErrors.push('Actual delayed enrolment list could not be captured'); classArrived(); }
    finally { classSettled(); }
  };
  await adminPage.route('**/api/enrolments?*', classDelay);
  try {
    await classSelector.selectOption(alternateClass.id); await classArrival;
    await check('Pending class selection hides the former roster and learner actions', async () => { await expect(classSelector).toHaveCount(0); await expect(studentSelector).toHaveCount(0); await expect(adminPage.getByRole('heading', { name: firstName + ' ' + lastName, exact: true })).toHaveCount(0); await expect(adminPage.getByRole('button', { name: 'Enrol Student', exact: true })).toHaveCount(0); await expect(adminPage.getByRole('status')).toContainText('Loading current enrolments'); });
    const refreshed = adminPage.waitForResponse(response => enrolmentResponse(response, alternateClass.id));
    await adminPage.getByRole('button', { name: 'Reload current enrolments', exact: true }).click(); const response = await refreshed; assert.equal(response.status(), 200); await response.body(); await enrolmentsReady(adminPage, alternateClass.id);
    await selectClass(adminPage, targetClass.id); releaseClass(); await obsoleteClassSettled;
    await check('Superseded class delivery cannot replace the current saved roster', async () => { await expect(classSelector).toHaveValue(targetClass.id); await expect(studentSelector).toHaveValue(''); await expect(adminPage.getByRole('heading', { name: firstName + ' ' + lastName, exact: true })).toBeVisible(); assert.equal((await api(admin, '/api/enrolments?' + new URLSearchParams({ classId: targetClass.id }))).find(item => item.studentId === ownStudent.id)?.status, 'active'); });
  } finally { releaseClass(); await adminPage.unroute('**/api/enrolments?*', classDelay); }
  await check('Desktop enrolment labels and width', async () => labelsAndOverflow(adminPage));

  // Profile ownership review: no fixture account ever participates in a mutation.
  await adminPage.goto(base.origin + '/admin/profile-links');
  await expect(adminPage.getByRole('button', { name: 'Review account link for ' + firstName + ' ' + lastName, exact: true })).toBeVisible();
  await check('Profile inventory labels its bounded scope', async () => expect(adminPage.getByText(/Displaying up to 500 student profiles/)).toBeVisible());
  await adminPage.getByRole('button', { name: 'Review account link for ' + firstName + ' ' + lastName, exact: true }).click();
  const profileReason = adminPage.getByLabel('Reason for this profile link decision', { exact: true });
  const profileReviewed = adminPage.getByRole('checkbox', { name: /I checked this profile and the exact account/ });
  const profileSave = adminPage.getByRole('button', { name: 'Save reviewed profile link', exact: true });
  await check('Profile review moves keyboard focus to its heading', async () => expect(adminPage.getByRole('heading', { name: 'Review profile ownership', exact: true })).toBeFocused());
  await check('An ownership change requires an account and explicit review', async () => expect(profileSave).toBeDisabled());
  await adminPage.getByLabel(/^Exact student account/).selectOption(ownAccount.id);
  await profileReason.fill('Synthetic browser exact ownership review.'); await profileReviewed.check();
  await profileReason.fill('Synthetic browser exact ownership review updated.');
  await check('Editing ownership reason clears the confirmation', async () => { await expect(profileReviewed).not.toBeChecked(); await expect(profileSave).toBeDisabled(); });
  await profileReviewed.check();
  const profileLoss = await loseResponse(adminPage, '**/api/admin/profile-links', 200);
  await profileSave.click();
  await check('Lost ownership acknowledgement retains the form and reason', async () => { await expect(adminPage.getByRole('alert')).toContainText('could not be confirmed'); await expect(profileReason).toHaveValue('Synthetic browser exact ownership review updated.'); await expect(profileReviewed).toBeChecked(); });
  await profileSave.click();
  await check('The exact ownership retry recovers one immutable decision', async () => { await expect(adminPage.getByRole('status')).toContainText('Reviewed decision 1 saved'); assert.equal(profileLoss.payloads.length, 2); assert.deepEqual(profileLoss.payloads[1], profileLoss.payloads[0]); const history = await api(admin, '/api/admin/profile-links/history?profileType=student&profileId=' + ownStudent.id); assert.equal(history.length, 1); assert.equal(history[0].nextUserId, ownAccount.id); });
  await profileLoss.remove();
  await adminPage.getByRole('button', { name: 'Review account link for ' + firstName + ' ' + lastName, exact: true }).click();
  await adminPage.getByLabel(/^Reviewed change/).selectOption('unlink');
  await profileReason.fill('Synthetic browser explicit unlink review.'); await profileReviewed.check();
  await adminPage.getByLabel(/^Reviewed change/).selectOption('link');
  await check('Changing ownership action invalidates the previous review', async () => expect(profileReviewed).not.toBeChecked());
  await adminPage.getByLabel(/^Reviewed change/).selectOption('unlink'); await profileReviewed.check(); await profileSave.click();
  await check('Explicit unlink preserves profile and both review events', async () => { await expect(adminPage.getByRole('status')).toContainText('Reviewed decision 2 saved'); const inventory = await api(admin, '/api/admin/profile-links'); assert.equal(inventory.profiles.find(item => item.profileId === ownStudent.id)?.userId, null); assert.equal((await api(admin, '/api/admin/profile-links/history?profileType=student&profileId=' + ownStudent.id)).length, 2); });
  await adminPage.getByRole('button', { name: 'View history for ' + firstName + ' ' + lastName, exact: true }).click();
  await check('Exact profile history displays link and unlink attribution', async () => { await expect(adminPage.getByRole('heading', { name: 'Review history for ' + firstName + ' ' + lastName, exact: true })).toBeVisible(); await expect(adminPage.getByText('Reason: Synthetic browser explicit unlink review.', { exact: true })).toBeVisible(); await expect(adminPage.getByText('Reason: Synthetic browser exact ownership review updated.', { exact: true })).toBeVisible(); });
  await adminPage.getByLabel(/^Profile type/).selectOption('guardian');
  await adminPage.getByRole('button', { name: 'Review account link for ' + ownGuardian.name, exact: true }).click();
  await adminPage.getByLabel(/^Exact guardian account/).selectOption(guardianAccount.id);
  await profileReason.fill('Synthetic browser guardian ownership review.'); await profileReviewed.check(); await profileSave.click();
  await check('Guardian review uses the explicit role-matched account', async () => { await expect(adminPage.getByRole('status')).toContainText('Reviewed decision 1 saved'); assert.equal((await api(admin, '/api/admin/profile-links')).profiles.find(item => item.profileId === ownGuardian.id)?.userId, guardianAccount.id); assert.equal((await api(admin, '/api/session')).id, 'admin-a'); });
  await check('Desktop profile labels and width', async () => labelsAndOverflow(adminPage));
  await screenshot(adminPage, 'profile-desktop');

  // Imports use the independent active learner, so prior fixture enrolment tests cannot race.
  const sourceLabel = 'Browser source ' + suffix, passageReference = 'Browser passage ' + suffix;
  const envelope = { format: 'saha.reading-results.v1', classId: 'class-a', sourceLabel, sourceReference: 'Browser batch ' + suffix, rows: [{ externalReference: 'result-' + suffix, studentId: ownStudent.id, language: 'en-IN', passageReference, readingDate: new Date().toISOString().slice(0, 10), durationSeconds: 60, wordsAttempted: 100, wordsCorrect: 91 }] };
  await page.goto(base.origin + '/reading-imports'); await expect(page.getByRole('button', { name: 'Validate and stage preview', exact: true })).toBeEnabled();
  await page.getByLabel(/^Authorized class/).selectOption('class-a');
  await check('Authorized roster displays exact independent learner IDs', async () => expect(page.getByText(firstName + ' ' + lastName + ' · studentId: ' + ownStudent.id, { exact: true })).toBeVisible());
  await page.getByLabel(/^Local JSON/).fill(JSON.stringify({ ...envelope, unsupportedUrl: 'https://example.invalid/do-not-fetch' }));
  await page.getByRole('button', { name: 'Validate and stage preview', exact: true }).click();
  await check('Unsupported import fields are rejected locally', async () => expect(page.getByText(/envelope contains unsupported fields/)).toBeVisible());
  await page.getByLabel(/^Local JSON/).fill(JSON.stringify(envelope, null, 2));
  const stageLoss = await loseResponse(page, '**/api/reading-imports', 201);
  await page.getByRole('button', { name: 'Validate and stage preview', exact: true }).click();
  await check('Lost stage acknowledgement explains retained import ID and keeps editable JSON', async () => { const alert = page.getByRole('alert').filter({ hasText: 'Retry the same JSON' }); await expect(alert).toContainText('import ID is retained'); assert.deepEqual(JSON.parse(await page.getByLabel(/^Local JSON/).inputValue()), envelope); });
  await page.getByRole('button', { name: 'Validate and stage preview', exact: true }).click();
  await check('Same import UUID recovers exactly one staged preview', async () => { await expect(page.getByRole('heading', { name: 'Saved import preview · staged', exact: true })).toBeVisible(); assert.equal(stageLoss.payloads.length, 2); assert.deepEqual(stageLoss.payloads[1], stageLoss.payloads[0]); assert.equal((await api(teacher, '/api/reading-imports')).filter(item => item.id === stageLoss.payloads[0].clientImportId).length, 1); assert.equal((await api(teacher, '/api/reading-checks?classId=class-a')).filter(item => item.passageReference === passageReference).length, 0); });
  await stageLoss.remove();
  const importId = stageLoss.payloads[0].clientImportId;
  const importReason = page.getByLabel('Review or rejection reason', { exact: true });
  const importReviewed = page.getByRole('checkbox', { name: /I reviewed the original normalized values/ });
  const confirm = page.getByRole('button', { name: 'Confirm reviewed readings', exact: true });
  await check('Staged normalized metrics remain explicit and require review', async () => { await expect(page.getByText('91 / 100 words correct · 60 seconds · 91 correct words/minute · 91% accuracy', { exact: true })).toBeVisible(); await expect(confirm).toBeDisabled(); });
  await importReason.fill('Synthetic educator reviewed exact normalized reading.'); await importReviewed.check();
  await importReason.fill('Synthetic educator reviewed exact normalized reading updated.');
  await check('Changing import review reason clears its confirmation', async () => { await expect(importReviewed).not.toBeChecked(); await expect(confirm).toBeDisabled(); });
  await importReviewed.check();
  const decisionLoss = await loseResponse(page, '**/api/reading-imports/' + importId + '/decision', 200);
  await confirm.click();
  await check('Uncertain confirmation explains retained decision ID and preserves educator review', async () => { const alert = page.getByRole('alert').filter({ hasText: 'Retry the same decision and reason' }); await expect(alert).toContainText('decision ID is retained'); await expect(importReviewed).toBeChecked(); await expect(importReason).toHaveValue('Synthetic educator reviewed exact normalized reading updated.'); });
  await confirm.click();
  await check('Same decision UUID recovers one observation and receipt', async () => { await expect(page.getByRole('heading', { name: 'Saved import preview · confirmed', exact: true })).toBeVisible(); assert.deepEqual(decisionLoss.payloads[1], decisionLoss.payloads[0]); const saved = await api(teacher, '/api/reading-imports/' + importId); assert.equal(saved.draft.status, 'confirmed'); assert.ok(saved.items[0].receipt?.readingCheckId); assert.equal((await api(teacher, '/api/reading-checks?classId=class-a')).filter(item => item.passageReference === passageReference).length, 1); await expect(page.getByText(/Consumption receipt:/)).toBeVisible(); });
  await decisionLoss.remove();
  const duplicateEnvelope = { ...envelope, sourceReference: 'Duplicate batch ' + suffix };
  await page.getByLabel(/^Local JSON/).fill(JSON.stringify(duplicateEnvelope)); await page.getByRole('button', { name: 'Validate and stage preview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saved import preview · staged', exact: true })).toBeVisible();
  await importReason.fill('Synthetic duplicate source consumption verification.'); await importReviewed.check(); await confirm.click();
  await check('A new draft cannot consume the same source result twice', async () => { await expect(page.getByRole('alert').filter({ hasText: 'already consumed source result' })).toBeVisible(); assert.equal((await api(teacher, '/api/reading-checks?classId=class-a')).filter(item => item.passageReference === passageReference).length, 1); await expect(page.getByRole('heading', { name: 'Saved import preview · staged', exact: true })).toBeVisible(); });
  await page.getByRole('button', { name: 'Reject this draft', exact: true }).click();
  await check('A conflicting duplicate draft can be explicitly rejected', async () => { await expect(page.getByRole('heading', { name: 'Saved import preview · rejected', exact: true })).toBeVisible(); await expect(page.getByText('Reason: Synthetic duplicate source consumption verification.', { exact: true })).toBeVisible(); assert.equal((await api(teacher, '/api/reading-checks?classId=class-a')).filter(item => item.passageReference === passageReference).length, 1); });
  await check('Desktop import labels and width', async () => labelsAndOverflow(page));
  await screenshot(page, 'import-desktop');

  // A separate assessment preserves zero, supplied grade and unchanged records.
  const assessment = await api(admin, '/api/assessments', 'POST', { classId: 'class-a', title: 'Browser assessment ' + suffix, kind: 'quiz', maxScore: 20, date: new Date().toISOString().slice(0, 10) }, 201);
  const resultsPath = '/api/assessments/' + assessment.id + '/results';
  await api(admin, resultsPath, 'POST', { results: [{ studentId: ownStudent.id, score: 0, grade: 'SUPPLIED-ZERO', feedback: 'Initial zero feedback.' }, { studentId: 'student-a', score: 17, grade: 'SUPPLIED-HIGH', feedback: 'Initial nonzero feedback.' }] });
  const roster = (await api(teacher, '/api/classes/class-a')).enrolledStudents;
  const existingStudent = roster.find(item => item.id === 'student-a'); assert.ok(existingStudent, 'Fixture learner must be active during this isolated browser run');
  const ownName = firstName + ' ' + lastName, existingName = existingStudent.firstName + ' ' + existingStudent.lastName;
  const assessmentUrl = base.origin + '/assessments/' + assessment.id;
  await page.goto(assessmentUrl);
  const zero = page.getByLabel('Score for ' + ownName, { exact: true }), nonzero = page.getByLabel('Score for ' + existingName, { exact: true });
  const ownFeedback = page.getByLabel('Feedback for ' + ownName, { exact: true });
  const editorPath = '/api/assessments/' + assessment.id + '/result-editor';
  const saveResults = page.getByRole('button', { name: 'Save reviewed results', exact: true });
  const resultReason = page.getByLabel('Reason for result changes', { exact: true });
  const resultReviewed = page.getByRole('checkbox', { name: 'I reviewed the loaded assessment, saved results and these intended changes.', exact: true });
  await check('Assessment editor hydrates zero and nonzero saved scores', async () => { await expect(zero).toHaveValue('0'); await expect(nonzero).toHaveValue('17'); await expect(ownFeedback).toHaveValue('Initial zero feedback.'); await expect(saveResults).toBeDisabled(); });
  const resultPayloads = [];
  const resultObserver = async route => { if (route.request().method() === 'POST') resultPayloads.push(route.request().postDataJSON()); return route.continue(); };
  await page.route('**' + editorPath, resultObserver);
  await ownFeedback.fill('Edited zero feedback only.'); await resultReason.fill('Synthetic review of feedback-only correction.'); await resultReviewed.check(); await saveResults.click();
  await check('Dirty-only result review preserves zero and supplied grade with exact evidence', async () => { await expect(page.getByRole('status').filter({ hasText: 'Result review saved' })).toBeVisible(); assert.equal(resultPayloads.length, 1); const input = resultPayloads[0]; assert.equal(input.reviewConfirmed, true); assert.equal(input.expectedAssessment.id, assessment.id); assert.equal(input.entries.length, 1); assert.deepEqual({ ...input.entries[0], expectedRecord: undefined }, { studentId: ownStudent.id, score: 0, grade: 'SUPPLIED-ZERO', feedback: 'Edited zero feedback only.', expectedRecord: undefined }); assert.equal(input.entries[0].expectedRecord.score, 0); assert.equal(input.entries[0].expectedRecord.feedback, 'Initial zero feedback.'); const saved = await api(admin, resultsPath); assert.equal(saved.find(item => item.studentId === ownStudent.id)?.grade, 'SUPPLIED-ZERO'); assert.equal(saved.find(item => item.studentId === 'student-a')?.feedback, 'Initial nonzero feedback.'); await expect(saveResults).toBeDisabled(); });
  await page.unroute('**' + editorPath, resultObserver);
  await zero.fill('5'); await ownFeedback.fill('Unsaved conflict feedback remains visible.'); await resultReason.fill('Synthetic rejected conflict review for browser verification.'); await resultReviewed.check();
  const conflictHandler = async route => route.request().method() === 'POST' ? route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic browser conflict' }) }) : route.continue();
  await page.route('**' + editorPath, conflictHandler); await saveResults.click();
  await check('Assessment conflict keeps intended edits and requires current-state comparison', async () => { await expect(page.getByRole('alert')).toContainText('Your intended edits are retained'); await expect(zero).toHaveValue('5'); await expect(ownFeedback).toHaveValue('Unsaved conflict feedback remains visible.'); await expect(saveResults).toBeDisabled(); await expect(page.getByRole('button', { name: 'Reload current results', exact: true })).toBeVisible(); assert.equal((await api(admin, resultsPath)).find(item => item.studentId === ownStudent.id)?.score, 0); });
  await page.unroute('**' + editorPath, conflictHandler);
  await page.getByRole('button', { name: 'Reload current results', exact: true }).click(); await expect(zero).toBeEnabled();
  await check('Assessment fields support keyboard focus through supplied grade and feedback', async () => { await zero.focus(); await expect(zero).toBeFocused(); await page.keyboard.press('Tab'); await expect(page.getByLabel('School-supplied grade for ' + ownName, { exact: true })).toBeFocused(); await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Set no grade for ' + ownName, exact: true })).toBeFocused(); await page.keyboard.press('Tab'); await expect(ownFeedback).toBeFocused(); await expect(resultReviewed).not.toBeChecked(); });
  await check('Desktop assessment labels and width', async () => labelsAndOverflow(page)); await screenshot(page, 'assessment-desktop');

  // Assignment window review does not edit or withdraw any fixture principal.
  const resource = await api(teacher, '/api/resources', 'POST', { content: { title: 'Browser window ' + suffix, type: 'worksheet', curriculum: 'Synthetic browser curriculum', gradeLevel: '8', subject: 'Mathematics', language: 'en-IN', objectives: 'Explain a synthetic example.', body: 'Write one synthetic explanation.', teacherNotes: 'Private synthetic note.', answerKey: 'Private synthetic answer.' } }, 201);
  await api(teacher, '/api/resources/' + resource.id + '/approve', 'POST', { versionId: resource.latest.id });
  const assignment = await api(teacher, '/api/resources/' + resource.id + '/assign', 'POST', { versionId: resource.latest.id, classId: 'class-a', dueDate: '2020-01-01' }, 201);
  const assignmentUrl = base.origin + '/assignments/' + assignment.id, windowPath = '/api/assignments/' + assignment.id + '/submission-window';
  await page.goto(assignmentUrl); await learner.goto(assignmentUrl);
  const windowForm = page.getByRole('form', { name: 'Review submission window', exact: true });
  const windowReason = windowForm.getByLabel('Reason for window change', { exact: true });
  const windowReviewed = windowForm.getByRole('checkbox');
  const windowSave = windowForm.getByRole('button', { name: 'Save reviewed submission window', exact: true });
  const access = windowForm.getByLabel(/^New response access/);
  const responseText = learner.getByLabel(/^Your response/);
  await check('Informational old due date leaves an unconfigured response window open', async () => { await expect(page.getByText('New responses are open.', { exact: true })).toBeVisible(); await expect(learner.getByText(/This date is informational/)).toBeVisible(); assert.equal((await api(student, windowPath)).acceptingSubmissions, true); });
  await responseText.fill('Unsaved response is preserved across window refreshes.');
  await access.selectOption('closed'); await windowReason.fill('Synthetic reviewed immediate closure.'); await windowReviewed.check();
  await windowReason.fill('Synthetic reviewed immediate closure updated.');
  await check('Window reason edits clear the previous review', async () => { await expect(windowReviewed).not.toBeChecked(); await expect(windowSave).toBeDisabled(); });
  await windowReviewed.check(); await windowSave.click();
  await check('Reviewed closure changes current access and appends revision one', async () => { await expect(page.getByRole('status').filter({ hasText: 'Window review revision 1 saved' })).toBeVisible(); assert.equal((await api(teacher, windowPath)).state, 'closed'); });
  await learner.getByRole('button', { name: 'Refresh submission window', exact: true }).click();
  await check('Student refresh reflects closure without deleting unsaved text', async () => { await expect(learner.getByText('New responses are closed.', { exact: true })).toBeVisible(); await expect(responseText).toHaveValue('Unsaved response is preserved across window refreshes.'); await expect(learner.getByRole('button', { name: 'Save response attempt 1', exact: true })).toBeDisabled(); });
  await access.selectOption('open');
  const closingInput = windowForm.getByLabel('Closing time in your device time zone (optional)', { exact: true });
  const deadline = new Date(Date.now() + 30 * 60000); deadline.setSeconds(37, 0);
  const deadlineUtc = deadline.toISOString();
  const deadlineLocal = await page.evaluate(value => new Date(Date.parse(value) - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 19), deadlineUtc);
  await closingInput.fill(deadlineLocal); await windowReason.fill('Synthetic reopened window with local closing time.'); await windowReviewed.check();
  // A real value change must reset the previous review confirmation.
  await closingInput.fill('');
  await check('Window closing-time changes clear prior confirmation', async () => expect(windowReviewed).not.toBeChecked());
  await closingInput.fill(deadlineLocal); const frozenClosingValue = await closingInput.inputValue(); await windowReviewed.check(); await windowSave.click();
  await check('Device-local deadline is saved as the exact UTC instant', async () => { await expect(page.getByRole('status').filter({ hasText: 'Window review revision 2 saved' })).toBeVisible(); const saved = await api(teacher, windowPath); assert.equal(saved.closesAt, deadlineUtc); assert.equal(saved.acceptingSubmissions, true); const localLabel = await page.evaluate(value => new Date(value).toLocaleString(undefined, { timeZoneName: 'short' }), deadlineUtc); await expect(page.getByText('Closing time: ' + localLabel + '.', { exact: true })).toBeVisible(); });
  await learner.getByRole('button', { name: 'Refresh saved history (keep text)', exact: true }).click();
  await check('Reopening restores student submission while keeping its draft', async () => { await expect(learner.getByText('New responses are open.', { exact: true })).toBeVisible(); await expect(responseText).toHaveValue('Unsaved response is preserved across window refreshes.'); await expect(learner.getByRole('button', { name: 'Save response attempt 1', exact: true })).toBeEnabled(); });
  await learner.getByRole('button', { name: 'Save response attempt 1', exact: true }).click();
  await check('An open reviewed window accepts the student response', async () => { await expect(learner.locator('[data-confirmed-original-save]')).toContainText('Response attempt 1'); const history = await api(student, '/api/assignments/' + assignment.id + '/submissions'); assert.equal(history.length, 1); assert.equal(history[0].response, 'Unsaved response is preserved across window refreshes.'); await expect(learner.locator('[data-confirmed-original-save=' + JSON.stringify(history[0].id) + ']')).toBeVisible(); });
  await windowReason.fill('Unsaved staff window reason is kept during refresh.'); await windowReviewed.check();
  await api(teacher, windowPath, 'POST', { clientPolicyId: crypto.randomUUID(), expectedRevision: 2, state: 'open', closesAt: new Date(Date.now() - 60000).toISOString(), reason: 'Synthetic elapsed deadline closes new responses.', reviewConfirmed: true }, 201);
  await page.getByRole('button', { name: 'Refresh submission window', exact: true }).click();
  await check('Refreshing changed window keeps form text and requires another review', async () => { await expect(page.getByText('New responses are closed.', { exact: true })).toBeVisible(); await expect(windowReason).toHaveValue('Unsaved staff window reason is kept during refresh.'); await expect(closingInput).toHaveValue(frozenClosingValue); await expect(windowReviewed).not.toBeChecked(); await expect(windowSave).toBeDisabled(); });
  await responseText.fill('Second unsaved response remains after deadline closure.');
  await learner.getByRole('button', { name: 'Refresh submission window', exact: true }).click();
  await check('Elapsed deadline freezes new student saves and keeps saved history', async () => { await expect(learner.getByText('New responses are closed.', { exact: true })).toBeVisible(); await expect(learner.getByRole('button', { name: 'Save response attempt 2', exact: true })).toBeDisabled(); await expect(responseText).toHaveValue('Second unsaved response remains after deadline closure.'); await expect(learner.locator('[data-submission-attempt]').getByRole('heading', { name: 'Response attempt 1 · Assigned version 1', exact: true })).toBeVisible(); });
  await closingInput.fill(''); await windowReason.fill('Synthetic final reviewed reopening without deadline.'); await windowReviewed.check(); await windowSave.click();
  await check('Staff can reopen the window with an explicit reviewed no-cutoff decision', async () => { await expect(page.getByRole('status').filter({ hasText: 'Window review revision 4 saved' })).toBeVisible(); const saved = await api(teacher, windowPath); assert.equal(saved.state, 'open'); assert.equal(saved.closesAt, null); });
  await page.getByText('Window review history (latest 100)', { exact: true }).click();
  await check('Window history retains all closed, timed and reopened decisions', async () => { const history = await api(teacher, windowPath + '/history'); assert.equal(history.length, 4); for (let revision = 1; revision <= 4; revision++) await expect(page.getByRole('heading', { name: new RegExp('^Window revision ' + revision + ' ·') })).toBeVisible(); });
  await check('Desktop staff window labels and width', async () => labelsAndOverflow(page));
  await check('Desktop student response labels and width', async () => labelsAndOverflow(learner)); await screenshot(page, 'window-desktop');

  // Basic viewport, label and keyboard checks are smoke checks, not accessibility certification.
  for (const [target, url, name, ready] of [
    [adminPage, base.origin + '/admin/profile-links', 'profile-mobile', () => adminPage.getByLabel(/^Profile type/)],
    [page, base.origin + '/reading-imports', 'import-mobile', () => page.getByLabel(/^Local JSON/)],
    [page, assessmentUrl, 'assessment-mobile', () => page.getByLabel('Score for ' + ownName, { exact: true })],
    [page, assignmentUrl, 'window-mobile', () => page.getByRole('form', { name: 'Review submission window', exact: true })],
    [adminPage, base.origin + '/enrolments', 'enrolment-mobile', () => adminPage.getByRole('combobox', { name: 'Select Class', exact: true })],
    [learner, assignmentUrl, 'student-mobile', () => learner.getByLabel(/^Your response/)],
  ]) {
    await target.setViewportSize({ width: 390, height: 844 }); await target.goto(url); await expect(ready()).toBeVisible();
    if (name === 'profile-mobile') {
      await target.getByRole('button', { name: 'Review account link for ' + ownName, exact: true }).click();
      await target.getByLabel(/^Exact student account/).selectOption(ownAccount.id);
      await target.getByLabel('Reason for this profile link decision', { exact: true }).fill('Unsaved synthetic mobile ownership review.');
    }
    if (name === 'import-mobile') {
      await expect(target.getByRole('button', { name: 'Refresh import history', exact: true })).toBeEnabled();
      await target.getByRole('button', { name: sourceLabel + ' · ' + envelope.sourceReference + ' · confirmed', exact: true }).click();
      await expect(target.getByRole('heading', { name: 'Saved import preview · confirmed', exact: true })).toBeVisible();
    }
    if (name === 'enrolment-mobile') { await selectClass(target, targetClass.id); await expect(ready()).toHaveValue(targetClass.id); await expect(target.getByRole('heading', { name: ownName, exact: true })).toBeVisible(); }
    await screenshot(target, name);
    // Inspect every mobile screen; report all failures together without counting failed checks as passes.
    try { await check('Mobile accessible labels and viewport: ' + name, async () => labelsAndOverflow(target)); }
    catch (error) { mobileFailures.push({ screen: name, errorName: error.name }); console.error('Mobile layout failure: ' + JSON.stringify(mobileFailures.at(-1))); }
  }
  await check('Profile filters support native keyboard navigation', async () => { await adminPage.goto(base.origin + '/admin/profile-links'); const type = adminPage.getByLabel(/^Profile type/); await expect(type).toBeVisible(); await type.focus(); await expect(type).toBeFocused(); await adminPage.keyboard.press('Tab'); await expect(adminPage.getByLabel(/^Account link/)).toBeFocused(); });
  await check('Import editor supports native keyboard navigation', async () => { await page.goto(base.origin + '/reading-imports'); const text = page.getByLabel(/^Local JSON/); await expect(text).toBeVisible(); await expect(text).toBeEnabled(); await text.focus(); await expect(text).toBeFocused(); await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Validate and stage preview', exact: true })).toBeFocused(); });
  await check('Built browser scripts and stylesheets load successfully', async () => assert.deepEqual(failedResources.filter(item => ['script', 'stylesheet'].includes(item.type) && item.status >= 400), []));
  assert.deepEqual(mobileFailures, [], 'All tested mobile screens must retain labels and fit the viewport.');
  await check('No browser request left localhost and no unhandled application error occurred', async () => { assert.deepEqual(externalRequests, []); assert.deepEqual(pageErrors, []); });
  const result = { executedAt: new Date().toISOString(), passed, failed: 0, skipped: 0, externalRequests: externalRequests.length, pageErrors: pageErrors.length, checks, screenshots, limits: ['Local built Worker and synthetic data/session evidence only.', 'No provider activation, external vendor verification, deployment or specification acceptance.', 'Label, keyboard and mobile viewport checks are smoke checks, not full accessibility certification.'] };
  writeFileSync('/private/tmp/saha-development-ui-results.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ passed, failed: 0, skipped: 0, externalRequests: externalRequests.length, pageErrors: pageErrors.length }));
} catch (error) {
  const result = { executedAt: new Date().toISOString(), passed, failed: 1, skipped: 0, stopped: true, failure: { procedure: activeProcedure, errorName: error.name }, externalRequests: externalRequests.length, pageErrors: pageErrors.length, checks, screenshots, limits: ['Stopped local synthetic browser run; remaining procedures were not executed.', 'Error messages, transport causes, headers and session values are deliberately excluded.'] };
  writeFileSync('/private/tmp/saha-development-ui-results.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ passed, failed: 1, failure: result.failure, externalRequests: externalRequests.length, pageErrors: pageErrors.length })); process.exitCode = 1;
} finally {
  for (const value of contexts) await value.close();
  await browser.close();
}
