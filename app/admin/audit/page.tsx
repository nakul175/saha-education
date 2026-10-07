'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- Use full-page navigation while vinext beta Link transitions are unreliable. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AUDIT_SOURCES, type AuditSource } from '@/lib/education/audit-sources';
import { ApiFailure, apiJson, roleLabel, whenText } from '@/lib/education/notices-client';
import type { AuditEntry, AuditEntryDetail, AuditPage } from '@/lib/education/audit-trail';
import type { Principal } from '@/lib/education/types';

type Person = { id: string; name: string; role: string };
type Filters = { source: '' | AuditSource; actorId: string; from: string; to: string; q: string };
const emptyFilters: Filters = { source: '', actorId: '', from: '', to: '', q: '' };
const inputStyle = 'w-full rounded border bg-background p-2';
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const keyOf = (entry: Pick<AuditEntry, 'source' | 'sourceId'>) => entry.source + ':' + entry.sourceId;
const NOTE_MESSAGES = {
  400: 'Check the note (10–500 characters, plain text on one line) and the confirmation.',
  404: 'This audit entry is no longer available. Reload the audit trail.',
  409: 'An earlier note with the same reference was saved with different content. Reload the entry and review it before adding a note.',
};
function query(filters: Filters, cursor?: string | null) {
  const params = new URLSearchParams({ limit: '20' });
  if (filters.source) params.set('source', filters.source);
  if (filters.actorId) params.set('actorId', filters.actorId);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (cursor) params.set('cursor', cursor);
  return '/api/admin/audit?' + params;
}

export default function AuditTrailPage() {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [applied, setApplied] = useState<Filters>(emptyFilters);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<AuditEntryDetail | null>(null);
  const [detailState, setDetailState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const generation = useRef(0);
  const busy = useRef(false);
  const retry = useRef<{ payload: string; id: string } | null>(null);
  const status = useRef<HTMLDivElement>(null);

  const search = useCallback(async (filters: Filters) => {
    const ticket = ++generation.current;
    setLoading(true); setError(''); setMessage(''); setOpen(null); setDetail(null);
    try {
      const page = await apiJson<AuditPage>(query(filters), undefined, { 400: 'Check the dates: the start date must not be after the end date.' });
      if (ticket !== generation.current) return;
      setEntries(page.items); setNext(page.nextCursor); setApplied(filters);
    } catch (failure) {
      if (ticket !== generation.current) return;
      setEntries([]); setNext(null);
      setError(failure instanceof ApiFailure ? failure.message : 'The audit trail could not be loaded. Reload the page.');
    } finally { if (ticket === generation.current) setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const actor = await apiJson<Principal>('/api/session', undefined);
        if (!active) return;
        if (actor.role !== 'admin') { setError('The audit trail is available to school administrators.'); setLoading(false); return; }
        setPrincipal(actor);
        // The person filter is a convenience; a failure to load names must not hide the trail.
        void apiJson<Person[]>('/api/admin/users', undefined).then(rows => { if (active) setPeople(rows.map(row => ({ id: row.id, name: row.name, role: row.role })).sort((a, b) => a.name.localeCompare(b.name))); }).catch(() => undefined);
        await search(emptyFilters);
      } catch (failure) {
        if (active) { setError(failure instanceof ApiFailure ? failure.message : 'Could not load the audit trail. Reload the page.'); setLoading(false); }
      }
    })();
    return () => { active = false; };
  }, [search]);
  useEffect(() => { if (error || message) status.current?.focus(); }, [error, message]);

  async function older() {
    if (busy.current || !next) return;
    busy.current = true; setLoadingMore(true); setError('');
    try {
      const page = await apiJson<AuditPage>(query(applied, next), undefined);
      setEntries(previous => [...previous, ...page.items.filter(item => !previous.some(known => keyOf(known) === keyOf(item)))]);
      setNext(page.nextCursor);
    } catch (failure) { setError(failure instanceof ApiFailure ? failure.message : 'Older entries could not be loaded.'); }
    finally { busy.current = false; setLoadingMore(false); }
  }
  async function toggle(entry: AuditEntry) {
    const key = keyOf(entry);
    if (open === key) { setOpen(null); setDetail(null); return; }
    setOpen(key); setDetail(null); setDetailState('loading'); setNote(''); setConfirmed(false); setMessage(''); setError('');
    try {
      const value = await apiJson<AuditEntryDetail>(`/api/admin/audit/${encodeURIComponent(entry.source)}/${encodeURIComponent(entry.sourceId)}`, undefined, { 404: 'This entry is no longer available. Reload the audit trail.' });
      setDetail(value); setDetailState('idle');
    } catch (failure) {
      setDetailState('error');
      setError(failure instanceof ApiFailure ? failure.message : 'The details could not be loaded.');
    }
  }
  async function addNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !detail || !confirmed) return;
    busy.current = true; setSaving(true); setError(''); setMessage('');
    const input = { source: detail.source, sourceId: detail.sourceId, note: note.trim(), reviewConfirmed: true as const };
    const payload = JSON.stringify(input);
    const id = retry.current?.payload === payload ? retry.current.id : crypto.randomUUID();
    retry.current = { payload, id };
    try {
      const saved = await apiJson<{ note: unknown; entry: AuditEntryDetail; replayed: boolean }>('/api/admin/audit/annotations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, clientRequestId: id }),
      }, NOTE_MESSAGES);
      retry.current = null;
      setDetail(saved.entry); setNote(''); setConfirmed(false);
      setEntries(previous => previous.map(item => keyOf(item) === keyOf(saved.entry) ? { ...item, noteCount: saved.entry.noteCount } : item));
      setMessage(saved.replayed ? 'That note was already saved, so it was not added twice.' : 'Your correction note was added beside the entry. The original record is unchanged.');
    } catch (failure) {
      const known = failure instanceof ApiFailure ? failure : null;
      if (known?.status === 409) retry.current = null;
      setError(known ? known.message + (known.status === 0 || known.status >= 500 ? ' Your note is kept. Pressing Add again will not add it twice.' : '') : 'The note could not be confirmed. Keep this page open and press Add again.');
    } finally { busy.current = false; setSaving(false); }
  }

  const filtered = applied.source !== '' || applied.actorId !== '' || applied.from !== '' || applied.to !== '' || applied.q !== '';
  return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
    <a href="/" className="underline">← Dashboard</a>
    <h1 className="text-2xl font-bold">Audit trail</h1>
    <p>A read-only record of who changed what in your school, and when. Entries cannot be edited or deleted. If something needs explaining, add a correction note beside the entry; the original stays as it was.</p>
    <div ref={status} tabIndex={-1} role={error ? 'alert' : 'status'} aria-live="polite" aria-atomic="true" className={error || message ? 'rounded border p-3 break-words' : undefined}>{loading ? 'Loading the audit trail…' : error || message}</div>
    {principal && <>
      <form className="space-y-4 rounded border p-4" aria-label="Filter the audit trail" onSubmit={event => { event.preventDefault(); void search(draft); }}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block space-y-1"><span>Area</span>
            <select className={inputStyle} aria-label="Area" value={draft.source} onChange={event => setDraft(previous => ({ ...previous, source: event.target.value as Filters['source'] }))}>
              <option value="">All areas</option>
              {(Object.keys(AUDIT_SOURCES) as AuditSource[]).map(key => <option key={key} value={key}>{AUDIT_SOURCES[key]}</option>)}
            </select></label>
          <label className="block space-y-1"><span>Done by</span>
            <select className={inputStyle} aria-label="Done by" value={draft.actorId} onChange={event => setDraft(previous => ({ ...previous, actorId: event.target.value }))}>
              <option value="">Anyone</option>
              {people.map(person => <option key={person.id} value={person.id}>{person.name} ({roleLabel(person.role)})</option>)}
            </select></label>
          <label className="block space-y-1"><span>Words in the entry</span>
            <input className={inputStyle} type="search" maxLength={60} value={draft.q} onChange={event => setDraft(previous => ({ ...previous, q: event.target.value }))} /></label>
          <label className="block space-y-1"><span>From date</span>
            <input className={inputStyle} type="date" value={draft.from} onChange={event => setDraft(previous => ({ ...previous, from: event.target.value }))} /></label>
          <label className="block space-y-1"><span>To date</span>
            <input className={inputStyle} type="date" value={draft.to} onChange={event => setDraft(previous => ({ ...previous, to: event.target.value }))} /></label>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={loading}>Show entries</Button>
          <Button type="button" variant="outline" disabled={loading} onClick={() => { setDraft(emptyFilters); void search(emptyFilters); }}>Clear filters</Button>
        </div>
      </form>
      <section aria-labelledby="entries-title" className="space-y-3" aria-busy={loading}>
        <h2 id="entries-title" className="text-xl font-semibold">{filtered ? 'Matching entries' : 'Recent entries'}</h2>
        {!loading && !error && entries.length === 0 && <p>{filtered ? 'No entries match these filters. Try a wider date range or clear the filters.' : 'Nothing has been recorded yet.'}</p>}
        {entries.length > 0 && <p className="text-sm text-muted-foreground">Showing {plural(entries.length, 'entry', 'entries')}, newest first.</p>}
        <ul className="space-y-3">{entries.map(entry => {
          const key = keyOf(entry), expanded = open === key;
          return <li key={key} className="min-w-0 space-y-2 rounded border p-4">
            <p className="text-sm text-muted-foreground">{entry.sourceLabel} · {whenText(entry.occurredAt)}</p>
            <h3 className="break-words font-semibold">{entry.action}</h3>
            <p className="break-words text-sm">About: {entry.subject || 'Not recorded'}</p>
            <p className="break-words text-sm">Done by: {entry.actor ? `${entry.actor.name}${entry.actor.role ? ` (${roleLabel(entry.actor.role)})` : ''}` : 'Not recorded'}</p>
            {entry.reason && <p className="break-words text-sm">Reason: {entry.reason}</p>}
            {(entry.before !== null || entry.after !== null) && <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="min-w-0 rounded border p-2"><dt className="font-medium">Before</dt><dd className="break-words">{entry.before ?? 'Nothing recorded'}</dd></div>
              <div className="min-w-0 rounded border p-2"><dt className="font-medium">After</dt><dd className="break-words">{entry.after ?? 'Nothing recorded'}</dd></div>
            </dl>}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" size="sm" aria-expanded={expanded} aria-controls={'detail-' + key} onClick={() => { void toggle(entry); }}>{expanded ? 'Hide details' : 'Show details and notes'}</Button>
              {entry.noteCount > 0 && <span className="text-sm text-muted-foreground">{plural(entry.noteCount, 'correction note')}</span>}
            </div>
            {expanded && <div id={'detail-' + key} className="space-y-3 border-t pt-3">
              {detailState === 'loading' && <p role="status">Loading details…</p>}
              {detailState === 'error' && <p>The details could not be loaded. Close and open this entry again.</p>}
              {detail && keyOf(detail) === key && <>
                {detail.changes.length > 0 ? <div className="space-y-1"><h4 className="font-medium">What changed</h4>
                  <ul className="space-y-1 text-sm">{detail.changes.map((change, index) => <li key={index} className="break-words rounded border p-2"><span className="font-medium">{change.label}:</span> {change.before} → {change.after}</li>)}</ul>
                  {detail.changesTruncated && <p className="text-sm text-muted-foreground">Only the first changes are listed here.</p>}</div> : <p className="text-sm text-muted-foreground">This entry has no line-by-line changes beyond the summary above.</p>}
                <div className="space-y-1"><h4 className="font-medium">Correction notes</h4>
                  {detail.notes.length === 0 ? <p className="text-sm">No correction notes yet.</p> : <ul className="space-y-1 text-sm">{detail.notes.map(item => <li key={item.id} className="break-words rounded border p-2">{item.note}<br /><span className="text-muted-foreground">{item.notedByName} · {whenText(item.createdAt)}</span></li>)}</ul>}</div>
                <form onSubmit={addNote} className="space-y-3">
                  <fieldset disabled={saving} className="space-y-3">
                    <legend className="font-medium">Add a correction note</legend>
                    <label className="block space-y-1"><span>Note</span>
                      <textarea className={inputStyle} rows={3} required minLength={10} maxLength={500} aria-label="Note" aria-describedby={'note-help-' + key} value={note} onChange={event => { setNote(event.target.value); setConfirmed(false); }} /></label>
                    <p id={'note-help-' + key} className="text-sm text-muted-foreground">Use 10–500 characters on one line. The note is added beside this entry and cannot be edited later.</p>
                    <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>I have checked this note and it should be kept on record.</span></label>
                    <Button type="submit" disabled={saving || !confirmed || note.trim().length < 10}>{saving ? 'Adding…' : 'Add note'}</Button>
                  </fieldset>
                </form>
              </>}
            </div>}
          </li>;
        })}</ul>
        {next && <Button type="button" variant="outline" disabled={loadingMore || loading} onClick={() => { void older(); }}>{loadingMore ? 'Loading…' : 'Show older entries'}</Button>}
      </section>
    </>}
  </main>;
}
