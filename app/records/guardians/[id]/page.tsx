'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- native navigation avoids the observed vinext beta transition failure. */
import * as React from 'react';
import { RecordsFrame, Field, Notice, StatusBadge, usePrincipal } from '@/components/records/bits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, failureText, isStale, shortDate } from '@/lib/education/records-client';
import type { GuardianDetail } from '@/lib/education/guardian-records';
import type { Principal } from '@/lib/education/types';

type Draft = { name: string; phone: string; email: string; relationship: string };
type Msg = { kind: 'error' | 'success' | 'warning' | 'info'; text: string } | null;
const labels: Record<string, string> = { name: 'name', phone: 'phone number', email: 'email address', relationship: 'relationship', expectedUpdatedAt: 'record version' };
const draftOf = (detail: GuardianDetail): Draft => ({ name: detail.guardian.name, phone: detail.guardian.phone ?? '', email: detail.guardian.email ?? '', relationship: detail.guardian.relationship });
const url = (id: string) => `/api/records/guardians/${encodeURIComponent(id)}`;

function Profile({ principal, id }: { principal: Principal; id: string }) {
  const isAdmin = principal.role === 'admin';
  const [detail, setDetail] = React.useState<GuardianDetail | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [outcome, setOutcome] = React.useState<{ tick: number; error: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<Msg>(null);
  const [conflict, setConflict] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const loading = outcome?.tick !== tick;
  const error = outcome?.tick === tick ? outcome.error : '';

  const reload = React.useCallback(async (keepDraft: boolean) => {
    const result = await api<GuardianDetail>('GET', url(id));
    if (!result.ok || !result.data) return null;
    setDetail(result.data);
    if (!keepDraft) setDraft(draftOf(result.data));
    return result.data;
  }, [id]);
  React.useEffect(() => {
    let live = true;
    api<GuardianDetail>('GET', url(id)).then(result => {
      if (!live) return;
      if (!result.ok || !result.data) { setOutcome({ tick, error: failureText(result) }); return; }
      setDetail(result.data); setDraft(draftOf(result.data)); setOutcome({ tick, error: '' });
    });
    return () => { live = false; };
  }, [id, tick]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!detail || !draft || busy) return;
    setBusy(true); setMessage(null);
    const result = await api<GuardianDetail>('PATCH', url(id), { ...draft, expectedUpdatedAt: detail.guardian.updatedAt });
    setBusy(false);
    if (result.ok && result.data) { setDetail(result.data); setDraft(draftOf(result.data)); setConflict(false); setMessage({ kind: 'success', text: 'Guardian details saved.' }); return; }
    if (isStale(result)) setConflict(true);
    setMessage({ kind: 'error', text: failureText(result, labels) });
  }
  async function keepMine() {
    const before = detail ? draftOf(detail) : null;
    const latest = await reload(true);
    if (!latest || !before) { setMessage({ kind: 'error', text: 'The latest record could not be loaded. Reload the page.' }); return; }
    const now = draftOf(latest);
    const changed = (Object.keys(now) as (keyof Draft)[]).filter(key => now[key] !== before[key]).map(key => `${labels[key]} is now "${now[key] || 'empty'}"`);
    setConflict(false);
    setMessage({ kind: 'warning', text: 'The latest record is loaded and your edits are kept. ' + (changed.length ? 'Changed by someone else: ' + changed.join('; ') + '. ' : '') + 'Review, then save again.' });
  }
  async function discard() { setConflict(false); setMessage(null); await reload(false); }

  if (loading) return <p role="status">Loading the guardian record…</p>;
  if (error || !detail || !draft) return <div className="space-y-2"><Notice kind="error">{error || 'This guardian record could not be loaded.'}</Notice><div className="flex gap-2"><Button variant="outline" onClick={() => setTick(value => value + 1)}>Try again</Button><a className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent" href="/records/guardians">Back to guardians</a></div></div>;
  const set = (key: keyof Draft) => (event: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [key]: event.target.value });
  const guardian = detail.guardian;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-xl font-semibold">{guardian.name}</h3>
        <a className="text-sm font-medium underline underline-offset-4" href="/records/guardians">All guardians</a>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-lg">Guardian details</CardTitle></CardHeader>
        <CardContent>
          {!isAdmin ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="font-medium">Name</dt><dd>{guardian.name}</dd></div>
              <div><dt className="font-medium">Relationship</dt><dd>{guardian.relationship}</dd></div>
              <div><dt className="font-medium">Phone</dt><dd>{guardian.phone || 'Not set'}</dd></div>
              <div><dt className="font-medium">Email</dt><dd className="break-words">{guardian.email || 'Not set'}</dd></div>
            </dl>
          ) : (
            <form onSubmit={save} className="space-y-4" aria-label="Guardian details form" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="guardian-name" label="Name"><Input id="guardian-name" value={draft.name} onChange={set('name')} maxLength={120} required autoComplete="off" /></Field>
                <Field id="guardian-relationship" label="Usual relationship" hint="Used when a link does not name its own relationship."><Input id="guardian-relationship" value={draft.relationship} onChange={set('relationship')} maxLength={60} required autoComplete="off" /></Field>
                <Field id="guardian-phone" label="Phone" hint="Optional."><Input id="guardian-phone" type="tel" value={draft.phone} onChange={set('phone')} maxLength={30} autoComplete="off" /></Field>
                <Field id="guardian-email" label="Email" hint="Optional."><Input id="guardian-email" type="email" value={draft.email} onChange={set('email')} maxLength={254} autoComplete="off" /></Field>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save guardian details'}</Button>
                <span className="text-xs text-muted-foreground">Last saved {shortDate(guardian.updatedAt)}. {guardian.hasLogin ? 'This guardian has a sign-in.' : 'No sign-in is linked yet.'}</span>
              </div>
            </form>
          )}
          {message && <div className="mt-4"><Notice kind={message.kind}>{message.text}</Notice></div>}
          {conflict && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void keepMine()}>Load latest and keep my edits</Button>
              <Button type="button" variant="outline" onClick={() => void discard()}>Discard my edits</Button>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-lg">Linked children</CardTitle></CardHeader>
        <CardContent>
          {detail.children.length === 0 ? <p className="text-sm text-muted-foreground">No linked children are visible to your account.</p> : (
            <ul className="divide-y rounded-md border" aria-label="Linked children">
              {detail.children.map(child => (
                <li key={child.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="break-words font-medium">{child.firstName} {child.lastName}{child.isPrimary && <span className="ml-2 rounded-full border border-blue-600/40 bg-blue-50 px-2 py-0.5 text-xs text-blue-900">Primary contact</span>}</p>
                    <p className="text-sm text-muted-foreground">Grade {child.gradeLevel} · {child.relationship}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge active={child.status === 'active'} />
                    <a className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent" href={isAdmin ? `/records/students/${encodeURIComponent(child.id)}` : `/students/${encodeURIComponent(child.id)}`} aria-label={`Open ${child.firstName} ${child.lastName}`}>Open</a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function GuardianProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const gate = usePrincipal();
  return (
    <RecordsFrame current="guardians" title="Guardian record" intro="Contact details and linked children. Only administrators can change them." gate={gate}>
      {principal => <Profile key={principal.id + id} principal={principal} id={id} />}
    </RecordsFrame>
  );
}
