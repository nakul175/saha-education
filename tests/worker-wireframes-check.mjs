import assert from 'node:assert/strict';
// Manual offline prototype review; this never connects to the built application.
import { chromium, expect } from '@playwright/test';
const executablePath = process.env.SAHA_TEST_BROWSER;
if (!executablePath) throw new Error('Supply the local browser executable in SAHA_TEST_BROWSER.');
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--disable-background-networking'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
let passed = 0,
  externalRequests = 0;
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
await page.route('**/*', (route) => {
  if (route.request().url().startsWith('file:')) return route.continue();
  externalRequests++;
  return route.abort();
});
const check = async (name, action) => {
  await action();
  passed++;
  console.log('ok - ' + name);
};
try {
  await page.goto(new URL('../docs/specification/wireframes/index.html', import.meta.url).href);
  await check('Twelve named prototype screens available', async () =>
    assert.equal(await page.locator('nav [data-screen]').count(), 12),
  );
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const id of await page
      .locator('nav [data-screen]')
      .evaluateAll((items) => items.map((item) => item.dataset.screen))) {
      await page.locator('nav [data-screen="' + id + '"]').click();
      await check('Visible labelled screen fits viewport: ' + id + '/' + width, async () => {
        await expect(page.locator('#' + id)).toBeVisible();
        assert.equal(
          await page.locator('#' + id + ' h2').evaluate((node) => node === document.activeElement),
          true,
        );
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
          true,
        );
        assert.equal(
          await page
            .locator('#' + id + ' input, #' + id + ' select, #' + id + ' textarea')
            .evaluateAll(
              (items) =>
                items.filter((item) => !item.labels?.length && !item.getAttribute('aria-label')).length,
            ),
          0,
        );
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-screen="profile-links"]').click();
  await check('Profile action requires review', async () =>
    expect(page.locator('#profile-save')).toBeDisabled(),
  );
  await page.locator('#profile-reviewed').check();
  await page.locator('#profile-save').click();
  await check('Reviewed profile link records visible original decision', async () => {
    await expect(page.locator('#profile-current')).toContainText('review version 1');
    assert.equal(await page.locator('#profile-history li').count(), 1);
  });
  await page.locator('#profile-action').selectOption('unlink');
  await page.locator('#profile-reviewed').check();
  await page.locator('#profile-reason').fill('Edited fictional ownership reason.');
  await check('Changed ownership reason clears prototype review', async () => {
    await expect(page.locator('#profile-reviewed')).not.toBeChecked();
    await expect(page.locator('#profile-save')).toBeDisabled();
  });
  await page.locator('#profile-reviewed').check();
  await page.locator('#profile-save').click();
  await check('Explicit unlink retains both fictional decisions', async () => {
    await expect(page.locator('#profile-current')).toContainText('no account linked');
    assert.equal(await page.locator('#profile-history li').count(), 2);
  });
  await page.screenshot({ path: '/private/tmp/saha-development-prototype-desktop.png', fullPage: true });
  await page.locator('[data-screen="imports"]').click();
  await page.locator('#import-stage').click();
  await check('Local import prototype stage creates review preview only', async () => {
    await expect(page.locator('#import-preview')).toBeVisible();
    await expect(page.locator('#import-outcome')).toContainText('no observations created');
    await expect(page.locator('#import-confirm')).toBeDisabled();
  });
  await page.locator('#import-reviewed').check();
  await page.locator('#import-confirm').click();
  await check('Prototype confirmation is clearly fictional and terminal', async () => {
    await expect(page.locator('#import-outcome')).toContainText('No actual readings created');
    await expect(page.locator('#import-confirm')).toBeDisabled();
  });
  await page.locator('#import-stage').click();
  await page.locator('#import-reviewed').check();
  await page.locator('#import-reject').click();
  await check('Prototype rejection creates no observation or receipt', async () =>
    expect(page.locator('#import-outcome')).toContainText('no observations or receipts'),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/private/tmp/saha-development-prototype-mobile.png', fullPage: true });
  await page.locator('[data-screen="windows"]').click();
  await check('Submission prototype defaults to unrestricted access', async () => {
    await expect(page.locator('#window-current')).toContainText('revision 0');
    await expect(page.locator('#window-save')).toBeDisabled();
  });
  await page.locator('#window-state').selectOption('closed');
  await page.locator('#window-reviewed').check();
  await page.locator('#window-save').click();
  await check('Prototype reviewed closure appends revision', async () =>
    expect(page.locator('#window-current')).toContainText('revision 1 · configured · new responses closed'),
  );
  await page.locator('#window-state').selectOption('open');
  await page.locator('#window-time').fill('2020-01-01T00:00');
  await page.locator('#window-reviewed').check();
  await page.locator('#window-save').click();
  await check('Explicit elapsed prototype cutoff stays closed with history', async () => {
    await expect(page.locator('#window-current')).toContainText(
      'revision 2 · configured · new responses closed',
    );
    assert.equal(await page.locator('#window-history li').count(), 2);
  });
  await page.locator('#window-time').fill('');
  await page.locator('#window-reviewed').check();
  await page.locator('#window-save').click();
  await check('Reviewed reopening retains prior prototype policy history', async () => {
    await expect(page.locator('#window-current')).toContainText(
      'revision 3 · configured · new responses open',
    );
    assert.equal(await page.locator('#window-history li').count(), 3);
  });
  await check('Prototype made no network calls or page errors', async () => {
    assert.equal(externalRequests, 0);
    assert.deepEqual(pageErrors, []);
  });
  console.log(
    JSON.stringify({ passed, failed: 0, skipped: 0, externalRequests, pageErrors: pageErrors.length }),
  );
} finally {
  await browser.close();
}
