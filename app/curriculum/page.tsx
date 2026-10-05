'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- vinext beta requires full-page navigation here. */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
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
const inputStyle = 'border rounded p-2 w-full min-w-0 bg-background';
function responseError(status: number, fallback: string): string {
  if (status === 401) { window.location.assign(new URL('/login', window.location.origin).href); return 'Please sign in again.'; }
  if (status === 403) return 'Your account does not have permission to use this staff library. Contact your school administrator.';
  if (status === 409) return 'This request conflicts with a saved reference. Your text is kept. Reload the list and check the saved reference before retrying.';
  return fallback;
}

export default function CurriculumPage() {
  const [references, setReferences] = useState<CurriculumReference[]>([]);
  const [content, setContent] = useState<CurriculumContent>(emptyContent);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [savedId, setSavedId] = useState('');
  const lock = useRef(false);
  const retry = useRef<{ payload: string; id: string } | null>(null);
  const notice = useRef<HTMLDivElement>(null);
  async function readReferences(signal?: AbortSignal): Promise<CurriculumReference[]> {
    const response = await fetch('/api/curriculum', { cache: 'no-store', signal });
    if (!response.ok) throw new Error(responseError(response.status, 'Could not load curriculum references. Try reloading the list.'));
    return response.json();
  }
  useEffect(() => {
    const controller = new AbortController();
    void readReferences(controller.signal).then(items => { if (!controller.signal.aborted) setReferences(items); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load references.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  async function reload() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try { setReferences(await readReferences()); setMessage('Library refreshed. Your unsaved reference text is kept.'); }
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
      try { setReferences(await readReferences()); }
      catch { setMessage('Reference saved as a private draft. The library could not refresh; open the saved reference below or reload the list.'); }
    } catch (reason) {
      if (acknowledged) setMessage('Reference saved. Open the saved reference below or reload the library to confirm its details. Your text is kept.');
      else setError(`${reason instanceof Error ? reason.message : 'Could not confirm the save.'} Retrying the same text is safe.`);
    } finally { lock.current = false; setBusy(false); notice.current?.focus(); }
  }
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
      {!loading && !error && references.length === 0 && <p>No references are available yet. Create a draft below.</p>}
      <ul className="space-y-3">{references.map(reference => <li className="border rounded p-4 space-y-1 break-words" key={reference.id}>
        <a className="font-medium underline" href={`/curriculum/${encodeURIComponent(reference.id)}`}>{reference.latest.title}</a>
        <p>{reference.latest.curriculum} · {reference.latest.gradeLevel} · {reference.latest.subject} · {reference.latest.language}</p>
        <p className="text-sm">Version {reference.latest.version} · {reference.latest.approvedAt ? 'Reviewed' : 'Private draft'} · {reference.canManage ? 'Manage entry' : 'Reviewed reference; read and copy'}</p>
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
