'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { AccountSummary } from '@/lib/education/account';

const ROLE_LABEL = { admin: 'School administrator', teacher: 'Teacher', guardian: 'Guardian', student: 'Student' } as const;
const HOME = { admin: '/dashboard/admin', teacher: '/dashboard/teacher', guardian: '/dashboard/guardian', student: '/dashboard/student' } as const;

function when(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
}

export default function AccountPage() {
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch('/api/account', { cache: 'no-store' });
        if (response.status === 401) { await response.text(); window.location.assign(new URL('/login?reason=expired', window.location.origin).href); return; }
        if (!response.ok) { await response.text(); throw new Error('Your account details could not be loaded. Reload the page to try again.'); }
        const value = await response.json() as AccountSummary;
        if (active) setAccount(value);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Your account details could not be loaded.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);
  async function signOut() {
    if (inFlight.current) return;
    inFlight.current = true; setSigningOut(true); setError('');
    try {
      const response = await fetch('/api/session', { method: 'DELETE' });
      await response.text();
      if (!response.ok) throw new Error('Sign out could not be confirmed. Please try again.');
      window.location.assign(new URL('/login', window.location.origin).href);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign out could not be confirmed. Please try again.');
      setSigningOut(false); inFlight.current = false;
    }
  }
  const synthetic = account?.signInMethod === 'synthetic_demo';
  return <div aria-labelledby="account-title" className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
    <a href={account ? HOME[account.role] : '/'} className="underline">← Dashboard</a>
    <h1 id="account-title" className="text-2xl font-bold">Your account</h1>
    <div role="status" aria-live="polite" aria-atomic="true">{loading ? 'Loading your account…' : ''}</div>
    {error && <p role="alert" className="rounded border border-destructive p-3">{error}</p>}
    {account && <>
      {synthetic && <p className="rounded border bg-amber-50 p-3 text-sm text-amber-950" data-synthetic="true"><strong>Synthetic demo.</strong> This account and every record in it are fictional. Nothing here is a real person or school.</p>}
      <dl className="grid gap-4 rounded border p-4 sm:grid-cols-2">
        <div><dt className="text-sm text-muted-foreground">Name</dt><dd className="break-words font-medium">{account.name}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Email</dt><dd className="break-all font-medium">{account.email}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Role</dt><dd className="font-medium">{ROLE_LABEL[account.role]}</dd></div>
        <div><dt className="text-sm text-muted-foreground">School</dt><dd className="break-words font-medium">{account.schoolName}</dd></div>
        <div><dt className="text-sm text-muted-foreground">How you signed in</dt><dd className="font-medium">{synthetic ? 'Synthetic demo entry (no school provider)' : 'School sign-in'}</dd></div>
        <div><dt className="text-sm text-muted-foreground">This session ends</dt><dd className="font-medium">{when(account.sessionExpiresAt)}</dd></div>
      </dl>
      <p className="text-sm text-muted-foreground">Your role and school are set by your school administrator and checked by the server on every request. This page cannot change them.</p>
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="outline" onClick={() => { void signOut(); }} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign out'}</Button>
        {synthetic && <Button asChild variant="outline"><a href="/login">Switch demo role</a></Button>}
      </div>
    </>}
  </div>;
}
