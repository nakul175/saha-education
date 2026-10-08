'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- vinext beta client Link transitions crash in this workspace; use full-page navigation. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ResourceAssignment } from '@/lib/education/resource-types';
import type { Class, Principal, Role } from '@/lib/education/types';

class LearningResponseError extends Error {
  constructor(readonly status: number) { super('Assigned learning could not load.'); }
}
async function readJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { cache: 'no-store', signal });
  const body = await response.text();
  if (!response.ok) throw new LearningResponseError(response.status);
  return JSON.parse(body) as T;
}
export default function LearningPage() {
  const [role, setRole] = useState<Role | null>(null);
  const [assignments, setAssignments] = useState<ResourceAssignment[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const controller = useRef<{ active: AbortController | null }>({ active: null });
  const generation = useRef({ value: 0 });
  const reload = useCallback(async () => {
    controller.current.active?.abort();
    const current = new AbortController(), sequence = ++generation.current.value;
    controller.current.active = current;
    setLoading(true); setMessage(''); setRole(null); setAssignments([]); setClasses([]);
    const active = () => !current.signal.aborted && generation.current.value === sequence;
    try {
      const principal = await readJson<Principal>('/api/session', current.signal);
      if (!active()) return;
      if (principal.role === 'guardian') {
        setRole('guardian'); setMessage('Assigned learning is currently available to students and school staff. Guardian access is not supported yet.'); return;
      }
      const items = await readJson<ResourceAssignment[]>('/api/resource-assignments', current.signal);
      if (!active()) return;
      if (!Array.isArray(items)) throw new Error('Unconfirmed assignment list.');
      let names: Class[] = [];
      try {
        const availableClasses = await readJson<Class[]>('/api/classes', current.signal);
        if (Array.isArray(availableClasses)) names = availableClasses;
      } catch (caught) {
        if (caught instanceof LearningResponseError && [401, 403, 404].includes(caught.status)) throw caught;
        // A temporary label failure must not hide an authorized accepted feed.
      }
      if (!active()) return;
      setRole(principal.role); setAssignments(items); setClasses(names);
    } catch (caught) {
      if (!active()) return;
      setRole(null); setAssignments([]); setClasses([]);
      if (caught instanceof LearningResponseError && caught.status === 401) {
        window.location.assign(new URL('/login', window.location.origin).href); setMessage('Please sign in again.');
      } else if (caught instanceof LearningResponseError && [403, 404].includes(caught.status)) {
        setMessage('Assigned learning is unavailable to your current account. Reload after your access is restored.');
      } else setMessage('Could not load assigned learning. Reload to try again.');
    } finally { if (active()) setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    const counter = generation.current, reads = controller.current;
    void Promise.resolve().then(() => { if (active) void reload(); });
    return () => { active = false; counter.value++; reads.active?.abort(); };
  }, [reload]);
  return <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6 break-words">
    <nav className="flex flex-wrap gap-4" aria-label="Workspace navigation"><a className="underline" href="/">← Dashboard</a><a className="underline" href="/submissions">Submission status and feedback</a></nav><h1 className="text-2xl font-bold">Assigned learning</h1>
    <p role="status" aria-live="polite">{loading ? 'Loading assigned learning…' : message}</p>
    <Button variant="outline" disabled={loading} onClick={() => { void reload(); }}>Reload assignments</Button>
    {role && role !== 'guardian' && <>
      <p>Open an assignment to read the approved material for your class.</p>
      {['admin', 'teacher'].includes(role) && <p>This is a student-edition preview. Teacher notes and answer keys are excluded.</p>}
      {!loading && !message && assignments.length === 0 && <p>No approved learning resources have been assigned to your classes yet.</p>}
      <div className="space-y-4">{assignments.map(assignment => <details key={assignment.id} className="border rounded p-4 min-w-0">
        <summary className="cursor-pointer font-semibold break-words">{assignment.resource.title} · {classes.find(item => item.id === assignment.classId)?.name ?? 'Assigned class'}{assignment.dueDate ? ` · Due ${assignment.dueDate}` : ''}</summary>
        <article className="space-y-3 mt-4 min-w-0" lang={assignment.resource.language}>
          <p>{assignment.resource.type} · {assignment.resource.gradeLevel} · {assignment.resource.subject} · {assignment.resource.language} · Version {assignment.resource.version}</p>
          <p>Curriculum: {assignment.resource.curriculum}</p>
          <h2 className="font-semibold">Learning objectives</h2><p className="whitespace-pre-wrap break-words">{assignment.resource.objectives}</p>
          <h2 className="font-semibold">Student material</h2><p className="whitespace-pre-wrap break-words">{assignment.resource.body}</p>
          <a className="underline break-words" href={`/assignments/${encodeURIComponent(assignment.id)}`}>{role === 'student' ? 'Submit a response and view reviewed feedback' : 'Review student responses and formative feedback'}</a>
        </article>
      </details>)}</div>
    </>}
  </div>;
}
