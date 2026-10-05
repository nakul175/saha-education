// Manual mounted-browser procedures for an isolated built localhost Worker.
// Requires the private write-worker-fixture sessions and an existing manually
// reviewed class-a/student-a reading (the specification UI procedure creates it).
// Creates suffix-only original sources/drafts. Reading corrections are appended;
// a final reviewed correction restores the previously effective values.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';

let base, sessions;
const fixture = process.env.SAHA_WORKER_SESSION_FIXTURE, executablePath = process.env.SAHA_TEST_BROWSER;
try {
  base = new URL(process.env.SAHA_WORKER_TEST_URL);
  if (!fixture || !executablePath || !['localhost', '127.0.0.1'].includes(base.hostname) || !['http:', 'https:'].includes(base.protocol) || base.pathname !== '/' || base.search || base.hash || base.username || base.password) throw new Error('Invalid local setup');
  sessions = JSON.parse(readFileSync(fixture, 'utf8'));
  for (const actor of ['teacher-a', 'admin-a', 'guardian-a', 'student-user-a']) if (typeof sessions[actor] !== 'string' || !/^__Host-saha_session=[^;\s]+$/.test(sessions[actor])) throw new Error('Invalid private synthetic fixture');
} catch { throw new Error('Use an exact localhost Worker origin, private synthetic fixture and local browser executable.'); }

const suffix = crypto.randomUUID().slice(0, 8), sourceTitle = 'Reading practice source ' + suffix;
const sourceBody = 'Original fictional literacy activity ' + suffix + ': read cat and cap carefully, then describe the different final sounds.';
const privateFocus = 'Private teacher planning focus ' + suffix;
const content = { title: sourceTitle, curriculum: 'Fictional local curriculum', gradeLevel: '8', subject: 'Literacy', language: 'en-IN', objectives: 'Practice careful reading of original paired words.', body: sourceBody, rightsStatement: 'Original fictional test content ' + suffix + '; permission declared for this isolated school only.', sourceReference: 'READING-PRACTICE-' + suffix, sourceUrl: null };
const contexts = [], checks = [], screenshots = [], injectionFailures = [];
const knownDrafts = new Set();
const ownedCorrections = new Set();
let browser, teacher, originalReading, originalMetrics, restoreNeeded = false, restorationFailed = false, restorationVerified = false, confirmedOwnedCorrections = 0;
let passed = 0, externalRequests = 0, pageErrors = 0, failedAssets = 0, sourceCount = 0, checkpoint = 'Local browser setup', failureInfo = null, obsoleteSnapshotOutcome = null;
const resultPath = '/private/tmp/saha-reading-practice-ui-results.json';
async function check(name, action) {
  checkpoint = name;
  await action();
  assert.equal(injectionFailures.length, 0, 'Local injection completed');
  passed++; checks.push(name); console.log('ok - ' + name);
}
async function switchActor(context, actor) {
  assert.equal(typeof sessions[actor], 'string', 'Expected private fictional fixture account');
  await context.clearCookies(); await context.setExtraHTTPHeaders({ cookie: sessions[actor] });
}
async function context(actor) {
  const value = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', timezoneId: 'Asia/Kolkata' });
  contexts.push(value); await switchActor(value, actor);
  value.setDefaultTimeout(10000); value.setDefaultNavigationTimeout(20000);
  value.on('page', page => {
    page.on('pageerror', () => { pageErrors++; });
    page.on('response', response => { if (response.status() >= 400 && ['script', 'stylesheet'].includes(response.request().resourceType())) failedAssets++; });
  });
  await value.route('**/*', route => {
    if (new URL(route.request().url()).origin === base.origin) return route.continue();
    externalRequests++; return route.abort();
  });
  return value;
}
async function api(value, path, method = 'GET', data, status = 200) {
  const url = new URL(path, base); assert.equal(url.origin, base.origin, 'Fixture request remains local');
  let response, body;
  try { response = await value.request.fetch(url.href, { method, timeout: 15000, maxRedirects: 0, headers: method === 'GET' ? {} : { Origin: base.origin }, ...(data === undefined ? {} : { data }) }); body = await response.text(); }
  catch { throw new Error('Local fixture transport unavailable'); }
  assert.equal(response.status(), status, 'Expected local API status');
  try { return JSON.parse(body); } catch { throw new Error('Local fixture response is not JSON'); }
}
async function routeFetch(route) {
  assert.equal(new URL(route.request().url()).origin, base.origin, 'Injected request remains local');
  try { return await route.fetch({ timeout: 15000, maxRedirects: 0, headers: await route.request().allHeaders() }); }
  catch { throw new Error('Local injected transport unavailable'); }
}
function guarded(work) {
  return async route => {
    try { return await work(route); }
    catch { injectionFailures.push('Local delivery injection failed'); return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Local delivery injection failed"}' }).catch(() => {}); }
  };
}
// Nested select labels include option text in getByLabel; native accessible names remain exact.
const field = (page, name) => page.getByRole(name === 'Teacher-selected practice focus' ? 'textbox' : 'combobox', { name, exact: true });
const create = page => page.getByRole('button', { name: 'Create provisional practice draft', exact: true });
const reload = page => page.getByRole('button', { name: 'Reload current planner', exact: true });
const confirmation = page => page.getByRole('checkbox', { name: /^I reviewed this observation, my practice focus/ });
const selectedSource = page => page.getByRole('article', { name: 'Current selected reviewed source', exact: true });
const receipt = page => page.getByRole('region', { name: 'Original copied draft receipt', exact: true });
const copyPath = id => '/api/curriculum/' + id + '/draft';
async function ready(page) {
  await expect(page.getByRole('status').filter({ hasText: 'Verifying current staff evidence and sources' })).toHaveCount(0);
  await expect(field(page, 'Class')).toBeVisible(); await expect(reload(page)).toBeEnabled();
}
async function refresh(page) { await reload(page).click(); await ready(page); }
async function prepare(page, reference, versionId, focus = privateFocus) {
  await ready(page);
  await field(page, 'Class').selectOption('class-a'); await ready(page);
  await field(page, 'Reading observation').selectOption(originalReading.original.id);
  await field(page, 'Teacher-selected practice focus').fill(focus);
  await field(page, 'Curriculum reference').selectOption(reference.id); await ready(page);
  if (versionId) { await field(page, 'Exact reviewed version').selectOption(versionId); await ready(page); }
  await expect(selectedSource(page)).toBeVisible();
}
async function copied(page, path) {
  const delivered = page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === 'POST');
  await create(page).click(); const response = await delivered;
  assert.equal(response.status(), 201, 'Actual Worker copy succeeded');
  const body = response.request().postData(), value = await response.json();
  knownDrafts.add(value.resource.id);
  await ready(page); await expect(receipt(page)).toBeVisible();
  return { body, value };
}
async function appendCorrection(metrics, reason) {
  const history = await api(teacher, '/api/reading-review?' + new URLSearchParams({ classId: 'class-a' }));
  const observation = history.observations.find(row => row.original.id === originalReading.original.id);
  assert.ok(observation, 'Existing fictional reading remains authorized');
  const clientCorrectionId = crypto.randomUUID(); ownedCorrections.add(clientCorrectionId); restoreNeeded = true;
  return api(teacher, '/api/reading-checks/' + observation.original.id + '/corrections', 'POST', {
    clientCorrectionId, expectedRevision: observation.revision, confirmReviewed: true, reason,
    language: metrics.language, passageReference: metrics.passageReference, readingDate: metrics.readingDate,
    durationSeconds: metrics.durationSeconds, wordsAttempted: metrics.wordsAttempted, wordsCorrect: metrics.wordsCorrect,
  }, 201);
}
async function geometry(page) {
  assert.equal(await page.locator('main input:not([type=hidden]),main select,main textarea').evaluateAll(items => items.filter(item => !item.labels?.length && !item.getAttribute('aria-label') && !item.getAttribute('aria-labelledby')).length), 0, 'Native controls are labelled');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'No horizontal page overflow');
  assert.equal(await page.locator('main input,main select,main textarea,main button').evaluateAll(items => items.filter(item => { const box = item.getBoundingClientRect(); return box.width && (box.left < -1 || box.right > innerWidth + 1); }).length), 0, 'Native controls fit viewport');
}
async function shot(page, name) {
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  const path = '/private/tmp/saha-reading-practice-ui-' + name + '.png'; await page.screenshot({ path, fullPage: true }); screenshots.push(path);
}
async function frames(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }

try {
  browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-background-networking'] });
  teacher = await context('teacher-a'); const page = await teacher.newPage();
  checkpoint = 'Existing fictional fixture and source setup';
  const history = await api(teacher, '/api/reading-review?' + new URLSearchParams({ classId: 'class-a' }));
  originalReading = history.observations.find(row => row.original.classId === 'class-a' && row.original.studentId === 'student-a' && row.original.provenance === 'manual-reviewed-external' && row.revision > 0)
    ?? history.observations.find(row => row.original.classId === 'class-a' && row.original.studentId === 'student-a' && row.original.provenance === 'manual-reviewed-external');
  if (!originalReading) throw new Error('Run the existing specification UI fixture journey before this procedure');
  originalMetrics = { ...originalReading.effective };
  const alteredCount = originalMetrics.wordsCorrect ? originalMetrics.wordsCorrect - 1 : 1;
  const correction = await appendCorrection({ ...originalMetrics, wordsCorrect: alteredCount }, 'Fictional planner reviewed transcription ' + suffix);
  const reference = await api(teacher, '/api/curriculum', 'POST', { content, clientReferenceId: crypto.randomUUID() }, 201);
  sourceCount++;
  await api(teacher, '/api/curriculum/' + reference.id + '/approve', 'POST', { versionId: reference.latest.id, confirmReview: true });
  const unreviewed = await api(teacher, '/api/curriculum', 'POST', { content: { ...content, title: 'Unreviewed fictional source ' + suffix }, clientReferenceId: crypto.randomUUID() }, 201);
  sourceCount++;
  const otherLanguage = originalMetrics.language === 'hi-IN' ? 'en-IN' : 'hi-IN';
  const mismatched = await api(teacher, '/api/curriculum', 'POST', { content: { ...content, title: 'Other-language fictional source ' + suffix, language: otherLanguage }, clientReferenceId: crypto.randomUUID() }, 201);
  sourceCount++;
  await api(teacher, '/api/curriculum/' + mismatched.id + '/approve', 'POST', { versionId: mismatched.latest.id, confirmReview: true });

  await check('Existing task evidence stays in the authorized fictional class', async () => {
    assert.equal(originalReading.original.classId, 'class-a'); assert.equal(originalReading.original.studentId, 'student-a');
    assert.equal(correction.readingCheckId, originalReading.original.id); assert.equal(correction.revision, originalReading.revision + 1);
  });
  checkpoint = 'Mounted planner initial navigation';
  await page.goto(base.origin + '/reading-practice', { waitUntil: 'domcontentloaded' });
  checkpoint = 'Mounted planner initial readiness'; await ready(page);
  checkpoint = 'Current fixture class and observation selection';
  await field(page, 'Class').selectOption('class-a'); await ready(page); await field(page, 'Reading observation').selectOption(originalReading.original.id);
  await check('Mounted planner binds the selected class and existing observation', async () => {
    await expect(field(page, 'Class')).toHaveValue('class-a'); await expect(field(page, 'Reading observation')).toHaveValue(originalReading.original.id);
    await expect(page.getByRole('article', { name: 'Selected effective reading', exact: true })).toContainText(originalMetrics.passageReference);
  });
  await check('Effective corrected counts are shown with original manual provenance', async () => {
    const selected = page.getByRole('article', { name: 'Selected effective reading', exact: true });
    await expect(selected).toContainText(alteredCount + ' correct of ' + originalMetrics.wordsAttempted);
    await expect(selected).toContainText('Reviewed correction revision ' + correction.revision);
    await expect(selected).toContainText('Original source: manual-reviewed-external');
  });
  for (const actor of ['guardian-a', 'student-user-a']) await check(actor === 'guardian-a' ? 'Guardian receives staff-only planner denial' : 'Student receives staff-only planner denial', async () => {
    const family = await context(actor), familyPage = await family.newPage(); await familyPage.goto(base.origin + '/reading-practice', { waitUntil: 'domcontentloaded' });
    await expect(familyPage.getByText('The reading practice planner is available to school staff.', { exact: true })).toBeVisible();
    await expect(familyPage.locator('main input,main select,main textarea')).toHaveCount(0);
    assert.equal((await familyPage.locator('body').innerText()).includes(originalMetrics.passageReference), false);
    await api(family, '/api/reading-review?classId=class-a', 'GET', undefined, 403);
  });
  await prepare(page, reference, reference.latest.id);
  await check('Exact approved source preview includes language objectives and declared rights', async () => {
    await expect(field(page, 'Exact reviewed version')).toHaveValue(reference.latest.id);
    await expect(selectedSource(page)).toContainText(content.language); await expect(selectedSource(page)).toContainText(content.objectives); await expect(selectedSource(page)).toContainText(content.rightsStatement);
  });
  await check('Manual suitability and unvalidated educational limits are disclosed', async () => {
    await expect(page.getByText(/no validated screening, scoring, diagnosis, adaptive placement or personalized learning/)).toBeVisible();
    await expect(selectedSource(page)).toContainText('not independent educational or licensing certification');
    await expect(page.getByText(/never inserts this focus, learner identity or reading evidence/)).toBeVisible();
  });
  await check('Copy requires explicit review of manual practice focus and source', async () => { await expect(confirmation(page)).not.toBeChecked(); await expect(create(page)).toBeDisabled(); });
  await confirmation(page).check(); await field(page, 'Teacher-selected practice focus').fill(privateFocus + ' revised');
  await check('Changing private focus resets earlier review', async () => { await expect(confirmation(page)).not.toBeChecked(); await expect(create(page)).toBeDisabled(); });
  await confirmation(page).check(); await field(page, 'Draft format').selectOption('worksheet');
  await check('Changing draft format resets earlier review', async () => { await expect(confirmation(page)).not.toBeChecked(); await expect(create(page)).toBeDisabled(); });
  await confirmation(page).check(); await field(page, 'Reading observation').selectOption('');
  await check('Changing reading selection clears focus and earlier review', async () => { await expect(field(page, 'Teacher-selected practice focus')).toHaveValue(''); await expect(confirmation(page)).not.toBeChecked(); await expect(create(page)).toBeDisabled(); });
  await field(page, 'Reading observation').selectOption(originalReading.original.id); await field(page, 'Teacher-selected practice focus').fill(privateFocus);
  await field(page, 'Curriculum reference').selectOption(unreviewed.id); await ready(page);
  await check('Unreviewed source cannot authorize a provisional copy', async () => { await expect(page.getByText(/no reviewed version available to copy/)).toBeVisible(); await expect(create(page)).toBeDisabled(); });
  await field(page, 'Curriculum reference').selectOption(mismatched.id); await ready(page);
  await check('Different language tags require manual suitability review without equivalence claims', async () => { await expect(page.getByText(/reading and source language tags differ/)).toBeVisible(); await expect(page.getByText(/does not establish cross-language equivalence/)).toBeVisible(); await expect(create(page)).toBeDisabled(); });
  await confirmation(page).check(); await field(page, 'Curriculum reference').selectOption(reference.id); await ready(page);
  await check('Changing the source resets its prior suitability review', async () => { await expect(confirmation(page)).not.toBeChecked(); await expect(create(page)).toBeDisabled(); });
  await confirmation(page).check(); const first = await copied(page, copyPath(reference.id));
  await check('Explicit copy produces a separate original source and draft receipt', async () => {
    const sent = JSON.parse(first.body); assert.deepEqual(Object.keys(sent).sort(), ['clientResourceId', 'type', 'versionId']); assert.equal(sent.versionId, reference.latest.id);
    assert.equal(sent.clientResourceId, first.value.resource.id); await expect(receipt(page)).toContainText('original source version 1');
    await expect(page.getByRole('link', { name: 'Open teaching draft to adapt and review', exact: true })).toHaveAttribute('href', '/resources/' + sent.clientResourceId);
  });
  await check('Copied content receives no automatic learner evidence or private focus', async () => {
    const saved = await api(teacher, '/api/resources/' + first.value.resource.id);
    assert.equal(saved.latest.body, sourceBody); assert.equal(saved.latest.objectives, content.objectives); assert.equal(saved.latest.teacherNotes, ''); assert.equal(saved.latest.answerKey, '');
    for (const value of [privateFocus, originalReading.original.studentId, originalMetrics.passageReference]) assert.equal(JSON.stringify(saved.latest).includes(value), false);
  });
  await check('The copied version is unapproved unassigned and bound to the exact reviewed source', async () => {
    assert.equal(first.value.resource.latest.approvedAt, null); assert.equal(first.value.resource.latest.approvedBy, null);
    assert.equal(first.value.provenance.referenceVersionId, reference.latest.id); assert.equal(first.value.provenance.resourceVersionId, first.value.resource.latest.id);
    assert.equal((await api(teacher, '/api/resource-assignments')).some(row => row.resourceId === first.value.resource.id), false);
  });
  checkpoint = 'Suffix-only later source and draft revisions';
  const laterResource = { ...first.value.resource.latest, title: 'Later edited planner draft ' + suffix, body: 'Later fictional draft material ' + suffix, teacherNotes: 'Private later draft notes ' + suffix };
  const { title, type, curriculum, gradeLevel, subject, language, objectives, body, teacherNotes, answerKey } = laterResource;
  await api(teacher, '/api/resources/' + first.value.resource.id, 'PATCH', { expectedVersion: 1, content: { title, type, curriculum, gradeLevel, subject, language, objectives, body, teacherNotes, answerKey } });
  const editor = await teacher.newPage(); await editor.goto(base.origin + '/resources/' + first.value.resource.id, { waitUntil: 'domcontentloaded' });
  await check('Existing resource editor shows later current material separately from the planner receipt', async () => {
    await expect(editor.getByLabel('Student material', { exact: false })).toHaveValue(laterResource.body);
    await expect(receipt(page)).toContainText('original copied resource version 1'); await expect(receipt(page)).not.toContainText(laterResource.body);
  });
  const nextContent = { ...content, title: 'Later reviewed planner source ' + suffix, body: 'Later original source activity ' + suffix };
  const revised = await api(teacher, '/api/curriculum/' + reference.id, 'PATCH', { expectedVersion: 1, content: nextContent });
  await api(teacher, '/api/curriculum/' + reference.id + '/approve', 'POST', { versionId: revised.latest.id, confirmReview: true });
  await refresh(page); await field(page, 'Exact reviewed version').selectOption(revised.latest.id); await ready(page);
  await check('Current reviewed source and original copy receipt keep separate versions', async () => {
    await expect(selectedSource(page)).toContainText(nextContent.body); await expect(selectedSource(page)).toContainText('source version 2');
    await expect(receipt(page)).toContainText(sourceTitle + ' · original source version 1'); await expect(receipt(page)).not.toContainText(nextContent.body);
  });
  await check('Choosing a newer exact source version requires fresh explicit confirmation', async () => { await expect(confirmation(page)).not.toBeChecked(); await expect(create(page)).toBeDisabled(); });

  let lostBody, committedLost, lossPosts = 0;
  const countLoss = request => { if (new URL(request.url()).pathname === copyPath(reference.id) && request.method() === 'POST') lossPosts++; };
  page.on('request', countLoss);
  const lostMatch = url => url.pathname === copyPath(reference.id);
  const lose = guarded(async route => {
    if (route.request().method() !== 'POST') return route.continue();
    lostBody = route.request().postData(); const actual = await routeFetch(route); assert.equal(actual.status(), 201); committedLost = await actual.json(); knownDrafts.add(committedLost.resource.id);
    return route.abort('failed');
  });
  checkpoint = 'Pending committed-copy delivery injection';
  await confirmation(page).check(); await page.route(lostMatch, lose);
  try { await create(page).click(); await expect(page.getByRole('alert')).toContainText('could not be confirmed'); }
  finally { await page.unroute(lostMatch, lose); }
  await check('Lost committed reply hides private evidence focus source and receipt without retry', async () => {
    assert.ok(lostBody); assert.equal(committedLost.resource.id, JSON.parse(lostBody).clientResourceId);
    assert.equal(lossPosts, 1, 'Unknown copy never causes an automatic retry');
    await expect(field(page, 'Teacher-selected practice focus')).toHaveCount(0); await expect(selectedSource(page)).toHaveCount(0); await expect(receipt(page)).toHaveCount(0);
    await expect(page.getByRole('alert')).toBeFocused();
    assert.equal((await page.locator('body').innerText()).includes(originalMetrics.passageReference), false);
    await expect(page.getByRole('button', { name: 'Recover original draft', exact: true })).toHaveCount(0);
  });
  checkpoint = 'Later original-copy editor and reading correction';
  const secondCount = alteredCount ? alteredCount - 1 : 1;
  const laterCorrection = await appendCorrection({ ...originalMetrics, wordsCorrect: secondCount }, 'Fictional planner later reviewed transcription ' + suffix);
  const lostDraft = committedLost.resource.latest;
  await api(teacher, '/api/resources/' + committedLost.resource.id, 'PATCH', { expectedVersion: 1, content: {
    title: 'Later lost-copy editor version ' + suffix, type: lostDraft.type, curriculum: lostDraft.curriculum, gradeLevel: lostDraft.gradeLevel, subject: lostDraft.subject, language: lostDraft.language, objectives: lostDraft.objectives, body: 'Later lost-copy material ' + suffix, teacherNotes: '', answerKey: '',
  } });
  await switchActor(teacher, 'admin-a'); await refresh(page);
  await check('Another current staff account cannot view or recover the original private pending plan', async () => {
    await expect(field(page, 'Teacher-selected practice focus')).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Recover original draft', exact: true })).toHaveCount(0);
    await expect(page.getByText(/Original reviewed source:/)).toHaveCount(0);
  });
  checkpoint = 'Original pending account restoration';
  await switchActor(teacher, 'teacher-a'); await refresh(page);
  await check('Original current account reload shows latest corrected evidence without rebasing pending copy', async () => {
    await expect(field(page, 'Teacher-selected practice focus')).toHaveValue(privateFocus);
    await expect(page.getByRole('article', { name: 'Selected effective reading', exact: true })).toContainText(secondCount + ' correct of ' + originalMetrics.wordsAttempted);
    await expect(page.getByRole('article', { name: 'Selected effective reading', exact: true })).toContainText('revision ' + laterCorrection.revision);
    await expect(page.getByRole('button', { name: 'Recover original draft', exact: true })).toBeEnabled();
    assert.equal(lossPosts, 1, 'Original-account reload remains read only');
  });
  checkpoint = 'Explicit original copy recovery';
  const recoveredResponse = page.waitForResponse(response => new URL(response.url()).pathname === copyPath(reference.id) && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Recover original draft', exact: true }).click(); const recovered = await recoveredResponse; const recoveredValue = await recovered.json(); await ready(page);
  await check('Explicit recovery reuses exact UUID and bytes and returns the original first resource version', async () => {
    assert.equal(recovered.status(), 201); assert.equal(recovered.request().postData(), lostBody); assert.equal(recoveredValue.resource.id, committedLost.resource.id);
    assert.equal(lossPosts, 2, 'Explicit original recovery sends one additional POST');
    assert.equal(recoveredValue.resource.latest.version, 1); assert.equal(recoveredValue.resource.latest.body, nextContent.body);
    assert.equal(recoveredValue.provenance.id, committedLost.provenance.id);
    assert.equal((await api(teacher, '/api/resources/' + committedLost.resource.id)).latest.version, 2);
    assert.equal((await api(teacher, '/api/resources')).filter(row => row.id === committedLost.resource.id).length, 1, 'Original UUID identifies exactly one current resource');
    await expect(receipt(page)).toContainText('original source version 2'); await expect(receipt(page)).toContainText('original copied resource version 1');
  });
  page.off('request', countLoss);

  checkpoint = 'Current family account denial';
  await switchActor(teacher, 'guardian-a'); await reload(page).click();
  await check('Actual current family session denial clears old protected staff planning views', async () => {
    await expect(page.getByRole('alert')).toContainText('Current staff access is unavailable');
    await expect(page.getByRole('alert')).toBeFocused();
    await expect(field(page, 'Class')).toHaveCount(0); await expect(selectedSource(page)).toHaveCount(0); await expect(receipt(page)).toHaveCount(0);
    assert.equal((await page.locator('body').innerText()).includes(privateFocus), false);
  });
  await switchActor(teacher, 'teacher-a'); await refresh(page);
  checkpoint = 'Suffix-only newer reviewed source for delayed delivery';
  const newest = await api(teacher, '/api/curriculum/' + reference.id, 'PATCH', { expectedVersion: 2, content: { ...nextContent, title: 'Newest reviewed planner source ' + suffix, body: 'Newest original source activity ' + suffix } });
  await api(teacher, '/api/curriculum/' + reference.id + '/approve', 'POST', { versionId: newest.latest.id, confirmReview: true }); await refresh(page);
  let release, observed, obsoleteRequest, settledObsolete, observedFresh;
  const gate = new Promise(resolve => { release = resolve; }), seen = new Promise(resolve => { observed = resolve; });
  const obsoleteSettled = new Promise(resolve => { settledObsolete = resolve; });
  const freshSnapshot = new Promise(resolve => { observedFresh = resolve; });
  let held = false;
  const snapshotMatch = url => url.pathname === '/api/curriculum/' + reference.id + '/snapshot' && url.searchParams.get('versionId') === newest.latest.id;
  const canceled = request => {
    if (request === obsoleteRequest && request.failure()?.errorText === 'net::ERR_ABORTED') settledObsolete('native-aborted');
  };
  const delivered = async response => {
    if (!snapshotMatch(new URL(response.url()))) return;
    if (response.request() !== obsoleteRequest && response.status() === 200) observedFresh();
    if (response.request() === obsoleteRequest) {
      try { if ((await response.text()).includes('OBSOLETE-DELIVERY-' + suffix)) settledObsolete('delivered-superseded'); }
      catch { /* A legitimately aborted exact request has no readable response body. */ }
    }
  };
  page.on('requestfailed', canceled); page.on('response', delivered);
  const boundedProbe = async (promise, description) => {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(description)), 15000); })]); }
    finally { clearTimeout(timer); }
  };
  const delay = guarded(async route => {
    if (held) return route.continue(); held = true; obsoleteRequest = route.request();
    const actual = await routeFetch(route); assert.equal(actual.status(), 200); const value = await actual.json(); observed(); await gate;
    value.content.body = 'OBSOLETE-DELIVERY-' + suffix; value.suggestedDraft.body = value.content.body;
    return route.fulfill({ response: actual, body: JSON.stringify(value), contentType: 'application/json' });
  });
  await page.route(snapshotMatch, delay);
  try {
    checkpoint = 'Obsolete exact snapshot captured after actual200';
    await field(page, 'Exact reviewed version').selectOption(newest.latest.id);
    await boundedProbe(seen, 'Local delayed response was not observed');
    checkpoint = 'Fresh reload supersedes exact held snapshot';
    await reload(page).click(); await ready(page);
    await boundedProbe(freshSnapshot, 'Fresh current snapshot response was not observed');
    checkpoint = 'Observed exact snapshot cancellation or superseded delivery';
    release(); obsoleteSnapshotOutcome = await boundedProbe(obsoleteSettled, 'Exact obsolete request neither aborted nor delivered'); await frames(page);
    await check('Obsolete delayed source reply cannot overwrite a newer verified planner reload', async () => {
      assert.ok(['native-aborted', 'delivered-superseded'].includes(obsoleteSnapshotOutcome), 'Exact original request settled by observed cancellation or tagged delivery');
      await expect(field(page, 'Exact reviewed version')).toHaveValue(newest.latest.id);
      await expect(field(page, 'Reading observation')).toHaveValue(originalReading.original.id);
      await expect(confirmation(page)).not.toBeChecked();
      await expect(selectedSource(page)).toContainText('Newest original source activity ' + suffix);
      await expect(page.getByText('OBSOLETE-DELIVERY-' + suffix, { exact: true })).toHaveCount(0);
      await expect(page.getByRole('alert')).toHaveCount(0);
    });
  } finally { release(); await page.unroute(snapshotMatch, delay); page.off('requestfailed', canceled); page.off('response', delivered); }
  const admin = await context('admin-a'), adminPage = await admin.newPage(); await adminPage.goto(base.origin + '/reading-practice', { waitUntil: 'domcontentloaded' }); await ready(adminPage);
  await field(adminPage, 'Class').selectOption('class-a'); await ready(adminPage); await field(adminPage, 'Reading observation').selectOption(originalReading.original.id);
  await field(adminPage, 'Class').selectOption('class-other'); await ready(adminPage);
  await check('New class selection cannot retain previous class observation or private focus', async () => {
    await expect(field(adminPage, 'Class')).toHaveValue('class-other'); await expect(field(adminPage, 'Reading observation')).toHaveValue('');
    assert.equal((await adminPage.locator('body').innerText()).includes(originalMetrics.passageReference), false);
    await expect(field(adminPage, 'Teacher-selected practice focus')).toHaveValue(''); await expect(create(adminPage)).toBeDisabled();
  });
  checkpoint = 'Synchronous duplicate copy preparation';
  await prepare(page, reference, newest.latest.id, privateFocus); await confirmation(page).check();
  let duplicatePosts = 0; const count = request => { if (new URL(request.url()).pathname === copyPath(reference.id) && request.method() === 'POST') duplicatePosts++; };
  page.on('request', count);
  const duplicateResponse = page.waitForResponse(response => new URL(response.url()).pathname === copyPath(reference.id) && response.request().method() === 'POST');
  try {
    await create(page).evaluate(button => { button.click(); button.click(); }); const actual = await duplicateResponse; assert.equal(actual.status(), 201); const value = await actual.json(); knownDrafts.add(value.resource.id); await ready(page);
    await check('Same-frame duplicate clicks are synchronously locked to one actual copy', async () => { assert.equal(duplicatePosts, 1); await expect(receipt(page)).toBeVisible(); });
  } finally { page.off('request', count); }
  await confirmation(page).check(); let forbiddenPosts = 0;
  const forbidCount = request => { if (new URL(request.url()).pathname === copyPath(reference.id) && request.method() === 'POST') forbiddenPosts++; }; page.on('request', forbidCount);
  checkpoint = 'Current-account copy preflight denial';
  await switchActor(teacher, 'guardian-a'); await create(page).click();
  try { await check('Fresh current-account mismatch before save sends no copy and hides previous private context', async () => { await expect(page.getByRole('alert')).toContainText('Current account'); assert.equal(forbiddenPosts, 0); await expect(field(page, 'Teacher-selected practice focus')).toHaveCount(0); await expect(receipt(page)).toHaveCount(0); }); }
  finally { page.off('request', forbidCount); await switchActor(teacher, 'teacher-a'); }
  await refresh(page);
  await check('Desktop native labels and keyboard focus support planning controls', async () => {
    await geometry(page); await field(page, 'Teacher-selected practice focus').focus(); await expect(field(page, 'Teacher-selected practice focus')).toBeFocused();
    await page.keyboard.press('Tab'); await expect(field(page, 'Curriculum reference')).toBeFocused();
  }); await shot(page, 'desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await check('390px source evidence receipt and native controls fit without page overflow', async () => { await geometry(page); await expect(selectedSource(page)).toBeVisible(); await expect(receipt(page)).toBeVisible(); }); await shot(page, 'mobile');
  await check('Mounted planner has only local traffic and no page errors or failed assets', async () => { assert.equal(externalRequests, 0); assert.equal(pageErrors, 0); assert.equal(failedAssets, 0); });
  checkpoint = 'Final local browser record';
} catch (error) {
  // Never serialize a caught message, cause, request headers, page body or cookies.
  failureInfo = { checkpoint, errorName: error instanceof Error ? error.name : 'NonError' };
  throw new Error('Reading practice browser procedure failed at checkpoint: ' + checkpoint + ' (' + (error instanceof Error ? error.name : 'NonError') + ')');
} finally {
  if (restoreNeeded && teacher && originalReading && originalMetrics) {
    try {
      await switchActor(teacher, 'teacher-a');
      const history = await api(teacher, '/api/reading-review?classId=class-a');
      const current = history.observations.find(row => row.original.id === originalReading.original.id);
      const latest = current?.corrections.at(-1);
      if (!current || !latest || !ownedCorrections.has(latest.id)) throw new Error('Current correction is not owned by this procedure');
      const restoredCorrection = await appendCorrection(originalMetrics, 'Fictional planner reviewed restoration of prior effective values ' + suffix);
      const restoredHistory = await api(teacher, '/api/reading-review?classId=class-a');
      const restored = restoredHistory.observations.find(row => row.original.id === originalReading.original.id);
      assert.deepEqual(restored.original, originalReading.original, 'Original reading evidence remains unchanged');
      assert.deepEqual(restored.effective, originalMetrics, 'Prior effective reading values were restored');
      assert.deepEqual(restored.corrections.slice(0, originalReading.corrections.length), originalReading.corrections, 'Existing correction history remains unchanged');
      assert.equal(restored.corrections.at(-1).id, restoredCorrection.id, 'Restoration appends its own reviewed correction');
      confirmedOwnedCorrections = restored.corrections.filter(row => ownedCorrections.has(row.id)).length; restorationVerified = true;
      restoreNeeded = false;
    } catch { restorationFailed = true; console.error('Fictional reading restoration needs coordinator review; original observation and history were preserved.'); }
  }
  for (const value of contexts) await value.close().catch(() => {});
  await browser?.close().catch(() => {});
  {
    const result = { executedAt: new Date().toISOString(), passed, failed: failureInfo || restorationFailed ? 1 : 0, skipped: 0, checkpoint: failureInfo?.checkpoint ?? (restorationFailed ? 'Reviewed reading restoration' : checkpoint), ...(failureInfo ? { errorName: failureInfo.errorName } : {}), checks, screenshots, externalRequests, pageErrors, failedAssets, knownSuffixSourceCount: sourceCount, knownSuffixDraftCount: knownDrafts.size, confirmedOwnedCorrections, restorationVerified, restorationFailed, obsoleteSnapshotOutcome, limits: [
      'Built localhost Worker and injected private fictional sessions only; no provider sign-in, paid AI, external app or real learners.',
      'Requires an existing class-a/student-a manually reviewed reading; no provider result fixtures are invented.',
      'Only suffix-scoped original curriculum sources and teaching drafts are created. Original class/profile/account/enrolment/assignment records are unchanged.',
      'Reading corrections append history; final restoration and preservation of original/prior history are verified when restorationVerified is true. No original observation or correction is deleted or overwritten.',
      'Committed reply loss and an obsolete response body are explicit local delivery injections; commits, later revisions, corrected evidence and current-account denials use actual Worker routes.',
      'Original exact-copy recovery confirms version 1 and its source binding, not later editor approval, assignment, intervention effectiveness, screening or personalization.',
      'The exact obsolete request may be natively aborted OR delivered with the tagged superseded body; either branch requires a fresh actual200 snapshot and unchanged selected source/version/observation with cleared review. Native cancellation is not proof of delivered-old callback handling; the separate offline contract covers that narrower claim.',
      'Pending recovery survives only within the mounted page. Native labels/focus and 390px geometry are bounded observations, not accessibility certification or UAT acceptance.',
    ] };
    writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ passed, failed: result.failed, skipped: 0, externalRequests, pageErrors, failedAssets, restorationFailed }));
    if (restorationFailed && !failureInfo) throw new Error('Reading practice browser procedure requires coordinator review of fictional reading restoration.');
  }
}
