// A real browser journey over an isolated built Worker; synthetic sessions only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
const origin = process.env.SAHA_WORKER_TEST_URL;
const fixture = process.env.SAHA_WORKER_SESSION_FIXTURE;
const executablePath = process.env.SAHA_TEST_BROWSER;
if (!origin || !fixture || !executablePath || !['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Local origin, synthetic sessions and browser executable required.');
const sessions = JSON.parse(readFileSync(fixture, 'utf8'));
const browser = await chromium.launch({executablePath, headless: true, args: ['--disable-background-networking']});
let passed = 0;
const check = async (name, action) => { await action(); passed++; console.log('ok - ' + name); };
const title = 'Browser worksheet ' + crypto.randomUUID().slice(0,8);
const body = 'Draw two equal parts of a rectangle.';
let teacher; let student;
try {
  // Send a synthetic session only to the local origin, never to an external app.
  async function context(user) {
    const value = await browser.newContext({viewport: {width: 1200, height: 900}, extraHTTPHeaders: {cookie: sessions[user]}});
    await value.route('**/*', route => new URL(route.request().url()).origin === new URL(origin).origin ? route.continue() : route.abort());
    return value;
  }
  teacher = await context('teacher-a'); const page = await teacher.newPage();
  page.on('pageerror', error => console.error('Browser error: ' + error.message));
  await page.goto(origin + '/dashboard/teacher');
  await check('Teacher dashboard links to the workspace', async () => { await expect(page.getByRole('link', {name: 'Teaching resources', exact: true})).toBeVisible(); await page.getByRole('link', {name: 'Teaching resources', exact: true}).click(); });
  await check('Teacher workspace opens', async () => expect(page.getByRole('heading', {name: 'Teaching resources', exact: true})).toBeVisible());
  await page.getByLabel('Start with a template').selectOption('worksheet');
  const fields = {'Title': title, 'Curriculum or local programme': 'Synthetic pilot curriculum', 'Grade or learning level': '8',
    'Subject': 'Mathematics', 'Language code (e.g. en-IN)': 'en-IN', 'Learning objectives': 'Describe equal parts.',
    'Student material': body, 'Teacher notes (staff only)': 'BROWSER_PRIVATE_NOTE', 'Answer key (staff only)': 'BROWSER_PRIVATE_ANSWER'};
  for (const [label, value] of Object.entries(fields)) await page.getByLabel(label, {exact: false}).fill(value);
  await page.getByRole('button', {name: 'Save draft', exact: true}).click();
  await check('Draft saves and opens for review', async () => { await page.getByRole('link', {name: title, exact: true}).click(); await expect(page.getByRole('heading', {name: 'Edit latest draft'})).toBeVisible(); });
  await check('Approval requires review confirmation', async () => expect(page.getByRole('button', {name: 'Approve version 1', exact: true})).toBeDisabled());
  await page.getByRole('checkbox').check();
  await page.getByRole('button', {name: 'Approve version 1', exact: true}).click();
  await check('Exact saved version approves', async () => expect(page.getByRole('link', {name: 'Print approved version 1', exact: true})).toBeVisible());
  await page.getByLabel('Assign this approved version to a class').selectOption('class-a');
  await page.getByRole('button', {name: 'Assign version 1', exact: true}).click();
  await check('Class assignment completes', async () => expect(page.getByRole('status')).toContainText('assigned to the selected class'));
  const detailUrl = page.url();
  await page.getByRole('link', {name: 'Print approved version 1', exact: true}).click();
  await check('Student print excludes teacher material', async () => { await expect(page.getByText(body, {exact: true})).toBeVisible(); await expect(page.getByText('BROWSER_PRIVATE_ANSWER', {exact: true})).toHaveCount(0); });
  await page.getByLabel('Teacher edition: include teacher notes and answer key').check();
  await check('Staff explicitly chooses teacher print', async () => expect(page.getByText('BROWSER_PRIVATE_ANSWER', {exact: true})).toBeVisible());
  await page.goto(detailUrl);
  await expect(page.getByLabel('Student material', {exact: false})).toHaveValue(body);
  await page.getByLabel('Student material', {exact: false}).fill('Draft revision not yet approved.');
  await page.getByRole('button', {name: 'Save new version', exact: true}).click();
  await check('Revision becomes a new unapproved version', async () => { await expect(page.getByRole('button', {name: 'Approve version 2', exact: true})).toBeDisabled(); await expect(page.getByLabel('Saved version to review, print or assign')).toContainText('Version 1 — Approved'); });
  student = await context('student-user-a'); const learner = await student.newPage();
  await learner.goto(origin + '/dashboard/student');
  await check('Student dashboard links only to learner resources', async () => { await expect(learner.getByRole('link', {name: 'Teaching resources', exact: true})).toHaveCount(0); await learner.getByRole('link', {name: 'Class resources', exact: true}).click(); });
  await learner.locator('summary').filter({hasText: title}).click();
  await check('Learner sees assigned approved version', async () => expect(learner.locator('details').filter({hasText: title}).getByText(body, {exact: true})).toBeVisible());
  await check('Later draft does not replace assignment', async () => expect(learner.getByText('Draft revision not yet approved.', {exact: true})).toHaveCount(0));
  await check('Learner material omits all private keys and notes', async () => {
    const text = await learner.locator('body').innerText(); assert.equal(text.includes('BROWSER_PRIVATE_'), false);
    const response = await learner.request.get(origin + '/api/resource-assignments'); assert.equal((await response.text()).includes('BROWSER_PRIVATE_'), false);
  });
  await learner.goto(origin + '/resources');
  await check('Learner has no draft editor', async () => { await expect(learner.getByText('This workspace is available to school staff.', {exact: true})).toBeVisible(); await expect(learner.getByRole('button', {name: 'Save draft'})).toHaveCount(0); });
  if (process.env.SAHA_UI_SCREENSHOT) {
    await page.goto(detailUrl); await expect(page.getByRole('heading', {name: 'Edit latest draft'})).toBeVisible();
    await page.screenshot({path: process.env.SAHA_UI_SCREENSHOT, fullPage: true});
  }
  console.log(JSON.stringify({passed, failed: 0, skipped: 0}));
} catch (error) {
  for (const page of teacher?.pages() ?? []) console.error('Local screen: ' + page.url() + '\n' + (await page.locator('body').innerText()).slice(0,2000));
  console.log(JSON.stringify({passed, failed: 1, skipped: 0})); throw error;
}
finally { await teacher?.close(); await student?.close(); await browser.close(); }
