'use client';

// vinext beta client Link transitions crash in this workspace; use full-page navigation.
import { Suspense, use, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { getPrincipal } from '@/lib/education/client-api';
import type { ResourceVersion } from '@/lib/education/resource-types';

function PrintResource({ id }: { id: string }) {
  const query = useSearchParams();
  const versionId = query.get('versionId');
  return <PrintVersion key={`${id}:${versionId}`} id={id} versionId={versionId} />;
}

function PrintVersion({ id, versionId }: { id: string; versionId: string | null }) {
  const [version, setVersion] = useState<ResourceVersion | null>(null);
  const [teacherEdition, setTeacherEdition] = useState(false);
  const [message, setMessage] = useState('Loading approved version…');
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await Promise.resolve();
        if (!versionId) throw new Error('Choose an approved saved version from the resource workspace before printing.');
        const principal = await getPrincipal();
        if (!['teacher', 'admin'].includes(principal.role)) throw new Error('Printing from this workspace is available to school staff.');
        const response = await fetch(`/api/resources/${encodeURIComponent(id)}/versions`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Could not load the saved version.');
        const versions: ResourceVersion[] = await response.json();
        const exact = versions.find(item => item.id === versionId && item.resourceId === id);
        if (!exact?.approvedAt) throw new Error('This exact saved version is unavailable or has not been approved.');
        if (active) { setVersion(exact); setMessage(''); }
      } catch (error) { if (active) setMessage(error instanceof Error ? error.message : 'Could not prepare print view.'); }
    })();
    return () => { active = false; };
  }, [id, versionId]);
  return <main className="max-w-3xl mx-auto p-6 space-y-6">
    <div className="resource-print-controls space-y-3">
      <a href={`/resources/${encodeURIComponent(id)}`}>← Resource workspace</a>
      <h1 className="text-2xl font-bold">Print an approved resource</h1>
      <p role="status">{message}</p>
      {version && <>
        <label className="flex gap-2 items-start"><input type="checkbox" checked={teacherEdition} onChange={event => setTeacherEdition(event.target.checked)} />
          <span>Teacher edition: include teacher notes and answer key</span></label>
        <p>The student edition excludes teacher notes and answers. The selected saved version stays unchanged.</p>
        <Button onClick={() => window.print()}>Print {teacherEdition ? 'teacher' : 'student'} edition</Button>
      </>}
    </div>
    {version && <article className="resource-print-sheet space-y-4 text-black bg-white p-4" lang={version.language}>
      <h2 className="text-2xl font-bold">{version.title}</h2>
      {teacherEdition && <p className="font-bold border p-2">Teacher edition · contains staff notes and answers</p>}
      <p>{version.curriculum} · {version.gradeLevel} · {version.subject} · {version.language}</p>
      <p className="text-sm">{version.type} · Approved version {version.version}</p>
      <section><h3 className="font-semibold">Learning objectives</h3><p className="whitespace-pre-wrap break-words">{version.objectives}</p></section>
      <section><h3 className="font-semibold">Student material</h3><p className="whitespace-pre-wrap break-words">{version.body}</p></section>
      {teacherEdition && version.teacherNotes && <section><h3 className="font-semibold">Teacher notes</h3><p className="whitespace-pre-wrap break-words">{version.teacherNotes}</p></section>}
      {teacherEdition && version.answerKey && <section><h3 className="font-semibold">Answer key</h3><p className="whitespace-pre-wrap break-words">{version.answerKey}</p></section>}
    </article>}
    <style>{`@media print {
      body * { visibility: hidden; }
      .resource-print-sheet, .resource-print-sheet * { visibility: visible; }
      .resource-print-sheet { position: absolute; inset: 0; padding: 1cm; }
      .resource-print-controls { display: none; }
      .resource-print-sheet section { break-inside: auto; }
    }`}</style>
  </main>;
}
export default function ResourcePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense fallback={<p>Loading print view…</p>}><PrintResource id={id} /></Suspense>;
}
