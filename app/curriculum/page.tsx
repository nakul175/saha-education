'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- vinext beta requires full-page navigation here. */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { excerpt, formatDay } from '@/lib/education/display';
import type { CurriculumContent, CurriculumReference } from '@/lib/education/curriculum';

const fields = [
  { key: 'title', label: 'Reference title', max: 160 },
  { key: 'curriculum', label: 'Curriculum or framework', max: 120 },
  { key: 'gradeLevel', label: 'Grade or level', max: 40 },
  { key: 'subject', label: 'Subject', max: 80 },
  { key: 'language', label: 'Language tag', max: 35, pattern: '[a-z]{2,3}(-[A-Za-z0-9]{2,8})*' },
  { key: 'objectives', label: 'Learning objectives', max: 4000, rows: 3 },
  { key: 'body', label: 'Reference text', max: 20000, rows: 9 },
  { key: 'rightsStatement', label: 'Rights and permission statement', max: 2000, rows: 3 },
] as const;
const emptyContent = (): CurriculumContent => ({ title: '', curriculum: '', gradeLevel: '', subject: '', language: 'en-IN', objectives: '', body: '', rightsStatement: '', sourceReference: '', sourceUrl: null });
type Filters = { q: string; curriculum: string; gradeLevel: string; subject: string; language: string; review: string; lifecycle: string };
const noFilters: Filters = { q: '', curriculum: '', gradeLevel: '', subject: '', language: '', review: 'all', lifecycle: 'active' };
type Facets = { curriculum: string[]; gradeLevel: string[]; subject: string[]; language: string[] };
const inputStyle = 'border rounded p-2 w-full min-w-0 bg-background';
function responseError(status: number, fallback: string): string {
  if (status === 401) { window.location.assign(new URL('/login', window.location.origin).href); return 'Please sign in again.'; }
  if (status === 403) return 'Your account does not have permission to use this staff library. Contact your school administrator.';
  if (status === 409) return 'This request conflicts with a saved reference. Your text is kept. Reload the list and check the saved reference before retrying.';
  return fallback;
}
function query(filters: Filters): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value && !(key === 'review' && value === 'all') && !(key === 'lifecycle' && value === 'active')) search.set(key, value);
  const text = search.toString();
  return text ? '?' + text : '';
}
function sortedUnion(previous: string[], next: string[]): string[] { return [...new Set([...previous, ...next])].sort((a, b) => a.localeCompare(b)); }
function merge(previous: Facets, items: CurriculumReference[]): Facets {
  return { curriculum: sortedUnion(previous.curriculum, items.map(item => item.latest.curriculum)), gradeLevel: sortedUnion(previous.gradeLevel, items.map(item => item.latest.gradeLevel)),
    subject: sortedUnion(previous.subject, items.map(item => item.latest.subject)), language: sortedUnion(previous.language, items.map(item => item.latest.language)) };
}
function Select({ label, value, options, onChange, any = 'Any' }: { label: string; value: string; options: string[]; onChange: (value: string) => void; any?: string }) {
  return <label className="block space-y-1 min-w-0"><span className="text-sm">{label}</span>
    <select className={inputStyle} value={value} onChange={event => onChange(event.target.value)}><option value="">{any}</option>{options.map(option => <option key={option} value={option}>{option}</option>)}</select></label>;
}

export default function CurriculumPage() {
  const [references, setReferences] = useState<CurriculumReference[]>([]);
  const [content, setContent] = useState<CurriculumContent>(emptyContent);
  const [draftFilters, setDraftFilters] = useState<Filters>(noFilters);
  const [applied, setApplied] = useState<Filters>(noFilters);
  const [facets, setFacets] = useState<Facets>({ curriculum: [], gradeLevel: [], subject: [], language: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [savedId, setSavedId] = useState('');
  const lock = useRef(false);
  const retry = useRef<{ payload: string; id: string } | null>(null);
  const notice = useRef<HTMLDivElement>(null);
  async function readReferences(filters: Filters, signal?: AbortSignal): Promise<CurriculumReference[]> {
    const response = await fetch('/api/curriculum' + query(filters), { cache: 'no-store', signal });
    if (!response.ok) throw new Error(responseError(response.status, response.status === 400 ? 'Those filters were not accepted. Clear the filters and try again.' : 'Could not load curriculum references. Try reloading the list.'));
    const items: CurriculumReference[] = await response.json();
    if (!Array.isArray(items)) throw new Error('Could not confirm the library list. Try reloading the list.');
    return items;
  }
  useEffect(() => {
    const controller = new AbortController();
    void readReferences(noFilters, controller.signal).then(items => { if (!controller.signal.aborted) { setReferences(items); setFacets(previous => merge(previous, items)); } })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load references.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  async function reload(filters: Filters = applied, note = 'Library refreshed. Your unsaved reference text is kept.') {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try { const items = await readReferences(filters); setReferences(items); setFacets(previous => merge(previous, items)); setApplied(filters); setMessage(note); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not reload the library.'); }
    finally { lock.current = false; setBusy(false); notice.current?.focus(); }
  }
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage(''); setSavedId('');
    const payload = JSON.stringify(content);
    const id = retry.current?.payload === payload ? retry.current.id : crypto.randomUUID();
    retry.current = { payload, id };
    let acknowledged = false;
    try {
      const response = await fetch('/api/curriculum', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, clientReferenceId: id }) });
      if (!response.ok) throw new Error(responseError(response.status, 'Could not save this reference. Check the required fields and source URL. Your text is kept.'));
      acknowledged = true;
      setSavedId(id);
      const created: CurriculumReference = await response.json();
      setReferences(previous => [created, ...previous.filter(item => item.id !== created.id)]);
      setContent(emptyContent()); retry.current = null;
      setMessage('Reference saved as a private draft. Open it to review an exact saved version before others can copy it.');
      try { const items = await readReferences(applied); setReferences(items); setFacets(previous => merge(previous, items)); }
      catch { setMessage('Reference saved as a private draft. The library could not refresh; open the saved reference below or reload the list.'); }
    } catch (reason) {
      if (acknowledged) setMessage('Reference saved. Open the saved reference below or reload the library to confirm its details. Your text is kept.');
      else setError(`${reason instanceof Error ? reason.message : 'Could not confirm the save.'} Retrying the same text is safe.`);
    } finally { lock.current = false; setBusy(false); notice.current?.focus(); }
  }
  const filtering = JSON.stringify(applied) !== JSON.stringify(noFilters);
  return <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
    <nav className="flex flex-wrap gap-4" aria-label="Workspace navigation"><a href="/" className="underline">← Dashboard</a><a href="/resources" className="underline">Teaching resources</a></nav>
    <h1 className="text-2xl font-bold">Curriculum references</h1>
    <p>Write original or permitted reference text for your school. Teachers manage their own entries; school administrators can manage school entries. Other staff can read and copy reviewed versions.</p>
    <div ref={notice} tabIndex={-1} className="space-y-2 rounded focus:outline-2 focus:outline-offset-2">
      <p role="status" aria-live="polite">{loading ? 'Loading curriculum references…' : message}</p>
      {error && <p role="alert">{error}</p>}
      {savedId && <a className="underline" href={`/curriculum/${encodeURIComponent(savedId)}`}>Open saved reference</a>}
    </div>
    <section aria-labelledby="curriculum-list-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="curriculum-list-title" className="text-xl font-semibold">Your school library</h2><Button variant="outline" disabled={busy || loading} onClick={() => { void reload(); }}>Reload list</Button></div>
      <form role="search" aria-label="Find references in the library" className="border rounded p-4 space-y-3" onSubmit={event => { event.preventDefault(); void reload(draftFilters, 'Filters applied.'); }}>
        <label className="block space-y-1"><span className="text-sm">Search the library</span>
          <input className={inputStyle} type="search" maxLength={200} placeholder="Words from the title, text, rights or source" value={draftFilters.q} onChange={event => setDraftFilters(previous => ({ ...previous, q: event.target.value }))} /></label>
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Framework" value={draftFilters.curriculum} options={facets.curriculum} onChange={value => setDraftFilters(previous => ({ ...previous, curriculum: value }))} />
          <Select label="Level" value={draftFilters.gradeLevel} options={facets.gradeLevel} onChange={value => setDraftFilters(previous => ({ ...previous, gradeLevel: value }))} />
          <Select label="Area of study" value={draftFilters.subject} options={facets.subject} onChange={value => setDraftFilters(previous => ({ ...previous, subject: value }))} />
          <Select label="Language" value={draftFilters.language} options={facets.language} onChange={value => setDraftFilters(previous => ({ ...previous, language: value }))} />
          <label className="block space-y-1 min-w-0"><span className="text-sm">Review state</span>
            <select className={inputStyle} value={draftFilters.review} onChange={event => setDraftFilters(previous => ({ ...previous, review: event.target.value }))}><option value="all">Reviewed and private drafts</option><option value="reviewed">Reviewed only</option><option value="draft">Private drafts only</option></select></label>
          <label className="block space-y-1 min-w-0"><span className="text-sm">Availability</span>
            <select className={inputStyle} value={draftFilters.lifecycle} onChange={event => setDraftFilters(previous => ({ ...previous, lifecycle: event.target.value }))}><option value="active">In use</option><option value="retired">Retired (yours to manage)</option><option value="all">In use and retired</option></select></label>
        </div>
        <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy || loading}>Apply filters</Button>
          <Button type="button" variant="outline" disabled={busy || loading || (!filtering && JSON.stringify(draftFilters) === JSON.stringify(noFilters))} onClick={() => { setDraftFilters(noFilters); void reload(noFilters, 'Filters cleared.'); }}>Clear filters</Button></div>
      </form>
      {!loading && !error && <p className="text-sm">{references.length === 1 ? '1 reference shown.' : `${references.length} references shown.`}{filtering ? ' Filters are applied.' : ''}</p>}
      {!loading && !error && references.length === 0 && <p>{filtering ? 'No references match these filters. Clear the filters to see the whole library.' : 'No references are available yet. Create a draft below.'}</p>}
      <ul className="space-y-3">{references.map(reference => <li className="border rounded p-4 space-y-1 break-words" key={reference.id}>
        <a className="font-medium underline" href={`/curriculum/${encodeURIComponent(reference.id)}`}>{reference.latest.title}</a>
        <p>{reference.latest.curriculum} · {reference.latest.gradeLevel} · {reference.latest.subject} · {reference.latest.language}</p>
        <p className="text-sm">Version {reference.latest.version} · {reference.latest.approvedAt ? `Reviewed by ${reference.latest.approvedByName ?? 'school staff'} on ${formatDay(reference.latest.approvedAt)}` : 'Private draft'} · {reference.canManage ? 'Manage entry' : 'Reviewed reference; read and copy'}</p>
        <p className="text-sm">Author: {reference.authorName}{reference.status.state === 'retired' ? ` · Retired ${formatDay(reference.status.changedAt)}. New copies are blocked.` : ''}</p>
        <p className="text-sm">Rights as declared by the author (not independently verified): {excerpt(reference.latest.rightsStatement)}</p>
      </li>)}</ul>
    </section>
    <section className="border rounded p-4 space-y-4" aria-labelledby="create-curriculum-title">
      <h2 id="create-curriculum-title" className="text-xl font-semibold">Create a reference draft</h2>
      <p className="text-sm">The permission statement is your declaration, not an independent licensing check. Include only material you have permission to use. Source URLs are stored for attribution and are never imported automatically.</p>
      <form onSubmit={create} className="space-y-4">
        <fieldset disabled={busy || loading} className="space-y-4"><legend className="sr-only">Reference content and permission</legend>
          {fields.map(field => <label className="block space-y-1" key={field.key}><span>{field.label} *</span>
            {'rows' in field ? <textarea className={inputStyle} rows={field.rows} required maxLength={field.max} value={content[field.key]} onChange={event => setContent(previous => ({ ...previous, [field.key]: event.target.value }))} /> :
              <input className={inputStyle} required maxLength={field.max} pattern={'pattern' in field ? field.pattern : undefined} value={content[field.key]} onChange={event => setContent(previous => ({ ...previous, [field.key]: event.target.value }))} />}
          </label>)}
          <p className="text-sm">Use a language tag such as en-IN or hi. Reference text is saved and shown as plain text.</p>
          <label className="block space-y-1"><span>Source reference (optional)</span><input className={inputStyle} maxLength={300} value={content.sourceReference} onChange={event => setContent(previous => ({ ...previous, sourceReference: event.target.value }))} /></label>
          <label className="block space-y-1"><span>HTTPS source URL (optional)</span><input className={inputStyle} type="url" maxLength={2000} placeholder="https://example.org/reference" value={content.sourceUrl ?? ''} onChange={event => setContent(previous => ({ ...previous, sourceUrl: event.target.value || null }))} /></label>
          <p className="text-sm">Source URLs must use HTTPS and contain no embedded credentials or fragment.</p>
        </fieldset>
        <Button type="submit" disabled={busy || loading}>{busy ? 'Working…' : 'Save private reference draft'}</Button>
      </form>
    </section>
  </main>;
}
