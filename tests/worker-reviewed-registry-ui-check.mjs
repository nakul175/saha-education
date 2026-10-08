// Manual local-only reviewed registry procedures over the actual built Worker.
// Delivery faults are explicitly injected; no external accounts or requests.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
const base = new URL(process.env.SAHA_WORKER_TEST_URL),
  fixture = process.env.SAHA_WORKER_SESSION_FIXTURE,
  executablePath = process.env.SAHA_TEST_BROWSER;
if (
  !fixture ||
  !executablePath ||
  !['127.0.0.1', 'localhost'].includes(base.hostname) ||
  !['http:', 'https:'].includes(base.protocol) ||
  base.pathname !== '/' ||
  base.search ||
  base.hash ||
  base.username ||
  base.password
)
  throw new Error('Use an exact local Worker origin, private synthetic sessions and local Chrome.');
const sessions = JSON.parse(readFileSync(fixture, 'utf8')),
  suffix = crypto.randomUUID().slice(0, 8);
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--disable-background-networking'],
});
const contexts = [],
  external = [],
  errors = [],
  assets = [],
  checks = [],
  screenshots = [],
  injections = [];
let passed = 0;
async function check(name, work) {
  await work();
  if (injections.length) throw injections[0];
  passed++;
  checks.push(name);
  console.log('ok - ' + name);
}
async function switchActor(context, user) {
  const cookie = sessions[user];
  assert.equal(typeof cookie, 'string');
  await context.setExtraHTTPHeaders({ cookie });
  await context.clearCookies();
  const split = cookie.indexOf('=');
  await context.addCookies([
    {
      name: cookie.slice(0, split),
      value: cookie.slice(split + 1),
      domain: base.hostname,
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}
async function context(user) {
  const value = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block',
    timezoneId: 'Asia/Kolkata',
    extraHTTPHeaders: { cookie: sessions[user] },
  });
  contexts.push(value);
  await switchActor(value, user);
  value.on('page', (page) => {
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => {
      if (r.status() >= 400 && ['script', 'stylesheet'].includes(r.request().resourceType()))
        assets.push({ path: new URL(r.url()).pathname, status: r.status() });
    });
  });
  await value.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.origin === base.origin) return route.continue();
    external.push(u.origin);
    return route.abort();
  });
  return value;
}
async function api(context, path, method = 'GET', data, expected = 200) {
  const url = new URL(path, base);
  assert.equal(url.origin, base.origin);
  let response, body;
  try {
    response = await context.request.fetch(url.href, {
      method,
      timeout: 15000,
      maxRedirects: 0,
      headers: method === 'GET' ? {} : { Origin: base.origin },
      ...(data === undefined ? {} : { data }),
    });
    body = await response.text();
  } catch {
    throw new Error('Local registry transport unavailable: ' + method + ' ' + url.pathname);
  }
  assert.equal(response.status(), expected, method + ' ' + path);
  return JSON.parse(body);
}
async function routeFetch(route, actor) {
  const url = new URL(route.request().url());
  assert.equal(url.origin, base.origin);
  try {
    return await route.fetch({
      timeout: 15000,
      maxRedirects: 0,
      headers: { ...(await route.request().allHeaders()), cookie: sessions[actor] },
    });
  } catch {
    throw new Error(
      'Local routed registry transport unavailable: ' + route.request().method() + ' ' + url.pathname,
    );
  }
}
function guarded(work) {
  return async (route) => {
    try {
      return await work(route);
    } catch (e) {
      injections.push(e);
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"error":"Local injection failed"}',
      });
    }
  };
}
const configs = {
  students: {
    path: '/students',
    api: '/api/students',
    create: '/api/registry/students',
    kind: 'student',
    title: 'Student Registry',
    reload: 'Reload students',
    save: 'Create Student',
    attr: 'data-student-id',
    receipt: 'Original student creation receipt',
    retry: 'Retry pending student creation',
    fields: () => ({
      'First name': 'Reviewed Student ' + suffix,
      'Last name': 'Synthetic',
      'Date of birth': '2012-02-29',
      'Admission number': 'REVIEWED-' + suffix,
      'Grade level': '8',
    }),
  },
  guardians: {
    path: '/guardians',
    api: '/api/guardians',
    create: '/api/registry/guardians',
    kind: 'guardian',
    title: 'Guardians',
    reload: 'Reload guardians',
    save: 'Create Guardian',
    attr: 'data-guardian-id',
    receipt: 'Original guardian creation receipt',
    retry: 'Retry pending guardian creation',
    fields: () => ({
      Name: 'Reviewed Guardian ' + suffix,
      Phone: '+910000000000',
      Email: suffix + '@example.invalid',
      Relationship: 'Synthetic guardian',
    }),
  },
};
const reload = (page, c) => page.getByRole('button', { name: c.reload, exact: true });
const createControl = (page, c) => page.getByRole('button', { name: c.save, exact: true });
const save = (page, c) =>
  c.kind === 'student'
    ? page.getByRole('dialog').getByRole('button', { name: c.save, exact: true })
    : createControl(page, c);
const field = (page, label) =>
  page.getByRole('textbox', { name: new RegExp('^' + label + '(?: \\*)?$', 'i') });
const rows = (page, c) => page.locator('[' + c.attr + ']');
const reviewed = (page, c) =>
  page.getByRole('checkbox', {
    name: 'I reviewed these details and confirm creating an unlinked ' + c.kind + ' profile.',
    exact: true,
  });
const receiptRegion = (page, c) => page.getByRole('region', { name: c.receipt, exact: true });
async function open(page, c) {
  await page.goto(base.origin + c.path, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: c.title, exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Loading current' })).toHaveCount(0);
  await expect(reload(page, c)).toBeEnabled();
}
async function refresh(page, c) {
  const delivered = page.waitForResponse(
    (response) => new URL(response.url()).pathname === c.api && response.request().method() === 'GET',
  );
  await reload(page, c).click();
  const response = await delivered;
  await response.body();
  await expect(page.getByRole('status').filter({ hasText: 'Loading current' })).toHaveCount(0);
  await expect(reload(page, c)).toBeEnabled();
  await expect(
    page.getByRole('alert').filter({ hasText: /Could not reload|Current registry access|Sign in to reload/ }),
  ).toHaveCount(0);
}
async function fill(page, c, tag) {
  if (c.kind === 'student' && !(await page.getByRole('dialog').count())) await createControl(page, c).click();
  for (const [label, original] of Object.entries(c.fields())) {
    const value = /name|admission number/i.test(label) ? original + ' ' + tag : original;
    if (/date of birth/i.test(label)) await page.getByLabel(/Date of birth/i).fill(value);
    else await field(page, label).fill(value);
  }
  await page
    .getByRole('textbox', { name: 'Reason for creating this profile', exact: true })
    .fill('Synthetic reviewed profile ' + tag);
  await reviewed(page, c).check();
}
async function submit(page, c) {
  const received = page.waitForResponse(
    (response) => new URL(response.url()).pathname === c.create && response.request().method() === 'POST',
  );
  await save(page, c).click();
  const response = await received;
  assert.equal(response.status(), 201);
  const body = await response.json();
  await expect(page.getByRole('status').filter({ hasText: /profile was saved/i })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Loading current' })).toHaveCount(0);
  return body;
}
async function injectedSubmit(page, c) {
  await expect(save(page, c)).toBeEnabled();
  await save(page, c).evaluate((button) => button.form.requestSubmit());
}
async function sameFrame(page, c) {
  let posts = 0;
  const count = (request) => {
    if (new URL(request.url()).pathname === c.create && request.method() === 'POST') posts++;
  };
  page.on('request', count);
  try {
    const response = page.waitForResponse(
      (r) => new URL(r.url()).pathname === c.create && r.request().method() === 'POST',
    );
    await save(page, c).evaluate((button) => {
      button.form.requestSubmit();
      button.form.requestSubmit();
    });
    const saved = await response;
    assert.equal(saved.status(), 201);
    await saved.body();
    await expect(page.getByRole('status').filter({ hasText: /profile was saved/i })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Loading current' })).toHaveCount(0);
    assert.equal(posts, 1);
  } finally {
    page.off('request', count);
  }
}
async function widths(page) {
  assert.equal(
    await page
      .locator('input:not([type=hidden]),select,textarea')
      .evaluateAll(
        (items) =>
          items.filter(
            (item) =>
              !item.labels?.length &&
              !item.getAttribute('aria-label') &&
              !item.getAttribute('aria-labelledby'),
          ).length,
      ),
    0,
  );
  const size = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(size.scroll <= size.width + 1, JSON.stringify(size));
}
async function shot(page, name) {
  await page.bringToFront();
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.documentElement.style.outline = '1px solid transparent';
    const frames = () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    document.body.getBoundingClientRect();
    await frames();
    scrollTo(0, document.documentElement.scrollHeight);
    await frames();
    scrollTo(0, 0);
    await frames();
  });
  const path = '/private/tmp/saha-reviewed-registry-ui-' + name + '.png';
  await page.screenshot({ path, fullPage: true });
  screenshots.push(path);
}
async function editProfile(admin, c, original) {
  if (c.kind === 'student')
    return api(
      admin,
      c.api + '/' + original.id,
      'PATCH',
      { ...original, firstName: 'Later current student ' + suffix },
      200,
    );
  // Guardians have no ordinary-field PATCH route. Use the existing reviewed
  // account link to change this suffix-only current profile legitimately.
  const account = await api(
    admin,
    '/api/admin/users',
    'POST',
    {
      clientRequestId: crypto.randomUUID(),
      reviewConfirmed: true,
      reason: 'Synthetic reviewed guardian account for receipt recovery',
      name: 'Reviewed recovery guardian ' + suffix,
      email: 'reviewed-recovery-' + suffix + '@example.invalid',
      role: 'guardian',
      identityIssuer: 'https://identity.example.invalid',
      identitySubject: 'reviewed-recovery-' + suffix,
    },
    201,
  );
  const linked = await api(
    admin,
    '/api/admin/profile-links',
    'POST',
    {
      clientRequestId: crypto.randomUUID(),
      reviewConfirmed: true,
      reason: 'Synthetic reviewed current profile change after lost receipt',
      profileType: 'guardian',
      profileId: original.id,
      userId: account.user.id,
      expectedVersion: 0,
    },
    200,
  );
  assert.equal(linked.profile.userId, account.user.id);
  return { ...original, userId: account.user.id };
}
const outcomeAlert = (page) =>
  page.getByRole('alert').filter({ hasText: 'The create outcome could not be confirmed.' });
const resultPath = '/private/tmp/saha-reviewed-registry-ui-results.json';
try {
  const admin = await context('admin-a'),
    guardian = await context('guardian-a'),
    teacher = await context('teacher-a'),
    learner = await context('student-user-a');
  const principal = await api(admin, '/api/session');
  assert.equal(principal.role, 'admin');
  const pages = { students: await admin.newPage(), guardians: await admin.newPage() },
    created = {};
  for (const [kind, c] of Object.entries(configs)) {
    const page = pages[kind];
    await open(page, c);
    await check(
      kind + ': review confirmation is explicit and field changes reset it before any create',
      async () => {
        await fill(page, c, 'normal');
        await field(page, c.kind === 'student' ? 'First name' : 'Name').fill(
          c.fields()[c.kind === 'student' ? 'First name' : 'Name'] + ' normal-reviewed',
        );
        await expect(reviewed(page, c)).not.toBeChecked();
        let posts = 0;
        const count = (r) => {
          if (new URL(r.url()).pathname === c.create && r.method() === 'POST') posts++;
        };
        page.on('request', count);
        try {
          await injectedSubmit(page, c);
          await expect(
            page.getByRole('alert').filter({ hasText: 'Review the profile and give a reason' }),
          ).toBeVisible();
          assert.equal(posts, 0);
        } finally {
          page.off('request', count);
        }
        await reviewed(page, c).check();
        await widths(page);
      },
    );
    await check(
      kind + ': genuine creation returns an unlinked same-school original receipt and current row',
      async () => {
        const result = await submit(page, c);
        created[kind] = result.receipt.profile;
        assert.equal(result.replayed, false);
        assert.equal(result.receipt.profile.userId, null);
        assert.equal(result.receipt.schoolId, principal.schoolId);
        await expect(receiptRegion(page, c)).toContainText(result.receipt.id);
        await expect(
          rows(page, c).filter({
            hasText: c.kind === 'student' ? created[kind].admissionNumber : created[kind].name,
          }),
        ).toBeVisible();
        assert.deepEqual(await api(admin, '/api/registry/creations/' + result.receipt.id), result.receipt);
        if (c.kind === 'student') {
          await page
            .locator('[data-student-id=' + JSON.stringify(created[kind].id) + ']')
            .getByRole('link', { name: 'View', exact: true })
            .click();
          await expect(page.getByRole('heading', { name: 'Student Profile', exact: true })).toBeVisible();
          await open(page, c);
        }
      },
    );
    await check(
      kind + ': synchronous native double submission emits one reviewed POST and durable profile',
      async () => {
        await fill(page, c, 'same-frame');
        const before = (await api(admin, c.api)).length;
        await sameFrame(page, c);
        assert.equal((await api(admin, c.api)).length, before + 1);
      },
    );
    await check(
      kind +
        ': committed lost reply locks editing and exact UUID/body replay recovers original evidence after a later legitimate profile change',
      async () => {
        await fill(page, c, 'lost-ack');
        let first, originalBody;
        const sentBodies = [];
        const match = (url) => url.pathname === c.create;
        const lose = guarded(async (route) => {
          const body = route.request().postData();
          sentBodies.push(body);
          originalBody = body;
          const response = await routeFetch(route, 'admin-a');
          assert.equal(response.status(), 201);
          first = await response.json();
          return route.abort('failed');
        });
        await page.route(match, lose);
        try {
          await injectedSubmit(page, c);
          await expect(outcomeAlert(page)).toBeVisible();
          await expect(rows(page, c)).toHaveCount(0);
          await expect(createControl(page, c)).toHaveCount(0);
          await expect(field(page, c.kind === 'student' ? 'First name' : 'Name')).toHaveCount(0);
          assert.equal(sentBodies.length, 1);
        } finally {
          await page.unroute(match, lose);
        }
        const edited = await editProfile(admin, c, first.receipt.profile);
        assert.equal(edited.id, first.receipt.profile.id);
        await refresh(page, c);
        await expect(page.getByRole('button', { name: c.retry, exact: true })).toBeEnabled();
        const before = (await api(admin, c.api)).length;
        const observe = guarded(async (route) => {
          sentBodies.push(route.request().postData());
          return route.continue();
        });
        await page.route(match, observe);
        try {
          const delivered = page.waitForResponse(
            (r) => new URL(r.url()).pathname === c.create && r.request().method() === 'POST',
          );
          await page.getByRole('button', { name: c.retry, exact: true }).click();
          const response = await delivered;
          assert.equal(response.status(), 200);
          const result = await response.json();
          assert.equal(result.replayed, true);
          assert.deepEqual(result.receipt, first.receipt);
          assert.equal(sentBodies.length, 2);
          assert.equal(sentBodies[1], originalBody);
          await expect(receiptRegion(page, c)).toBeVisible();
          await expect(receiptRegion(page, c)).toContainText(
            c.kind === 'student' ? first.receipt.profile.firstName : first.receipt.profile.name,
          );
          await expect(
            rows(page, c).filter({ hasText: c.kind === 'student' ? edited.firstName : edited.name }),
          ).toBeVisible();
          const currentProfiles = await api(admin, c.api);
          assert.equal(currentProfiles.length, before);
          if (c.kind === 'guardian')
            assert.equal(currentProfiles.find((profile) => profile.id === edited.id).userId, edited.userId);
        } finally {
          await page.unroute(match, observe);
        }
      },
    );
    await check(
      kind +
        ': account change before uncertain reply hides old rows and original payload, only original administrator can retry',
      async () => {
        await fill(page, c, 'actor-bound');
        let first, originalBody;
        const match = (url) => url.pathname === c.create;
        const lose = guarded(async (route) => {
          originalBody = route.request().postData();
          const response = await routeFetch(route, 'admin-a');
          assert.equal(response.status(), 201);
          first = await response.json();
          await switchActor(admin, 'admin-b');
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: '{"error":"Injected uncertain delivery"}',
          });
        });
        await page.route(match, lose);
        try {
          await injectedSubmit(page, c);
          await expect(outcomeAlert(page)).toBeVisible();
          await expect(rows(page, c)).toHaveCount(0);
          await expect(createControl(page, c)).toHaveCount(0);
        } finally {
          await page.unroute(match, lose);
        }
        await refresh(page, c);
        await expect(page.locator('body')).not.toContainText(
          c.kind === 'student' ? first.receipt.profile.admissionNumber : first.receipt.profile.name,
        );
        await expect(page.getByRole('button', { name: c.retry, exact: true })).toHaveCount(0);
        await expect(createControl(page, c)).toHaveCount(0);
        await switchActor(admin, 'guardian-a');
        await refresh(page, c);
        await expect(page.getByRole('button', { name: c.retry, exact: true })).toHaveCount(0);
        await switchActor(admin, 'admin-a');
        await refresh(page, c);
        const responsePromise = page.waitForResponse(
          (r) => new URL(r.url()).pathname === c.create && r.request().method() === 'POST',
        );
        await page.getByRole('button', { name: c.retry, exact: true }).click();
        const response = await responsePromise;
        assert.equal(response.status(), 200);
        assert.equal(response.request().postData(), originalBody);
        assert.deepEqual((await response.json()).receipt, first.receipt);
        await expect(receiptRegion(page, c)).toBeVisible();
      },
    );
    await check(
      kind +
        ': committed401 acknowledgement and denied reload preserve private exact retry without navigating',
      async () => {
        await fill(page, c, 'denied-ack');
        let originalBody;
        const match = (url) => url.pathname === c.create;
        const deny = guarded(async (route) => {
          originalBody = route.request().postData();
          const response = await routeFetch(route, 'admin-a');
          assert.equal(response.status(), 201);
          await response.body();
          return route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: '{"error":"Injected denied delivery"}',
          });
        });
        await page.route(match, deny);
        try {
          await injectedSubmit(page, c);
          await expect(outcomeAlert(page)).toBeVisible();
          await expect(rows(page, c)).toHaveCount(0);
          await expect(receiptRegion(page, c)).toHaveCount(0);
          assert.equal(new URL(page.url()).pathname, c.path);
          await expect(
            page.getByRole('link', { name: 'Sign in in another tab', exact: true }),
          ).toHaveAttribute('target', '_blank');
        } finally {
          await page.unroute(match, deny);
        }
        const sessionMatch = (url) => url.pathname === '/api/session',
          sessionDeny = (route) =>
            route.fulfill({
              status: 401,
              contentType: 'application/json',
              body: '{"error":"Injected denied read"}',
            });
        await page.route(sessionMatch, sessionDeny);
        try {
          await reload(page, c).click();
          await expect(
            page.getByRole('alert').filter({ hasText: 'Sign in to reload the current registry.' }),
          ).toBeVisible();
          await expect(rows(page, c)).toHaveCount(0);
          assert.equal(new URL(page.url()).pathname, c.path);
        } finally {
          await page.unroute(sessionMatch, sessionDeny);
        }
        await refresh(page, c);
        const responsePromise = page.waitForResponse(
          (r) => new URL(r.url()).pathname === c.create && r.request().method() === 'POST',
        );
        await page.getByRole('button', { name: c.retry, exact: true }).click();
        const response = await responsePromise;
        assert.equal(response.status(), 200);
        assert.equal(response.request().postData(), originalBody);
        await response.body();
        await expect(receiptRegion(page, c)).toBeVisible();
      },
    );
    await check(
      kind + ': confirmed201 survives failed list refresh and hides unavailable private receipt details',
      async () => {
        await fill(page, c, 'saved-refresh-fails');
        let committed = false,
          first;
        const createMatch = (url) => url.pathname === c.create,
          listMatch = (url) => url.pathname === c.api;
        const create = guarded(async (route) => {
          const response = await routeFetch(route, 'admin-a');
          assert.equal(response.status(), 201);
          first = await response.json();
          committed = true;
          return route.fulfill({ response });
        });
        const fail = (route) =>
          committed
            ? route.fulfill({
                status: 503,
                contentType: 'application/json',
                body: '{"error":"Injected failed refresh"}',
              })
            : route.continue();
        await page.route(createMatch, create);
        await page.route(listMatch, fail);
        try {
          await injectedSubmit(page, c);
          await expect(page.getByRole('status').filter({ hasText: /profile was saved/i })).toContainText(
            'The list refresh failed',
          );
          await expect(rows(page, c)).toHaveCount(0);
          await expect(receiptRegion(page, c)).toHaveCount(0);
          await expect(outcomeAlert(page)).toHaveCount(0);
        } finally {
          await page.unroute(createMatch, create);
          await page.unroute(listMatch, fail);
        }
        await refresh(page, c);
        await expect(receiptRegion(page, c)).toContainText(first.receipt.id);
      },
    );
    await check(
      kind + ': definitive400 retains fields and reason, resets review and exposes rejection accessibly',
      async () => {
        await fill(page, c, 'rejected');
        const match = (url) => url.pathname === c.create,
          reject = (route) =>
            route.fulfill({
              status: 400,
              contentType: 'application/json',
              body: '{"error":"Injected definitive invalid request"}',
            });
        await page.route(match, reject);
        try {
          await injectedSubmit(page, c);
          await expect(
            page.getByRole('alert').filter({ hasText: 'The profile was rejected.' }),
          ).toBeVisible();
          if (c.kind === 'student') await createControl(page, c).click();
          await expect(field(page, c.kind === 'student' ? 'First name' : 'Name')).toHaveValue(/rejected$/);
          await expect(
            page.getByRole('textbox', { name: 'Reason for creating this profile', exact: true }),
          ).toHaveValue('Synthetic reviewed profile rejected');
          await expect(reviewed(page, c)).not.toBeChecked();
        } finally {
          await page.unroute(match, reject);
        }
        if (c.kind === 'student') {
          await page.keyboard.press('Escape');
          await expect(page.getByRole('dialog')).toHaveCount(0);
        }
      },
    );
    await check(
      kind + ':409 requires explicit current reload and new review rather than an uncertain retry',
      async () => {
        await fill(page, c, 'conflict');
        let conflictId;
        const match = (url) => url.pathname === c.create,
          reject = guarded(async (route) => {
            conflictId = JSON.parse(route.request().postData()).clientRequestId;
            return route.fulfill({
              status: 409,
              contentType: 'application/json',
              body: '{"error":"Injected current-record conflict"}',
            });
          });
        await page.route(match, reject);
        try {
          await injectedSubmit(page, c);
          await expect(
            page.getByRole('alert').filter({ hasText: 'The reviewed creation conflicted' }),
          ).toBeVisible();
          await expect(createControl(page, c)).toHaveCount(0);
          await expect(page.getByRole('button', { name: c.retry, exact: true })).toHaveCount(0);
        } finally {
          await page.unroute(match, reject);
        }
        await refresh(page, c);
        if (c.kind === 'student') await createControl(page, c).click();
        await expect(field(page, c.kind === 'student' ? 'First name' : 'Name')).toHaveValue(/conflict$/);
        await expect(reviewed(page, c)).not.toBeChecked();
        await reviewed(page, c).check();
        const result = await submit(page, c);
        assert.notEqual(result.receipt.id, conflictId);
      },
    );
    await check(
      kind + ': known403/404 list denial clears private rows, receipt and creation controls',
      async () => {
        for (const status of [403, 404]) {
          const match = (url) => url.pathname === c.api,
            deny = (route) =>
              route.fulfill({
                status,
                contentType: 'application/json',
                body: '{"error":"Injected unavailable scope"}',
              });
          await page.route(match, deny);
          try {
            await reload(page, c).click();
            await expect(
              page.getByRole('alert').filter({ hasText: 'Current registry access is unavailable' }),
            ).toBeVisible();
            await expect(rows(page, c)).toHaveCount(0);
            await expect(receiptRegion(page, c)).toHaveCount(0);
            await expect(createControl(page, c)).toHaveCount(0);
          } finally {
            await page.unroute(match, deny);
          }
          await refresh(page, c);
        }
      },
    );
    await check(
      kind + ': list503 availability failure clears stale rows without inventing an empty registry',
      async () => {
        const match = (url) => url.pathname === c.api,
          fail = (route) =>
            route.fulfill({
              status: 503,
              contentType: 'application/json',
              body: '{"error":"Injected temporary availability"}',
            });
        await page.route(match, fail);
        try {
          await reload(page, c).click();
          await expect(page.getByRole('alert').filter({ hasText: 'Could not reload' })).toBeVisible();
          await expect(rows(page, c)).toHaveCount(0);
          await expect(createControl(page, c)).toHaveCount(0);
          await expect(
            page.getByText(c.kind === 'student' ? 'No students found' : 'No guardians found.', {
              exact: true,
            }),
          ).toHaveCount(0);
        } finally {
          await page.unroute(match, fail);
        }
        await refresh(page, c);
      },
    );
    await check(
      kind + ': delayed former-administrator list is suppressed after an actual guardian account switch',
      async () => {
        let release, entered, delivered;
        const ready = new Promise((resolve) => (entered = resolve)),
          wait = new Promise((resolve) => (release = resolve)),
          finished = new Promise((resolve) => (delivered = resolve));
        let held = false;
        const match = (url) => url.pathname === c.api;
        const delay = guarded(async (route) => {
          if (held) return route.continue();
          held = true;
          const response = await routeFetch(route, 'admin-a');
          assert.equal(response.status(), 200);
          const body = await response.body();
          entered();
          await wait;
          try {
            await route.fulfill({ status: 200, contentType: 'application/json', body });
          } catch {
            /* The old request may correctly have been aborted. */
          } finally {
            delivered();
          }
        });
        await page.route(match, delay);
        try {
          await reload(page, c).click();
          await ready;
          await switchActor(admin, 'guardian-a');
          await refresh(page, c);
          release();
          await finished;
        } finally {
          release();
          await page.unroute(match, delay);
        }
        await expect(createControl(page, c)).toHaveCount(0);
        const expected = (await api(guardian, c.api))
          .slice(0, c.kind === 'student' ? 200 : undefined)
          .map((row) => row.id)
          .sort();
        const actual = await rows(page, c).evaluateAll(
          (nodes, attribute) => nodes.map((node) => node.getAttribute(attribute)).sort(),
          c.attr,
        );
        assert.deepEqual(actual, expected);
        await switchActor(admin, 'admin-a');
        await refresh(page, c);
      },
    );
  }
  await check(
    'A real existing admission-number conflict blocks new creation until current reload and deliberate field correction',
    async () => {
      const page = pages.students,
        c = configs.students;
      await fill(page, c, 'admission-conflict');
      await field(page, 'Admission number').fill(created.students.admissionNumber);
      await reviewed(page, c).check();
      const rejected = page.waitForResponse(
        (response) => new URL(response.url()).pathname === c.create && response.request().method() === 'POST',
      );
      await save(page, c).click();
      const response = await rejected;
      assert.equal(response.status(), 409);
      await response.body();
      await expect(
        page.getByRole('alert').filter({ hasText: 'The reviewed creation conflicted' }),
      ).toBeVisible();
      await expect(createControl(page, c)).toHaveCount(0);
      await refresh(page, c);
      await createControl(page, c).click();
      await expect(field(page, 'Admission number')).toHaveValue(created.students.admissionNumber);
      await expect(reviewed(page, c)).not.toBeChecked();
      await field(page, 'Admission number').fill('REVIEWED-CORRECTED-' + suffix);
      await reviewed(page, c).check();
      const corrected = await submit(page, c);
      assert.equal(corrected.receipt.profile.admissionNumber, 'REVIEWED-CORRECTED-' + suffix);
    },
  );
  await check(
    'Teacher, learner and guardian see only scoped registry rows with administrator creation hidden',
    async () => {
      for (const actor of [teacher, learner, guardian])
        for (const c of Object.values(configs)) {
          const page = await actor.newPage();
          await open(page, c);
          await expect(createControl(page, c)).toHaveCount(0);
          const expected = (await api(actor, c.api))
            .slice(0, c.kind === 'student' ? 200 : undefined)
            .map((row) => row.id)
            .sort();
          const actual = await rows(page, c).evaluateAll(
            (nodes, attribute) => nodes.map((node) => node.getAttribute(attribute)).sort(),
            c.attr,
          );
          assert.deepEqual(actual, expected);
          await page.close();
        }
    },
  );
  await check(
    'Student search remains bound to200characters and current authorized names/admission numbers',
    async () => {
      const page = pages.students,
        c = configs.students,
        search = page.getByRole('textbox', {
          name: 'Search students by name or admission number',
          exact: true,
        });
      await expect(search).toHaveAttribute('maxlength', '200');
      await search.fill(created.students.admissionNumber);
      await expect(rows(page, c)).toHaveCount(1);
      await search.fill('x'.repeat(205));
      assert.equal((await search.inputValue()).length, 200);
      await search.fill('');
    },
  );
  await check(
    'Desktop registry screens preserve native labels and full-page profile-link destinations',
    async () => {
      await widths(pages.students);
      await widths(pages.guardians);
      await expect(pages.students.locator('[data-student-id] a').first()).toHaveAttribute(
        'href',
        /^\/students\//,
      );
      await expect(
        pages.students.getByRole('link', { name: 'reviewed profile links', exact: true }),
      ).toHaveAttribute('href', '/admin/profile-links');
    },
  );
  await shot(pages.students, 'students-desktop');
  await shot(pages.guardians, 'guardians-desktop');
  await check(
    '390px reviewed student and guardian forms have labels, keyboard focus and no horizontal overflow',
    async () => {
      for (const [kind, c] of Object.entries(configs)) {
        const page = pages[kind];
        await page.setViewportSize({ width: 390, height: 844 });
        await fill(page, c, 'mobile');
        await widths(page);
        const control = page.getByRole('textbox', { name: 'Reason for creating this profile', exact: true });
        await control.focus();
        await expect(control).toBeFocused();
        await expect(reviewed(page, c)).toBeChecked();
        if (c.kind === 'student') {
          await page.keyboard.press('Escape');
          await expect(page.getByRole('dialog')).toHaveCount(0);
        } else {
          const region = page.getByRole('region', { name: 'Guardian profiles', exact: true });
          await region.focus();
          await expect(region).toBeFocused();
        }
      }
    },
  );
  await shot(pages.students, 'students-mobile');
  await shot(pages.guardians, 'guardians-mobile');
  await check(
    'Observed reviewed registry traffic remains local with no page errors or failed assets',
    async () => {
      assert.deepEqual(external, []);
      assert.deepEqual(errors, []);
      assert.deepEqual(assets, []);
    },
  );
  const result = {
    executedAt: new Date().toISOString(),
    passed,
    failed: 0,
    skipped: 0,
    externalRequests: external.length,
    pageErrors: errors.length,
    checks,
    screenshots,
    limits: [
      'Built localhost Worker and synthetic opaque session cookies only.',
      'Lost or denied acknowledgements are named local browser delivery injections after real commits;409/400 browser outcomes are named response injections, while real SQL conflict/rollback races are independently covered offline.',
      'Original receipt evidence is separate from a later student ordinary-field PATCH or guardian reviewed account link; only suffix-created profiles/accounts are changed.',
      'Base profiles, roles, mappings and family relationships were not changed.',
      'Pending requests currently survive the mounted page only; hard-reload persistence is not claimed.',
      'No external providers, messaging, deployment, live data, UAT acceptance or accessibility certification were exercised.',
    ],
  };
  writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n');
  console.log(
    JSON.stringify({ passed, failed: 0, externalRequests: external.length, pageErrors: errors.length }),
  );
} catch (error) {
  writeFileSync(
    resultPath,
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        passed,
        failed: 1,
        checks,
        screenshots,
        failure: error instanceof Error ? error.message : String(error),
        externalRequests: external.length,
        pageErrors: errors.length,
      },
      null,
      2,
    ) + '\n',
  );
  throw error;
} finally {
  for (const item of contexts) await item.close();
  await browser.close();
}
