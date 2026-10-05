'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- vinext beta client Link transitions crash in this workspace; use full-page navigation. */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getPrincipal } from '@/lib/education/client-api';
import type { ResourceAssignment } from '@/lib/education/resource-types';
import type { Class, Role } from '@/lib/education/types';

export default function LearningPage() {
  const [role, setRole] = useState<Role | null>(null);
  const [assignments, setAssignments] = useState<ResourceAssignment[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  useEffect(() => { let active = true; void (async () => {
    try {
      const principal = await getPrincipal();
      if (!active) return;
      setRole(principal.role);
      if (principal.role === 'guardian') { setMessage('Assigned learning is currently available to students and school staff. Guardian access is not supported yet.'); return; }
      const response = await fetch('/api/resource-assignments', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load assigned learning. Please try again.');
      const items: ResourceAssignment[] = await response.json();
      if (active) setAssignments(items);
      try {
        const classResponse = await fetch('/api/classes', { cache: 'no-store' });
        if (classResponse.ok) { const roster: Class[] = await classResponse.json(); if (active) setClasses(roster); }
      } catch { /* A roster label failure must not hide an accepted assignment. */ }
    } catch (error) { if (active) setMessage(error instanceof Error ? error.message : 'Could not load assigned learning.'); }
    finally { if (active) setLoading(false); }
  })(); return () => { active = false; }; }, []);
  async function reload() {
    setLoading(true); setMessage('');
    try {
      const response = await fetch('/api/resource-assignments', { cache: 'no-store' });
      if (response.status === 401) { window.location.assign(new URL('/login', window.location.origin).href); return; }
      if (!response.ok) throw new Error('Could not load assigned learning. Please try again.');
      setAssignments(await response.json());
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load assigned learning.'); }
    finally { setLoading(false); }
  }
  return <main className="max-w-4xl mx-auto p-6 space-y-6">
    <a href="/">← Dashboard</a><h1 className="text-2xl font-bold">Assigned learning</h1>
    <p role="status" aria-live="polite">{loading ? 'Loading assigned learning…' : message}</p>
    {role && role !== 'guardian' && <>
      <p>Open an assignment to read the approved material for your class.</p>
      {['admin', 'teacher'].includes(role) && <p>This is a student-edition preview. Teacher notes and answer keys are excluded.</p>}
      <Button variant="outline" disabled={loading} onClick={() => { void reload(); }}>Reload assignments</Button>
      {!loading && !message && assignments.length === 0 && <p>No approved learning resources have been assigned to your classes yet.</p>}
      <div className="space-y-4">{assignments.map(assignment => <details key={assignment.id} className="border rounded p-4">
        <summary className="cursor-pointer font-semibold">{assignment.resource.title} · {classes.find(item => item.id === assignment.classId)?.name ?? 'Assigned class'}{assignment.dueDate ? ` · Due ${assignment.dueDate}` : ''}</summary>
        <article className="space-y-3 mt-4" lang={assignment.resource.language}>
          <p>{assignment.resource.type} · {assignment.resource.gradeLevel} · {assignment.resource.subject} · {assignment.resource.language} · Version {assignment.resource.version}</p>
          <p>Curriculum: {assignment.resource.curriculum}</p>
          <h2 className="font-semibold">Learning objectives</h2><p className="whitespace-pre-wrap break-words">{assignment.resource.objectives}</p>
          <h2 className="font-semibold">Student material</h2><p className="whitespace-pre-wrap break-words">{assignment.resource.body}</p>
          <a className="underline" href={`/assignments/${encodeURIComponent(assignment.id)}`}>{role === 'student' ? 'Submit a response and view reviewed feedback' : 'Review student responses and formative feedback'}</a>
        </article>
      </details>)}</div>
    </>}
  </main>;
}
