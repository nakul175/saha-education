'use client';

import * as React from 'react';
import { RecordsFrame, Field, Notice, selectClass, usePrincipal } from '@/components/records/bits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, failureText, isStale, requestId, shortDate } from '@/lib/education/records-client';
import type { SchoolSetupView, SchoolTermView } from '@/lib/education/school-setup';
import type { Principal } from '@/lib/education/types';

type Draft = { name: string; address: string; academicYear: string; contactEmail: string; contactPhone: string; currentTermId: string };
type TermDraft = { academicYear: string; name: string; startsOn: string; endsOn: string };
const labels: Record<string, string> = { name: 'school name', address: 'address', academicYear: 'academic year', contactEmail: 'contact email', contactPhone: 'contact phone', currentTermId: 'current term',
  startsOn: 'start date', endsOn: 'end date', expectedVersion: 'record version', expectedUpdatedAt: 'record version' };
const draftOf = (view: SchoolSetupView): Draft => ({ name: view.school.name, address: view.school.address ?? '', academicYear: view.settings.academicYear ?? '', contactEmail: view.settings.contactEmail ?? '',
  contactPhone: view.settings.contactPhone ?? '', currentTermId: view.settings.currentTermId ?? '' });
const fieldNames: Record<keyof Draft, string> = { name: 'School name', address: 'Address', academicYear: 'Academic year', contactEmail: 'Contact email', contactPhone: 'Contact phone', currentTermId: 'Current term' };

function SetupEditor({ principal }: { principal: Principal }) {
  const schoolId = principal.schoolId ?? '';
  const isAdmin = principal.role === 'admin';
  const [view, setView] = React.useState<SchoolSetupView | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<{ kind: 'error' | 'success' | 'warning' | 'info'; text: string } | null>(null);
  const [conflict, setConflict] = React.useState(false);

  const load = React.useCallback(async (keepDraft: boolean) => {
    setLoading(true); setLoadError('');
    const result = await api<SchoolSetupView>('GET', `/api/schools/${encodeURIComponent(schoolId)}/setup`);
    setLoading(false);
    if (!result.ok || !result.data) { setLoadError(failureText(result)); return null; }
    setView(result.data);
    if (!keepDraft) setDraft(draftOf(result.data));
    return result.data;
  }, [schoolId]);
  React.useEffect(() => {
    if (!schoolId) return;
    let live = true;
    api<SchoolSetupView>('GET', `/api/schools/${encodeURIComponent(schoolId)}/setup`).then(result => {
      if (!live) return;
      setLoading(false);
      if (!result.ok || !result.data) { setLoadError(failureText(result)); return; }
      setView(result.data); setDraft(draftOf(result.data));
    });
    return () => { live = false; };
  }, [schoolId]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!view || !draft || saving) return;
    setSaving(true); setMessage(null);
    const result = await api<SchoolSetupView>('PATCH', `/api/schools/${encodeURIComponent(schoolId)}/setup`, {
      name: draft.name, address: draft.address, academicYear: draft.academicYear, contactEmail: draft.contactEmail, contactPhone: draft.contactPhone,
      currentTermId: draft.currentTermId || null, expectedVersion: view.settings.version, expectedUpdatedAt: view.school.updatedAt,
    });
    setSaving(false);
    if (result.ok && result.data) { setView(result.data); setDraft(draftOf(result.data)); setConflict(false); setMessage({ kind: 'success', text: 'School details saved.' }); return; }
    if (isStale(result)) setConflict(true);
    setMessage({ kind: 'error', text: failureText(result, labels) });
  }
  async function keepMine() {
    const before = view;
    const latest = await load(true);
    if (!latest || !before) return;
    // Fields you did not touch take the latest saved value; fields you changed keep your edit.
    const was = draftOf(before), now = draftOf(latest), keys = Object.keys(fieldNames) as (keyof Draft)[];
    const mine = (key: keyof Draft) => draft !== null && draft[key] !== was[key];
    const changed = keys.filter(key => now[key] !== was[key]).map(key => `${fieldNames[key]} is now saved as "${now[key] || 'empty'}"${mine(key) ? ' (your edit is kept)' : ''}`);
    setDraft(Object.fromEntries(keys.map(key => [key, mine(key) ? draft![key] : now[key]])) as Draft);
    setConflict(false);
    setMessage({ kind: 'warning', text: 'The latest saved details are loaded and your edits are kept. ' + (changed.length ? 'Changed by someone else: ' + changed.join('; ') + '. ' : '') + 'Review, then save again.' });
  }
  // Term changes refresh only the term list; the school details draft and its version tokens are left alone.
  const reloadTerms = React.useCallback(async () => {
    const result = await api<SchoolSetupView>('GET', `/api/schools/${encodeURIComponent(schoolId)}/setup`);
    const latest = result.data;
    if (result.ok && latest) setView(current => current ? { ...current, terms: latest.terms } : latest);
  }, [schoolId]);
  async function discard() { setConflict(false); setMessage(null); await load(false); }

  if (!schoolId) return <Notice kind="error">Your account is not attached to a school.</Notice>;
  if (loading && !view) return <p role="status">Loading school details…</p>;
  if (loadError && !view) return <div className="space-y-2"><Notice kind="error">{loadError}</Notice><Button variant="outline" onClick={() => void load(false)}>Try again</Button></div>;
  if (!view || !draft) return null;
  const set = (key: keyof Draft) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft({ ...draft, [key]: event.target.value });
  const currentTerm = view.terms.find(term => term.id === view.settings.currentTermId);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-lg">School details</CardTitle></CardHeader>
        <CardContent>
          {!isAdmin && (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="font-medium">School name</dt><dd>{view.school.name}</dd></div>
              <div><dt className="font-medium">Address</dt><dd>{view.school.address || 'Not set'}</dd></div>
              <div><dt className="font-medium">Academic year</dt><dd>{view.settings.academicYear || 'Not set'}</dd></div>
              <div><dt className="font-medium">Current term</dt><dd>{currentTerm ? `${currentTerm.name} (${currentTerm.academicYear})` : 'Not set'}</dd></div>
              <div><dt className="font-medium">Contact email</dt><dd className="break-words">{view.settings.contactEmail || 'Not set'}</dd></div>
              <div><dt className="font-medium">Contact phone</dt><dd>{view.settings.contactPhone || 'Not set'}</dd></div>
            </dl>
          )}
          {isAdmin && (
            <form onSubmit={save} className="space-y-4" aria-label="School details form" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="school-name" label="School name"><Input id="school-name" value={draft.name} onChange={set('name')} maxLength={120} required autoComplete="off" /></Field>
                <Field id="school-address" label="Address" hint="Optional."><Input id="school-address" value={draft.address} onChange={set('address')} maxLength={300} autoComplete="off" /></Field>
                <Field id="school-year" label="Academic year" hint="A short label such as 2026-27."><Input id="school-year" value={draft.academicYear} onChange={set('academicYear')} maxLength={20} autoComplete="off" /></Field>
                <Field id="school-current-term" label="Current term">
                  <select id="school-current-term" className={selectClass} value={draft.currentTermId} onChange={set('currentTermId')}>
                    <option value="">No current term</option>
                    {view.terms.map(term => <option key={term.id} value={term.id}>{term.name} ({term.academicYear})</option>)}
                  </select>
                </Field>
                <Field id="school-email" label="Contact email" hint="Optional."><Input id="school-email" type="email" value={draft.contactEmail} onChange={set('contactEmail')} maxLength={254} autoComplete="off" /></Field>
                <Field id="school-phone" label="Contact phone" hint="Optional."><Input id="school-phone" type="tel" value={draft.contactPhone} onChange={set('contactPhone')} maxLength={30} autoComplete="off" /></Field>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save school details'}</Button>
                <span className="text-xs text-muted-foreground">Last saved {shortDate(view.settings.updatedAt ?? view.school.updatedAt)}.</span>
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
      <TermsSection view={view} isAdmin={isAdmin} schoolId={schoolId} reload={reloadTerms} defaultYear={view.settings.academicYear ?? ''} />
    </div>
  );
}

function TermsSection({ view, isAdmin, schoolId, reload, defaultYear }: { view: SchoolSetupView; isAdmin: boolean; schoolId: string; reload: () => Promise<unknown>; defaultYear: string }) {
  const [adding, setAdding] = React.useState<TermDraft>({ academicYear: defaultYear, name: '', startsOn: '', endsOn: '' });
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ kind: 'error' | 'success' | 'warning'; text: string } | null>(null);
  const pending = React.useRef<{ key: string; id: string } | null>(null);
  const [editing, setEditing] = React.useState<string | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setNotice(null);
    const key = JSON.stringify(adding);
    if (pending.current?.key !== key) pending.current = { key, id: requestId() };
    const result = await api<{ term: SchoolTermView; replayed: boolean }>('POST', `/api/schools/${encodeURIComponent(schoolId)}/terms`, { clientRequestId: pending.current.id, ...adding });
    setBusy(false);
    if (result.ok) { pending.current = null; setAdding({ ...adding, name: '', startsOn: '', endsOn: '' }); setNotice({ kind: 'success', text: 'Term added.' }); await reload(); return; }
    if (!result.unreachable) pending.current = null;
    setNotice({ kind: 'error', text: failureText(result, labels) });
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Terms</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {view.terms.length === 0 ? <p className="text-sm text-muted-foreground">No terms have been added yet.</p> : (
          <ul className="divide-y rounded-md border" aria-label="Terms">
            {view.terms.map(term => (
              <li key={term.id} className="space-y-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{term.name} <span className="font-normal text-muted-foreground">({term.academicYear})</span>{term.id === view.settings.currentTermId && <span className="ml-2 rounded-full border border-green-600/40 bg-green-50 px-2 py-0.5 text-xs text-green-900">Current</span>}</p>
                    <p className="text-sm text-muted-foreground">{shortDate(term.startsOn)} to {shortDate(term.endsOn)}</p>
                  </div>
                  {isAdmin && <Button type="button" variant="outline" size="sm" aria-expanded={editing === term.id} onClick={() => setEditing(editing === term.id ? null : term.id)}>{editing === term.id ? 'Close' : `Edit ${term.name}`}</Button>}
                </div>
                {isAdmin && editing === term.id && <TermEditor term={term} schoolId={schoolId} done={async text => { setEditing(null); setNotice({ kind: 'success', text }); await reload(); }} reload={reload} />}
              </li>
            ))}
          </ul>
        )}
        {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
        {isAdmin && (
          <form onSubmit={add} className="space-y-3 rounded-md border p-3" aria-label="Add a term" noValidate>
            <h3 className="font-medium">Add a term</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="term-year" label="Academic year"><Input id="term-year" value={adding.academicYear} onChange={event => setAdding({ ...adding, academicYear: event.target.value })} maxLength={20} required autoComplete="off" /></Field>
              <Field id="term-name" label="Term name"><Input id="term-name" value={adding.name} onChange={event => setAdding({ ...adding, name: event.target.value })} maxLength={60} required autoComplete="off" /></Field>
              <Field id="term-start" label="Starts on"><Input id="term-start" type="date" value={adding.startsOn} onChange={event => setAdding({ ...adding, startsOn: event.target.value })} required /></Field>
              <Field id="term-end" label="Ends on"><Input id="term-end" type="date" value={adding.endsOn} onChange={event => setAdding({ ...adding, endsOn: event.target.value })} required /></Field>
            </div>
            <Button type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add term'}</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function TermEditor({ term, schoolId, done, reload }: { term: SchoolTermView; schoolId: string; done: (text: string) => Promise<void>; reload: () => Promise<unknown> }) {
  const [draft, setDraft] = React.useState<TermDraft>({ academicYear: term.academicYear, name: term.name, startsOn: term.startsOn, endsOn: term.endsOn });
  const [version, setVersion] = React.useState(term.version);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ kind: 'error' | 'warning'; text: string } | null>(null);
  const [stale, setStale] = React.useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setNotice(null);
    const result = await api<{ term: SchoolTermView }>('PATCH', `/api/schools/${encodeURIComponent(schoolId)}/terms/${encodeURIComponent(term.id)}`, { ...draft, expectedVersion: version });
    setBusy(false);
    if (result.ok) { await done(`${draft.name} saved.`); return; }
    if (isStale(result)) setStale(true);
    setNotice({ kind: 'error', text: failureText(result, labels) });
  }
  async function loadLatest() {
    const latest = await api<SchoolSetupView>('GET', `/api/schools/${encodeURIComponent(schoolId)}/setup`);
    const found = latest.data?.terms.find(item => item.id === term.id);
    if (!found) { setNotice({ kind: 'error', text: 'The latest version of this term could not be loaded. Reload the page.' }); return; }
    setVersion(found.version); setStale(false);
    setNotice({ kind: 'warning', text: `Latest saved term: ${found.name}, ${shortDate(found.startsOn)} to ${shortDate(found.endsOn)}. Your edits are kept; review them and save again.` });
    await reload();
  }
  const id = 'term-edit-' + term.id;
  return (
    <form onSubmit={save} className="space-y-3 rounded-md bg-muted/40 p-3" aria-label={`Edit ${term.name}`} noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={id + '-year'} label="Academic year"><Input id={id + '-year'} value={draft.academicYear} onChange={event => setDraft({ ...draft, academicYear: event.target.value })} maxLength={20} required autoComplete="off" /></Field>
        <Field id={id + '-name'} label="Term name"><Input id={id + '-name'} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} maxLength={60} required autoComplete="off" /></Field>
        <Field id={id + '-start'} label="Starts on"><Input id={id + '-start'} type="date" value={draft.startsOn} onChange={event => setDraft({ ...draft, startsOn: event.target.value })} required /></Field>
        <Field id={id + '-end'} label="Ends on"><Input id={id + '-end'} type="date" value={draft.endsOn} onChange={event => setDraft({ ...draft, endsOn: event.target.value })} required /></Field>
      </div>
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save term'}</Button>
        {stale && <Button type="button" variant="outline" onClick={() => void loadLatest()}>Load latest and keep my edits</Button>}
      </div>
    </form>
  );
}

export default function SchoolSetupPage() {
  const gate = usePrincipal();
  return (
    <RecordsFrame current="setup" title="School setup" intro="Basic school details, academic year and terms. Only administrators can change them." gate={gate}>
      {principal => <SetupEditor key={principal.id + ':' + principal.schoolId} principal={principal} />}
    </RecordsFrame>
  );
}
