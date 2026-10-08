import assert from 'node:assert/strict';
import { load } from '../support/security-db.mjs';
const { workspaceGroups, currentWorkspace, accountDisplayScope } = await load('lib/education/navigation.ts');
const { digest } = await load('lib/education/identity.ts');
let passed = 0;
const check = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  passed++;
};
for (const role of ['admin', 'teacher', 'guardian', 'student']) {
  const groups = workspaceGroups(role),
    links = groups.flatMap((group) => group.links);
  check(
    new Set(links.map((link) => link.href)).size,
    links.length,
    role + ': every destination has one entry',
  );
  check(
    links.every((link) => link.roles.includes(role)),
    true,
    role + ': all entries retain role visibility',
  );
  check(
    links.some((link) => link.href === '/admin/users'),
    role === 'admin',
    role + ': school account controls stay administrator-only',
  );
  check(
    links.some((link) => link.href === '/reading-practice'),
    role === 'admin' || role === 'teacher',
    role + ': reading planning stays staff-only',
  );
  check(
    links.some((link) => link.href === '/learning'),
    role !== 'guardian',
    role + ': guardian learning access is not invented',
  );
  check(
    currentWorkspace('/dashboard/' + role, role).groupId,
    'today',
    role + ': its dashboard highlights Today',
  );
}
check(
  currentWorkspace('/schools/setup', 'admin').href,
  '/schools/setup',
  'Setup beats the parent school path',
);
check(
  currentWorkspace('/enrolments/history', 'teacher').href,
  '/enrolments/history',
  'History beats enrolment list',
);
check(
  currentWorkspace('/students/a-safe-student', 'guardian').groupId,
  'classroom',
  'Profile details stay in Classroom',
);
check(currentWorkspace('/students-other', 'admin').groupId, '', 'A similar path is not a matching route');
check(
  currentWorkspace('/resources/saved/print', 'teacher').groupId,
  'teaching',
  'Print edition remains in Teaching',
);
check(
  currentWorkspace('/assignments/current/progress', 'student').groupId,
  'teaching',
  'Assignment progress remains in Teaching',
);
check(
  currentWorkspace('/admin/users', 'student').groupId,
  '',
  'An inaccessible staff URL never highlights a fabricated permission',
);
check(currentWorkspace('/account', 'guardian').label, 'Your account', 'Account remains discoverable');
check(
  await accountDisplayScope('teacher-a', 'teacher', 'school-a'),
  await digest(JSON.stringify(['teacher-a', 'teacher', 'school-a'])),
  'Display metadata uses the server’s exact scope binding',
);
check(
  (await accountDisplayScope('teacher-b', 'teacher', 'school-a')) ===
    (await accountDisplayScope('teacher-a', 'teacher', 'school-a')),
  false,
  'Different accounts cannot share a display scope',
);
check(
  (await accountDisplayScope('teacher-a', 'teacher', 'school-b')) ===
    (await accountDisplayScope('teacher-a', 'teacher', 'school-a')),
  false,
  'Changed school cannot reuse a display scope',
);
check(
  (await accountDisplayScope('teacher-a', 'admin', 'school-a')) ===
    (await accountDisplayScope('teacher-a', 'teacher', 'school-a')),
  false,
  'Changed role cannot reuse a display scope',
);
console.log(
  JSON.stringify({
    passed,
    failed: 0,
    skipped: 0,
    scope:
      'Navigation/path collisions and exact metadata binding only; no business acceptance or authentication authority',
  }),
);
