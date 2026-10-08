// FR-05 school setup: actual synthetic opaque sessions, route handlers and production Drizzle D1 over the final
// migrated SQLite (0017). Not browser, provider, educator or UAT evidence.
import { counters, recordScenario, stamp } from '../support/records-harness.mjs';
const state = counters();
const oldFetch = globalThis.fetch;
globalThis.fetch = async () => {
  state.externalRequests++;
  throw new Error('School setup contracts remain offline and synthetic');
};
const scenario = (name, action) => recordScenario(state, name, action);
const setupPath = (id) => '/api/schools/' + id + '/setup';
const valid = (setup, override = {}) => ({
  name: 'Synthetic School A Renamed',
  address: '1 Fictional Road',
  academicYear: '2026-27',
  contactEmail: 'office@example.invalid',
  contactPhone: '+91 00000 00000',
  currentTermId: null,
  expectedVersion: setup.settings.version,
  expectedUpdatedAt: setup.school.updatedAt,
  ...override,
});
const term = (override = {}) => ({
  clientRequestId: crypto.randomUUID(),
  academicYear: '2026-27',
  name: 'Term 1',
  startsOn: '2026-06-01',
  endsOn: '2026-09-30',
  ...override,
});

try {
  await scenario(
    'every school role reads only its own school setup; foreign and anonymous are denied',
    async ({ get, check, okay }) => {
      for (const actor of ['admin-a', 'teacher-a', 'guardian-a', 'student-user-a']) {
        const read = await get(setupPath('a'), actor);
        check(read.status, 200, actor + ' reads own school setup');
        check(
          Object.keys(read.body).sort(),
          ['school', 'settings', 'terms'],
          'Setup DTO has only school/settings/terms',
        );
        check(
          Object.keys(read.body.school).sort(),
          ['address', 'id', 'name', 'updatedAt'],
          'School DTO omits creation internals',
        );
        check(
          read.body.settings,
          {
            academicYear: null,
            contactEmail: null,
            contactPhone: null,
            currentTermId: null,
            version: 0,
            updatedAt: null,
          },
          'Untouched school has an explicit empty version-zero setup',
        );
        check(read.body.terms, [], 'No terms initially');
        check((await get(setupPath('b'), actor)).status, 404, actor + ' cannot read a foreign school setup');
      }
      check((await get(setupPath('a'), null)).status, 401, 'Anonymous cannot read setup');
      check((await get(setupPath('a'), 'admin-b')).status, 404, 'Foreign administrator cannot read school A');
      okay(
        !JSON.stringify((await get(setupPath('a'), 'admin-a')).body).includes('updatedBy'),
        'Internal actor ids are not disclosed',
      );
    },
  );
  await scenario(
    'administrator saves basics, academic year and contacts once; legacy DTO is unchanged',
    async ({ get, send, check, okay, count, row }) => {
      const before = (await get(setupPath('a'))).body;
      const saved = await send('PATCH', setupPath('a'), 'admin-a', valid(before));
      check(saved.status, 200, 'Version-checked save succeeds');
      check(saved.body.school.name, 'Synthetic School A Renamed', 'Name saved');
      check(saved.body.school.address, '1 Fictional Road', 'Address saved');
      check(saved.body.settings.academicYear, '2026-27', 'Academic year saved');
      check(saved.body.settings.contactEmail, 'office@example.invalid', 'Email saved');
      check(saved.body.settings.version, 1, 'First settings revision is version one');
      okay(saved.body.school.updatedAt > before.school.updatedAt, 'Stored update time strictly advances');
      const legacy = await get('/api/schools', 'teacher-a');
      check(
        legacy.body.map((school) => Object.keys(school).sort()),
        [['address', 'createdAt', 'id', 'name', 'updatedAt']],
        'Legacy school DTO keeps exactly its original fields',
      );
      check(legacy.body[0].name, 'Synthetic School A Renamed', 'Legacy reads see the saved name');
      const bootstrap = await send('POST', '/api/schools', 'admin-a', { name: 'Self provisioned school' });
      check(
        bootstrap.status,
        403,
        'A school administrator cannot create a school (operator provisioning only)',
      );
      check(count('schools'), 2, 'No school was created');
      check(count('school_setup_settings'), 1, 'One settings row');
      check(
        row("SELECT updated_by FROM school_setup_settings WHERE school_id='a'").updated_by,
        'admin-a',
        'Actor is attributed from the session, not the caller',
      );
      const cleared = await send(
        'PATCH',
        setupPath('a'),
        'admin-a',
        valid(saved.body, { address: '', academicYear: null, contactEmail: null, contactPhone: '' }),
      );
      check(cleared.status, 200, 'Deliberately cleared optional fields save');
      check(
        [
          cleared.body.school.address,
          cleared.body.settings.academicYear,
          cleared.body.settings.contactEmail,
          cleared.body.settings.contactPhone,
        ],
        [null, null, null, null],
        'Empty means null',
      );
      check(cleared.body.settings.version, 2, 'Second save advances the version');
    },
  );
  await scenario(
    'stale setup saves, legacy edits and exact replays are 409 and change nothing',
    async ({ get, send, check, snapshot }) => {
      const first = (await get(setupPath('a'))).body;
      const one = await send('PATCH', setupPath('a'), 'admin-a', valid(first));
      check(one.status, 200, 'First save wins');
      const afterOne = snapshot();
      const stale = await send(
        'PATCH',
        setupPath('a'),
        'admin-second-a',
        valid(first, { name: 'Competing name' }),
      );
      check(
        [stale.status, stale.body.reason],
        [409, 'stale'],
        'A second administrator holding the old token cannot overwrite the first save',
      );
      check(snapshot(), afterOne, 'Stale competing save changes nothing');
      const mixed = await send('PATCH', setupPath('a'), 'admin-a', {
        ...valid(one.body, { name: 'Mixed tokens' }),
        expectedVersion: first.settings.version,
      });
      check(
        [mixed.status, mixed.body.reason],
        [409, 'stale'],
        'A current record token with an old settings version is also stale',
      );
      check(snapshot(), afterOne, 'Mixed-token save changes nothing');
      const replay = await send('PATCH', setupPath('a'), 'admin-a', valid(first));
      check(
        [replay.status, replay.body],
        [409, { error: 'Conflict', reason: 'stale' }],
        'The old token is a safe stale conflict, never a blind overwrite',
      );
      check(snapshot(), afterOne, 'Stale save changes nothing');
      const legacy = await send('PATCH', '/api/schools/a', 'admin-a', { name: 'Legacy rename' });
      check(legacy.status, 200, 'The original school PATCH still works');
      const afterLegacy = snapshot();
      const crossStale = await send(
        'PATCH',
        setupPath('a'),
        'admin-a',
        valid(one.body, { name: 'Setup after legacy rename' }),
      );
      check(
        [crossStale.status, crossStale.body.reason],
        [409, 'stale'],
        'A legacy edit makes older setup tokens stale',
      );
      check(snapshot(), afterLegacy, 'Cross-path stale save changes nothing');
      const fresh = (await get(setupPath('a'))).body;
      check(fresh.school.name, 'Legacy rename', 'Current evidence reflects the winning legacy change');
      check(
        (await send('PATCH', setupPath('a'), 'admin-a', valid(fresh))).status,
        200,
        'Reloading yields a valid token',
      );
    },
  );
  await scenario(
    'only an administrator of the same school may change setup; role and origin denial precede body parsing',
    async ({ get, send, check, snapshot }) => {
      const setup = (await get(setupPath('a'))).body,
        before = snapshot();
      for (const actor of ['teacher-a', 'guardian-a', 'student-user-a'])
        check(
          (await send('PATCH', setupPath('a'), actor, valid(setup))).status,
          403,
          actor + ' cannot edit setup',
        );
      check(
        (await send('PATCH', setupPath('a'), 'teacher-a', '{not json')).status,
        403,
        'Role denial precedes parsing malformed bodies',
      );
      check((await send('PATCH', setupPath('a'), null, valid(setup))).status, 401, 'Anonymous denied');
      check(
        (
          await send('PATCH', setupPath('a'), 'admin-a', valid(setup), {
            origin: 'https://other.example.invalid',
          })
        ).status,
        403,
        'Cross-origin write denied',
      );
      check(
        (await send('PATCH', setupPath('b'), 'admin-a', valid(setup))).status,
        404,
        'Administrator cannot edit another school',
      );
      check(
        (await send('PATCH', setupPath('a'), 'admin-b', valid(setup))).status,
        404,
        'Foreign administrator cannot edit school A',
      );
      check(snapshot(), before, 'Every denial leaves all records unchanged');
    },
  );
  await scenario(
    'validation rejects bad fields with field names only and persists nothing',
    async ({ get, send, check, snapshot, okay }) => {
      const setup = (await get(setupPath('a'))).body,
        before = snapshot();
      const cases = [
        [{ name: '' }, 'name'],
        [{ name: 'x'.repeat(121) }, 'name'],
        [{ name: 'Bad\u0000Name' }, 'name'],
        [{ contactEmail: 'not-an-email' }, 'contactEmail'],
        [{ contactPhone: 'abc' }, 'contactPhone'],
        [{ academicYear: 'x'.repeat(30) }, 'academicYear'],
        [{ academicYear: '<b>' }, 'academicYear'],
        [{ expectedUpdatedAt: 'yesterday' }, 'expectedUpdatedAt'],
        [{ expectedVersion: -1 }, 'expectedVersion'],
        [{ expectedVersion: 1.5 }, 'expectedVersion'],
        [{ schoolId: 'b' }, ''],
        [{ id: 'b' }, ''],
      ];
      for (const [override, field] of cases) {
        const result = await send('PATCH', setupPath('a'), 'admin-a', valid(setup, override));
        check(result.status, 400, 'Invalid ' + JSON.stringify(override).slice(0, 40) + ' is rejected');
        if (field)
          okay(result.body.fields.includes(field), 'Names the invalid field without echoing its value');
        okay(!JSON.stringify(result.body).includes('not-an-email'), 'Error body never echoes entered values');
      }
      check(
        (await send('PATCH', setupPath('a'), 'admin-a', '{"name":')).status,
        400,
        'Malformed JSON is a 400',
      );
      check(snapshot(), before, 'No rejected request persisted anything');
    },
  );
  await scenario(
    'terms: create, exact replay, reuse, overlap, duplicate names, bad dates and current-term choice',
    async ({ get, send, check, okay, count, snapshot }) => {
      const input = term(),
        created = await send('POST', '/api/schools/a/terms', 'admin-a', input);
      check(created.status, 201, 'Term created');
      check(created.body.replayed, false, 'Fresh creation is not a replay');
      check(created.body.term.id, input.clientRequestId, 'Request UUID is the stable term identity');
      check(created.body.term.version, 1, 'Terms start at version one');
      const replay = await send('POST', '/api/schools/a/terms', 'admin-a', input);
      check(
        [replay.status, replay.body.replayed, replay.body.term],
        [200, true, created.body.term],
        'Exact retry returns the original term',
      );
      check(count('school_setup_terms'), 1, 'No duplicate term from a retry');
      check(
        (await send('POST', '/api/schools/a/terms', 'admin-a', { ...input, name: 'Changed' })).body.reason,
        'request-reused',
        'A UUID cannot be reused for different content',
      );
      check(
        (
          await send(
            'POST',
            '/api/schools/a/terms',
            'admin-a',
            term({ name: 'Overlaps', startsOn: '2026-09-30', endsOn: '2026-12-01' }),
          )
        ).body.reason,
        'term-overlap',
        'Overlapping dates are refused',
      );
      check(
        (
          await send(
            'POST',
            '/api/schools/a/terms',
            'admin-a',
            term({ name: 'Term 1', startsOn: '2027-01-01', endsOn: '2027-03-01' }),
          )
        ).body.reason,
        'term-duplicate',
        'The same name in the same year is refused',
      );
      const second = await send(
        'POST',
        '/api/schools/a/terms',
        'admin-a',
        term({ name: 'Term 2', startsOn: '2026-10-01', endsOn: '2026-12-20' }),
      );
      check(second.status, 201, 'Adjacent non-overlapping term allowed');
      for (const [override, label] of [
        [{ startsOn: '2026-02-30' }, 'impossible date'],
        [{ startsOn: '2026-1-1' }, 'unpadded date'],
        [{ startsOn: '2027-01-02', endsOn: '2027-01-01', name: 'Backwards' }, 'end before start'],
        [{ name: '' }, 'empty name'],
        [{ academicYear: '' }, 'empty year'],
        [{ clientRequestId: 'not-a-uuid' }, 'bad id'],
      ])
        check(
          (await send('POST', '/api/schools/a/terms', 'admin-a', term(override))).status,
          400,
          'Rejected: ' + label,
        );
      check(
        (await send('POST', '/api/schools/a/terms', 'admin-a', { ...term(), extra: 1 })).status,
        400,
        'Strict body',
      );
      for (const actor of ['teacher-a', 'guardian-a', 'student-user-a'])
        check(
          (await send('POST', '/api/schools/a/terms', actor, term({ name: 'Denied ' + actor }))).status,
          403,
          actor + ' cannot create terms',
        );
      check(
        (await send('POST', '/api/schools/b/terms', 'admin-a', term({ name: 'Cross' }))).status,
        404,
        'Cannot create in another school',
      );
      check(
        (await send('POST', '/api/schools/a/terms', 'admin-b', term({ name: 'Cross' }))).status,
        404,
        'Foreign administrator cannot create in school A',
      );
      const setup = (await get(setupPath('a'))).body;
      check(
        setup.terms.map((item) => item.name),
        ['Term 1', 'Term 2'],
        'Terms are listed in date order',
      );
      check(count('school_setup_terms'), 2, 'Only the two valid terms exist');
      // Current term choice
      const chosen = await send(
        'PATCH',
        setupPath('a'),
        'admin-a',
        valid(setup, { currentTermId: second.body.term.id }),
      );
      check(chosen.status, 200, 'A school term can be the current term');
      check(chosen.body.settings.currentTermId, second.body.term.id, 'Current term stored');
      const before = snapshot();
      const foreign = await send(
        'PATCH',
        setupPath('a'),
        'admin-a',
        valid(chosen.body, { currentTermId: 'term-of-another-school' }),
      );
      check(
        [foreign.status, foreign.body.reason],
        [409, 'term-unavailable'],
        'An unknown or foreign term cannot become current',
      );
      check(snapshot(), before, 'Nothing changed');
      okay(chosen.body.terms.length === 2, 'Setup includes both terms');
    },
  );
  await scenario(
    'term edits are version-checked and cannot create overlaps; terms are never deleted',
    async ({ send, get, check, okay, sqlite }) => {
      const a = await send('POST', '/api/schools/a/terms', 'admin-a', term()),
        b = await send(
          'POST',
          '/api/schools/a/terms',
          'admin-a',
          term({ name: 'Term 2', startsOn: '2026-10-01', endsOn: '2026-12-20' }),
        );
      const edit = (item, override = {}) => ({
        academicYear: item.academicYear,
        name: item.name,
        startsOn: item.startsOn,
        endsOn: item.endsOn,
        expectedVersion: item.version,
        ...override,
      });
      const moved = await send(
        'PATCH',
        '/api/schools/a/terms/' + a.body.term.id,
        'admin-a',
        edit(a.body.term, { endsOn: '2026-09-15' }),
      );
      check(moved.status, 200, 'Term end can be corrected');
      check(moved.body.term.version, 2, 'Version advances');
      const stale = await send(
        'PATCH',
        '/api/schools/a/terms/' + a.body.term.id,
        'admin-a',
        edit(a.body.term, { endsOn: '2026-09-20' }),
      );
      check([stale.status, stale.body.reason], [409, 'stale'], 'Old term version is stale');
      const overlap = await send(
        'PATCH',
        '/api/schools/a/terms/' + a.body.term.id,
        'admin-a',
        edit(moved.body.term, { endsOn: '2026-10-05' }),
      );
      check(
        [overlap.status, overlap.body.reason],
        [409, 'term-overlap'],
        'Edits cannot overlap another term',
      );
      const rename = await send(
        'PATCH',
        '/api/schools/a/terms/' + b.body.term.id,
        'admin-a',
        edit(b.body.term, { name: 'Term 1' }),
      );
      check(
        [rename.status, rename.body.reason],
        [409, 'term-duplicate'],
        'Renames cannot duplicate within a year',
      );
      check(
        (await send('PATCH', '/api/schools/a/terms/' + a.body.term.id, 'teacher-a', edit(moved.body.term)))
          .status,
        403,
        'Teacher cannot edit',
      );
      check(
        (await send('PATCH', '/api/schools/a/terms/' + a.body.term.id, 'admin-b', edit(moved.body.term)))
          .status,
        404,
        'Foreign administrator cannot edit',
      );
      check(
        (await send('PATCH', '/api/schools/a/terms/missing', 'admin-a', edit(moved.body.term))).status,
        404,
        'Unknown term is 404',
      );
      check(
        (await send('DELETE', '/api/schools/a/terms/' + a.body.term.id, 'admin-a')).absent,
        true,
        'The API offers no hard delete of a term',
      );
      sqlite.exec('PRAGMA foreign_keys=ON');
      okay((await get(setupPath('a'))).body.terms.length === 2, 'Both terms remain');
      okay(
        sqlite
          .prepare(
            "SELECT 1 FROM sqlite_master WHERE name='school_setup_terms' AND sql LIKE '%school_setup_terms_dates%'",
          )
          .get(),
        'Date and order rules are also enforced by the table itself',
      );
      let rejected = false;
      try {
        sqlite
          .prepare(
            "INSERT INTO school_setup_terms VALUES ('x','a','2026','Bad','2026-02-30','2026-03-01',1,'admin-a','t','t')",
          )
          .run();
      } catch {
        rejected = true;
      }
      check(rejected, true, 'The table rejects an impossible date even if the service were bypassed');
    },
  );
  await scenario(
    'late authority loss and injected faults never leave a partial school or settings write',
    async ({ get, send, check, arm, revoke, snapshot, fired }) => {
      const setup = (await get(setupPath('a'))).body,
        before = snapshot();
      arm(
        'before',
        (query) => query.startsWith('update "schools"'),
        () => revoke('admin-a'),
      );
      const revoked = await send('PATCH', setupPath('a'), 'admin-a', valid(setup));
      check(fired(), true, 'Authority is lost immediately before the actual UPDATE');
      check(revoked.status >= 400 && revoked.status < 500, true, 'Revoked administrator is denied');
      check(snapshot(), before, 'No school or settings change persisted');
    },
  );
  await scenario(
    'a fault in the settings write rolls back the school write too',
    async ({ get, send, check, arm, snapshot, fired }) => {
      const setup = (await get(setupPath('a'))).body,
        before = snapshot();
      arm(
        'before',
        (query) => query.startsWith('insert into "school_setup_settings"'),
        () => {
          throw new Error('Injected settings write fault');
        },
      );
      const failed = await send('PATCH', setupPath('a'), 'admin-a', valid(setup));
      check(fired(), true, 'Fault fired on the second statement');
      check(failed.status, 500, 'The client sees a failed, unconfirmed save');
      check(snapshot(), before, 'The already-applied school update was rolled back with the batch');
      check(
        (await send('PATCH', setupPath('a'), 'admin-a', valid(setup))).status,
        200,
        'The same token still saves after a rolled-back failure',
      );
    },
  );
  await scenario(
    'concurrent saves with one token produce exactly one winner',
    async ({ get, send, check }) => {
      const setup = (await get(setupPath('a'))).body;
      const results = await Promise.all([
        send('PATCH', setupPath('a'), 'admin-a', valid(setup, { name: 'Racer one' })),
        send('PATCH', setupPath('a'), 'admin-a', valid(setup, { name: 'Racer two' })),
      ]);
      check(
        results.map((result) => result.status).sort(),
        [200, 409],
        'One save wins and the other is a stale conflict',
      );
      const winner = results.find((result) => result.status === 200).body.school.name;
      check(
        (await get(setupPath('a'))).body.school.name,
        winner,
        'The stored name is the winner, never a blend',
      );
    },
  );
  await scenario(
    'setup tables are append-safe: setup migration did not rewrite existing school rows',
    async ({ row, check, sqlite }) => {
      check(
        row("SELECT name, updated_at FROM schools WHERE id='a'"),
        { name: 'Synthetic school a', updated_at: stamp },
        'Existing school row is untouched by the migration',
      );
      check(
        sqlite.prepare('SELECT count(*) n FROM school_setup_settings').get().n,
        0,
        'No settings were invented for existing schools',
      );
    },
  );
  console.log(
    JSON.stringify({
      passed: state.checks,
      failed: 0,
      skipped: 0,
      scenarios: state.scenarios,
      requests: state.requests,
      externalRequests: state.externalRequests,
      scope:
        'actual sessions/routes/production Drizzle D1 over final migrated SQLite; SQL-time authority loss, injected fault rollback and concurrent version arbitration; no browser/provider/UAT evidence',
    }),
  );
  if (state.externalRequests !== 0) throw new Error('External request attempted');
} finally {
  globalThis.fetch = oldFetch;
}
