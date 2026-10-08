// Independent actual synthetic sessions/routes/production D1 over SQLite.
// Unchanged candidate client callbacks use substituted hooks/elements, not mounted-browser evidence.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import { freshDatabase, seedSecurityData, load, bindings, root, stamp } from '../support/security-db.mjs';
import { serverWork, settleQuiet } from '../support/quiescence.mjs';
const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
const routes = {
  session: await load('app/api/session/route.ts'),
  students: await load('app/api/students/route.ts'),
  guardians: await load('app/api/guardians/route.ts'),
  reviewedStudents: await load('app/api/registry/students/route.ts'),
  reviewedGuardians: await load('app/api/registry/guardians/route.ts'),
};
const sessions = await load('lib/education/session.ts');
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
  oldWindow = globalThis.window,
  oldInputElement = globalThis.HTMLInputElement;
class ContractInput {}
globalThis.HTMLInputElement = ContractInput;
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
globalThis.__sahaRegistryContractReact = {
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
  useMemo(callback, deps) {
    const ui = activeUI,
      index = ui.index++,
      old = ui.cells[index];
    if (!old || deps.some((value, index) => value !== old.deps[index]))
      ui.cells[index] = { deps, value: callback() };
    return ui.cells[index].value;
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
globalThis.__sahaRegistryContractZ = z;
globalThis.__sahaRegistryContractForm = (options) => {
  const cell = globalThis.__sahaRegistryContractReact.useRef(null);
  if (!cell.current) {
    const form = { values: { ...options.defaultValues } };
    form.control = form;
    form.handleSubmit = (action) => (event) => {
      event.preventDefault();
      return action({ ...form.values });
    };
    form.reset = () => {
      form.values = { ...options.defaultValues };
    };
    cell.current = form;
  }
  return cell.current;
};
async function client(path) {
  const source = readFileSync(path.startsWith('/') ? path : root + path, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React },
  }).outputText;
  const prefix =
    'const React=globalThis.__sahaRegistryContractReact;const {useState,useRef,useCallback,useMemo,useEffect}=React;const AppShell="app-shell",Button="button",Input="input",Textarea="textarea",Label="label",Card="section",CardContent="div",CardDescription="p",CardHeader="header",CardTitle="h2",Badge="span",Link="a",Table="table",TableBody="tbody",TableCell="td",TableHead="th",TableHeader="thead",TableRow="tr",Dialog="dialog",DialogContent="section",DialogHeader="header",DialogTitle="h2",DialogTrigger="trigger",Form="form-provider",FormControl="control",FormItem="item",FormLabel="label",FormMessage="p";const z=globalThis.__sahaRegistryContractZ,useForm=globalThis.__sahaRegistryContractForm,zodResolver=()=>null;const FormField=props=>props.render({field:{name:props.name,value:props.control.values[props.name],onChange:event=>{props.control.values[props.name]=event.target.value;}}});\n';
  return import(
    'data:text/javascript;base64,' +
      Buffer.from(
        prefix +
          compiled.replace(/^import[^\n]*;\n/gm, '') +
          '\n//# sourceURL=saha-registry-contract-' +
          path.split('/').at(-1),
      ).toString('base64')
  );
}
// Candidate production sources are loaded unchanged after the preceding publication.
const Student = (await client('app/students/page.tsx')).default;
const Guardian = (await client('app/guardians/page.tsx')).default;
const settle = () => settleQuiet();
function driver(Component) {
  const ui = {
    cells: [],
    effects: [],
    index: 0,
    tree: null,
    render() {
      activeUI = ui;
      ui.index = 0;
      ui.effects = [];
      ui.tree = Component();
      for (const effect of ui.effects) effect();
    },
    all(predicate) {
      return nodes(ui.tree).filter(predicate);
    },
    one(predicate) {
      const result = ui.all(predicate);
      assert.equal(result.length, 1, 'Exactly one registry native control');
      return result[0];
    },
    button(label) {
      return ui.one(
        (item) =>
          item.type === 'button' &&
          (typeof label === 'string' ? text(item).includes(label) : label.test(text(item))),
      );
    },
    async flush() {
      await settle();
      ui.render();
      await settle();
      ui.render();
    },
    async click(label) {
      const item = ui.button(label);
      okay(!item.props.disabled, 'Requested registry action is enabled');
      await item.props.onClick();
      await ui.flush();
    },
    async change(predicate, value) {
      const item = ui.one(predicate),
        target = Object.assign(item.type === 'input' ? new ContractInput() : {}, {
          name: item.props.name,
          value,
          checked: value,
          type: item.props.type ?? 'text',
        });
      const event = { target };
      item.props.onChange(event);
      for (const form of ui.all((parent) => parent.type === 'form' && nodes(parent).includes(item)))
        form.props.onChange?.(event);
      await ui.flush();
    },
    async submit() {
      await ui.one((item) => item.type === 'form').props.onSubmit({ preventDefault() {} });
      await ui.flush();
    },
    dispose() {
      for (const cell of ui.cells) cell?.cleanup?.();
    },
  };
  ui.render();
  return ui;
}
const studentData = {
  firstName: 'Synthetic Registry',
  lastName: 'Contract',
  dateOfBirth: '2012-01-01',
  admissionNumber: 'REGISTRY-CONTRACT',
  gradeLevel: '8',
};
const guardianData = {
  name: 'Synthetic Registry Guardian',
  phone: '',
  email: 'registry-contract@example.invalid',
  relationship: 'parent',
};
function has(ui, value) {
  return text(ui.tree).includes(value);
}
function createEnabled(ui, kind) {
  return ui
    .all(
      (item) =>
        item.type === 'button' &&
        item.props.type === 'submit' &&
        text(item).includes(kind === 'students' ? 'Create Student' : 'Create Guardian'),
    )
    .some((item) => !item.props.disabled);
}
function locked(ui) {
  return ui
    .all((item) => ['input', 'textarea'].includes(item.type) && item.props.name)
    .every(
      (item) =>
        item.props.disabled ||
        ui.all(
          (parent) => parent.type === 'fieldset' && parent.props.disabled && nodes(parent).includes(item),
        ).length,
    );
}
const reviewReason = 'Synthetic reviewed registry callback creation';
const retryLabel = (kind) => 'Retry pending ' + (kind === 'students' ? 'student' : 'guardian') + ' creation';
async function fill(ui, kind, values = kind === 'students' ? studentData : guardianData) {
  for (const [name, value] of Object.entries(values))
    await ui.change((item) => ['input', 'textarea'].includes(item.type) && item.props.name === name, value);
  await ui.change(
    (item) =>
      item.type === 'textarea' &&
      item.props.id === (kind === 'students' ? 'student' : 'guardian') + '-create-reason',
    reviewReason,
  );
  await ui.change((item) => item.type === 'input' && item.props.type === 'checkbox', true);
}
async function scenario(name, kind, action) {
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
  for (const id of ['admin-a', 'guardian-a', 'teacher-a', 'student-user-a', 'admin-b'])
    cookies[id] = (await sessions.createSession(id)).split(';')[0];
  let actor = 'admin-a',
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
      throw new Error('Synthetic registry contracts remain offline.');
    }
    requests++;
    const headers = { origin };
    if (user) headers.cookie = cookies[user];
    const request = new Request(url, {
      method,
      headers: { ...headers, ...(payload === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(payload === undefined
        ? {}
        : { body: typeof payload === 'string' ? payload : JSON.stringify(payload) }),
    });
    const route =
      url.pathname === '/api/session'
        ? routes.session
        : url.pathname === '/api/students'
          ? routes.students
          : url.pathname === '/api/guardians'
            ? routes.guardians
            : url.pathname === '/api/registry/students'
              ? routes.reviewedStudents
              : url.pathname === '/api/registry/guardians'
                ? routes.reviewedGuardians
                : null;
    if (!route) throw new Error('Unexpected registry API path');
    return route[method](request);
  }
  globalThis.fetch = async (path, options = {}) => {
    const response = await api(String(path), options.method || 'GET', options.body);
    trace.push({
      path: String(path),
      method: options.method || 'GET',
      status: response.status,
      ...(options.body ? { payload: JSON.parse(options.body), body: options.body } : {}),
    });
    const result = intercept ? await intercept({ path: String(path), options, response }) : response;
    if (result) responses.push(result);
    return result;
  };
  async function mount() {
    const ui = driver(kind === 'students' ? Student : Guardian);
    uis.push(ui);
    await ui.flush();
    return ui;
  }
  function writes() {
    return trace.filter((item) => item.method === 'POST');
  }
  function countCreated() {
    return sqlite
      .prepare(
        kind === 'students'
          ? 'SELECT count(*) n FROM students WHERE admission_number=?'
          : 'SELECT count(*) n FROM guardians WHERE name=?',
      )
      .get(kind === 'students' ? studentData.admissionNumber : guardianData.name).n;
  }
  function drained() {
    check(
      responses.every((value) => value.bodyUsed),
      true,
      'All delivered registry success/error responses are consumed',
    );
  }
  function lose(mode) {
    let original;
    intercept = async ({ path, options, response }) => {
      if (path === '/api/registry/' + kind && options.method === 'POST' && !original) {
        check(response.status, 201, 'Uncertain delivery follows actual committed reviewed profile creation');
        original = JSON.parse(options.body);
        await response.arrayBuffer();
        if (mode === 'network') throw new TypeError('Synthetic committed registry reply loss');
        return new Response(
          mode === 'malformed'
            ? '{invalid'
            : mode === 'shape'
              ? '{}'
              : JSON.stringify({ error: 'Synthetic temporary acknowledgement failure' }),
          { status: mode === 'unavailable' ? 503 : 201, headers: { 'content-type': 'application/json' } },
        );
      }
      return response;
    };
    return {
      get payload() {
        return original;
      },
      stop() {
        intercept = undefined;
      },
    };
  }
  try {
    await action({
      ...fixture,
      api,
      mount,
      writes,
      countCreated,
      trace,
      drained,
      lose,
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
try {
  for (const kind of ['students', 'guardians'])
    await scenario(
      kind + ' same-frame create has one reviewed request',
      kind,
      async ({ mount, writes, countCreated, drained }) => {
        const ui = await mount();
        await fill(ui, kind);
        const callback = ui.one((item) => item.type === 'form').props.onSubmit;
        await Promise.all([callback({ preventDefault() {} }), callback({ preventDefault() {} })]);
        await ui.flush();
        check(writes().length, 1, 'Synchronous lock prevents duplicate same-frame registry POST');
        check(countCreated(), 1, 'Exactly one valid profile is persisted');
        okay(/saved/i.test(text(ui.tree)), 'Known successful profile acknowledgement is visible');
        drained();
      },
    );
  for (const kind of ['students', 'guardians'])
    for (const mode of ['network', 'malformed', 'shape', 'unavailable'])
      await scenario(
        kind + ' ' + mode + ' unknown create blocks blind retry',
        kind,
        async ({ mount, lose, countCreated, writes, drained }) => {
          const ui = await mount();
          await fill(ui, kind);
          const original = lose(mode);
          await ui.submit();
          original.stop();
          check(countCreated(), 1, 'Original unknown-delivery create remains committed once');
          okay(locked(ui), 'Unknown reviewed create freezes original fields');
          check(createEnabled(ui, kind), false, 'Unknown create cannot be blindly retried');
          check(writes().length, 1, 'No automatic new create request follows uncertain acknowledgement');
          await ui.click(kind === 'students' ? 'Reload students' : 'Reload guardians');
          check(
            createEnabled(ui, kind),
            false,
            'Authorized list refresh alone cannot blindly retry original create',
          );
          check(writes().length, 1, 'Authorized recovery reload makes no mutation');
          const bytes = writes()[0].body;
          await ui.click(retryLabel(kind));
          check(writes().length, 2, 'Explicit recovery sends one original reviewed replay');
          check(writes()[1].body, bytes, 'Recovery preserves exact original request bytes and UUID');
          check(writes()[1].path, writes()[0].path, 'Recovery preserves original endpoint');
          check(writes()[1].status, 200, 'Committed original UUID returns a replay receipt');
          for (const [name] of Object.entries(kind === 'students' ? studentData : guardianData))
            check(
              ui.one((item) => ['input', 'textarea'].includes(item.type) && item.props.name === name).props
                .value,
              '',
              'New intentional draft starts blank rather than repeating uncertain values',
            );
          check(countCreated(), 1, 'Exact recovery appends no duplicate profile');
          drained();
        },
      );
  for (const kind of ['students', 'guardians'])
    await scenario(
      kind + ' old administrator reply cannot restore unrelated family profiles',
      kind,
      async ({ mount, intercept, setActor, api, drained }) => {
        const ui = await mount();
        okay(
          has(ui, kind === 'students' ? 'student-other' : 'guardian-profile-other'),
          'Initial administrator current list contains authorized other profile',
        );
        let release,
          started = false;
        intercept(async ({ path, options, response }) => {
          if (path.startsWith('/api/' + kind) && options.method !== 'POST' && !started) {
            started = true;
            await new Promise((resolve) => {
              release = resolve;
            });
          }
          return response;
        });
        const callback = ui.button(kind === 'students' ? 'Reload students' : 'Reload guardians').props
          .onClick;
        callback();
        await settle();
        okay(started, 'Old actual authorized administrator list response is held');
        setActor('guardian-a');
        callback();
        await ui.flush();
        check(
          has(ui, kind === 'students' ? 'student-other' : 'guardian-profile-other'),
          false,
          'New guardian scope excludes unrelated profiles',
        );
        release();
        await ui.flush();
        check(
          has(ui, kind === 'students' ? 'student-other' : 'guardian-profile-other'),
          false,
          'Late old administrator response cannot overwrite current guardian view',
        );
        const scoped = await (await api('/api/' + kind)).json();
        check(scoped.length, 1, 'Actual guardian server list remains explicitly linked only');
        check(createEnabled(ui, kind), false, 'Current guardian has no stale administrator create controls');
        drained();
      },
    );
  for (const kind of ['students', 'guardians'])
    for (const denied of ['no-session', 'disabled', 'list-failure'])
      await scenario(
        kind + ' ' + denied + ' clears stale private registry view',
        kind,
        async ({ mount, setActor, sqlite, intercept, drained }) => {
          const ui = await mount();
          okay(
            has(ui, kind === 'students' ? 'student-other' : 'guardian-profile-other'),
            'Current administrator initially sees authorized registry row',
          );
          if (denied === 'no-session') setActor(null);
          if (denied === 'disabled')
            sqlite.exec("UPDATE users SET disabled_at='2026-10-05T00:00:00.000Z' WHERE id='admin-a'");
          let injected = false;
          if (denied === 'list-failure')
            intercept(async ({ path, response }) => {
              if (path.startsWith('/api/' + kind)) {
                injected = true;
                await response.arrayBuffer();
                return new Response(JSON.stringify({ error: 'Synthetic registry list unavailable' }), {
                  status: 503,
                });
              }
              return response;
            });
          await ui.click(kind === 'students' ? 'Reload students' : 'Reload guardians');
          check(
            has(ui, kind === 'students' ? 'student-other' : 'guardian-profile-other'),
            false,
            'Failed/unavailable current load clears private cached registry row',
          );
          check(createEnabled(ui, kind), false, 'Failed load clears stale administrator create authority');
          if (denied === 'list-failure')
            okay(injected, 'Actual list delivery failure reached source callback');
          intercept(undefined);
          setActor('admin-a');
          sqlite.exec("UPDATE users SET disabled_at=null WHERE id='admin-a'");
          await ui.click(kind === 'students' ? 'Reload students' : 'Reload guardians');
          okay(
            has(ui, kind === 'students' ? 'student-other' : 'guardian-profile-other'),
            'Restored authorized load clears sticky error and restores current registry',
          );
          drained();
        },
      );
  for (const kind of ['students', 'guardians'])
    await scenario(
      kind + ' final-session actor mismatch never exposes first-session data',
      kind,
      async ({ mount, intercept, setActor, drained }) => {
        const ui = await mount();
        let changed = false;
        intercept(async ({ path, response }) => {
          if (path.startsWith('/api/' + kind) && !changed) {
            changed = true;
            setActor('guardian-a');
          }
          return response;
        });
        await ui.click(kind === 'students' ? 'Reload students' : 'Reload guardians');
        okay(changed, 'Actual list first-account response precedes a different current final session');
        check(
          has(ui, kind === 'students' ? 'student-other' : 'guardian-profile-other'),
          false,
          'Session/list/session mismatch cannot display first actor private profiles',
        );
        check(createEnabled(ui, kind), false, 'Mismatched read cannot authorize an administrator form');
        intercept(undefined);
        await ui.click(kind === 'students' ? 'Reload students' : 'Reload guardians');
        check(
          has(ui, kind === 'students' ? 'student-other' : 'guardian-profile-other'),
          false,
          'Clean family reload remains narrowly scoped',
        );
        drained();
      },
    );
  await scenario(
    'Student search is explicit local filtering of current authorized rows',
    'students',
    async ({ mount, trace, drained }) => {
      const ui = await mount();
      const search = (item) =>
        item.type === 'input' && (item.props.type === 'search' || item.props.placeholder?.includes('Search'));
      await ui.change(search, 'A-name-that-does-not-exist');
      check(has(ui, 'student-a'), false, 'Nonmatching local query hides current rows');
      check(
        has(ui, 'student-other'),
        false,
        'Nonmatching query does not falsely show all server-scoped rows',
      );
      okay(/0/.test(text(ui.tree)), 'Zero matches are disclosed');
      await ui.change(search, 'student-a');
      okay(has(ui, 'student-a'), 'Local name/admission query matches current authorized student');
      check(has(ui, 'student-other'), false, 'Local query filters unrelated current row');
      check(
        trace.some((item) => item.path.includes('search=')),
        false,
        'Client does not imply unsupported server search',
      );
      await ui.change(search, '');
      okay(has(ui, 'student-other'), 'Clearing local query restores current authorized loaded rows');
      drained();
    },
  );
  for (const kind of ['students', 'guardians'])
    await scenario(
      kind + ' valid acknowledgement remains saved after list refresh failure',
      kind,
      async ({ mount, intercept, countCreated, writes, drained }) => {
        const ui = await mount();
        await fill(ui, kind);
        let committed = false;
        intercept(async ({ path, options, response }) => {
          if (path === '/api/registry/' + kind && options.method === 'POST') {
            check(response.status, 201, 'Actual profile create acknowledgement is committed');
            committed = true;
            return response;
          }
          if (committed && path.startsWith('/api/' + kind)) {
            await response.arrayBuffer();
            return new Response(JSON.stringify({ error: 'Synthetic post-save list failure' }), {
              status: 503,
            });
          }
          return response;
        });
        await ui.submit();
        check(countCreated(), 1, 'Confirmed original create persists once despite refresh error');
        okay(/saved/i.test(text(ui.tree)), 'Known committed outcome remains saved');
        check(
          createEnabled(ui, kind),
          false,
          'Failed post-save registry refresh blocks another unchecked create',
        );
        check(writes().length, 1, 'Failed readback never causes automatic create replay');
        intercept(undefined);
        await ui.click(kind === 'students' ? 'Reload students' : 'Reload guardians');
        check(countCreated(), 1, 'Authorized refresh changes no confirmed record');
        drained();
      },
    );

  for (const kind of ['students', 'guardians'])
    await scenario(
      kind + ' uncertain old-admin values remain private under a different administrator',
      kind,
      async ({ mount, lose, setActor, countCreated, writes, drained }) => {
        const ui = await mount();
        await fill(ui, kind);
        const failure = lose('network');
        await ui.submit();
        failure.stop();
        setActor('admin-b');
        await ui.click(kind === 'students' ? 'Reload students' : 'Reload guardians');
        for (const secret of kind === 'students'
          ? [studentData.firstName, studentData.lastName, studentData.admissionNumber]
          : [guardianData.name, guardianData.email])
          check(has(ui, secret), false, 'Different administrator cannot see original pending values');
        check(
          ui.all((item) => item.type === 'form').length,
          0,
          'Different administrator sees no old pending creation form',
        );
        check(
          ui.all((item) => item.type === 'input' && item.props.type === 'checkbox').length,
          0,
          'Different administrator cannot release another account pending retry',
        );
        check(writes().length, 1, 'Changing administrator creates no blind duplicate mutation');
        setActor('admin-a');
        await ui.click(kind === 'students' ? 'Reload students' : 'Reload guardians');
        okay(
          has(ui, kind === 'students' ? studentData.admissionNumber : guardianData.email),
          'Original current authorized administrator can view retained submitted identifiers',
        );
        const bytes = writes()[0].body;
        await ui.click(retryLabel(kind));
        check(countCreated(), 1, 'Original actor exact retry sends no duplicate profile');
        check(writes().length, 2, 'Authorized recovery sends exactly one original replay');
        check(writes()[1].body, bytes, 'Changing accounts does not rebase original request bytes');
        check(writes()[1].status, 200, 'Original actor receives committed original receipt');
        drained();
      },
    );
  await scenario(
    'Student local search labels exact matches and bounded display',
    'students',
    async ({ mount, sqlite, drained }) => {
      const insert = sqlite.prepare(
        'INSERT INTO students (id,school_id,first_name,last_name,date_of_birth,admission_number,grade_level,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      );
      for (let index = 0; index < 203; index++)
        insert.run(
          'cap-' + index,
          'a',
          'SyntheticCap',
          String(index).padStart(3, '0'),
          '2012-01-01',
          'CAP-' + String(index).padStart(3, '0'),
          '8',
          stamp,
          stamp,
        );
      const ui = await mount();
      check(
        ui.all((item) => item.props?.['data-student-id']).length,
        200,
        'Visible current authorized student rows cap200',
      );
      okay(
        /205 loaded authorized profiles/.test(text(ui.tree)),
        'Exact complete loaded profile count remains explicit',
      );
      await ui.change(
        (item) => item.type === 'input' && item.props.id === 'registry-student-search',
        'SyntheticCap',
      );
      check(
        ui.all((item) => item.props?.['data-student-id']).length,
        200,
        'Search match rendering retains200 cap',
      );
      okay(
        /203 matching/.test(text(ui.tree)),
        'Exact match total is disclosed separately from displayed subset',
      );
      await ui.change(
        (item) => item.type === 'input' && item.props.id === 'registry-student-search',
        'CAP-202',
      );
      check(
        ui.all((item) => item.props?.['data-student-id']).length,
        1,
        'Admission query finds a previously undisplayed authorized profile',
      );
      okay(has(ui, 'CAP-202'), 'Search is over complete current loaded rows, not just first200 rendered');
      drained();
    },
  );
  for (const kind of ['students', 'guardians'])
    await scenario(
      kind + ' unknown committed reply after actor change clears every old private view',
      kind,
      async ({ mount, intercept, setActor, countCreated, writes, drained }) => {
        const ui = await mount();
        await fill(ui, kind);
        okay(
          has(ui, kind === 'students' ? 'student-other' : 'guardian-profile-other'),
          'Original current administrator initially has authorized unrelated profile',
        );
        let changed = false;
        intercept(async ({ path, options, response }) => {
          if (path === '/api/registry/' + kind && options.method === 'POST' && !changed) {
            check(
              response.status,
              201,
              'Original profile was actually committed before acknowledgement uncertainty',
            );
            changed = true;
            setActor('guardian-a');
            await response.arrayBuffer();
            return new Response(
              JSON.stringify({ error: 'Synthetic unknown acknowledgement after account switch' }),
              { status: 503 },
            );
          }
          return response;
        });
        await ui.submit();
        intercept(undefined);
        okay(changed, 'Changed session occurs after actual commit and before uncertain delivery');
        check(countCreated(), 1, 'Original profile remains committed once');
        check(
          has(ui, kind === 'students' ? 'student-other' : 'guardian-profile-other'),
          false,
          'Any unknown save outcome clears old administrator private records',
        );
        check(createEnabled(ui, kind), false, 'Unknown outcome removes old administrator create authority');
        check(
          ui.all((item) => item.type === 'form').length,
          0,
          'Private pending form is hidden after uncertain delivery',
        );
        check(writes().length, 1, 'Unknown outcome does not auto-repeat reviewed creation');
        await ui.click(kind === 'students' ? 'Reload students' : 'Reload guardians');
        check(
          has(ui, kind === 'students' ? 'student-other' : 'guardian-profile-other'),
          false,
          'Current family reload cannot expose unrelated original account records',
        );
        check(
          ui.all((item) => item.type === 'input' && item.props.type === 'checkbox').length,
          0,
          'Current family cannot release original administrator retry',
        );
        setActor('admin-a');
        await ui.click(kind === 'students' ? 'Reload students' : 'Reload guardians');
        okay(
          has(ui, kind === 'students' ? studentData.admissionNumber : guardianData.email),
          'Restored original administrator can view retained submitted identifiers',
        );
        const bytes = writes()[0].body;
        await ui.click(retryLabel(kind));
        check(writes().length, 2, 'Current original account performs exactly one safe reviewed retry');
        check(writes()[1].body, bytes, 'Known account-switch recovery retains original request bytes');
        check(writes()[1].status, 200, 'Committed account-switch request returns original receipt');
        check(countCreated(), 1, 'No duplicate profile is added after current account recovery');
        drained();
      },
    );
  for (const kind of ['students', 'guardians'])
    await scenario(
      kind + ' changed create-preflight actor sends no POST',
      kind,
      async ({ mount, setActor, writes, countCreated, drained }) => {
        const ui = await mount();
        await fill(ui, kind);
        setActor('guardian-a');
        await ui.submit();
        check(writes().length, 0, 'Fresh preflight actor mismatch sends no reviewed create');
        check(countCreated(), 0, 'Preflight denial creates no profile');
        check(
          has(ui, kind === 'students' ? 'student-other' : 'guardian-profile-other'),
          false,
          'Preflight changed account clears old private registry',
        );
        check(createEnabled(ui, kind), false, 'Changed preflight account removes stale admin form');
        drained();
      },
    );
  for (const kind of ['students', 'guardians'])
    await scenario(
      kind + ' changed fields and reason require a new explicit review',
      kind,
      async ({ mount, writes, countCreated, drained }) => {
        const ui = await mount();
        await fill(ui, kind);
        check(
          ui.one((item) => item.type === 'input' && item.props.type === 'checkbox').props.checked,
          true,
          'Original values are explicitly reviewed',
        );
        await ui.change(
          (item) =>
            ['input', 'textarea'].includes(item.type) &&
            item.props.name === (kind === 'students' ? 'gradeLevel' : 'relationship'),
          kind === 'students' ? '9' : 'carer',
        );
        check(
          ui.one((item) => item.type === 'input' && item.props.type === 'checkbox').props.checked,
          false,
          'Editing a profile field clears review confirmation',
        );
        await ui.submit();
        check(writes().length, 0, 'Unreviewed changed fields cannot send a creation request');
        await ui.change((item) => item.type === 'input' && item.props.type === 'checkbox', true);
        await ui.change(
          (item) => item.type === 'textarea' && item.props.id?.endsWith('-create-reason'),
          'A different synthetic creation reason',
        );
        check(
          ui.one((item) => item.type === 'input' && item.props.type === 'checkbox').props.checked,
          false,
          'Changing reason also clears review confirmation',
        );
        await ui.submit();
        check(writes().length, 0, 'Changed review reason cannot inherit earlier confirmation');
        await ui.change((item) => item.type === 'input' && item.props.type === 'checkbox', true);
        await ui.submit();
        check(writes().length, 1, 'Explicit final review permits exactly one actual create');
        check(
          writes()[0].payload.reason,
          'A different synthetic creation reason',
          'Receipt request contains reviewed final reason',
        );
        check(countCreated(), 1, 'Reviewed final values persist once');
        drained();
      },
    );
  for (const kind of ['students', 'guardians'])
    await scenario(
      kind + ' actual definitive400 retains draft and resets review before new UUID',
      kind,
      async ({ mount, writes, countCreated, drained }) => {
        const ui = await mount();
        await fill(ui, kind);
        const field = kind === 'students' ? 'firstName' : 'name';
        await ui.change((item) => ['input', 'textarea'].includes(item.type) && item.props.name === field, '');
        await ui.change((item) => item.type === 'input' && item.props.type === 'checkbox', true);
        await ui.submit();
        check(writes()[0].status, 400, 'Actual route validates the deliberately invalid synthetic profile');
        check(countCreated(), 0, 'Definitively rejected request creates no profile');
        check(
          ui.one((item) => item.type === 'input' && item.props.type === 'checkbox').props.checked,
          false,
          'Rejected values require review again',
        );
        okay(has(ui, 'rejected'), 'Definitive rejection is visible without being labelled unknown commit');
        for (const [name, value] of Object.entries(kind === 'students' ? studentData : guardianData))
          if (name !== field)
            check(
              ui.one((item) => ['input', 'textarea'].includes(item.type) && item.props.name === name).props
                .value,
              value,
              'Rejected draft preserves other entered fields',
            );
        await ui.change(
          (item) => ['input', 'textarea'].includes(item.type) && item.props.name === field,
          kind === 'students' ? studentData[field] : guardianData[field],
        );
        await ui.submit();
        check(writes().length, 1, 'Corrected draft still cannot send without new review');
        await ui.change((item) => item.type === 'input' && item.props.type === 'checkbox', true);
        await ui.submit();
        check(writes().length, 2, 'Explicit corrected review sends one fresh request');
        okay(
          writes()[1].payload.clientRequestId !== writes()[0].payload.clientRequestId,
          'Rejected request is replaced by a new deliberate UUID',
        );
        check(writes()[1].status, 201, 'Corrected reviewed request is acknowledged');
        check(countCreated(), 1, 'Correction creates one profile');
        drained();
      },
    );
  for (const kind of ['students', 'guardians'])
    await scenario(
      kind + ' actual409 requires reload and review retained fields before fresh request',
      kind,
      async ({ mount, api, writes, countCreated, drained }) => {
        const ui = await mount();
        await fill(ui, kind);
        const uuid = crypto.randomUUID;
        let collision;
        if (kind === 'students') {
          await ui.change(
            (item) => item.type === 'input' && item.props.name === 'admissionNumber',
            'student-a',
          );
          await ui.change((item) => item.type === 'input' && item.props.type === 'checkbox', true);
        } else {
          collision = crypto.randomUUID();
          const response = await api('/api/registry/guardians', 'POST', {
            clientRequestId: collision,
            reviewConfirmed: true,
            reason: 'Different previously reviewed guardian request',
            profile: { name: 'Synthetic previously reviewed guardian', relationship: 'parent' },
          });
          check(response.status, 201, 'Synthetic existing UUID has an actual committed distinct receipt');
          await response.arrayBuffer();
          crypto.randomUUID = () => collision;
        }
        try {
          await ui.submit();
        } finally {
          crypto.randomUUID = uuid;
        }
        check(writes()[0].status, 409, 'Actual admission/UUID conflict safely rejects current request');
        check(countCreated(), 0, 'Conflicting draft creates no matching profile');
        check(
          createEnabled(ui, kind),
          false,
          'Conflict hides create authority until explicit current reload',
        );
        okay(has(ui, 'conflicted'), 'Conflict is distinct from uncertain delivery');
        await ui.click(kind === 'students' ? 'Reload students' : 'Reload guardians');
        check(
          ui.one((item) => item.type === 'input' && item.props.type === 'checkbox').props.checked,
          false,
          'Reload alone does not restore explicit review',
        );
        await ui.submit();
        check(writes().length, 1, 'Conflict recovery cannot submit before new review');
        if (kind === 'students')
          await ui.change(
            (item) => item.type === 'input' && item.props.name === 'admissionNumber',
            studentData.admissionNumber,
          );
        await ui.change((item) => item.type === 'input' && item.props.type === 'checkbox', true);
        await ui.submit();
        check(writes().length, 2, 'Reloaded and reviewed corrected draft sends one new request');
        okay(
          writes()[1].payload.clientRequestId !== writes()[0].payload.clientRequestId,
          'Conflict resolution requires a fresh UUID',
        );
        check(writes()[1].status, 201, 'Deliberate conflict correction succeeds');
        check(countCreated(), 1, 'Conflict recovery persists one intended profile');
        drained();
      },
    );
  for (const kind of ['students', 'guardians'])
    await scenario(
      kind + ' stale original retry action cannot post under a newer account',
      kind,
      async ({ mount, lose, setActor, writes, countCreated, drained }) => {
        const ui = await mount();
        await fill(ui, kind);
        const loss = lose('network');
        await ui.submit();
        loss.stop();
        await ui.click(kind === 'students' ? 'Reload students' : 'Reload guardians');
        const stale = ui.button(retryLabel(kind)).props.onClick;
        const bytes = writes()[0].body;
        setActor('admin-b');
        await ui.click(kind === 'students' ? 'Reload students' : 'Reload guardians');
        check(
          ui.all((item) => item.type === 'button' && text(item).includes(retryLabel(kind))).length,
          0,
          'Different current administrator cannot see original retry',
        );
        await stale();
        await ui.flush();
        check(
          writes().length,
          1,
          'Stale retry callback cannot send original private body under another account',
        );
        setActor('admin-a');
        await ui.click(kind === 'students' ? 'Reload students' : 'Reload guardians');
        await ui.click(retryLabel(kind));
        check(
          writes()[1].body,
          bytes,
          'Original current account retains exact request after obsolete callback',
        );
        check(writes()[1].status, 200, 'Original retry returns immutable receipt');
        check(countCreated(), 1, 'Obsolete callback creates no duplicate profile');
        drained();
      },
    );
  for (const kind of ['students', 'guardians'])
    await scenario(
      kind + ' invalid original receipt timestamp cannot clear pending creation',
      kind,
      async ({ mount, intercept, writes, countCreated, drained }) => {
        const ui = await mount();
        await fill(ui, kind);
        let changed = false;
        intercept(async ({ path, options, response }) => {
          if (!changed && path === '/api/registry/' + kind && options.method === 'POST') {
            check(response.status, 201, 'Timestamp diagnostic follows actual reviewed creation commit');
            changed = true;
            const value = await response.json();
            value.receipt.createdAt = 'not-a-time';
            value.receipt.profile.createdAt = 'not-a-time';
            value.receipt.profile.updatedAt = 'not-a-time';
            return new Response(JSON.stringify(value), {
              status: 201,
              headers: { 'content-type': 'application/json' },
            });
          }
          return response;
        });
        await ui.submit();
        intercept(undefined);
        okay(changed, 'Successful acknowledgement has deliberately malformed timestamp evidence');
        check(countCreated(), 1, 'Actual reviewed original remains committed once');
        check(
          ui.all((item) => item.type === 'form').length,
          0,
          'Malformed correlated timestamp keeps immutable request pending rather than permitting another create',
        );
        check(
          ui.all((item) => item.props?.['aria-label']?.startsWith('Original ')).length,
          0,
          'Malformed timestamp is not displayed as a valid original receipt',
        );
        check(writes().length, 1, 'Malformed receipt does not trigger automatic new request');
        await ui.click(kind === 'students' ? 'Reload students' : 'Reload guardians');
        const bytes = writes()[0].body;
        await ui.click(retryLabel(kind));
        check(writes()[1].body, bytes, 'Authorized recovery still sends original reviewed UUID/body');
        check(
          writes()[1].status,
          200,
          'Malformed acknowledgement recovery obtains immutable original receipt',
        );
        check(countCreated(), 1, 'Recovery creates no duplicate profile');
        drained();
      },
    );
  check(externalRequests, 0, 'All registry callback/route evidence remains synthetic and offline');
  console.log(
    JSON.stringify({
      passed: checks,
      failed: 0,
      skipped: 0,
      scenarios,
      requests,
      externalRequests,
      scope:
        'actual opaque sessions/routes/production D1 SQLite; unchanged source callbacks with substituted React/RHF hooks/elements; not mounted-browser evidence',
    }),
  );
} finally {
  globalThis.fetch = oldFetch;
  globalThis.window = oldWindow;
  globalThis.HTMLInputElement = oldInputElement;
  delete globalThis.__sahaRegistryContractReact;
  delete globalThis.__sahaRegistryContractZ;
  delete globalThis.__sahaRegistryContractForm;
}
