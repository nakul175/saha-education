import type { Role } from './types';

export type WorkspaceLink = { label: string; href: string; roles: readonly Role[] };
export type WorkspaceGroup = { id: string; label: string; icon: string; links: WorkspaceLink[] };
const everyone: Role[] = ['admin', 'teacher', 'guardian', 'student'];
const staff: Role[] = ['admin', 'teacher'];
const admin: Role[] = ['admin'];
// Navigation is orientation only. Every destination retains its server permission checks.
export const WORKSPACE_GROUPS: WorkspaceGroup[] = [
  { id: 'today', label: 'Today', icon: 'sun', links: [{ label: 'Dashboard', href: '/', roles: everyone }] },
  {
    id: 'classroom',
    label: 'Classroom',
    icon: 'users',
    links: [
      { label: 'Students', href: '/students', roles: everyone },
      { label: 'Classes', href: '/classes', roles: everyone },
      { label: 'Student records', href: '/records', roles: everyone },
      { label: 'Guardians', href: '/guardians', roles: admin },
      { label: 'Courses', href: '/courses', roles: staff },
      { label: 'Enrolments', href: '/enrolments', roles: staff },
      { label: 'Courses and rosters', href: '/academic', roles: staff },
      { label: 'Enrolment history', href: '/enrolments/history', roles: everyone },
    ],
  },
  {
    id: 'attendance',
    label: 'Attendance',
    icon: 'check',
    links: [{ label: 'Attendance', href: '/attendance', roles: everyone }],
  },
  {
    id: 'teaching',
    label: 'Teaching',
    icon: 'book',
    links: [
      { label: 'Teaching resources', href: '/resources', roles: staff },
      { label: 'Class resources', href: '/learning', roles: ['admin', 'teacher', 'student'] },
      { label: 'Submissions and feedback', href: '/submissions', roles: ['admin', 'teacher', 'student'] },
      { label: 'Curriculum library', href: '/curriculum', roles: staff },
    ],
  },
  {
    id: 'reading',
    label: 'Reading',
    icon: 'reading',
    links: [
      { label: 'Reading review', href: '/reading-review', roles: staff },
      { label: 'Reading practice planner', href: '/reading-practice', roles: staff },
      { label: 'Reading imports', href: '/reading-imports', roles: staff },
      { label: 'Reading apps', href: '/external-apps', roles: staff },
    ],
  },
  {
    id: 'progress',
    label: 'Progress',
    icon: 'chart',
    links: [
      { label: 'Assessments', href: '/assessments', roles: everyone },
      { label: 'Report cards', href: '/report-cards', roles: everyone },
    ],
  },
  {
    id: 'school',
    label: 'School',
    icon: 'school',
    links: [
      { label: 'School setup', href: '/schools/setup', roles: staff },
      { label: 'Schools', href: '/schools', roles: admin },
      { label: 'Accounts', href: '/admin/users', roles: admin },
      { label: 'Profile links', href: '/admin/profile-links', roles: admin },
      { label: 'Audit trail', href: '/admin/audit', roles: admin },
      { label: 'Send a notice', href: '/notices', roles: staff },
    ],
  },
];
export function workspaceGroups(role: Role): WorkspaceGroup[] {
  return WORKSPACE_GROUPS.map((group) => ({
    ...group,
    links: group.links.filter((link) => link.roles.includes(role)),
  })).filter((group) => group.links.length > 0);
}
export function currentWorkspace(pathname: string, role: Role) {
  const path = pathname.split('?')[0].replace(/\/$/, '') || '/';
  const groups = workspaceGroups(role);
  if (path === '/' || /^\/dashboard(?:\/|$)/.test(path))
    return { groupId: 'today', href: '/', label: 'Dashboard' };
  if (path === '/account') return { groupId: '', href: '/account', label: 'Your account' };
  if (path === '/notifications') return { groupId: '', href: '/notifications', label: 'Notifications' };
  // Longest path wins: school setup and enrolment history must not activate their parent list.
  const match = groups
    .flatMap((group) => group.links.map((link) => ({ ...link, groupId: group.id })))
    .filter((link) => link.href !== '/' && (path === link.href || path.startsWith(link.href + '/')))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (match) return { groupId: match.groupId, href: match.href, label: match.label };
  if (path.startsWith('/assignments/'))
    return { groupId: 'teaching', href: '/learning', label: 'Class assignment' };
  return { groupId: '', href: '', label: 'Workspace' };
}

/** Display metadata binding only; this digest is never an authentication token. */
export async function accountDisplayScope(id: string, role: Role, schoolId?: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify([id, role, schoolId ?? null])),
    ),
  );
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
