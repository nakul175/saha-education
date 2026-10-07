'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- vinext beta requires full-page navigation here. */
import { use, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CurriculumLifecycle } from '@/components/curriculum-lifecycle';
import { formatWhen } from '@/lib/education/display';
import type { CurriculumContent, CurriculumReference, CurriculumVersion, CurriculumProvenance } from '@/lib/education/curriculum';
import type { ResourceType, TeachingResource } from '@/lib/education/resource-types';

const fields = [
  { key: 'title', label: 'Reference title', max: 160 }, { key: 'curriculum', label: 'Curriculum or framework', max: 120 },
  { key: 'gradeLevel', label: 'Grade or level', max: 40 }, { key: 'subject', label: 'Subject', max: 80 },
  { key: 'language', label: 'Language tag', max: 35, pattern: '[a-z]{2,3}(-[A-Za-z0-9]{2,8})*' },
  { key: 'objectives', label: 'Learning objectives', max: 4000, rows: 3 },
  { key: 'body', label: 'Reference text', max: 20000, rows: 9 },
  { key: 'rightsStatement', label: 'Rights and permission statement', max: 2000, rows: 3 },
] as const;
const inputStyle = 'border rounded p-2 w-full min-w-0 bg-background';
function editable(version: CurriculumVersion): CurriculumContent {
  return { title: version.title, curriculum: version.curriculum, gradeLevel: version.gradeLevel, subject: version.subject, language: version.language,
    objectives: version.objectives, body: version.body, rightsStatement: version.rightsStatement, sourceReference: version.sourceReference, sourceUrl: version.sourceUrl };
}
function responseError(status: number): string {
  if (status === 401) { window.location.assign(new URL('/login', window.location.origin).href); return 'Please sign in again.'; }
  if (status === 403) return 'Your account does not have permission for this action. Contact your school administrator.';
  if (status === 404) return 'This reference or selected saved version is unavailable to your account.';
  if (status === 409) return 'This request conflicts with the saved state. Your edits are kept. Reload the saved history before continuing.';
  if (status === 400) return 'Check the required fields, permission statement and HTTPS source URL. Your edits are kept.';
  return 'Could not confirm this action. Your edits are kept; reload the saved history before retrying.';
}

export default function CurriculumDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params), path = `/api/curriculum/${encodeURIComponent(id)}`;
  const [reference, setReference] = useState<CurriculumReference | null>(null);
  const [content, setContent] = useState<CurriculumContent | null>(null);
  const [versions, setVersions] = useState<CurriculumVersion[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [resourceType, setResourceType] = useState<ResourceType>('lesson');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<{ resource: TeachingResource; provenance: CurriculumProvenance } | null>(null);
  const lock = useRef(false);
  const copyRetry = useRef<{ payload: string; id: string } | null>(null);
  const notice = useRef<HTMLDivElement>(null);
  const selected = versions.find(version => version.id === selectedId);
  const retired = reference?.status.state === 'retired';
  const dirty = !!reference && !!content && JSON.stringify(content) !== JSON.stringify(editable(reference.latest));
  async function readReference(signal?: AbortSignal) {
    const responses = await Promise.all([fetch(path, { cache: 'no-store', signal }), fetch(`${path}/versions`, { cache: 'no-store', signal })]);
    const failed = responses.find(response => !response.ok);
    if (failed) throw new Error(responseError(failed.status));
    const current: CurriculumReference = await responses[0].json(), history: CurriculumVersion[] = await responses[1].json();
    return { current, history };
  }
  useEffect(() => {
    const controller = new AbortController();
    void readReference(controller.signal).then(({ current, history }) => {
      if (controller.signal.aborted) return;
      setReference(current); setContent(editable(current.latest)); setVersions(history); setSelectedId(current.latest.id); setReviewed(false); setNeedsReload(false);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load this reference.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  // The current record URL is the complete input for this read operation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  async function reload(replaceEdits: boolean) {
    if (lock.current) return;
    if (replaceEdits && dirty && !window.confirm('Replace your unsaved reference edits with the latest saved version?')) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const { current, history } = await readReference();
      setVersions(history); setReviewed(false);
      if (replaceEdits || !dirty) {
        setReference(current); setContent(editable(current.latest)); setNeedsReload(false);
        setSelectedId(previous => history.some(version => version.id === previous) ? previous : current.latest.id);
      }
      if (dirty && !replaceEdits && current.latest.id !== reference?.latest.id) {
        setNeedsReload(true); setMessage('History refreshed. A newer reference version exists; your edits and selected saved version are kept. Copy your edits before reloading latest.');
      } else setMessage(replaceEdits ? 'Latest saved reference loaded. Unsaved edits were replaced; the selected saved version is kept when available.' : 'Saved history refreshed. Your edits and selected saved version are kept.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not reload this reference.'); }
    finally { lock.current = false; setBusy(false); notice.current?.focus(); }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !reference?.canManage || !content || needsReload || !dirty) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    let acknowledged = false, receivedResponse = false, reloadRequired = false;
    try {
      const response = await fetch(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion: reference.latest.version, content }) });
      receivedResponse = true;
      if (!response.ok) { reloadRequired = response.status === 409 || response.status >= 500; throw new Error(responseError(response.status)); }
      acknowledged = true;
      const saved: CurriculumReference = await response.json();
      setReference(saved); setContent(editable(saved.latest)); setVersions(previous => [saved.latest, ...previous.filter(version => version.id !== saved.latest.id)]);
      setSelectedId(saved.latest.id); setReviewed(false); setNeedsReload(false);
      setMessage(`Version ${saved.latest.version} saved as a private draft. Review this exact saved version before approving it.`);
      try {
        const { current, history } = await readReference();
        // Preserve the exact version just saved even if another author appends
        // a newer revision before this refresh finishes.
        setVersions(history);
        if (current.latest.id !== saved.latest.id) { setNeedsReload(true); setMessage(`Version ${saved.latest.version} saved. A newer revision also exists; your selected saved version is kept. Reload latest before editing again.`); }
      } catch { setMessage(`Version ${saved.latest.version} saved. History could not refresh; your selected saved version is kept. You can reload the history.`); }
    } catch (reason) {
      if (acknowledged) { setNeedsReload(true); setReviewed(false); setMessage('A new version was saved. Reload latest to load its exact saved content before making another change. Your edits are kept.'); }
      else { setNeedsReload(reloadRequired || !receivedResponse); setReviewed(false); setError(reason instanceof Error ? reason.message : 'Could not confirm the save. Reload saved history before retrying; your edits are kept.'); }
    } finally { lock.current = false; setBusy(false); notice.current?.focus(); }
  }
  async function approve() {
    if (lock.current || !reference?.canManage || !selected || !reviewed || dirty || needsReload) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    const exactId = selected.id, number = selected.version;
    let acknowledged = false;
    try {
      const response = await fetch(`${path}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versionId: exactId, confirmReview: true }) });
      if (!response.ok) throw new Error(responseError(response.status));
      acknowledged = true;
      const saved: CurriculumVersion = await response.json();
      setVersions(previous => previous.map(version => version.id === exactId ? saved : version));
      setReference(previous => previous && ({ ...previous, latest: previous.latest.id === exactId ? saved : previous.latest }));
      setReviewed(false); setMessage(`Saved version ${number} reviewed. School staff may now copy this exact version into a provisional teaching draft.`);
    } catch (reason) {
      setReviewed(false);
      if (acknowledged) setMessage(`Saved version ${number} reviewed. Reload saved history to display the approval details.`);
      else setError(reason instanceof Error ? reason.message : 'Could not confirm review. Reload history to check this exact version.');
    } finally { lock.current = false; setBusy(false); notice.current?.focus(); }
  }
  async function copy() {
    if (lock.current || !selected?.approvedAt) return;
    lock.current = true; setBusy(true); setError(''); setMessage(''); setCopied(null);
    const payload = JSON.stringify({ versionId: selected.id, type: resourceType });
    const resourceId = copyRetry.current?.payload === payload ? copyRetry.current.id : crypto.randomUUID();
    copyRetry.current = { payload, id: resourceId };
    let acknowledged = false;
    try {
      const response = await fetch(`${path}/draft`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versionId: selected.id, type: resourceType, clientResourceId: resourceId }) });
      if (!response.ok) throw new Error(responseError(response.status));
      acknowledged = true;
      const result: { resource: TeachingResource; provenance: CurriculumProvenance } = await response.json();
      setCopied(result); copyRetry.current = null;
      setMessage(`Provisional ${resourceType} draft created from reviewed reference version ${selected.version}. Open it to edit and review; it has not been approved or assigned.`);
    } catch (reason) {
      if (acknowledged) setMessage('The provisional teaching draft was created. Retry the same source and type to recover its link safely, or open Teaching resources.');
      else setError(`${reason instanceof Error ? reason.message : 'Could not confirm draft creation.'} Retrying the same source version and type is safe.`);
    } finally { lock.current = false; setBusy(false); notice.current?.focus(); }
  }
  return <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
    <nav className="flex flex-wrap gap-4" aria-label="Workspace navigation"><a className="underline" href="/curriculum">← Curriculum references</a><a className="underline" href="/resources">Teaching resources</a></nav>
    <h1 className="text-2xl font-bold">Review a curriculum reference</h1>
    {retired && reference && <p className="border rounded p-4" role="note">This reference is retired ({formatWhen(reference.status.changedAt)}). Reason: {reference.status.reason} It is hidden from other staff and cannot be copied or revised until it is reinstated under Availability below. Existing copies and assignments are unchanged.</p>}
    <div ref={notice} tabIndex={-1} className="space-y-2 rounded focus:outline-2 focus:outline-offset-2"><p role="status" aria-live="polite">{loading ? 'Loading reference and saved history…' : message}</p>{error && <p role="alert">{error}</p>}
      {!loading && !reference && <Button variant="outline" disabled={busy} onClick={() => { void reload(false); }}>Retry loading reference</Button>}
      {copied && <div className="space-y-1"><a className="underline" href={`/resources/${encodeURIComponent(copied.resource.id)}`}>Open provisional teaching draft</a><p className="text-sm">The draft retains attribution to this exact saved reference version when either item is revised.</p></div>}
    </div>
    {reference && content && <>
      {reference.canManage ? <section className="border rounded p-4 space-y-4" aria-labelledby="curriculum-edit-title">
        <h2 id="curriculum-edit-title" className="text-xl font-semibold">Edit latest reference</h2>
        <p>Editing version {reference.latest.version}{dirty ? ' · Unsaved edits' : ''}. Saving adds a new revision; earlier ones are kept. Other staff continue to see the latest reviewed version until the new revision is reviewed.</p>
        <p className="text-sm">The permission statement is your declaration, not an independent licensing check. Only include content you have permission to use.</p>
        <form onSubmit={save} className="space-y-4"><fieldset disabled={busy} className="space-y-4"><legend className="sr-only">Edit reference content and permission</legend>
          {fields.map(field => <label className="block space-y-1" key={field.key}><span>{field.label} *</span>
            {'rows' in field ? <textarea className={inputStyle} rows={field.rows} required maxLength={field.max} value={content[field.key]} onChange={event => { setContent(previous => previous && ({ ...previous, [field.key]: event.target.value })); setReviewed(false); }} /> :
              <input className={inputStyle} required maxLength={field.max} pattern={'pattern' in field ? field.pattern : undefined} value={content[field.key]} onChange={event => { setContent(previous => previous && ({ ...previous, [field.key]: event.target.value })); setReviewed(false); }} />}
          </label>)}
          <p className="text-sm">Use a language tag such as en-IN or hi. Reference text is stored as plain text.</p>
          <label className="block space-y-1"><span>Source reference (optional)</span><input className={inputStyle} maxLength={300} value={content.sourceReference} onChange={event => { setContent(previous => previous && ({ ...previous, sourceReference: event.target.value })); setReviewed(false); }} /></label>
          <label className="block space-y-1"><span>HTTPS source URL (optional)</span><input type="url" className={inputStyle} maxLength={2000} value={content.sourceUrl ?? ''} onChange={event => { setContent(previous => previous && ({ ...previous, sourceUrl: event.target.value || null })); setReviewed(false); }} /></label>
          <p className="text-sm">No automatic source import. HTTPS only; no embedded credentials or URL fragment.</p>
        </fieldset>
        <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy || !dirty || needsReload || retired}>Save new reference version</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { void reload(true); }}>Reload latest (replace edits)</Button></div>
        {needsReload && <p>Reload the latest saved reference before saving again. Keep a copy of your unsaved edits before replacing them.</p>}
        </form>
      </section> : <p className="border rounded p-4">This reviewed school reference is available for reading and copying. Its author and school administrators manage revisions and review.</p>}
      <section className="border rounded p-4 space-y-4" aria-labelledby="curriculum-history-title">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="curriculum-history-title" className="text-xl font-semibold">Saved source versions</h2><Button variant="outline" disabled={busy} onClick={() => { void reload(false); }}>Refresh saved history (keep edits)</Button></div>
        <label className="block space-y-1"><span>Exact saved version to preview</span><select className={inputStyle} disabled={busy} value={selectedId} onChange={event => { setSelectedId(event.target.value); setReviewed(false); setCopied(null); }}>{versions.map(version => <option value={version.id} key={version.id}>Version {version.version} — {version.approvedAt ? 'Reviewed' : 'Private draft'}</option>)}</select></label>
        {selected && <>
          <article className="border rounded p-4 space-y-3 break-words" aria-labelledby="source-preview-title">
            <h3 id="source-preview-title" className="text-lg font-semibold">{selected.title} · Saved version {selected.version}</h3>
            <p>{selected.curriculum} · {selected.gradeLevel} · {selected.subject} · {selected.language}</p>
            <h4 className="font-semibold">Learning objectives</h4><p className="whitespace-pre-wrap">{selected.objectives}</p>
            <h4 className="font-semibold">Reference text</h4><p className="whitespace-pre-wrap">{selected.body}</p>
            <h4 className="font-semibold">Declared rights and permission</h4><p className="whitespace-pre-wrap">{selected.rightsStatement}</p>
            {selected.sourceReference && <p>Source reference: {selected.sourceReference}</p>}
            {selected.sourceUrl && <p><a className="underline break-all" href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">Open source attribution URL in a new tab</a></p>}
            <p className="text-sm">Rights as recorded by {selected.createdByName ?? 'the author'}. This is the author&apos;s declaration; the library does not verify permission, and the school&apos;s curriculum and pilot rights position is still an open decision.</p>
            <p>{selected.approvedAt ? `Reviewed by ${selected.approvedByName ?? 'school staff'} on ${formatWhen(selected.approvedAt)}` : 'Private draft; not available for copying.'}</p>
          </article>
          {reference.canManage && !selected.approvedAt && !retired && <div className="space-y-3">
            <label className="flex items-start gap-3"><input type="checkbox" checked={reviewed} disabled={busy || dirty || needsReload} onChange={event => setReviewed(event.target.checked)} /><span>I reviewed saved version {selected.version} above for accuracy, grade suitability, curriculum fit and permission to use this material. I approve this exact version for school staff to copy. Self-review is permitted.</span></label>
            {dirty && <p>Save or replace your unsaved edits before approving a saved version.</p>}
            <Button disabled={busy || !reviewed || dirty || needsReload} onClick={() => { void approve(); }}>Review and approve saved version {selected.version}</Button>
          </div>}
          {selected.approvedAt && retired && <p>This reference is retired, so new copies are blocked. Reinstate it under Availability to copy this reviewed version.</p>}
          {selected.approvedAt && !retired && <form onSubmit={event => { event.preventDefault(); void copy(); }} className="space-y-3">
            <h3 className="text-lg font-semibold">Create a provisional teaching draft</h3>
            <p>Copy the text and curriculum context of reviewed version {selected.version}. This creates your own editable draft and retains the exact source version. Resource approval and class assignment require separate actions.</p>
            {dirty && <p className="text-sm">Your unsaved reference edits above are excluded from this copy.</p>}
            <label className="block space-y-1"><span>Teaching resource type</span><select className={inputStyle} value={resourceType} disabled={busy} onChange={event => setResourceType(event.target.value as ResourceType)}>{(['lesson', 'worksheet', 'quiz', 'activity'] as const).map(type => <option value={type} key={type}>{type}</option>)}</select></label>
            <Button type="submit" disabled={busy}>{busy ? 'Working…' : `Copy reviewed version ${selected.version} to a new draft`}</Button>
          </form>}
        </>}
      </section>
      <CurriculumLifecycle reference={reference} onStatusChanged={status => { setReference(previous => previous && ({ ...previous, status })); setMessage(''); }} />
    </>}
  </main>;
}
