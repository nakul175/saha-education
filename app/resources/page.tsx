'use client';

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
  function field(key: typeof RESOURCE_FIELDS[number]['key']) {
    const spec = RESOURCE_FIELDS.find(item => item.key === key)!;
    const labels = { objectives: 'What will students learn?', body: 'Student material', title: 'Resource title' };
    return <label key={key} className="saha-field"><span>{labels[key as keyof typeof labels] || spec.label}{spec.required ? ' *' : ''}</span>
      {spec.multiline ? <textarea className={inputStyle} rows={key === 'body' ? 10 : 4} required={spec.required} maxLength={spec.maxLength} value={content[key]} onChange={event => setContent(previous => ({ ...previous, [key]: event.target.value }))} /> :
      <input className={inputStyle} pattern={spec.pattern} required={spec.required} maxLength={spec.maxLength} value={content[key]} placeholder={key === 'language' ? 'For example, en-IN or hi-IN' : undefined} onChange={event => setContent(previous => ({ ...previous, [key]: event.target.value }))} />}
      {key === 'language' && <span className="saha-field-hint">Use your teaching language tag, such as en-IN for English or hi-IN for Hindi.</span>}
    </label>;
  }
  return <div className="space-y-6">
    <header className="saha-page-header"><div><p className="saha-eyebrow">Teaching workspace</p><h1>Teaching resources</h1><p className="saha-page-intro">Create original lessons, worksheets, quizzes and activities. Start with a clear learning goal, then prepare the material your students will use.</p></div></header>
    <p role="status" aria-live="polite">{loading ? 'Loading resources…' : message}</p>
    {staff && <>
      <section className="saha-workspace-panel" aria-labelledby="resource-list-title">
        <div className="saha-panel-heading"><h2 id="resource-list-title">Your resources</h2><Button variant="outline" onClick={() => { void loadResources().then(() => setMessage('List refreshed.')).catch(error => setMessage(error.message)); }}>Reload list</Button></div>
        {!loading && resources.length === 0 && <p className="saha-coverage-note">No saved resources yet. Create your first draft below.</p>}
        <ul>{resources.map(resource => <li key={resource.id} className="saha-resource-summary"><div><a href={`/resources/${encodeURIComponent(resource.id)}`}>{resource.latest.title}</a><p>{resource.latest.type} · {resource.latest.gradeLevel} · {resource.latest.language} · Version {resource.latest.version}</p></div><span className="saha-quiet-label">{resource.latest.approvedAt ? 'Approved' : 'Draft'}</span></li>)}</ul>
      </section>
      <section className="saha-workspace-panel" aria-labelledby="create-resource-title">
        <div className="saha-panel-heading"><h2 id="create-resource-title">Create a draft</h2><span>Manual planning · not AI generated</span></div>
        <div className="px-6 pb-5"><label className="saha-field"><span>Start with a template</span><select className={inputStyle} value={content.type} disabled={saving} onChange={event => {
          const type = event.target.value as ResourceType;
          if (content.body !== resourceTemplate(content.type).body && !window.confirm('Replace your edited student material with the new template outline? The other fields will be kept.')) return;
          setContent(previous => ({ ...previous, type, body: resourceTemplate(type).body }));
        }}>{RESOURCE_TYPES.map(type => <option value={type} key={type}>{type}</option>)}</select></label><p className="saha-field-hint mt-2">Templates provide writing prompts for you to edit. Changing the template replaces the student-material outline. No curriculum alignment is implied.</p></div>
        <form onSubmit={create} className="saha-resource-form">
          <fieldset disabled={saving} className="space-y-6"><section className="space-y-4"><div><p className="saha-eyebrow">Plan</p><h3>The purpose of this resource</h3></div><div className="saha-field-grid">{(['title', 'gradeLevel', 'subject', 'language', 'curriculum', 'objectives'] as const).map(field)}</div></section>
            <section className="space-y-4"><div><p className="saha-eyebrow">Prepare</p><h3>What students will see</h3><p className="saha-field-hint">Clear instructions and material for the student edition.</p></div>{field('body')}</section>
            <details className="saha-role-guide"><summary>Teacher notes and answer key · staff only</summary><div className="space-y-4">{field('teacherNotes')}{field('answerKey')}</div></details>
          </fieldset>
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="saha-field-hint">Save a private draft, then review its saved version before assigning it.</p><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save draft'}</Button></div>
        </form>
      </section>
    </>}
  </div>;
}
