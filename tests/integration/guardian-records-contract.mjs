// FR-06 guardian records and student-guardian links: scoped directory/detail, version-checked edit, reviewed
// link/update/unlink with immutable history, family visibility after unlink. Actual synthetic sessions, route
// handlers and production Drizzle D1 over the final migrated SQLite (0017). Not browser/provider/UAT evidence.
import { counters, recordScenario, stamp } from '../support/records-harness.mjs';
const state = counters();
const oldFetch = globalThis.fetch;
globalThis.fetch = async () => {
  state.externalRequests++;
  throw new Error('Guardian record contracts remain offline and synthetic');
};
const scenario = (name, action) => recordScenario(state, name, action);
const linkPath = (student) => '/api/records/students/' + student + '/guardian-links';
const reason = 'Synthetic administrator family review';
const link = (guardianId, over = {}) => ({
  action: 'link',
  guardianId,
  relationship: 'Aunt',
  isPrimary: false,
  reason,
  clientRequestId: crypto.randomUUID(),
  expectedVersion: 0,
  ...over,
});
const update = (guardianId, expectedVersion, over = {}) => ({
  action: 'update',
  guardianId,
  reason,
  clientRequestId: crypto.randomUUID(),
  expectedVersion,
  ...over,
});
const unlink = (guardianId, expectedVersion, over = {}) => ({
  action: 'unlink',
  guardianId,
  reason,
  clientRequestId: crypto.randomUUID(),
  expectedVersion,
  ...over,
});
const guardianRow = (
  sqlite,
  id,
  school,
  name,
  relationship = 'parent',
  phone = null,
  email = null,
  userId = null,
) =>
  sqlite
    .prepare(
      'INSERT INTO guardians (id,school_id,user_id,name,phone,email,relationship,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
    )
    .run(id, school, userId, name, phone, email, relationship, stamp, stamp);

try {
  await scenario(
    'link inventory lists same-school links, candidates and history for the administrator only',
    async ({ get, check, sqlite, okay }) => {
      guardianRow(sqlite, 'g-free', 'a', 'Free Guardian');
      guardianRow(sqlite, 'g-foreign', 'b', 'Foreign Guardian');
      const inventory = await get(linkPath('student-a'), 'admin-a');
      check(inventory.status, 200, 'Administrator reads the link inventory');
      check(
        Object.keys(inventory.body).sort(),
        ['candidates', 'history', 'links', 'student'],
        'Inventory DTO',
      );
      check(
        inventory.body.links.map((item) => [
          item.guardianId,
          item.relationship,
          item.isPrimary,
          item.hasLogin,
          item.version,
        ]),
        [['guardian-profile-a', 'parent', true, true, 0]],
        'The legacy link appears with its stored primary flag at version zero',
      );
      check(
        inventory.body.candidates.map((item) => item.id).sort(),
        ['g-free', 'guardian-profile-other'],
        'Only unlinked same-school guardians are candidates',
      );
      okay(!JSON.stringify(inventory.body).includes('Foreign Guardian'), 'No foreign guardian data');
      for (const actor of ['teacher-a', 'guardian-a', 'student-user-a'])
        check(
          (await get(linkPath('student-a'), actor)).status,
          403,
          actor + ' cannot read link administration',
        );
      check((await get(linkPath('student-b'), 'admin-a')).status, 404, 'Foreign student not found');
      check((await get(linkPath('student-a'), 'admin-b')).status, 404, 'Foreign administrator not found');
      check((await get(linkPath('student-a'), null)).status, 401, 'Anonymous denied');
    },
  );
  await scenario(
    'link with relationship and primary flag; public DTOs and family access follow',
    async ({ get, send, check, okay, count, sqlite }) => {
      guardianRow(sqlite, 'g-free', 'a', 'Free Guardian', 'parent', null, null, null);
      const input = link('g-free', { relationship: 'Aunt', isPrimary: true });
      const linked = await send('POST', linkPath('student-a'), 'admin-a', input);
      check(linked.status, 201, 'Link recorded');
      check(linked.body.replayed, false, 'Fresh');
      const mine = linked.body.inventory.links.find((item) => item.guardianId === 'g-free');
      check(
        [mine.relationship, mine.profileRelationship, mine.isPrimary, mine.version],
        ['Aunt', 'parent', true, 1],
        'Link-level relationship and primary stored; profile relationship unchanged',
      );
      check(
        linked.body.inventory.links.find((item) => item.guardianId === 'guardian-profile-a').isPrimary,
        false,
        'The previous primary was demoted: one primary per student',
      );
      check(
        linked.body.inventory.history
          .map((item) => [item.guardianName, item.action, item.relationshipAfter, item.primaryAfter])
          .sort(),
        [
          ['Free Guardian', 'link', 'Aunt', true],
          ['guardian-profile-a', 'update', 'parent', false],
        ],
        'History has the link and the demotion, both attributed',
      );
      check(
        linked.body.inventory.history.every((item) => item.actorName === 'admin-a'),
        true,
        'Actor name is from the session',
      );
      const publicList = await get('/api/students/student-a/guardians', 'admin-a');
      check(publicList.status, 200, 'Existing public guardian list works');
      check(
        publicList.body.map((item) => Object.keys(item).sort()),
        [
          ['id', 'name', 'relationship', 'userId'],
          ['id', 'name', 'relationship', 'userId'],
        ],
        'Public DTO still omits isPrimary',
      );
      check(
        publicList.body.find((item) => item.id === 'g-free').relationship,
        'Aunt',
        'The public list shows the link-specific relationship',
      );
      check(
        publicList.body.find((item) => item.id === 'guardian-profile-a').relationship,
        'parent',
        'Other links keep the profile relationship',
      );
      const replay = await send('POST', linkPath('student-a'), 'admin-a', input);
      check(
        [replay.status, replay.body.replayed],
        [200, true],
        'Exact UUID retry returns the original outcome',
      );
      check(count('student_guardian_events'), 2, 'No extra history from a retry');
      check(
        (await send('POST', linkPath('student-a'), 'admin-a', { ...input, relationship: 'Uncle' })).body
          .reason,
        'request-reused',
        'A UUID cannot be reused for different content',
      );
      check(
        (await send('POST', linkPath('student-a'), 'admin-a', link('g-free'))).body.reason,
        'already-linked',
        'A second link for the same pair is refused',
      );
      check(
        (await send('POST', linkPath('student-a'), 'admin-a', link('guardian-profile-a'))).body.reason,
        'already-linked',
        'A legacy link cannot be duplicated either',
      );
      okay(
        count('student_guardians') === 4,
        'Exactly one new relationship row exists (three seeded plus one)',
      );
    },
  );
  await scenario(
    'update relationship and move the primary flag with exact version checks',
    async ({ send, check, sqlite, count }) => {
      guardianRow(sqlite, 'g-free', 'a', 'Free Guardian');
      const one = await send('POST', linkPath('student-a'), 'admin-a', link('g-free'));
      check(one.status, 201, 'Linked non-primary');
      const rel = await send(
        'POST',
        linkPath('student-a'),
        'admin-a',
        update('g-free', 1, { relationship: 'Grandmother' }),
      );
      check(rel.status, 201, 'Relationship updated');
      check(
        rel.body.inventory.links.find((item) => item.guardianId === 'g-free').version,
        2,
        'Pair version advances per change',
      );
      check(
        (
          await send(
            'POST',
            linkPath('student-a'),
            'admin-a',
            update('g-free', 1, { relationship: 'Neighbour' }),
          )
        ).body.reason,
        'stale',
        'Old pair version is stale',
      );
      check(
        (
          await send(
            'POST',
            linkPath('student-a'),
            'admin-a',
            update('g-free', 2, { relationship: 'Grandmother' }),
          )
        ).body.reason,
        'no-change',
        'Saving an unchanged relationship is not a change',
      );
      check(
        (await send('POST', linkPath('student-a'), 'admin-a', update('g-free', 2))).status,
        409,
        'An update must change something',
      );
      const primary = await send(
        'POST',
        linkPath('student-a'),
        'admin-a',
        update('g-free', 2, { isPrimary: true }),
      );
      check(primary.status, 201, 'Primary moved');
      check(
        primary.body.inventory.links.map((item) => [item.guardianId, item.isPrimary]).sort(),
        [
          ['g-free', true],
          ['guardian-profile-a', false],
        ],
        'Exactly one primary',
      );
      check(
        count('student_guardian_events'),
        4,
        'Link, relationship, primary change and one demotion are recorded',
      );
      const back = await send(
        'POST',
        linkPath('student-a'),
        'admin-a',
        update('guardian-profile-a', 1, { isPrimary: true }),
      );
      check(
        back.status,
        201,
        'The demotion counted as a pair revision (version one), so version one is current',
      );
      check(
        back.body.inventory.links.find((item) => item.guardianId === 'guardian-profile-a').isPrimary,
        true,
        'Primary moved back',
      );
      check(
        (
          await send(
            'POST',
            linkPath('student-a'),
            'admin-a',
            update('guardian-profile-other', 0, { isPrimary: true }),
          )
        ).body.reason,
        'not-linked',
        'Cannot update a guardian who is not linked to this student',
      );
    },
  );
  await scenario(
    'unlink removes access immediately, keeps history and allows a later relink at the next version',
    async ({ get, send, check, okay, count, sqlite }) => {
      const before = await get('/api/students/student-a', 'guardian-a');
      check(before.status, 200, 'Linked guardian reads the child');
      check(
        (await get('/api/students', 'guardian-a')).body.map((item) => item.id),
        ['student-a'],
        'Guardian lists only linked children',
      );
      const removed = await send('POST', linkPath('student-a'), 'admin-a', unlink('guardian-profile-a', 0));
      check(removed.status, 201, 'Unlink recorded');
      check(removed.body.inventory.links, [], 'No links remain');
      check(
        removed.body.inventory.history.map((item) => [
          item.action,
          item.relationshipBefore,
          item.primaryBefore,
        ]),
        [['unlink', 'parent', true]],
        'History keeps what was removed',
      );
      check(count('student_guardians') <= 2, true, 'The relationship row is deleted');
      check(
        sqlite.prepare("SELECT count(*) n FROM guardians WHERE id='guardian-profile-a'").get().n,
        1,
        'The guardian profile itself is retained',
      );
      check(
        (await get('/api/students/student-a', 'guardian-a')).status,
        404,
        'The unlinked guardian cannot read the child',
      );
      check((await get('/api/students', 'guardian-a')).body, [], 'Guardian list is empty');
      check(
        (await get('/api/records/students?status=all', 'guardian-a')).body.items,
        [],
        'Directory is empty for the unlinked guardian',
      );
      check(
        (await get('/api/report-cards?studentId=student-a', 'guardian-a')).status === 200 &&
          (await get('/api/report-cards?studentId=student-a', 'guardian-a')).body.length === 0,
        true,
        'Published reports are no longer visible to the unlinked guardian',
      );
      check(
        (await send('POST', linkPath('student-a'), 'admin-a', unlink('guardian-profile-a', 1))).body.reason,
        'not-linked',
        'Unlinking twice is refused',
      );
      check(
        (
          await send(
            'POST',
            linkPath('student-a'),
            'admin-a',
            link('guardian-profile-a', { relationship: 'Mother', expectedVersion: 0 }),
          )
        ).body.reason,
        'stale',
        'Relinking with the old version is stale',
      );
      const again = await send(
        'POST',
        linkPath('student-a'),
        'admin-a',
        link('guardian-profile-a', { relationship: 'Mother', expectedVersion: 1, isPrimary: true }),
      );
      check(again.status, 201, 'Relink at the next version succeeds');
      check(
        again.body.inventory.links.map((item) => [item.relationship, item.version, item.isPrimary]),
        [['Mother', 2, true]],
        'New link-level relationship at version two',
      );
      check(
        (await get('/api/students/student-a', 'guardian-a')).status,
        200,
        'Access returns with the new link',
      );
      okay(
        (await get(linkPath('student-a'), 'admin-a')).body.history.length === 2,
        'Both unlink and link remain in history',
      );
    },
  );
  await scenario(
    'administrator authority, school boundaries and request shape',
    async ({ send, check, snapshot, sqlite }) => {
      guardianRow(sqlite, 'g-foreign', 'b', 'Foreign Guardian');
      const before = snapshot();
      for (const actor of ['teacher-a', 'guardian-a', 'student-user-a'])
        check(
          (await send('POST', linkPath('student-a'), actor, '{bad')).status,
          403,
          actor + ' denied before parsing',
        );
      check(
        (await send('POST', linkPath('student-a'), null, link('guardian-profile-other'))).status,
        401,
        'Anonymous denied',
      );
      check(
        (await send('POST', linkPath('student-a'), 'admin-a', link('g-foreign'))).status,
        404,
        'A guardian from another school cannot be linked',
      );
      check(
        (await send('POST', linkPath('student-b'), 'admin-a', link('guardian-profile-other'))).status,
        404,
        'A student from another school cannot be linked',
      );
      check(
        (await send('POST', linkPath('student-a'), 'admin-b', link('guardian-profile-other'))).status,
        404,
        'Foreign administrator denied',
      );
      check(
        (
          await send('POST', linkPath('student-a'), 'admin-a', link('guardian-profile-other'), {
            origin: 'https://other.example.invalid',
          })
        ).status,
        403,
        'Cross-origin denied',
      );
      for (const [over, label] of [
        [{ reason: 'short' }, 'short reason'],
        [{ relationship: '' }, 'empty relationship'],
        [{ relationship: 'x'.repeat(61) }, 'long relationship'],
        [{ isPrimary: 'yes' }, 'non-boolean primary'],
        [{ clientRequestId: 'x' }, 'bad uuid'],
        [{ expectedVersion: 0.5 }, 'fractional version'],
        [{ extra: 1 }, 'unknown field'],
        [{ action: 'delete' }, 'unknown action'],
      ])
        check(
          (await send('POST', linkPath('student-a'), 'admin-a', link('guardian-profile-other', over))).status,
          400,
          'Rejected: ' + label,
        );
      check(snapshot(), before, 'Nothing persisted from denied or invalid requests');
      check(
        (await send('DELETE', linkPath('student-a'), 'admin-a')).absent,
        true,
        'No DELETE method exists for links',
      );
    },
  );
  await scenario(
    'a guardian sees only linked children and published information; a student sees only themself',
    async ({ get, check, okay }) => {
      const guardian = await get('/api/records/guardians/guardian-profile-a', 'guardian-a');
      check(guardian.status, 200, 'Guardian opens their own profile');
      check(
        guardian.body.children.map((item) => [item.id, item.relationship, item.status]),
        [['student-a', 'parent', 'active']],
        'Only the linked child, with no primary-flag evidence',
      );
      okay(!('isPrimary' in guardian.body.children[0]), 'Primary flag stays administrator-only');
      check(
        (await get('/api/records/guardians/guardian-profile-other', 'guardian-a')).status,
        404,
        "Another family's guardian profile is not found",
      );
      check(
        (await get('/api/records/guardians/guardian-profile-b', 'guardian-a')).status,
        404,
        'A foreign-school guardian is not found',
      );
      check(
        (await get('/api/students/student-other', 'guardian-a')).status,
        404,
        "Another family's child is not found",
      );
      check((await get('/api/students/student-b', 'guardian-a')).status, 404, 'A foreign child is not found');
      const reports = await get('/api/report-cards?studentId=student-a', 'guardian-a');
      check(
        reports.body.map((item) => item.id),
        ['published-a'],
        'Guardian sees only the published report, never the draft',
      );
      const student = await get('/api/records/students?status=all', 'student-user-a');
      check(
        student.body.items.map((item) => item.id),
        ['student-a'],
        'Student sees only themself',
      );
      check(
        (await get('/api/students/student-other', 'student-user-a')).status,
        404,
        'Student cannot open another student',
      );
      check(
        (await get('/api/records/students/student-a', 'student-user-a')).status,
        403,
        'Student cannot open administration detail',
      );
      check(
        (await get('/api/records/guardians?q=guardian', 'student-user-a')).body.items.map((item) => item.id),
        ['guardian-profile-a'],
        'A student sees only guardians of themself',
      );
      check(
        (await get('/api/records/guardians', 'teacher-a')).body.items.map((item) => item.id),
        ['guardian-profile-a'],
        'A teacher sees guardians of assigned students only',
      );
    },
  );
  await scenario(
    'guardian directory is searchable, scoped and counts only visible children',
    async ({ get, send, check, sqlite }) => {
      guardianRow(sqlite, 'g-zed', 'a', 'Zed Zulu', 'uncle', '+91 111 222', 'zed@example.invalid');
      guardianRow(sqlite, 'g-foreign', 'b', 'Zed Foreign');
      const all = await get('/api/records/guardians', 'admin-a');
      check(all.status, 200, 'Administrator reads the guardian directory');
      check(all.body.total, 3, 'Own school guardians only');
      check(
        all.body.items
          .map((item) => [item.id, item.linkedStudents, item.hasLogin])
          .sort((x, y) => x[0].localeCompare(y[0])),
        [
          ['g-zed', 0, false],
          ['guardian-profile-a', 1, true],
          ['guardian-profile-other', 1, true],
        ],
        'Rows with honest linked counts and login flag',
      );
      check(
        (await get('/api/records/guardians?q=zed', 'admin-a')).body.items.map((item) => item.id),
        ['g-zed'],
        'Search never crosses the school',
      );
      check(
        (await get('/api/records/guardians?q=222', 'admin-a')).body.items.map((item) => item.id),
        ['g-zed'],
        'Phone fragment search',
      );
      check(
        (await get('/api/records/guardians', 'guardian-a')).body.items.map((item) => item.id),
        ['guardian-profile-a'],
        'A guardian sees only themself',
      );
      check((await get('/api/records/guardians?limit=0', 'admin-a')).status, 400, 'Bad paging rejected');
      check((await get('/api/records/guardians?grade=7', 'admin-a')).status, 400, 'Unknown filter rejected');
      await send('POST', linkPath('student-other'), 'admin-a', link('g-zed'));
      check(
        (await get('/api/records/guardians', 'teacher-a')).body.items.map((item) => item.id),
        ['guardian-profile-a'],
        "The link to another teacher's student does not widen teacher-a scope",
      );
      await send('POST', linkPath('student-other'), 'admin-a', link('guardian-profile-a'));
      check(
        (await get('/api/records/guardians/guardian-profile-a', 'admin-a')).body.children
          .map((item) => item.id)
          .sort(),
        ['student-a', 'student-other'],
        'Administrator sees both children',
      );
      check(
        (await get('/api/records/guardians/guardian-profile-a', 'teacher-a')).body.children.map(
          (item) => item.id,
        ),
        ['student-a'],
        'A teacher sees only the child of an assigned class',
      );
      check(
        (await get('/api/records/guardians', 'admin-a')).body.items.find(
          (item) => item.id === 'guardian-profile-a',
        ).linkedStudents,
        2,
        'Administrator count includes both children',
      );
      check(
        (await get('/api/records/guardians', 'teacher-a')).body.items.find(
          (item) => item.id === 'guardian-profile-a',
        ).linkedStudents,
        1,
        'Teacher count includes only the visible child',
      );
    },
  );
  await scenario(
    'guardian edit is administrator-only, version-checked and validated',
    async ({ get, send, check, okay, snapshot, row }) => {
      const detail = (await get('/api/records/guardians/guardian-profile-a', 'admin-a')).body;
      check(detail.guardian.hasLogin, true, 'Detail shows whether a login account is linked');
      okay(!('userId' in detail.guardian), 'The account id is not disclosed');
      const body = {
        name: 'Edited Guardian',
        phone: '+91 98765 43210',
        email: 'edited@example.invalid',
        relationship: 'Mother',
        expectedUpdatedAt: detail.guardian.updatedAt,
      };
      const saved = await send('PATCH', '/api/records/guardians/guardian-profile-a', 'admin-a', body);
      check(saved.status, 200, 'Saved');
      check(
        [saved.body.guardian.name, saved.body.guardian.phone, saved.body.guardian.email],
        ['Edited Guardian', '+91 98765 43210', 'edited@example.invalid'],
        'Fields saved',
      );
      check(
        row("SELECT user_id FROM guardians WHERE id='guardian-profile-a'").user_id,
        'guardian-a',
        'Login binding retained',
      );
      const before = snapshot();
      check(
        (await send('PATCH', '/api/records/guardians/guardian-profile-a', 'admin-a', body)).body.reason,
        'stale',
        'The old token is stale',
      );
      const fresh = saved.body.guardian.updatedAt;
      for (const [over, field] of [
        [{ name: '' }, 'name'],
        [{ email: 'nope' }, 'email'],
        [{ phone: 'letters' }, 'phone'],
        [{ relationship: '' }, 'relationship'],
        [{ expectedUpdatedAt: 'x' }, 'expectedUpdatedAt'],
        [{ userId: 'guardian-other' }, ''],
        [{ schoolId: 'b' }, ''],
      ]) {
        const result = await send('PATCH', '/api/records/guardians/guardian-profile-a', 'admin-a', {
          ...body,
          expectedUpdatedAt: fresh,
          ...over,
        });
        check(result.status, 400, 'Rejected ' + JSON.stringify(over));
        if (field) okay(result.body.fields.includes(field), 'Field named ' + field);
      }
      const cleared = await send('PATCH', '/api/records/guardians/guardian-profile-a', 'admin-a', {
        ...body,
        phone: '',
        email: null,
        expectedUpdatedAt: fresh,
      });
      check(
        [cleared.status, cleared.body.guardian.phone, cleared.body.guardian.email],
        [200, null, null],
        'Optional contact details can be cleared',
      );
      for (const actor of ['teacher-a', 'guardian-a', 'student-user-a'])
        check(
          (await send('PATCH', '/api/records/guardians/guardian-profile-a', actor, '{bad')).status,
          403,
          actor + ' denied (a guardian cannot edit even their own profile here)',
        );
      check(
        (
          await send('PATCH', '/api/records/guardians/guardian-profile-b', 'admin-a', {
            ...body,
            expectedUpdatedAt: fresh,
          })
        ).status,
        404,
        'Foreign guardian is not found',
      );
      check(
        (
          await send('PATCH', '/api/records/guardians/guardian-profile-a', 'admin-b', {
            ...body,
            expectedUpdatedAt: fresh,
          })
        ).status,
        404,
        'Foreign administrator not found',
      );
      check(
        snapshot().guardians.filter((item) => item.id === 'guardian-profile-b'),
        before.guardians.filter((item) => item.id === 'guardian-profile-b'),
        'Foreign guardian row untouched',
      );
    },
  );
  await scenario(
    'the original guardian link endpoint still works and now records history without duplicating on retry',
    async ({ send, get, check, count, sqlite, rows }) => {
      guardianRow(sqlite, 'g-legacy', 'a', 'Legacy Guardian', 'uncle');
      const first = await send('POST', '/api/students/student-a/guardians', 'admin-a', {
        guardianId: 'g-legacy',
        isPrimary: true,
      });
      check(
        [first.status, first.body],
        [200, { message: 'Guardian linked successfully' }],
        'Original response contract',
      );
      const second = await send('POST', '/api/students/student-a/guardians', 'admin-a', {
        guardianId: 'g-legacy',
      });
      check(second.status, 200, 'Exact retry is safe');
      check(
        rows("SELECT is_primary FROM student_guardians WHERE guardian_id='g-legacy'").map(
          (item) => item.is_primary,
        ),
        [0],
        'The supplied primary flag is still ignored and the stored evidence retained',
      );
      check(
        rows(
          "SELECT action, relationship_after, primary_after, expected_version, resulting_version FROM student_guardian_events WHERE guardian_id='g-legacy'",
        ),
        [
          {
            action: 'link',
            relationship_after: 'uncle',
            primary_after: 0,
            expected_version: 0,
            resulting_version: 1,
          },
        ],
        'One history row for the new pair only',
      );
      const inventory = await get(linkPath('student-a'), 'admin-a');
      check(
        inventory.body.links.find((item) => item.guardianId === 'g-legacy').version,
        1,
        'The managed workflow continues from the recorded version',
      );
      check(
        (await send('POST', '/api/students/student-a/guardians', 'teacher-a', { guardianId: 'g-legacy' }))
          .status,
        403,
        'Teacher denied as before',
      );
      check(
        (
          await send('POST', '/api/students/student-a/guardians', 'admin-a', {
            guardianId: 'guardian-profile-b',
          })
        ).status,
        404,
        'Foreign guardian is 404 as before',
      );
      check(count('student_guardian_events'), 1, 'No history from denied requests');
    },
  );
  await scenario(
    'late authority loss, injected faults and concurrent changes never leave a half-applied link',
    async ({ send, check, arm, revoke, snapshot, fired, sqlite }) => {
      guardianRow(sqlite, 'g-free', 'a', 'Free Guardian');
      const before = snapshot();
      arm(
        'before',
        (query) => query.startsWith('insert into "student_guardian_events"'),
        () => revoke('admin-a'),
      );
      const denied = await send('POST', linkPath('student-a'), 'admin-a', link('g-free'));
      check(fired(), true, 'Session lost immediately before the actual event INSERT');
      check(denied.status >= 400 && denied.status < 500, true, 'Revoked administrator denied');
      check(snapshot(), before, 'Nothing changed');
      arm(
        'before',
        (query) => query.startsWith('insert into "student_guardian_details"'),
        () => {
          throw new Error('Injected relationship write fault');
        },
      );
      const failed = await send('POST', linkPath('student-a'), 'admin-second-a', link('g-free'));
      check(fired(), true, 'Fault fired on the third statement');
      check(failed.status, 500, 'Client sees an unconfirmed failure');
      check(snapshot(), before, 'Event and relationship rolled back together');
      const ok = await send('POST', linkPath('student-a'), 'admin-second-a', link('g-free'));
      check(ok.status, 201, 'A fresh request after the rolled-back fault succeeds');
      const racers = await Promise.all([
        send(
          'POST',
          linkPath('student-a'),
          'admin-second-a',
          update('g-free', 1, { relationship: 'Racer one' }),
        ),
        send(
          'POST',
          linkPath('student-a'),
          'admin-second-a',
          update('g-free', 1, { relationship: 'Racer two' }),
        ),
      ]);
      check(
        racers.map((item) => item.status).sort(),
        [201, 409],
        'Two changes against one pair version have exactly one winner',
      );
    },
  );
  await scenario('link history is immutable at the database', async ({ send, check, sqlite }) => {
    const input = unlink('guardian-profile-a', 0);
    await send('POST', linkPath('student-a'), 'admin-a', input);
    let updated = false,
      deleted = false;
    try {
      sqlite
        .prepare("UPDATE student_guardian_events SET reason='Changed afterwards in place' WHERE id=?")
        .run(input.clientRequestId);
      updated = true;
    } catch {
      /* expected */
    }
    try {
      sqlite.prepare('DELETE FROM student_guardian_events WHERE id=?').run(input.clientRequestId);
      deleted = true;
    } catch {
      /* expected */
    }
    check([updated, deleted], [false, false], 'Event rows cannot be rewritten or removed');
  });
  console.log(
    JSON.stringify({
      passed: state.checks,
      failed: 0,
      skipped: 0,
      scenarios: state.scenarios,
      requests: state.requests,
      externalRequests: state.externalRequests,
      scope:
        'actual sessions/routes/production Drizzle D1 over final migrated SQLite; SQL-time authority loss, injected fault rollback, immutable history and concurrent version arbitration; no browser/provider/UAT evidence',
    }),
  );
  if (state.externalRequests !== 0) throw new Error('External request attempted');
} finally {
  globalThis.fetch = oldFetch;
}
