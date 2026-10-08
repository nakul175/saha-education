// Actual synthetic opaque sessions/routes/production D1 over SQLite.
// Candidate page callbacks use substituted hooks/elements, not mounted-browser evidence.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { drizzle } from 'drizzle-orm/d1';
import { freshDatabase, seedSecurityData, load, bindings, root } from '../support/security-db.mjs';
import { serverWork, settleQuiet } from '../support/quiescence.mjs';
const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
const routes = {
  session: await load('app/api/session/route.ts'),
  profile: await load('app/api/students/[id]/route.ts'),
  links: await load('app/api/students/[id]/guardians/route.ts'),
  guardians: await load('app/api/guardians/route.ts'),
  classes: await load('app/api/classes/route.ts'),
  assessments: await load('app/api/assessments/route.ts'),
  results: await load('app/api/assessments/[id]/results/route.ts'),
};
const sessions = await load('lib/education/session.ts');
const calendar = await load('lib/education/calendar-date.ts');
let checks = 0,
  scenarios = 0,
  requests = 0,
  externalRequests = 0,
  activeUI;
const check = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks++;
};
const okay = (actual, message) => {
  assert.ok(actual, message);
  checks++;
};
const oldFetch = globalThis.fetch,
  oldWindow = globalThis.window;
const redirects = [];
globalThis.window = {
  location: {
    origin,
    assign(path) {
      redirects.push(path);
    },
  },
};
const nodes = (value) =>
  Array.isArray(value)
    ? value.flatMap(nodes)
    : value && typeof value === 'object'
      ? [value, ...nodes(value.props?.children)]
      : [];
const text = (value) =>
  Array.isArray(value)
    ? value.map(text).join('')
    : value && typeof value === 'object'
      ? text(value.props?.children)
      : value == null || typeof value === 'boolean'
        ? ''
        : String(value);
globalThis.__sahaProfileAssessmentReact = {
  createElement(type, props, ...children) {
    const values = { ...props, children: children.length === 1 ? children[0] : children };
    return typeof type === 'function' ? type(values) : { type, props: values };
  },
  useState(initial) {
    const ui = activeUI,
      index = ui.index++;
    if (!ui.cells[index]) ui.cells[index] = { value: typeof initial === 'function' ? initial() : initial };
    return [
      ui.cells[index].value,
      (value) => {
        ui.cells[index].value = typeof value === 'function' ? value(ui.cells[index].value) : value;
      },
    ];
  },
  useRef(initial) {
    const ui = activeUI,
      index = ui.index++;
    if (!ui.cells[index]) ui.cells[index] = { current: initial };
    return ui.cells[index];
  },
  useCallback(callback, deps) {
    const ui = activeUI,
      index = ui.index++,
      old = ui.cells[index];
    if (!old || deps.some((value, index) => value !== old.deps[index])) ui.cells[index] = { deps, callback };
    return ui.cells[index].callback;
  },
  useEffect(callback, deps) {
    const ui = activeUI,
      index = ui.index++,
      old = ui.cells[index];
    if (!old || !deps || !old.deps || deps.some((value, index) => value !== old.deps[index])) {
      old?.cleanup?.();
      ui.cells[index] = { deps };
      ui.effects.push(() => {
        ui.cells[index].cleanup = callback();
      });
    }
  },
};
globalThis.__sahaProfileAssessmentCalendar = calendar;
async function client(path) {
  const compiled = ts.transpileModule(readFileSync(root + path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React },
  }).outputText;
  const prefix =
    'const React=globalThis.__sahaProfileAssessmentReact;const {useState,useRef,useCallback,useEffect}=React;const AppShell="app-shell",Button="button",Label="label",Card="section",CardContent="div",CardDescription="p",CardHeader="header",CardTitle="h2",Table="table",TableBody="tbody",TableCell="td",TableHead="th",TableHeader="thead",TableRow="tr";const {isExactCalendarDate}=globalThis.__sahaProfileAssessmentCalendar;\n';
  return import(
    'data:text/javascript;base64,' +
      Buffer.from(prefix + compiled.replace(/^import[^\n]*;\n/gm, '')).toString('base64')
  );
}
const Profile = (await client('app/students/[id]/page.tsx')).default;
const Index = (await client('app/assessments/page.tsx')).default;
const settle = () => settleQuiet();
function driver(Component, props) {
  const ui = {
    cells: [],
    effects: [],
    index: 0,
    tree: null,
    props,
    render() {
      activeUI = ui;
      ui.index = 0;
      ui.effects = [];
      ui.tree = Component(ui.props);
      for (const effect of ui.effects) effect();
    },
    all(predicate) {
      return nodes(ui.tree).filter(predicate);
    },
    one(predicate) {
      const found = ui.all(predicate);
      assert.equal(found.length, 1, 'Exactly one intended native control');
      return found[0];
    },
    button(label) {
      return ui.one((item) => item.type === 'button' && text(item) === label);
    },
    async flush() {
      await settle();
      ui.render();
      await settle();
      ui.render();
    },
    async click(label) {
      const item = ui.button(label);
      okay(!item.props.disabled, 'Intended action is enabled');
      await item.props.onClick();
      await ui.flush();
    },
    async change(id, value) {
      const item = ui.one((item) => item.type === 'select' && item.props.id === id);
      okay(!item.props.disabled, 'Native selection is enabled');
      item.props.onChange({ target: { value } });
      await ui.flush();
    },
    dispose() {
      for (const cell of ui.cells) cell?.cleanup?.();
    },
  };
  ui.render();
  return ui;
}
const has = (ui, value) => text(ui.tree).includes(value);
const rowIds = (ui, attr) =>
  ui
    .all((item) => item.props?.[attr])
    .map((item) => item.props[attr])
    .sort();
const shell = (ui) => ui.one((item) => item.type === 'app-shell').props.principal;
const privateProfile = (ui) => ui.all((item) => item.type === 'dl').length;
async function scenario(name, kind, action, initialActor = 'admin-a') {
  const fixture = freshDatabase();
  await seedSecurityData(fixture.db, fixture.schema);
  const { sqlite, schema } = fixture;
  function prepare(query, values = []) {
    return {
      bind(...params) {
        return prepare(query, params);
      },
      async raw() {
        const statement = sqlite.prepare(query);
        statement.setReturnArrays(true);
        return statement.all(...values);
      },
      async all() {
        return { success: true, results: sqlite.prepare(query).all(...values), meta: {} };
      },
      async run() {
        const statement = sqlite.prepare(query);
        if (statement.columns().length) return { success: true, results: statement.all(...values), meta: {} };
        const result = statement.run(...values);
        return { success: true, results: [], meta: { changes: Number(result.changes) } };
      },
    };
  }
  globalThis.__sahaTestDb = drizzle(
    {
      prepare,
      async batch(statements) {
        sqlite.exec('BEGIN');
        try {
          const result = [];
          for (const statement of statements) result.push(await statement.run());
          sqlite.exec('COMMIT');
          return result;
        } catch (error) {
          sqlite.exec('ROLLBACK');
          throw error;
        }
      },
    },
    { schema },
  );
  const cookies = {};
  for (const id of ['admin-a', 'admin-b', 'teacher-a', 'guardian-a', 'student-user-a'])
    cookies[id] = (await sessions.createSession(id)).split(';')[0];
  let actor = initialActor,
    intercept;
  const trace = [],
    responses = [],
    uis = [];
  function api(...args) {
    return serverWork(() => routeApi(...args));
  }
  async function routeApi(path, method = 'GET', payload, user = actor) {
    const url = new URL(path, origin);
    if (url.origin !== origin) {
      externalRequests++;
      throw new Error('Contracts are local synthetic only');
    }
    requests++;
    const headers = { origin, ...(user ? { cookie: cookies[user] } : {}) };
    const request = new Request(url, {
      method,
      headers: { ...headers, ...(payload === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(payload === undefined
        ? {}
        : { body: typeof payload === 'string' ? payload : JSON.stringify(payload) }),
    });
    if (url.pathname === '/api/session') return routes.session[method](request);
    if (url.pathname === '/api/guardians') return routes.guardians[method](request);
    if (url.pathname === '/api/classes') return routes.classes[method](request);
    if (url.pathname === '/api/assessments') return routes.assessments[method](request);
    const profile = /^\/api\/students\/([^/]+)(\/guardians)?$/.exec(url.pathname);
    if (profile)
      return (profile[2] ? routes.links : routes.profile)[method](request, {
        params: Promise.resolve({ id: decodeURIComponent(profile[1]) }),
      });
    const result = /^\/api\/assessments\/([^/]+)\/results$/.exec(url.pathname);
    if (result) return routes.results[method](request, { params: Promise.resolve({ id: result[1] }) });
    throw new Error('Unexpected local contract route');
  }
  globalThis.fetch = async (path, options = {}) => {
    const response = await api(String(path), options.method || 'GET', options.body);
    trace.push({
      path: String(path),
      method: options.method || 'GET',
      status: response.status,
      ...(options.body ? { body: options.body } : {}),
    });
    const result = intercept ? await intercept({ path: String(path), options, response }) : response;
    if (result) responses.push(result);
    return result;
  };
  async function mount(props = { params: Promise.resolve({ id: 'student-a' }) }) {
    const ui = driver(kind === 'profile' ? Profile : Index, props);
    uis.push(ui);
    await ui.flush();
    return ui;
  }
  const writes = () => trace.filter((row) => row.method === 'POST');
  const linkedCount = () =>
    sqlite
      .prepare(
        "SELECT count(*) n FROM student_guardians WHERE student_id='student-a' AND guardian_id='guardian-profile-other'",
      )
      .get().n;
  const drained = () =>
    check(
      responses.every((response) => response.bodyUsed),
      true,
      'Every delivered success/error response is drained',
    );
  try {
    await action({
      ...fixture,
      mount,
      api,
      trace,
      writes,
      linkedCount,
      drained,
      setActor(value) {
        actor = value;
      },
      intercept(value) {
        intercept = value;
      },
    });
    scenarios++;
  } finally {
    for (const ui of uis) ui.dispose();
    intercept = undefined;
    await settle();
    sqlite.close();
  }
}
const reloadLabel = (kind) => (kind === 'profile' ? 'Reload student profile' : 'Reload assessments');
try {
  for (const [actor, role] of [
    ['admin-a', 'admin'],
    ['teacher-a', 'teacher'],
    ['guardian-a', 'guardian'],
    ['student-user-a', 'student'],
  ]) {
    await scenario(
      role + ' profile uses current shell and permitted names without unauthorized linking',
      'profile',
      async ({ mount, trace, api, drained }) => {
        const ui = await mount();
        check(shell(ui)?.role, role, 'Shell receives the verified current role');
        check(privateProfile(ui), 1, 'Authorized profile details render');
        okay(has(ui, 'student-a'), 'Actual scoped pupil is displayed');
        check(
          rowIds(ui, 'data-linked-guardian-id'),
          ['guardian-profile-a'],
          'Only actual permitted linked guardians render',
        );
        check(
          ui.all((item) => item.type === 'select' && item.props.id === 'guardian-choice').length,
          role === 'admin' ? 1 : 0,
          'Only administrator sees guardian association selection',
        );
        check(
          trace.filter((row) => row.path === '/api/guardians').length,
          role === 'admin' ? 1 : 0,
          'Non-administrator never loads administrator chooser inventory',
        );
        const anchors = ui.all((item) => item.type === 'a').map((item) => item.props.href);
        okay(
          anchors.includes('/') && anchors.includes('/students') && anchors.includes('/report-cards'),
          'Permitted native return/profile-report paths exist',
        );
        check(
          ui.all((item) => item.type === 'time').map((item) => item.props.dateTime),
          ['2012-01-01'],
          'Birth date is the exact stored calendar day',
        );
        if (role !== 'admin') {
          const rejected = await api('/api/students/student-a/guardians', 'POST', {
            guardianId: 'guardian-profile-other',
          });
          check(rejected.status, 403, 'Backend association remains administrator-only');
          await rejected.text();
        }
        drained();
      },
      actor,
    );
    await scenario(
      role + ' assessment metadata has honest navigation and no private result read',
      'index',
      async ({ mount, api, trace, drained }) => {
        const ui = await mount();
        check(shell(ui)?.role, role, 'Assessment shell is verified current role');
        check(
          rowIds(ui, 'data-assessment-list-item'),
          ['assessment-a'],
          'Only actual permitted assessment metadata renders',
        );
        const staff = role === 'admin' || role === 'teacher';
        check(
          ui.all((item) => item.type === 'a' && item.props.href === '/assessments/assessment-a').length,
          staff ? 1 : 0,
          'Only staff are invited to the unchanged result editor',
        );
        check(
          trace.some((row) => /results|result-editor/.test(row.path)),
          false,
          'Metadata list never fetches private results',
        );
        check(
          has(ui, 'Individual assessment results are private staff records.'),
          !staff,
          'Family sees accurate metadata restriction',
        );
        check(
          ui.all((item) => item.type === 'a' && text(item) === 'Published report cards').length,
          staff ? 0 : 1,
          'Family receives the existing published-report destination',
        );
        check(
          ui.one((item) => item.props?.['aria-label'] === 'Assessment metadata').props.tabIndex,
          0,
          'Scrollable metadata region has a keyboard focus target',
        );
        if (!staff) {
          const result = await api('/api/assessments/assessment-a/results');
          check(result.status, 403, 'Unpublished assessment results remain staff-only');
          await result.text();
        }
        drained();
      },
      actor,
    );
  }
  await scenario(
    'same-frame administrator link is one actual mutation and a known acknowledgement',
    'profile',
    async ({ mount, writes, linkedCount, drained }) => {
      const ui = await mount();
      await ui.change('guardian-choice', 'guardian-profile-other');
      const action = ui.button('Link Guardian').props.onClick;
      await Promise.all([action(), action()]);
      await ui.flush();
      check(writes().length, 1, 'Same-frame link callbacks send one actual POST');
      check(linkedCount(), 1, 'Exactly one intended relationship persists');
      check(
        rowIds(ui, 'data-linked-guardian-id'),
        ['guardian-profile-a', 'guardian-profile-other'],
        'Acknowledged reload displays current association',
      );
      okay(has(ui, 'Guardian link was acknowledged'), 'Known save is distinct from uncertain delivery');
      check(
        ui
          .one((item) => item.type === 'select')
          .props.children.flat()
          .filter((item) => item?.type === 'option' && item.props.value === 'guardian-profile-other').length,
        0,
        'Already linked guardian is excluded from new choices',
      );
      drained();
    },
  );
  for (const mode of ['network', 'unavailable', 'malformed', 'shape', '401', '403', '404'])
    await scenario(
      mode + ' committed reply loss retains exact original pair and recovers idempotently',
      'profile',
      async ({ mount, intercept, writes, linkedCount, sqlite, drained }) => {
        const ui = await mount();
        await ui.change('guardian-choice', 'guardian-profile-other');
        let changed = false;
        intercept(async ({ options, response }) => {
          if (options.method === 'POST' && !changed) {
            changed = true;
            check(response.status, 200, 'Fault is injected after actual original association commit');
            await response.text();
            if (mode === 'network') throw new TypeError('Synthetic reply loss');
            return new Response(
              mode === 'malformed' ? '{bad' : mode === 'shape' ? '{}' : '{"error":"Synthetic unavailable"}',
              { status: /^\d+$/.test(mode) ? Number(mode) : mode === 'unavailable' ? 503 : 200 },
            );
          }
          return response;
        });
        await ui.click('Link Guardian');
        intercept(undefined);
        check(linkedCount(), 1, 'Committed original pair is retained');
        check(privateProfile(ui), 0, 'Unknown acknowledgement hides old private profile');
        check(shell(ui), null, 'Unknown acknowledgement clears old role navigation');
        check(writes().length, 1, 'Unknown outcome never auto retries');
        okay(has(ui, 'outcome could not be confirmed'), 'Uncertainty has explicit recovery wording');
        sqlite.exec(
          "UPDATE student_guardians SET is_primary=1 WHERE student_id='student-a' AND guardian_id='guardian-profile-other'",
        );
        await ui.click('Reload student profile');
        check(writes().length, 1, 'Current reload is read-only');
        const bytes = writes()[0].body,
          endpoint = writes()[0].path;
        await ui.click('Retry pending guardian link');
        check(writes().length, 2, 'Explicit retry sends one original pair request');
        check(writes()[1].body, bytes, 'Pending body is exact original pair');
        check(writes()[1].path, endpoint, 'Pending endpoint is original pupil');
        check(writes()[1].status, 200, 'Established pair retry returns existing success');
        check(linkedCount(), 1, 'Pair retry creates no duplicate');
        check(
          sqlite
            .prepare(
              "SELECT is_primary FROM student_guardians WHERE student_id='student-a' AND guardian_id='guardian-profile-other'",
            )
            .get().is_primary,
          1,
          'Exact retry preserves subsequently established primary evidence',
        );
        drained();
      },
    );
  await scenario(
    'known save survives failed GET refresh without inferred empty relationships',
    'profile',
    async ({ mount, intercept, linkedCount, writes, drained }) => {
      const ui = await mount();
      await ui.change('guardian-choice', 'guardian-profile-other');
      let committed = false;
      intercept(async ({ options, path, response }) => {
        if (options.method === 'POST') committed = true;
        else if (committed && path.includes('/students/')) {
          await response.text();
          return new Response('{"error":"Synthetic read unavailable"}', { status: 503 });
        }
        return response;
      });
      await ui.click('Link Guardian');
      intercept(undefined);
      check(linkedCount(), 1, 'Known original link persisted');
      check(writes().length, 1, 'Refresh failure does not repeat mutation');
      okay(
        has(ui, 'Guardian link was acknowledged') && has(ui, 'profile refresh failed'),
        'Known committed acknowledgement and failed current refresh are separate',
      );
      check(privateProfile(ui), 0, 'Failed refresh does not display stale profile');
      check(has(ui, 'No linked guardians'), false, 'Failed GET cannot fabricate an empty relationship list');
      await ui.click('Reload student profile');
      check(
        rowIds(ui, 'data-linked-guardian-id').length,
        2,
        'Authorized explicit refresh recovers current relations',
      );
      check(
        ui.all((item) => item.props?.['aria-label'] === 'Acknowledged guardian link').length,
        1,
        'Original acknowledged pair is visible only after current same-actor load',
      );
      drained();
    },
  );
  await scenario(
    'pending pair cannot be displayed or posted by a different current account',
    'profile',
    async ({ mount, intercept, setActor, writes, drained }) => {
      const ui = await mount();
      await ui.change('guardian-choice', 'guardian-profile-other');
      let once = false;
      intercept(async ({ options, response }) => {
        if (options.method === 'POST' && !once) {
          once = true;
          await response.text();
          throw new TypeError('Synthetic loss');
        }
        return response;
      });
      await ui.click('Link Guardian');
      intercept(undefined);
      setActor('guardian-a');
      await ui.click('Reload student profile');
      check(shell(ui)?.role, 'guardian', 'Fresh guardian profile load is allowed');
      check(has(ui, 'Original pair:'), false, 'Different account cannot see retained pair details');
      check(
        ui.all((item) => item.type === 'button' && text(item) === 'Retry pending guardian link').length,
        0,
        'Different account cannot retry administrator pair',
      );
      check(
        ui.all((item) => item.type === 'select').length,
        0,
        'Different account has no association controls',
      );
      setActor('admin-a');
      await ui.click('Reload student profile');
      const stale = ui.button('Retry pending guardian link').props.onClick;
      setActor('admin-b');
      await ui.click('Reload student profile');
      await stale();
      await ui.flush();
      check(writes().length, 1, 'Stale retry callback cannot post with newer actor scope');
      check(privateProfile(ui), 0, 'Foreign administrator unavailable profile is hidden');
      setActor('admin-a');
      await ui.click('Reload student profile');
      await ui.click('Retry pending guardian link');
      check(
        writes()[1].body,
        writes()[0].body,
        'Original account retains exact pair through another-account denial',
      );
      drained();
    },
  );
  await scenario(
    'submission preflight verifies current administrator before any association request',
    'profile',
    async ({ mount, setActor, writes, drained }) => {
      const ui = await mount();
      await ui.change('guardian-choice', 'guardian-profile-other');
      setActor('guardian-a');
      await ui.click('Link Guardian');
      check(writes().length, 0, 'Current non-administrator preflight sends no POST');
      check(privateProfile(ui), 0, 'Preflight denial hides stale administrator profile');
      okay(has(ui, 'No guardian-link request was sent'), 'Preflight rejection does not claim unknown save');
      drained();
    },
  );
  for (const kind of ['profile', 'index'])
    await scenario(
      kind + ' obsolete administrator reply cannot replace current family scope',
      kind,
      async ({ mount, intercept, setActor, drained }) => {
        const ui = await mount();
        let release,
          started = false;
        intercept(async ({ path, response }) => {
          if (!started && path === (kind === 'profile' ? '/api/guardians' : '/api/assessments')) {
            started = true;
            await new Promise((resolve) => {
              release = resolve;
            });
          }
          return response;
        });
        ui.button(reloadLabel(kind)).props.onClick();
        await settle();
        okay(started, 'Old actual administrator read is delayed');
        setActor('guardian-a');
        await ui.click(reloadLabel(kind));
        check(shell(ui)?.role, 'guardian', 'Current family read completes first');
        release();
        await ui.flush();
        check(shell(ui)?.role, 'guardian', 'Superseded administrator reply does not restore old shell');
        check(
          ui.all((item) => item.type === 'select' && item.props.id === 'guardian-choice').length,
          0,
          'Superseded reply does not restore administrator chooser',
        );
        if (kind === 'index')
          check(
            ui.all((item) => item.type === 'a' && item.props.href.startsWith('/assessments/')).length,
            0,
            'Superseded reply does not restore staff links',
          );
        drained();
      },
    );
  for (const kind of ['profile', 'index'])
    await scenario(
      kind + ' actor change before final session refuses partially assembled current read',
      kind,
      async ({ mount, intercept, setActor, drained }) => {
        const ui = await mount();
        let changed = false;
        intercept(async ({ path, response }) => {
          if (!changed && path === (kind === 'profile' ? '/api/guardians' : '/api/assessments')) {
            changed = true;
            setActor('guardian-a');
          }
          return response;
        });
        await ui.click(reloadLabel(kind));
        check(shell(ui), null, 'Session mismatch cannot authorize first-account data');
        check(privateProfile(ui), 0, 'Session mismatch displays no pupil details');
        check(
          rowIds(ui, 'data-assessment-list-item').length,
          0,
          'Session mismatch displays no assessment rows',
        );
        intercept(undefined);
        await ui.click(reloadLabel(kind));
        check(shell(ui)?.role, 'guardian', 'Fresh current family reload recovers');
        drained();
      },
    );
  for (const kind of ['profile', 'index'])
    for (const status of [401, 403, 404, 503])
      await scenario(
        kind + ' current read ' + status + ' clears private rows and supports explicit restored read',
        kind,
        async ({ mount, intercept, drained }) => {
          const ui = await mount();
          let injected = false;
          intercept(async ({ path, response }) => {
            if (path === (kind === 'profile' ? '/api/students/student-a' : '/api/assessments')) {
              injected = true;
              await response.text();
              return new Response('{"error":"Synthetic read failure"}', { status });
            }
            return response;
          });
          await ui.click(reloadLabel(kind));
          okay(injected, 'Current protected response delivery reaches failure');
          check(shell(ui), null, 'Failed current read hides role shell');
          check(privateProfile(ui), 0, 'Failed read hides private pupil details');
          check(rowIds(ui, 'data-assessment-list-item').length, 0, 'Failed read hides private metadata rows');
          check(
            ui.all((item) => item.props?.role === 'alert').length,
            1,
            'Failure is a visible alert rather than empty success',
          );
          intercept(undefined);
          await ui.click(reloadLabel(kind));
          check(shell(ui)?.role, 'admin', 'Explicit restored current read clears failure');
          drained();
        },
      );
  for (const date of ['2012-02-29', '2012-02-30', 'legacy-nonempty-date-value', '2012-01-01T00:00:00+05:30'])
    await scenario(
      'profile date preserves stored evidence ' + date,
      'profile',
      async ({ mount, sqlite, drained }) => {
        sqlite.prepare("UPDATE students SET date_of_birth=? WHERE id='student-a'").run(date);
        const ui = await mount();
        okay(has(ui, date), 'Exact raw stored date is visible');
        check(
          has(ui, 'Stored date requires review:'),
          !calendar.isExactCalendarDate(date),
          'Malformed/noncalendar evidence is explicitly disclosed',
        );
        check(has(ui, 'Invalid Date'), false, 'No Date constructor failure text is fabricated');
        check(
          sqlite.prepare("SELECT date_of_birth FROM students WHERE id='student-a'").get().date_of_birth,
          date,
          'Display never normalizes stored evidence',
        );
        drained();
      },
    );
  await scenario(
    'assessment filter and legacy metadata remain truthful without inferred grades',
    'index',
    async ({ mount, sqlite, drained }) => {
      sqlite.exec("UPDATE assessments SET date='2026-02-30',max_score=-1 WHERE id='assessment-a'");
      const ui = await mount();
      okay(
        has(ui, 'Stored date requires review: 2026-02-30') && has(ui, 'Stored maximum requires review.'),
        'Invalid legacy metadata is labelled without normalization',
      );
      await ui.change('class-filter', 'class-other');
      check(rowIds(ui, 'data-assessment-list-item').length, 0, 'Native class choice filters current rows');
      okay(
        has(ui, 'Showing 0 of 1') && has(ui, 'No assessments are available for this selection.'),
        'Selected empty view is distinct from loaded total',
      );
      await ui.change('class-filter', '');
      check(
        rowIds(ui, 'data-assessment-list-item'),
        ['assessment-a'],
        'Native all-current selection restores permitted assessment',
      );
      check(
        { ...sqlite.prepare("SELECT date,max_score FROM assessments WHERE id='assessment-a'").get() },
        { date: '2026-02-30', max_score: -1 },
        'List display never repairs legacy source',
      );
      drained();
    },
  );
  for (const kind of ['profile', 'index'])
    await scenario(
      kind + ' duplicate delivered inventory fails honestly without partial rows',
      kind,
      async ({ mount, intercept, drained }) => {
        intercept(async ({ path, response }) => {
          if (path === (kind === 'profile' ? '/api/guardians' : '/api/assessments')) {
            const data = await response.json();
            return new Response(JSON.stringify([...data, data[0]]), { status: 200 });
          }
          return response;
        });
        const ui = await mount();
        check(shell(ui), null, 'Duplicate malformed response cannot authorize a partial view');
        check(
          ui.all((item) => item.props?.role === 'alert').length,
          1,
          'Ambiguous delivered inventory reports failure',
        );
        okay(
          has(ui, 'duplicated or incomplete rows'),
          'Ambiguous returned rows receive an explicit review message',
        );
        check(privateProfile(ui), 0, 'Duplicate response hides profile rather than duplicate keys');
        check(
          rowIds(ui, 'data-assessment-list-item').length,
          0,
          'Duplicate response displays no duplicate assessment rows',
        );
        drained();
      },
    );
  await scenario(
    'superseded unresolved profile route parameters cannot select the previous learner',
    'profile',
    async ({ mount, trace, drained }) => {
      let resolve;
      const previous = new Promise((done) => {
        resolve = done;
      });
      const ui = await mount({ params: previous });
      ui.props = { params: Promise.resolve({ id: 'student-a' }) };
      ui.render();
      await ui.flush();
      check(shell(ui)?.role, 'admin', 'Newest params load the actual permitted profile');
      resolve({ id: 'student-other' });
      await ui.flush();
      check(has(ui, 'student-other'), false, 'Late previous params cannot replace current learner');
      check(
        trace.some((row) => row.path === '/api/students/student-other'),
        false,
        'Superseded unresolved params never request old learner',
      );
      drained();
    },
  );
  await scenario(
    'actual account changes before unknown association acknowledgement hide all old protected content',
    'profile',
    async ({ mount, intercept, setActor, linkedCount, writes, drained }) => {
      const ui = await mount();
      await ui.change('guardian-choice', 'guardian-profile-other');
      let once = false;
      intercept(async ({ options, response }) => {
        if (options.method === 'POST' && !once) {
          once = true;
          check(response.status, 200, 'Cookie-change fault follows actual committed association');
          await response.text();
          setActor('guardian-a');
          return new Response('{"error":"Synthetic lost delivery"}', { status: 503 });
        }
        return response;
      });
      await ui.click('Link Guardian');
      intercept(undefined);
      check(linkedCount(), 1, 'Unknown delivery retains the actual original association');
      check(shell(ui), null, 'Changed-cookie unknown acknowledgement clears former administrator header');
      check(privateProfile(ui), 0, 'Changed-cookie unknown acknowledgement hides former private profile');
      check(
        has(ui, 'guardian-profile-other'),
        false,
        'Changed-cookie unknown acknowledgement hides retained guardian name',
      );
      await ui.click('Reload student profile');
      check(shell(ui)?.role, 'guardian', 'Actual new account reload remains permitted');
      check(
        ui.all((item) => item.type === 'button' && text(item) === 'Retry pending guardian link').length,
        0,
        'New account cannot recover administrator mutation',
      );
      setActor('admin-a');
      await ui.click('Reload student profile');
      await ui.click('Retry pending guardian link');
      check(
        writes()[1].body,
        writes()[0].body,
        'Original account recovery preserves exact pair after cookie switch',
      );
      check(linkedCount(), 1, 'Cookie-switch recovery creates no duplicate');
      drained();
    },
  );
  await scenario(
    'known acknowledgement after account change keeps saved fact without revealing original staff pair',
    'profile',
    async ({ mount, intercept, setActor, linkedCount, drained }) => {
      const ui = await mount();
      await ui.change('guardian-choice', 'guardian-profile-other');
      let once = false;
      intercept(async ({ options, response }) => {
        if (options.method === 'POST' && !once) {
          once = true;
          setActor('guardian-a');
        }
        return response;
      });
      await ui.click('Link Guardian');
      intercept(undefined);
      check(linkedCount(), 1, 'Known original association is retained');
      check(shell(ui)?.role, 'guardian', 'Confirmed save uses a fresh current family load');
      okay(has(ui, 'Guardian link was acknowledged'), 'Known save fact survives newer account view');
      check(
        ui.all((item) => item.props?.['aria-label'] === 'Acknowledged guardian link').length,
        0,
        'Different account sees no original acknowledged staff names',
      );
      check(
        rowIds(ui, 'data-linked-guardian-id'),
        ['guardian-profile-a'],
        'New account sees only its actual scoped current relationship',
      );
      drained();
    },
  );
  await scenario(
    'current empty guardian view is distinct from a failed current profile read',
    'profile',
    async ({ mount, sqlite, drained }) => {
      sqlite.exec("DELETE FROM student_guardians WHERE student_id='student-a'");
      const ui = await mount();
      check(privateProfile(ui), 1, 'Actual empty relationships do not hide an authorized profile');
      check(rowIds(ui, 'data-linked-guardian-id'), [], 'Actual zero linked guardians render zero rows');
      okay(
        has(ui, 'No linked guardians are available in this view.'),
        'Actual zero relationship list has explicit scoped empty text',
      );
      check(
        ui.all((item) => item.props?.role === 'alert').length,
        0,
        'Actual empty relationship list is a successful read',
      );
      drained();
    },
  );
  await scenario(
    'actual empty assessment inventory remains successful scoped metadata',
    'index',
    async ({ mount, sqlite, drained }) => {
      sqlite.exec("DELETE FROM assessments WHERE id='assessment-a'");
      const ui = await mount();
      check(shell(ui)?.role, 'admin', 'Actual empty current inventory retains verified shell');
      check(rowIds(ui, 'data-assessment-list-item'), [], 'Actual zero assessments render zero rows');
      okay(
        has(ui, 'Showing 0 of 0') && has(ui, 'No assessments are available for this selection.'),
        'Actual zero assessments have honest loaded total and empty text',
      );
      check(
        ui.all((item) => item.props?.role === 'alert').length,
        0,
        'Actual empty inventory is distinct from failed read',
      );
      drained();
    },
  );
  await scenario(
    'stale profile link and reload actions cannot select a previous learner after native route params change',
    'profile',
    async ({ mount, writes, trace, drained }) => {
      const ui = await mount();
      await ui.change('guardian-choice', 'guardian-profile-other');
      const oldLink = ui.button('Link Guardian').props.onClick,
        oldReload = ui.button('Reload student profile').props.onClick;
      ui.props = { params: Promise.resolve({ id: 'student-other' }) };
      ui.render();
      await ui.flush();
      check(has(ui, 'student-other'), true, 'New current profile is rendered');
      const before = trace.length;
      await oldLink();
      await oldReload();
      await ui.flush();
      check(writes().length, 0, 'Obsolete learner action sends no association POST');
      check(trace.length, before, 'Obsolete reload action requests no prior profile');
      check(
        ui.all((item) => item.props?.['aria-label'] === 'Pending guardian link').length,
        0,
        'Obsolete link action does not freeze a new profile with old pending state',
      );
      check(has(ui, 'student-other'), true, 'Obsolete callbacks preserve the current profile view');
      drained();
    },
  );
  check(externalRequests, 0, 'All evidence remains offline with fictional records');
  console.log(
    JSON.stringify({
      passed: checks,
      failed: 0,
      skipped: 0,
      scenarios,
      requests,
      externalRequests,
      scope:
        'actual opaque sessions/routes/production D1 SQLite; unchanged candidate callbacks with substituted React hooks/elements; not mounted-browser or accessibility evidence',
    }),
  );
} finally {
  globalThis.fetch = oldFetch;
  globalThis.window = oldWindow;
  delete globalThis.__sahaProfileAssessmentReact;
  delete globalThis.__sahaProfileAssessmentCalendar;
}
