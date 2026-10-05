'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- full-page links avoid the observed vinext beta transition failure. */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Principal, School } from '@/lib/education/types';

async function read<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: 'no-store' });
  if (response.status === 401) { window.location.assign(new URL('/login', window.location.origin).href); throw new Error('Please sign in again.'); }
  if (!response.ok) throw new Error(response.status === 403 ? 'Your account does not have permission for this view.' : 'School details could not be loaded. Reload and try again.');
  return response.json() as Promise<T>;
}

export default function SchoolsPage() {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [form, setForm] = useState({ name: '', address: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lock = useRef(false);
  const message = useRef<HTMLDivElement>(null);
  const busy = loading || saving;
  const isAdmin = principal?.role === 'admin';
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const account = await read<Principal>('/api/session');
        if (active) setPrincipal(account);
        const rows = await read<School[]>('/api/schools');
        const currentSchool = rows.find(row => row.id === account.schoolId);
        if (!currentSchool) throw new Error('Your current school could not be verified.');
        if (active) { setPrincipal(account); setSchool(currentSchool); setForm({ name: currentSchool.name, address: currentSchool.address ?? '' }); }
      } catch (failure) { if (active) setError(failure instanceof Error ? failure.message : 'School details could not be loaded.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);
  useEffect(() => { if (error || notice) message.current?.focus(); }, [error, notice]);
  async function reload() {
    if (lock.current || !principal) return;
    setLoading(true); setNeedsReload(true); setError(null);
    try {
      const rows = await read<School[]>('/api/schools');
      const currentSchool = rows.find(row => row.id === principal.schoolId);
      if (!currentSchool) throw new Error('Your current school could not be verified.');
      setSchool(currentSchool); setNeedsReload(false);
      setNotice('Saved school details reloaded. Compare the saved details with your retained entries before saving again.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'School details could not be reloaded.'); }
    finally { setLoading(false); }
  }
  async function update(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || busy || needsReload || !isAdmin || !school) return;
    lock.current = true; setSaving(true); setError(null); setNotice(null);
    try {
      const payload = { name: form.name, ...(form.address === '' && school.address == null ? {} : { address: form.address }) };
      const response = await fetch('/api/schools/' + encodeURIComponent(school.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) {
        if (response.status === 401) window.location.assign(new URL('/login', window.location.origin).href);
        setNeedsReload(response.status === 409 || response.status >= 500);
        setError(response.status >= 500 ? 'The school save could not be confirmed. Reload saved details before trying again. Your entries are retained.' : response.status === 409 ? 'School access changed. Reload saved details before trying again. Your entries are retained.' : 'School details were not saved. Check your entries and permissions, then try again.');
        return;
      }
      setNotice('School details saved.');
      try {
        const rows = await read<School[]>('/api/schools');
        const currentSchool = rows.find(row => row.id === principal!.schoolId);
        if (!currentSchool) throw new Error('School missing');
        setSchool(currentSchool);
      } catch { setNeedsReload(true); setNotice('School details saved, but the view could not be refreshed. Reload saved details before another update.'); }
    } catch { setNeedsReload(true); setError('The school save could not be confirmed. Reload saved details before trying again. Your entries are retained.'); }
    finally { lock.current = false; setSaving(false); }
  }
  return <div className="mx-auto max-w-5xl space-y-6 p-4">
    <div><a href="/" className="text-sm underline">Dashboard</a><h1>School</h1><p className="text-muted-foreground">Your existing school details.</p></div>
    {(error || notice) && <div ref={message} tabIndex={-1} role={error ? 'alert' : 'status'} className="rounded border p-3 break-words">{error || notice}</div>}
    {loading && <p role="status">Loading school details…</p>}
    <Button type="button" variant="outline" onClick={() => void reload()} disabled={busy || !principal}>Reload saved school details</Button>
    <div className="grid gap-6 md:grid-cols-2">
      <Card><CardHeader><CardTitle>Saved school details</CardTitle></CardHeader><CardContent className="space-y-3 break-words">
        {school ? <><p className="font-semibold">{school.name}</p><p>{school.address || 'No address supplied.'}</p></> : !loading && <p>No school details available.</p>}
      </CardContent></Card>
      {isAdmin && <Card><CardHeader><CardTitle>Edit school</CardTitle></CardHeader><CardContent>
        <form onSubmit={update} className="space-y-4"><fieldset disabled={busy || needsReload || !school} className="min-w-0 space-y-4">
          <div><Label htmlFor="school-name">School name</Label><Input id="school-name" value={form.name} required onChange={event => setForm(previous => ({ ...previous, name: event.target.value }))} /></div>
          <div><Label htmlFor="school-address">Address (optional)</Label><Input id="school-address" value={form.address} onChange={event => setForm(previous => ({ ...previous, address: event.target.value }))} /></div>
          <Button type="submit">{saving ? 'Saving…' : 'Save school details'}</Button>
        </fieldset></form>
      </CardContent></Card>}
    </div>
  </div>;
}
