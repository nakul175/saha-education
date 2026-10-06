'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- vinext beta client Link transitions crash in this workspace; use full-page navigation. */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getPrincipal } from '@/lib/education/client-api';
import { RESOURCE_FIELDS, RESOURCE_TYPES, resourceTemplate } from '@/lib/education/resource-templates';
import type { ResourceContent, ResourceType, TeachingResource } from '@/lib/education/resource-types';

export default function ResourcesPage() {
  const [staff, setStaff] = useState(false);
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState<TeachingResource[]>([]);
  const [content, setContent] = useState<ResourceContent>(() => resourceTemplate('lesson'));
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const retry = useRef<{ payload: string; id: string } | null>(null);
  const inputStyle = 'border rounded p-2 w-full bg-background';
  async function loadResources() {
    const response = await fetch('/api/resources', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load your resources. Please try again.');
    setResources(await response.json());
  }
  useEffect(() => { let active = true; void (async () => {
    try {
      const principal = await getPrincipal();
      if (!active) return;
      if (!['admin', 'teacher'].includes(principal.role)) { setMessage('This workspace is available to school staff.'); return; }
      setStaff(true);
      const response = await fetch('/api/resources', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load your resources. Please try again.');
      const items: TeachingResource[] = await response.json();
      if (active) setResources(items);
    } catch (error) { if (active) setMessage(error instanceof Error ? error.message : 'Could not load resources.'); }
    finally { if (active) setLoading(false); }
  })(); return () => { active = false; }; }, []);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true); setMessage('');
    const payload = JSON.stringify(content);
    const id = retry.current?.payload === payload ? retry.current.id : crypto.randomUUID();
    retry.current = { payload, id };
    try {
      const response = await fetch('/api/resources', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, clientResourceId: id }) });
      if (!response.ok) {
        if (response.status === 401) { window.location.assign(new URL('/login', window.location.origin).href); return; }
        throw new Error(response.status === 409 ? 'This draft conflicts with an existing request. Keep your text and retry or reload the list.' : 'Could not save the draft. Check all fields and retry. Your text has been kept.');
      }
      retry.current = null;
      setContent(resourceTemplate(content.type));
      setMessage('Draft saved. Open it below to review, approve and assign a saved version.');
      try { await loadResources(); } catch { setMessage('Draft saved. Reload the list to find and review it.'); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save. Your text has been kept.'); }
    finally { savingRef.current = false; setSaving(false); }
  }
  return <main className="max-w-4xl mx-auto p-6 space-y-6">
    <a href="/">← Dashboard</a><h1 className="text-2xl font-bold">Teaching resources</h1>
    <p>Create original lessons, worksheets, quizzes and activities. These templates contain writing prompts for you to edit; they do not generate teaching content.</p>
    <p role="status" aria-live="polite">{loading ? 'Loading resources…' : message}</p>
    {staff && <>
      <section className="space-y-3" aria-labelledby="resource-list-title">
        <div className="flex items-center justify-between gap-3"><h2 id="resource-list-title" className="text-xl font-semibold">Your resources</h2>
          <Button variant="outline" onClick={() => { void loadResources().then(() => setMessage('List refreshed.')).catch(error => setMessage(error.message)); }}>Reload list</Button></div>
        {!loading && resources.length === 0 && <p>No saved resources yet.</p>}
        <ul className="space-y-2">{resources.map(resource => <li key={resource.id} className="border rounded p-3">
          <a href={`/resources/${encodeURIComponent(resource.id)}`} className="font-medium underline">{resource.latest.title}</a>
          <p>{resource.latest.type} · {resource.latest.gradeLevel} · {resource.latest.language} · Version {resource.latest.version} · {resource.latest.approvedAt ? 'Approved' : 'Draft'}</p>
        </li>)}</ul>
      </section>
      <section className="border rounded p-4 space-y-4" aria-labelledby="create-resource-title">
        <h2 id="create-resource-title" className="text-xl font-semibold">Create a draft</h2>
        <label className="block space-y-1"><span>Start with a template</span>
          <select className={inputStyle} value={content.type} disabled={saving} onChange={event => {
            const type = event.target.value as ResourceType;
            if (content.body !== resourceTemplate(content.type).body && !window.confirm('Replace your edited student material with the new template outline? The other fields will be kept.')) return;
            setContent(previous => ({ ...previous, type, body: resourceTemplate(type).body }));
          }}>{RESOURCE_TYPES.map(type => <option value={type} key={type}>{type}</option>)}</select>
        </label>
        <p className="text-sm text-muted-foreground">Changing the template replaces the student-material outline. Enter your local curriculum; no alignment is implied.</p>
        <form onSubmit={create} className="space-y-4">
          <fieldset disabled={saving} className="space-y-4">{RESOURCE_FIELDS.map(field => <label key={field.key} className="block space-y-1">
            <span>{field.label}{field.required ? ' *' : ''}</span>
            {field.multiline ? <textarea className={inputStyle} rows={field.key === 'body' ? 10 : 4} required={field.required} maxLength={field.maxLength} value={content[field.key]}
              onChange={event => setContent(previous => ({ ...previous, [field.key]: event.target.value }))} /> :
              <input className={inputStyle} pattern={field.pattern} required={field.required} maxLength={field.maxLength} value={content[field.key]} onChange={event => setContent(previous => ({ ...previous, [field.key]: event.target.value }))} />}
          </label>)}</fieldset>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save draft'}</Button>
        </form>
      </section>
    </>}
  </main>;
}
