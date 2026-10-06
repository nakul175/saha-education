'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- vinext beta client Link transitions crash in this workspace; use full-page navigation. */
import { use, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getPrincipal } from '@/lib/education/client-api';
import { copyResourceContent, RESOURCE_FIELDS, RESOURCE_TYPES } from '@/lib/education/resource-templates';
import type { ResourceContent, ResourceType, ResourceVersion, TeachingResource } from '@/lib/education/resource-types';
import type { Class } from '@/lib/education/types';

export default function ResourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const path = `/api/resources/${encodeURIComponent(id)}`;
  const [staff, setStaff] = useState(false);
  const [resource, setResource] = useState<TeachingResource | null>(null);
  const [content, setContent] = useState<ResourceContent | null>(null);
  const [versions, setVersions] = useState<ResourceVersion[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [classes, setClasses] = useState<Class[]>([]);
  const [classId, setClassId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [message, setMessage] = useState('Loading resource…');
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const selected = versions.find(version => version.id === selectedId);
  const dirty = !!resource && !!content && JSON.stringify(content) !== JSON.stringify(copyResourceContent(resource.latest));
  const inputStyle = 'border rounded p-2 w-full bg-background';
  async function readResource() {
    const responses = await Promise.all([fetch(path, { cache: 'no-store' }), fetch(`${path}/versions`, { cache: 'no-store' })]);
    if (responses.some(response => response.status === 401)) { window.location.assign(new URL('/login', window.location.origin).href); throw new Error('Please sign in.'); }
    if (responses.some(response => !response.ok)) throw new Error('Could not load this resource. It may be unavailable to your account.');
    const current: TeachingResource = await responses[0].json();
    const history: ResourceVersion[] = await responses[1].json();
    return { current, history };
  }
  useEffect(() => { let active = true; void (async () => {
    try {
      const principal = await getPrincipal();
      if (!active) return;
      if (!['teacher', 'admin'].includes(principal.role)) { setMessage('This workspace is available to school staff.'); return; }
      setStaff(true);
      const responses = await Promise.all([fetch(path, { cache: 'no-store' }), fetch(`${path}/versions`, { cache: 'no-store' }), fetch('/api/classes', { cache: 'no-store' })]);
      if (responses.some(response => !response.ok)) throw new Error('Could not load this resource and its classes.');
      const current: TeachingResource = await responses[0].json();
      const history: ResourceVersion[] = await responses[1].json();
      const roster: Class[] = await responses[2].json();
      if (!active) return;
      setResource(current); setContent(copyResourceContent(current.latest)); setVersions(history); setSelectedId(current.latest.id);
      setClasses(roster); setMessage(''); setConflict(false); setReviewed(false);
    } catch (error) { if (active) setMessage(error instanceof Error ? error.message : 'Could not load resource.'); }
  })(); return () => { active = false; }; }, [path]);
  async function mutate(action: 'save' | 'approve' | 'assign') {
    if (busyRef.current || !resource || !content) return;
    if (action === 'approve' && (!selected || !reviewed || dirty)) return;
    if (action === 'assign' && (!selected?.approvedAt || !classId)) return;
    busyRef.current = true; setBusy(true); setMessage('');
    try {
      const route = action === 'save' ? path : `${path}/${action}`;
      const payload = action === 'save' ? { expectedVersion: resource.latest.version, content } :
        action === 'approve' ? { versionId: selected!.id } : { versionId: selected!.id, classId, ...(dueDate ? { dueDate } : {}) };
      const response = await fetch(route, { method: action === 'save' ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (response.status === 401) { window.location.assign(new URL('/login', window.location.origin).href); return; }
      if (!response.ok) {
        if (response.status === 409) {
          if (action === 'save') { setConflict(true); throw new Error('A newer version is saved. Your edits are still here. Copy them before reloading, then apply them to the latest version.'); }
          throw new Error('This action conflicts with the saved state. Reload the saved history and check whether the version is already approved or assigned.');
        }
        throw new Error('Could not complete this action. Check your fields and permissions, then retry. Your edits are still here.');
      }
      if (action === 'assign') { setMessage('Approved version assigned to the selected class.'); return; }
      try {
        const { current, history } = await readResource();
        setResource(current); setVersions(history);
        if (action === 'save') { setContent(copyResourceContent(current.latest)); setSelectedId(current.latest.id); setConflict(false); }
        setReviewed(false);
        setMessage(action === 'save' ? 'New version saved. Review this saved version before approving it.' : 'Selected version approved. You can print or assign this exact version.');
      } catch { setMessage('The action completed. Reload saved history before making another change. Your text is still here.'); setConflict(true); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not complete the action.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function reload(replaceEdits: boolean) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const { current, history } = await readResource();
      setVersions(history);
      if (replaceEdits) { setResource(current); setContent(copyResourceContent(current.latest)); setSelectedId(current.latest.id); setConflict(false); }
      setReviewed(false); setMessage(replaceEdits ? 'Latest version loaded. Previous unsaved edits were replaced.' : 'Saved history refreshed. Your edits were kept.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not reload.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return <main className="max-w-4xl mx-auto p-6 space-y-6">
    <a href="/resources">← Teaching resources</a><h1 className="text-2xl font-bold">Review and prepare a resource</h1>
    <p role="status" aria-live="polite">{message}</p>
    {staff && resource && content && <>
      <section className="border rounded p-4 space-y-4">
        <h2 className="text-xl font-semibold">Edit latest draft</h2>
        <p>Saving creates a new revision; earlier ones are kept. Editing an approved resource creates a new draft; existing assignments keep their approved version.</p>
        <p>Editing version {resource.latest.version}{dirty ? ' · Unsaved edits' : ''}</p>
        <form onSubmit={event => { event.preventDefault(); void mutate('save'); }} className="space-y-4">
          <fieldset disabled={busy} className="space-y-4">
            <label className="block space-y-1"><span>Resource type</span><select className={inputStyle} value={content.type}
              onChange={event => { setContent(previous => previous && ({ ...previous, type: event.target.value as ResourceType })); setReviewed(false); }}>
              {RESOURCE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}</select></label>
            {RESOURCE_FIELDS.map(field => <label key={field.key} className="block space-y-1"><span>{field.label}{field.required ? ' *' : ''}</span>
              {field.multiline ? <textarea rows={field.key === 'body' ? 10 : 4} className={inputStyle} required={field.required} maxLength={field.maxLength} value={content[field.key]}
                onChange={event => { setContent(previous => previous && ({ ...previous, [field.key]: event.target.value })); setReviewed(false); }} /> :
                <input className={inputStyle} pattern={field.pattern} required={field.required} maxLength={field.maxLength} value={content[field.key]}
                  onChange={event => { setContent(previous => previous && ({ ...previous, [field.key]: event.target.value })); setReviewed(false); }} />}
            </label>)}
          </fieldset>
          <div className="flex gap-3 flex-wrap"><Button type="submit" disabled={busy || !dirty || conflict}>{busy ? 'Working…' : 'Save new version'}</Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => { void reload(true); }}>Reload latest (replaces unsaved edits)</Button></div>
        </form>
      </section>
      <section className="border rounded p-4 space-y-4">
        <h2 className="text-xl font-semibold">Saved revision history</h2>
        <Button variant="outline" disabled={busy} onClick={() => { void reload(false); }}>Refresh saved history (keep edits)</Button>
        <label className="block space-y-1"><span>Saved version to review, print or assign</span>
          <select className={inputStyle} value={selectedId} onChange={event => { setSelectedId(event.target.value); setReviewed(false); }}>
            {versions.map(version => <option key={version.id} value={version.id}>Version {version.version} — {version.approvedAt ? 'Approved' : 'Draft'} — {new Date(version.createdAt).toLocaleString()}</option>)}
          </select></label>
        {selected && <>
          <article className="space-y-3 border rounded p-4">
            <h3 className="text-lg font-semibold">{selected.title} · Version {selected.version}</h3>
            <p>{selected.curriculum} · {selected.gradeLevel} · {selected.subject} · {selected.language}</p>
            <h4 className="font-semibold">Objectives</h4><p className="whitespace-pre-wrap break-words">{selected.objectives}</p>
            <h4 className="font-semibold">Student material</h4><p className="whitespace-pre-wrap break-words">{selected.body}</p>
            {selected.teacherNotes && <><h4 className="font-semibold">Teacher notes · staff only</h4><p className="whitespace-pre-wrap break-words">{selected.teacherNotes}</p></>}
            {selected.answerKey && <><h4 className="font-semibold">Answer key · staff only</h4><p className="whitespace-pre-wrap break-words">{selected.answerKey}</p></>}
            <p>{selected.approvedAt ? `Approved ${new Date(selected.approvedAt).toLocaleString()}` : 'Not approved'}</p>
          </article>
          {!selected.approvedAt && <div className="space-y-3">
            <label className="flex gap-2 items-start"><input type="checkbox" checked={reviewed} disabled={busy || dirty} onChange={event => setReviewed(event.target.checked)} />
              <span>I reviewed this saved version for accuracy, age suitability, curriculum fit and original or licensed content. I approve it for use. Self-review is permitted.</span></label>
            {dirty && <p>Save or replace your unsaved edits before approving a saved version.</p>}
            <Button disabled={busy || dirty || !reviewed} onClick={() => { void mutate('approve'); }}>Approve version {selected.version}</Button>
          </div>}
          {selected.approvedAt && <>
            <a className="underline" href={`/resources/${encodeURIComponent(id)}/print?versionId=${encodeURIComponent(selected.id)}`}>Print approved version {selected.version}</a>
            <form className="space-y-3" onSubmit={event => { event.preventDefault(); void mutate('assign'); }}>
              <label className="block space-y-1"><span>Assign this approved version to a class</span><select required className={inputStyle} disabled={busy} value={classId} onChange={event => setClassId(event.target.value)}>
                <option value="">Select a class</option>{classes.map(item => <option key={item.id} value={item.id}>{item.name} · {item.term}</option>)}</select></label>
              <label className="block space-y-1"><span>Due date (optional)</span><input type="date" className={inputStyle} disabled={busy} value={dueDate} onChange={event => setDueDate(event.target.value)} /></label>
              {classes.length === 0 && <p>No classes are available to your account.</p>}
              <Button type="submit" disabled={busy || !classId}>Assign version {selected.version}</Button>
            </form>
          </>}
        </>}
      </section>
    </>}
  </main>;
}
