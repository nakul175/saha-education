'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- Use full-page navigation while vinext beta Link transitions are unreliable. */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { AdminUser, IdentityAdminEvent, IdentityAdminResult } from '@/lib/education/identity-admin';
import type { Principal, Role } from '@/lib/education/types';

type ProvisionForm = { name: string; email: string; role: Role; identityIssuer: string; identitySubject: string; reason: string; reviewConfirmed: boolean };
type StatusReview = { user: AdminUser; enabled: boolean; reason: string; reviewConfirmed: boolean };
type PendingRequest = { payload: string; id: string };
const emptyProvision = (): ProvisionForm => ({ name: '', email: '', role: 'teacher', identityIssuer: '', identitySubject: '', reason: '', reviewConfirmed: false });
class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function readJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: 'no-store' });
  if (response.status === 401) {
    window.location.assign(new URL('/login', window.location.origin).href);
    throw new RequestError('Please sign in to continue.', 401);
  }
  if (response.status === 403) throw new RequestError('Administrator access is required. Your permission may have changed.', 403);
  if (response.status === 409) throw new RequestError('This account or request conflicts with saved information.', 409);
  if (response.status === 404) throw new RequestError('This account is no longer available in your school. Reload accounts.', 404);
  if (response.status === 400) throw new RequestError('Check the fields, exact provider identity, review confirmation and reason.', 400);
  if (!response.ok) throw new RequestError('The request could not be confirmed. Keep this page open and retry the same review.', response.status);
  return response.json() as Promise<T>;
}
async function inventory() {
  const [users, events] = await Promise.all([
    readJson<AdminUser[]>('/api/admin/users'), readJson<IdentityAdminEvent[]>('/api/admin/users/events'),
  ]);
  return { users, events };
}
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
    setUsers(value.users); setEvents(value.events);
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
        if (active) { setUsers(value.users); setEvents(value.events); }
      } catch (caught) {
        if (active) {
          if (caught instanceof RequestError && caught.status === 403) setPrincipal(null);
          setError(caught instanceof Error ? caught.message : 'Could not load account administration.');
        }
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);
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
      if (caught instanceof RequestError && caught.status === 409) setError('This identity, email or earlier request conflicts with saved information. Reload accounts and review existing mappings before trying again. Your form has been kept.');
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

  return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
    <a href="/" className="underline">← Dashboard</a>
    <h1 className="text-2xl font-bold">Reviewed account administration</h1>
    <p>Provision accounts after checking the person, school role and exact identity supplied by your trusted sign-in provider. The provider is configured separately.</p>
    <p className="text-sm text-muted-foreground">Role, provider identity and school remain fixed on this screen. Review explicit profile links through <a href="/students" className="underline">students</a> or <a href="/guardians" className="underline">guardians</a>.</p>
    <div role="status" aria-live="polite" aria-atomic="true">{loading ? 'Loading accounts and recent reviews…' : message}</div>
    {error && <p role="alert" className="rounded border border-destructive p-3">{error}</p>}
    <Button type="button" variant="outline" disabled={saving || loading} onClick={() => { void reload(); }}>Reload accounts</Button>
    {principal?.role === 'admin' && <>
      <section aria-labelledby="account-list-title" className="space-y-3" aria-busy={loading}>
        <h2 id="account-list-title" className="text-xl font-semibold">School accounts</h2>
        <p className="text-sm text-muted-foreground">Showing up to 500 accounts in your school, ordered by name. This list is not a whole-school total.</p>
        {!loading && users.length === 0 && <p>No accounts are available to display.</p>}
        <ul className="grid gap-3 md:grid-cols-2">{users.map(user => <li key={user.id} className="min-w-0 space-y-2 rounded border p-4">
          <h3 className="break-words font-semibold">{user.name}{user.id === principal.id ? ' (you)' : ''}</h3>
          <p className="break-all">{user.email}</p>
          <p>{user.role} · {user.disabledAt ? 'Disabled' : 'Enabled'} · Version {user.version}</p>
          <dl className="space-y-1 text-sm"><div><dt className="font-medium">Identity issuer</dt><dd className="break-all">{user.identityIssuer ?? 'Not mapped'}</dd></div>
            <div><dt className="font-medium">Identity subject</dt><dd className="break-all">{user.identitySubject ?? 'Not mapped'}</dd></div></dl>
          {(!user.identityIssuer || !user.identitySubject) && <p className="text-sm text-muted-foreground">This legacy account has no complete sign-in mapping. This screen preserves that mapping; an operator must review it separately.</p>}
          {user.id === principal.id && !user.disabledAt ? <p className="text-sm text-muted-foreground">Your own administrator access is protected.</p> :
            <Button type="button" variant="outline" disabled={saving || loading} aria-label={`${user.disabledAt ? 'Enable' : 'Disable'} access for ${user.name}`} onClick={() => {
              setReview({ user, enabled: Boolean(user.disabledAt), reason: '', reviewConfirmed: false }); setError(''); setMessage('Review the selected account and explain the access change below.');
            }}>{user.disabledAt ? 'Enable access' : 'Disable access'}</Button>}
        </li>)}</ul>
      </section>
      {review && <section aria-labelledby="access-review-title" className="space-y-4 rounded border p-4">
        <h2 id="access-review-title" ref={reviewHeading} tabIndex={-1} className="text-xl font-semibold">Review {review.enabled ? 'enablement' : 'disablement'}</h2>
        <p className="break-words">{review.user.name} · {review.user.role} · Account version {review.user.version}</p>
        <p>{review.enabled ? 'An enabled account can sign in only with its mapped identity and a configured provider. Previously revoked sessions stay revoked.' : 'Disabling access revokes all current sessions. The account and its linked records are preserved.'}</p>
        <form onSubmit={changeStatus} className="space-y-4">
          <fieldset disabled={saving || loading} className="space-y-4">
            <label className="block space-y-1"><span>Reason for this access change</span>
              <textarea className={inputStyle} rows={3} required minLength={10} maxLength={500} value={review.reason} onChange={event => setReview(previous => previous ? { ...previous, reviewConfirmed: false, reason: event.target.value } : null)} />
            </label>
            <p className="text-sm text-muted-foreground">Use 10–500 characters on one line. Record the decision without passwords, tokens or unnecessary personal details.</p>
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
        <form onSubmit={provision} className="space-y-4">
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
            <p className="text-sm text-muted-foreground">Use 10–500 characters on one line. Record the review without passwords, tokens or unnecessary personal details.</p>
            <label className="flex items-start gap-2"><input type="checkbox" required checked={form.reviewConfirmed} onChange={event => setForm(previous => ({ ...previous, reviewConfirmed: event.target.checked }))} />
              <span>I checked this person’s school role and exact identity with the trusted provider and confirm provisioning.</span></label>
            <Button type="submit" disabled={!form.reviewConfirmed}>{saving ? 'Saving review…' : 'Provision reviewed account'}</Button>
          </fieldset>
        </form>
      </section>
      <section aria-labelledby="administration-history-title" className="space-y-3">
        <h2 id="administration-history-title" className="text-xl font-semibold">Recent administration reviews</h2>
        <p className="text-sm text-muted-foreground">Up to 200 latest reviews in this school. This is a recent activity list, not the complete audit archive.</p>
        {!loading && events.length === 0 && <p>No administration reviews are available to display.</p>}
        <ol className="space-y-3">{events.map(event => <li key={event.id} className="min-w-0 space-y-1 rounded border p-3">
          <p className="break-words font-medium">{event.action === 'provision' ? 'Provisioned' : event.action === 'enable' ? 'Enabled' : 'Disabled'} · {users.find(user => user.id === event.userId)?.name ?? 'School account'} · Version {event.resultingVersion}</p>
          <p className="break-words">{event.reason}</p>
          <p className="break-words text-sm text-muted-foreground">Reviewed by {users.find(user => user.id === event.actorId)?.name ?? event.actorId} · {timestamp(event.reviewedAt)}</p>
        </li>)}</ol>
      </section>
    </>}
  </main>;
}
