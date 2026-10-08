'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- Use full-page navigation while vinext beta Link transitions are unreliable. */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { AdminUser, IdentityAdminEvent, IdentityAdminResult } from '@/lib/education/identity-admin';
import type { AdminUserDetail, ConflictReason, IdentityChangeEvent, IdentityChangeResult } from '@/lib/education/identity-changes';
import type { Principal, Role } from '@/lib/education/types';

type ProvisionForm = { name: string; email: string; role: Role; identityIssuer: string; identitySubject: string; reason: string; reviewConfirmed: boolean };
type StatusReview = { user: AdminUser; enabled: boolean; reason: string; reviewConfirmed: boolean };
type PendingRequest = { payload: string; id: string };
type RoleForm = { role: Role; reason: string; reviewConfirmed: boolean };
type SignInForm = { identityIssuer: string; identitySubject: string; reason: string; reviewConfirmed: boolean };
type HistoryItem = { id: string; at: string; title: string; reason: string; actorId: string; userId: string; version: number };
const ROLE_LABEL: Record<Role, string> = { admin: 'School administrator', teacher: 'Teacher', student: 'Student', guardian: 'Guardian' };
const SYNTHETIC_ISSUER = 'https://saha-demo.example.invalid';
/** Plain-language explanation for each reason the server can refuse a role or sign-in change. */
const CONFLICT: Record<ConflictReason, string> = {
  stale_version: 'This account changed after you opened it. Close the panel, reload accounts and open it again.',
  self: 'You cannot change your own role or sign-in link. Ask another school administrator to review it.',
  no_change: 'The account already has that role or sign-in state, so nothing was changed.',
  last_admin: 'This would leave the school without an enabled administrator who can sign in. Provision or link another administrator first.',
  profile_linked: 'This account is linked to a student or guardian profile. Remove that link under reviewed profile links before changing the role.',
  class_assigned: 'This teacher still has classes. Move those classes to another teacher before changing the role.',
  identity_in_use: 'Another account in the system already uses that sign-in identity.',
  already_mapped: 'This account already has a sign-in link. Remove it before linking a different identity.',
  not_mapped: 'This account has no sign-in link to remove.',
  fixed_demo_account: 'This is a fixed synthetic demo account and keeps its sign-in identity.',
  demo_unlink: 'Sign-in links cannot be removed on a synthetic demo installation.',
  demo_issuer: 'A synthetic demo installation accepts only the synthetic demo sign-in provider.',
  request_reused: 'That review was already used for a different change. Close the panel and start a new review.',
};
const emptyRoleForm = (role: Role): RoleForm => ({ role, reason: '', reviewConfirmed: false });
const emptySignIn = (): SignInForm => ({ identityIssuer: '', identitySubject: '', reason: '', reviewConfirmed: false });
const emptyProvision = (): ProvisionForm => ({ name: '', email: '', role: 'teacher', identityIssuer: '', identitySubject: '', reason: '', reviewConfirmed: false });
class RequestError extends Error {
  constructor(message: string, readonly status: number, readonly reason?: string) { super(message); }
}
async function readJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: 'no-store' });
  if (response.status === 401) {
    window.location.assign(new URL('/login?reason=expired', window.location.origin).href);
    throw new RequestError('Please sign in to continue.', 401);
  }
  if (response.status === 403) throw new RequestError('Administrator access is required. Your permission may have changed.', 403);
  if (response.status === 409) {
    let reason: string | undefined;
    try { const value = await response.json() as { reason?: unknown }; if (typeof value.reason === 'string') reason = value.reason; } catch { /* The generic conflict text still applies. */ }
    throw new RequestError('This account or request conflicts with saved information.', 409, reason);
  }
  if (response.status === 404) throw new RequestError('This account is no longer available in your school. Reload accounts.', 404);
  if (response.status === 400) throw new RequestError('Check the fields, exact provider identity, review confirmation and reason.', 400);
  if (!response.ok) throw new RequestError('The request could not be confirmed. Keep this page open and retry the same review.', response.status);
  return response.json() as Promise<T>;
}
async function inventory() {
  const [users, events, changes] = await Promise.all([
    readJson<AdminUser[]>('/api/admin/users'), readJson<IdentityAdminEvent[]>('/api/admin/users/events'),
    readJson<IdentityChangeEvent[]>('/api/admin/users/changes'),
  ]);
  return { users, events, changes };
}
function conflictText(caught: unknown, fallback: string): string {
  if (caught instanceof RequestError && caught.status === 409) return (caught.reason && CONFLICT[caught.reason as ConflictReason]) || 'This account changed or the request conflicts with saved information. Close the panel, reload accounts and review the account again.';
  return caught instanceof RequestError ? caught.message : fallback;
}
function issuerLabel(value: string | null): string { return value === null ? 'Not mapped' : value === SYNTHETIC_ISSUER ? 'Synthetic demo sign-in' : value; }
function timestamp(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
}

export default function AdminUsersPage() {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [events, setEvents] = useState<IdentityAdminEvent[]>([]);
  const [form, setForm] = useState<ProvisionForm>(emptyProvision);
  const [review, setReview] = useState<StatusReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [changes, setChanges] = useState<IdentityChangeEvent[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [managed, setManaged] = useState<AdminUserDetail | null>(null);
  const [roleForm, setRoleForm] = useState<RoleForm>(() => emptyRoleForm('teacher'));
  const [signInForm, setSignInForm] = useState<SignInForm>(emptySignIn);
  const manageHeading = useRef<HTMLHeadingElement>(null);
  const roleRetry = useRef<PendingRequest | null>(null);
  const signInRetry = useRef<PendingRequest | null>(null);
  const busy = useRef(false);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const provisionRetry = useRef<PendingRequest | null>(null);
  const statusRetry = useRef<PendingRequest | null>(null);
  const inputStyle = 'w-full rounded border bg-background p-2';

  function displayError(caught: unknown, fallback: string) {
    if (caught instanceof RequestError && caught.status === 403) setPrincipal(null);
    setError(caught instanceof RequestError ? caught.message : fallback);
  }
  function applyInventory(value: Awaited<ReturnType<typeof inventory>>) {
    setUsers(value.users); setEvents(value.events); setChanges(value.changes);
  }
  function applyChange(value: IdentityChangeResult) {
    setUsers(previous => [value.user, ...previous.filter(user => user.id !== value.user.id)]
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).slice(0, 500));
    setChanges(previous => [value.event, ...previous.filter(event => event.id !== value.event.id)]
      .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt) || b.id.localeCompare(a.id)).slice(0, 200));
  }
  function failure(caught: unknown, fallback: string) {
    if (caught instanceof RequestError && caught.status === 403) setPrincipal(null);
    setError(conflictText(caught, fallback) + (caught instanceof RequestError && caught.status === 409 ? ' Your review text has been kept.' : ''));
  }
  function applySaved(value: IdentityAdminResult) {
    setUsers(previous => [value.user, ...previous.filter(user => user.id !== value.user.id)]
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).slice(0, 500));
    setEvents(previous => [value.event, ...previous.filter(event => event.id !== value.event.id)]
      .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt) || b.id.localeCompare(a.id)).slice(0, 200));
  }
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const actor = await readJson<Principal>('/api/session');
        if (!active) return;
        if (actor.role !== 'admin') { setError('This workspace is available to school administrators.'); return; }
        setPrincipal(actor);
        const value = await inventory();
        if (active) { setUsers(value.users); setEvents(value.events); setChanges(value.changes); }
      } catch (caught) {
        if (active) {
          if (caught instanceof RequestError && caught.status === 403) setPrincipal(null);
          setError(caught instanceof Error ? caught.message : 'Could not load account administration.');
        }
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);
  const managedUserId = managed?.user.id;
  useEffect(() => {
    if (managedUserId) { manageHeading.current?.focus(); manageHeading.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }, [managedUserId]);
  const reviewUserId = review?.user.id;
  useEffect(() => {
    if (reviewUserId) { reviewHeading.current?.focus(); reviewHeading.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }, [reviewUserId]);

  async function reload() {
    if (busy.current) return;
    busy.current = true; setLoading(true); setError(''); setMessage('');
    try {
      const actor = await readJson<Principal>('/api/session');
      if (actor.role !== 'admin') throw new RequestError('Administrator access is required.', 403);
      setPrincipal(actor); applyInventory(await inventory());
      setMessage(review ? 'Accounts refreshed. Close the open review and select the account again to use its latest version.' : 'Accounts and recent reviews refreshed.');
    } catch (caught) { displayError(caught, 'Could not reload accounts.'); }
    finally { busy.current = false; setLoading(false); }
  }
  async function provision(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true; setSaving(true); setError(''); setMessage('');
    const input = { ...form, name: form.name.trim(), email: form.email.trim(), reason: form.reason.trim() };
    const payload = JSON.stringify(input);
    const id = provisionRetry.current?.payload === payload ? provisionRetry.current.id : crypto.randomUUID();
    provisionRetry.current = { payload, id };
    try {
      const saved = await readJson<IdentityAdminResult>('/api/admin/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, clientRequestId: id }),
      });
      applySaved(saved); provisionRetry.current = null; setForm(emptyProvision());
      setMessage('Reviewed account saved. Its sign-in provider must be configured separately.');
      try { applyInventory(await inventory()); }
      catch { setMessage('Reviewed account saved. Reload accounts to refresh the full list and recent reviews.'); }
    } catch (caught) {
      if (caught instanceof RequestError && caught.status === 409 && caught.reason === 'demo_issuer') setError(CONFLICT.demo_issuer + ' Your form has been kept.');
      else if (caught instanceof RequestError && caught.status === 409) setError('This identity, email or earlier request conflicts with saved information. Reload accounts and review existing mappings before trying again. Your form has been kept.');
      else displayError(caught, 'The save could not be confirmed. Keep this page open and retry without changing the form.');
    } finally { busy.current = false; setSaving(false); }
  }
  async function changeStatus(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !review) return;
    busy.current = true; setSaving(true); setError(''); setMessage('');
    const target = review;
    const input = { expectedVersion: target.user.version, enabled: target.enabled, reviewConfirmed: target.reviewConfirmed, reason: target.reason.trim() };
    const payload = JSON.stringify({ userId: target.user.id, ...input });
    const id = statusRetry.current?.payload === payload ? statusRetry.current.id : crypto.randomUUID();
    statusRetry.current = { payload, id };
    try {
      const saved = await readJson<IdentityAdminResult>('/api/admin/users/' + encodeURIComponent(target.user.id), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, clientRequestId: id }),
      });
      applySaved(saved); statusRetry.current = null; setReview(null);
      // A safe replay may return today's state after a later administration event.
      // Report the confirmed review and current account state instead of assuming it.
      const result = `Reviewed access change saved. ${saved.user.name} is currently ${saved.user.disabledAt ? 'disabled' : 'enabled'}.`;
      setMessage(result);
      try { applyInventory(await inventory()); }
      catch { setMessage(result + ' Reload accounts to refresh the list and recent reviews.'); }
    } catch (caught) {
      if (caught instanceof RequestError && caught.status === 409) setError('This account has changed, the review conflicts, or the change would remove protected administrator access. Reload accounts, close this review and select the account again. Your review text has been kept.');
      else displayError(caught, 'The access change could not be confirmed. Keep this page open and retry the same review.');
    } finally { busy.current = false; setSaving(false); }
  }

  async function openManage(user: AdminUser) {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError(''); setMessage('');
    try {
      const detail = await readJson<AdminUserDetail>('/api/admin/users/' + encodeURIComponent(user.id));
      setReview(null); setManaged(detail); setRoleForm(emptyRoleForm(detail.user.role)); setSignInForm(emptySignIn());
      roleRetry.current = null; signInRetry.current = null;
      setMessage('Managing ' + detail.user.name + '. Review the role and sign-in link below.');
    } catch (caught) { displayError(caught, 'This account could not be opened.'); }
    finally { busy.current = false; setSaving(false); }
  }
  async function submitRole(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !managed) return;
    busy.current = true; setSaving(true); setError(''); setMessage('');
    const target = managed;
    const input = { expectedVersion: target.user.version, role: roleForm.role, reviewConfirmed: roleForm.reviewConfirmed, reason: roleForm.reason.trim() };
    const payload = JSON.stringify({ userId: target.user.id, ...input });
    const id = roleRetry.current?.payload === payload ? roleRetry.current.id : crypto.randomUUID();
    roleRetry.current = { payload, id };
    try {
      const saved = await readJson<IdentityChangeResult>('/api/admin/users/' + encodeURIComponent(target.user.id) + '/role', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, clientRequestId: id }),
      });
      applyChange(saved); roleRetry.current = null; setManaged(null);
      const result = `Reviewed role change saved. ${saved.user.name} is now ${ROLE_LABEL[saved.user.role].toLowerCase()}. Their open sessions were ended.`;
      setMessage(result);
      try { applyInventory(await inventory()); }
      catch { setMessage(result + ' Reload accounts to refresh the list and recent reviews.'); }
    } catch (caught) { failure(caught, 'The role change could not be confirmed. Keep this page open and retry the same review.'); }
    finally { busy.current = false; setSaving(false); }
  }
  async function submitSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !managed) return;
    busy.current = true; setSaving(true); setError(''); setMessage('');
    const target = managed;
    const linked = Boolean(target.user.identityIssuer && target.user.identitySubject);
    const common = { expectedVersion: target.user.version, reviewConfirmed: signInForm.reviewConfirmed, reason: signInForm.reason.trim() };
    const input = linked ? { ...common, action: 'unlink' as const }
      : { ...common, action: 'link' as const, identityIssuer: signInForm.identityIssuer.trim(), identitySubject: signInForm.identitySubject };
    const payload = JSON.stringify({ userId: target.user.id, ...input });
    const id = signInRetry.current?.payload === payload ? signInRetry.current.id : crypto.randomUUID();
    signInRetry.current = { payload, id };
    try {
      const saved = await readJson<IdentityChangeResult>('/api/admin/users/' + encodeURIComponent(target.user.id) + '/identity', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, clientRequestId: id }),
      });
      applyChange(saved); signInRetry.current = null; setManaged(null);
      const result = `Reviewed sign-in change saved. ${saved.user.name} ${saved.user.identityIssuer ? 'is now linked to the school sign-in identity' : 'no longer has a school sign-in link'}. Their open sessions were ended.`;
      setMessage(result);
      try { applyInventory(await inventory()); }
      catch { setMessage(result + ' Reload accounts to refresh the list and recent reviews.'); }
    } catch (caught) { failure(caught, 'The sign-in change could not be confirmed. Keep this page open and retry the same review.'); }
    finally { busy.current = false; setSaving(false); }
  }
  const needle = search.trim().toLowerCase();
  const visibleUsers = users.filter(user => (roleFilter === 'all' || user.role === roleFilter)
    && (statusFilter === 'all' || (statusFilter === 'disabled') === Boolean(user.disabledAt))
    && (!needle || user.name.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle)));
  const nameOf = (id: string, fallback: string) => users.find(user => user.id === id)?.name ?? fallback;
  const history: HistoryItem[] = [
    ...events.map(event => ({ id: event.id, at: event.reviewedAt, userId: event.userId, actorId: event.actorId, reason: event.reason, version: event.resultingVersion,
      title: event.action === 'provision' ? 'Provisioned' : event.action === 'enable' ? 'Enabled' : 'Disabled' })),
    ...changes.map(change => ({ id: change.id, at: change.reviewedAt, userId: change.userId, actorId: change.actorId, reason: change.reason, version: change.resultingVersion,
      title: change.action === 'change_role' ? `Role changed from ${ROLE_LABEL[change.previousRole].toLowerCase()} to ${ROLE_LABEL[change.nextRole].toLowerCase()}`
        : change.action === 'link_identity' ? 'School sign-in linked' : 'School sign-in link removed' })),
  ].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)).slice(0, 200);

  return <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
    <a href="/" className="underline">← Dashboard</a>
    <h1 className="text-2xl font-bold">Reviewed account administration</h1>
    <p>Provision accounts after checking the person, school role and exact identity supplied by your trusted sign-in provider. The provider is configured separately.</p>
    <p className="text-sm text-muted-foreground">Open Manage account to change a role or link or remove a school sign-in identity, each as a reviewed, recorded change. School stays fixed. Link or unlink student and guardian profiles through <a href="/admin/profile-links" className="underline">reviewed profile links</a>.</p>
    <div role="status" aria-live="polite" aria-atomic="true">{loading ? 'Loading accounts and recent reviews…' : message}</div>
    {error && <p role="alert" className="rounded border border-destructive p-3">{error}</p>}
    <Button type="button" variant="outline" disabled={saving || loading} onClick={() => { void reload(); }}>Reload accounts</Button>
    {principal?.role === 'admin' && <>
      <section aria-labelledby="account-list-title" className="space-y-3" aria-busy={loading}>
        <h2 id="account-list-title" className="text-xl font-semibold">School accounts</h2>
        <p className="text-sm text-muted-foreground">Showing up to 500 accounts in your school, ordered by name. This list is not a whole-school total.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block space-y-1"><span>Search accounts by name or email</span><input className={inputStyle} type="search" maxLength={120} autoComplete="off" value={search} onChange={event => setSearch(event.target.value)} /></label>
          <label className="block space-y-1"><span>Filter by role</span><select className={inputStyle} value={roleFilter} onChange={event => setRoleFilter(event.target.value)}>
            <option value="all">All roles</option><option value="admin">School administrators</option><option value="teacher">Teachers</option><option value="guardian">Guardians</option><option value="student">Students</option>
          </select></label>
          <label className="block space-y-1"><span>Filter by status</span><select className={inputStyle} value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
            <option value="all">Enabled and disabled</option><option value="enabled">Enabled only</option><option value="disabled">Disabled only</option>
          </select></label>
        </div>
        {!loading && users.length > 0 && <p className="text-sm text-muted-foreground">Showing {visibleUsers.length} of {users.length} loaded accounts.</p>}
        {!loading && users.length === 0 && <p>No accounts are available to display.</p>}
        {!loading && users.length > 0 && visibleUsers.length === 0 && <p>No loaded account matches this search and filter.</p>}
        <ul className="grid gap-3 md:grid-cols-2">{visibleUsers.map(user => <li key={user.id} className="min-w-0 space-y-2 rounded border p-4">
          <h3 className="break-words font-semibold">{user.name}{user.id === principal.id ? ' (you)' : ''}</h3>
          <p className="break-all">{user.email}</p>
          <p>{user.role} · {user.disabledAt ? 'Disabled' : 'Enabled'} · Version {user.version}</p>
          <dl className="space-y-1 text-sm"><div><dt className="font-medium">Identity issuer</dt><dd className="break-all">{issuerLabel(user.identityIssuer)}</dd></div>
            <div><dt className="font-medium">Identity subject</dt><dd className="break-all">{user.identitySubject ?? 'Not mapped'}</dd></div></dl>
          {(!user.identityIssuer || !user.identitySubject) && <p className="text-sm text-muted-foreground">This account has no complete sign-in mapping, so it cannot sign in yet. Open Manage account to link the exact provider identity.</p>}
          <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={saving || loading} aria-label={`Manage account for ${user.name}`} onClick={() => { void openManage(user); }}>Manage account</Button>
          {user.id === principal.id && !user.disabledAt ? <p className="text-sm text-muted-foreground">Your own administrator access is protected.</p> :
            <Button type="button" variant="outline" disabled={saving || loading} aria-label={`${user.disabledAt ? 'Enable' : 'Disable'} access for ${user.name}`} onClick={() => {
              setManaged(null); setReview({ user, enabled: Boolean(user.disabledAt), reason: '', reviewConfirmed: false }); setError(''); setMessage('Review the selected account and explain the access change below.');
            }}>{user.disabledAt ? 'Enable access' : 'Disable access'}</Button>}
          </div>
        </li>)}</ul>
      </section>
      {managed && <section aria-labelledby="manage-title" className="space-y-5 rounded border p-4">
        <h2 id="manage-title" ref={manageHeading} tabIndex={-1} className="text-xl font-semibold">Manage account</h2>
        <p className="break-words">{managed.user.name} · {ROLE_LABEL[managed.user.role]} · {managed.user.disabledAt ? 'Disabled' : 'Enabled'} · Account version {managed.user.version}</p>
        {managed.demoRuntime && <p className="rounded border bg-amber-50 p-3 text-sm text-amber-950" data-synthetic="true"><strong>Synthetic demo.</strong> Only the synthetic demo sign-in identity is accepted here, and sign-in links cannot be removed. These accounts and records are fictional.</p>}
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="font-medium">Linked profile</dt><dd>{managed.profile ? `${managed.profile.kind === 'student' ? 'Student' : 'Guardian'}: ${managed.profile.name}` : 'None'}</dd></div>
          <div><dt className="font-medium">Classes taught</dt><dd>{managed.classCount}</dd></div>
          <div><dt className="font-medium">School sign-in</dt><dd className="break-all">{managed.user.identityIssuer && managed.user.identitySubject ? issuerLabel(managed.user.identityIssuer) : 'Not linked'}</dd></div>
        </dl>
        {managed.user.id === principal.id && <p className="text-sm">This is your own account. Your role and sign-in link can only be changed by another school administrator.</p>}
        {managed.lastEnabledAdministrator && managed.user.id !== principal.id && <p className="text-sm">This is the only enabled administrator who can sign in, so it cannot be demoted, disabled or unlinked.</p>}
        <form onSubmit={submitRole} className="space-y-4 rounded border p-4" aria-labelledby="role-change-title">
          <h3 id="role-change-title" className="font-semibold">Change role</h3>
          <p className="text-sm text-muted-foreground">Changing a role ends this account’s open sessions. A teacher with classes, or a student or guardian with a linked profile, must be moved first.</p>
          <fieldset disabled={saving || loading || managed.user.id === principal.id} className="space-y-4">
            <label className="block space-y-1"><span>New role for this account</span><select className={inputStyle} value={roleForm.role} onChange={event => setRoleForm(previous => ({ ...previous, reviewConfirmed: false, role: event.target.value as Role }))}>
              <option value="teacher">Teacher</option><option value="student">Student</option><option value="guardian">Guardian</option><option value="admin">School administrator</option>
            </select></label>
            <label className="block space-y-1"><span>Reason for the role change</span><textarea className={inputStyle} rows={3} required minLength={10} maxLength={500} value={roleForm.reason} onChange={event => setRoleForm(previous => ({ ...previous, reviewConfirmed: false, reason: event.target.value }))} /></label>
            <label className="flex items-start gap-2"><input type="checkbox" required checked={roleForm.reviewConfirmed} onChange={event => setRoleForm(previous => ({ ...previous, reviewConfirmed: event.target.checked }))} />
              <span>I reviewed this account and confirm this role change.</span></label>
            <Button type="submit" disabled={!roleForm.reviewConfirmed || roleForm.role === managed.user.role}>{saving ? 'Saving review…' : 'Change role'}</Button>
          </fieldset>
        </form>
        <form onSubmit={submitSignIn} className="space-y-4 rounded border p-4" aria-labelledby="sign-in-change-title">
          <h3 id="sign-in-change-title" className="font-semibold">{managed.user.identityIssuer && managed.user.identitySubject ? 'Remove school sign-in link' : 'Link school sign-in'}</h3>
          {managed.user.identityIssuer && managed.user.identitySubject ? <>
            <p className="text-sm text-muted-foreground">Removing the link ends this account’s open sessions and stops school sign-in for it until a new link is reviewed. The account and its records are kept.</p>
            {(managed.demoRuntime || managed.fixedDemoAccount) && <p className="text-sm">Synthetic demo accounts keep their sign-in link, so removal is unavailable here.</p>}
          </> : <>
            <p className="text-sm text-muted-foreground">Enter the exact issuer and subject supplied by the trusted provider. An email match never links an identity.{managed.demoRuntime ? ' On this synthetic installation only the synthetic demo sign-in provider is accepted.' : ''}</p>
          </>}
          <fieldset disabled={saving || loading || managed.user.id === principal.id || (Boolean(managed.user.identityIssuer && managed.user.identitySubject) && (managed.demoRuntime || managed.fixedDemoAccount))} className="space-y-4">
            {!(managed.user.identityIssuer && managed.user.identitySubject) && <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1"><span>Provider issuer to link</span><input className={inputStyle} type="url" pattern="https://.*" required maxLength={2048} autoComplete="off" value={signInForm.identityIssuer} onChange={event => setSignInForm(previous => ({ ...previous, reviewConfirmed: false, identityIssuer: event.target.value }))} /></label>
              <label className="block space-y-1"><span>Provider subject to link</span><input className={inputStyle} required maxLength={255} autoComplete="off" value={signInForm.identitySubject} onChange={event => setSignInForm(previous => ({ ...previous, reviewConfirmed: false, identitySubject: event.target.value }))} /></label>
            </div>}
            <label className="block space-y-1"><span>Reason for the sign-in change</span><textarea className={inputStyle} rows={3} required minLength={10} maxLength={500} value={signInForm.reason} onChange={event => setSignInForm(previous => ({ ...previous, reviewConfirmed: false, reason: event.target.value }))} /></label>
            <label className="flex items-start gap-2"><input type="checkbox" required checked={signInForm.reviewConfirmed} onChange={event => setSignInForm(previous => ({ ...previous, reviewConfirmed: event.target.checked }))} />
              <span>I reviewed this account and confirm this sign-in change.</span></label>
            <Button type="submit" variant={managed.user.identityIssuer ? 'destructive' : 'default'} disabled={!signInForm.reviewConfirmed}>{saving ? 'Saving review…' : managed.user.identityIssuer && managed.user.identitySubject ? 'Remove sign-in link' : 'Link sign-in identity'}</Button>
          </fieldset>
        </form>
        <Button type="button" variant="outline" onClick={() => setManaged(null)}>Close account panel</Button>
      </section>}
      {review && <section aria-labelledby="access-review-title" className="space-y-4 rounded border p-4">
        <h2 id="access-review-title" ref={reviewHeading} tabIndex={-1} className="text-xl font-semibold">Review {review.enabled ? 'enablement' : 'disablement'}</h2>
        <p className="break-words">{review.user.name} · {review.user.role} · Account version {review.user.version}</p>
        <p>{review.enabled ? 'An enabled account can sign in only with its mapped identity and a configured provider. Previously revoked sessions stay revoked.' : 'Disabling access revokes all current sessions. The account and its linked records are preserved.'}</p>
        <form onSubmit={changeStatus} className="space-y-4">
          <fieldset disabled={saving || loading} className="space-y-4">
            <label className="block space-y-1"><span>Reason for this access change</span>
              <textarea className={inputStyle} rows={3} required minLength={10} maxLength={500} value={review.reason} onChange={event => setReview(previous => previous ? { ...previous, reviewConfirmed: false, reason: event.target.value } : null)} />
            </label>
            <p className="text-sm text-muted-foreground">Use 10–500 characters on one line. Record the decision without passwords, access codes or unnecessary personal details.</p>
            <label className="flex items-start gap-2"><input type="checkbox" required checked={review.reviewConfirmed} onChange={event => setReview(previous => previous ? { ...previous, reviewConfirmed: event.target.checked } : null)} />
              <span>I reviewed this account and confirm this {review.enabled ? 'enable' : 'disable'} decision.</span></label>
            <div className="flex flex-wrap gap-3"><Button type="submit" variant={review.enabled ? 'default' : 'destructive'} disabled={!review.reviewConfirmed}>{saving ? 'Saving review…' : review.enabled ? 'Enable reviewed account' : 'Disable reviewed account'}</Button>
              <Button type="button" variant="outline" onClick={() => setReview(null)}>Close review</Button></div>
          </fieldset>
        </form>
      </section>}
      <section aria-labelledby="provision-title" className="space-y-4 rounded border p-4">
        <h2 id="provision-title" className="text-xl font-semibold">Provision a reviewed account</h2>
        <p>Enter a new person’s exact provider issuer and subject. An email match does not link identities. This form does not create a student or guardian profile.</p>
        <form onSubmit={provision} className="space-y-4" aria-labelledby="provision-title">
          <fieldset disabled={saving || loading} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1"><span>Name</span><input className={inputStyle} required maxLength={120} autoComplete="off" value={form.name} onChange={event => setForm(previous => ({ ...previous, reviewConfirmed: false, name: event.target.value }))} /></label>
              <label className="block space-y-1"><span>Email</span><input className={inputStyle} type="email" required maxLength={254} autoComplete="off" value={form.email} onChange={event => setForm(previous => ({ ...previous, reviewConfirmed: false, email: event.target.value }))} /></label>
              <label className="block space-y-1"><span>School role</span><select className={inputStyle} value={form.role} onChange={event => setForm(previous => ({ ...previous, reviewConfirmed: false, role: event.target.value as Role }))}>
                <option value="teacher">Teacher</option><option value="student">Student</option><option value="guardian">Guardian</option><option value="admin">School administrator</option>
              </select></label>
              <label className="block space-y-1"><span>Exact trusted identity issuer</span><input className={inputStyle} type="url" pattern="https://.*" required maxLength={2048} autoComplete="off" placeholder="https://your-provider.example/issuer" value={form.identityIssuer} onChange={event => setForm(previous => ({ ...previous, reviewConfirmed: false, identityIssuer: event.target.value }))} /></label>
            </div>
            <label className="block space-y-1"><span>Exact provider identity subject</span><input className={inputStyle} required maxLength={255} autoComplete="off" value={form.identitySubject} onChange={event => setForm(previous => ({ ...previous, reviewConfirmed: false, identitySubject: event.target.value }))} /></label>
            <label className="block space-y-1"><span>Reason and review reference</span><textarea className={inputStyle} rows={3} required minLength={10} maxLength={500} value={form.reason} onChange={event => setForm(previous => ({ ...previous, reviewConfirmed: false, reason: event.target.value }))} /></label>
            <p className="text-sm text-muted-foreground">Use 10–500 characters on one line. Record the review without passwords, access codes or unnecessary personal details.</p>
            <label className="flex items-start gap-2"><input type="checkbox" required checked={form.reviewConfirmed} onChange={event => setForm(previous => ({ ...previous, reviewConfirmed: event.target.checked }))} />
              <span>I checked this person’s school role and exact identity with the trusted provider and confirm provisioning.</span></label>
            <Button type="submit" disabled={!form.reviewConfirmed}>{saving ? 'Saving review…' : 'Provision reviewed account'}</Button>
          </fieldset>
        </form>
      </section>
      <section aria-labelledby="administration-history-title" className="space-y-3">
        <h2 id="administration-history-title" className="text-xl font-semibold">Recent administration reviews</h2>
        <p className="text-sm text-muted-foreground">Up to 200 latest reviews in this school. This is a recent activity list, not the complete audit archive.</p>
        {!loading && history.length === 0 && <p>No administration reviews are available to display.</p>}
        <ol className="space-y-3">{history.map(item => <li key={item.id} className="min-w-0 space-y-1 rounded border p-3">
          <p className="break-words font-medium">{item.title} · {nameOf(item.userId, 'School account')} · Version {item.version}</p>
          <p className="break-words">{item.reason}</p>
          <p className="break-words text-sm text-muted-foreground">Reviewed by {nameOf(item.actorId, 'a school administrator')} · {timestamp(item.at)}</p>
        </li>)}</ol>
      </section>
    </>}
  </div>;
}
