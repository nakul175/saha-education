import { AuthError, setting } from './identity';
import { assertPrincipal } from './access';
import { getStudent } from './students';
import type { Principal, Role } from './types';

const ORF_ID = 'oral-reading-fluency';
const STAFF_ROLES: Role[] = ['admin', 'teacher'];

export interface ExternalAppMetadata {
  id: string;
  title: string;
  available: boolean;
  allowedRoles: Role[];
  capability: 'launch-only';
  signIn: 'separate';
  resultSync: false;
}

// The trusted operator configuration is the only destination authority. No
// request parameter can set a URL, and no student or session data is appended.
function configuredOrfUrl(): string | null {
  const value = setting('SAHA_ORF_APP_URL');
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
        /[?#\\\s]/.test(value)) return null;
    return value;
  } catch {
    return null;
  }
}

export function assertExternalAppStaff(principal: Principal): void {
  assertPrincipal(principal);
  if (!STAFF_ROLES.includes(principal.role)) throw new AuthError('Staff access required', 403);
}

export function listExternalApps(principal: Principal): ExternalAppMetadata[] {
  assertPrincipal(principal);
  return [{
    id: ORF_ID,
    title: 'Oral reading fluency',
    available: STAFF_ROLES.includes(principal.role) && configuredOrfUrl() !== null,
    allowedRoles: [...STAFF_ROLES],
    capability: 'launch-only',
    signIn: 'separate',
    resultSync: false,
  }];
}

export async function launchExternalApp(principal: Principal, id: string, input: { studentId?: string } = {}): Promise<{ url: string; signIn: 'separate'; resultSync: false }> {
  assertExternalAppStaff(principal);
  if (id !== ORF_ID) throw new AuthError('Application not found', 404);
  if (input.studentId && !await getStudent(principal, input.studentId)) throw new AuthError('Student not found', 404);
  const url = configuredOrfUrl();
  if (!url) throw new AuthError('Application unavailable', 503);
  return { url, signIn: 'separate', resultSync: false };
}
