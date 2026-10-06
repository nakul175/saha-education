'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- full-page links preserve the tested vinext navigation behavior. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AppShell } from '@/components/app-shell';
import { isExactStoredTimestamp } from '@/lib/education/stored-timestamp';
import type { Class, Student, Principal } from '@/lib/education/types';

type ClassSnapshot = Class & { enrolledStudents: Student[] };
const scopeKey = (actor: Principal) => `${actor.id}:${actor.role}:${actor.schoolId ?? ''}`;
class ReadFailure extends Error { constructor(readonly status: number) { super('Class request unavailable'); } }
async function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { cache: 'no-store', signal });
  const body = await response.text();
  if (!response.ok) throw new ReadFailure(response.status);
  return JSON.parse(body) as T;
}
function StoredDate({ value }: { value: unknown }) { return isExactStoredTimestamp(value) ? <time dateTime={value}>{new Date(value).toLocaleDateString()}</time> : <span>Stored date requires review: {String(value ?? '')}</span>; }

export default function ClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [snapshot, setSnapshot] = useState<ClassSnapshot | null>(null);
  const [loadedFor, setLoadedFor] = useState<Promise<{ id: string }> | null>(null);
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0), controller = useRef<AbortController | null>(null), mounted = useRef(true), routeId = useRef('');
  const message = useRef<HTMLDivElement>(null);
  const invalidate = useCallback(() => { generation.current++; controller.current?.abort(); }, []);
  const reload = useCallback(async (id = routeId.current) => {
    if (!mounted.current || !id) return;
    const ticket = ++generation.current;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const current = () => mounted.current && ticket === generation.current && routeId.current === id && !abort.signal.aborted;
    setSnapshot(null); setPrincipal(null); setError(null); setLoading(true);
    try {
      const actor = await read<Principal>('/api/session', abort.signal);
      if (!current()) return;
      // The existing endpoint already scopes the class and each roster member in
      // one SQL statement. Separate child requests can mix accounts/snapshots.
      const saved = await read<ClassSnapshot>('/api/classes/' + encodeURIComponent(id), abort.signal);
      if (!current()) return;
      const verified = await read<Principal>('/api/session', abort.signal);
      if (!current()) return;
      if (!actor.id || scopeKey(actor) !== scopeKey(verified) || !saved || saved.id !== id || saved.schoolId !== actor.schoolId || !Array.isArray(saved.enrolledStudents) || saved.enrolledStudents.some(row => !row.id || row.schoolId !== saved.schoolId)) throw new Error('Unconfirmed class details');
      setSnapshot(saved); setPrincipal(actor);
    } catch (failure) {
      if (!current()) return;
      setSnapshot(null); setPrincipal(null);
      setError(failure instanceof ReadFailure && failure.status === 401 ? 'Sign in again, then reload this class.' : failure instanceof ReadFailure && [403, 404].includes(failure.status) ? 'This class is unavailable to your current account. Reload after access is restored.' : 'The current class and its available student profiles could not be verified. Reload to try again.');
    } finally { if (current()) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true; let active = true;
    invalidate(); routeId.current = '';
    void Promise.resolve().then(async () => {
      if (!active) return;
      setSnapshot(null); setPrincipal(null); setLoading(true); setError(null);
      try { const { id } = await params; if (!active) return; routeId.current = id; await reload(id); if (active) setLoadedFor(params); }
      catch { if (active) { setLoading(false); setError('This class could not be identified. Reopen the class from your current class list.'); } }
    });
    return () => { active = false; mounted.current = false; invalidate(); };
  }, [params, reload, invalidate]);
  useEffect(() => { if (error) message.current?.focus(); }, [error]);
  const visibleSnapshot = loadedFor === params ? snapshot : null;
  const visiblePrincipal = loadedFor === params ? principal : null;
  const staff = visiblePrincipal?.role === 'admin' || visiblePrincipal?.role === 'teacher';
  const profiles = visibleSnapshot ? [...new Map(visibleSnapshot.enrolledStudents.map(student => [student.id, student])).values()] : [];
  const repeatedRows = visibleSnapshot ? visibleSnapshot.enrolledStudents.length - profiles.length : 0;
  return <AppShell principal={visiblePrincipal}><div className="min-w-0 space-y-6">
    <header className="space-y-3"><h1 className="text-3xl font-bold break-words">{visibleSnapshot?.name ?? 'Class Details'}</h1><p className="text-muted-foreground">Class and student profiles currently available to your account.</p><Button type="button" variant="outline" onClick={() => void reload()} disabled={loading || loadedFor !== params}>Reload current class</Button></header>
    {loading && <p role="status">Loading current class details…</p>}
    {error && <div ref={message} tabIndex={-1} role="alert" className="space-y-2 rounded border p-3 break-words"><p>{error}</p><a href="/classes" className="underline">Open your current class list</a><p><a href="/login" target="_blank" rel="noreferrer" className="underline">Sign in in another tab</a> if needed, then reload.</p></div>}
    {visibleSnapshot && visiblePrincipal && <><div className="space-y-2">{staff ? <a href={'/classes/' + encodeURIComponent(visibleSnapshot.id) + '/attendance'} className="inline-block underline">Review attendance for this class</a> : <><a href="/attendance" className="inline-block underline">View attendance records</a><p className="text-sm text-muted-foreground break-words">Choose {visibleSnapshot.name} in the attendance class selector to view the records available to your account.</p></>}</div>
      <Card><CardHeader><CardTitle>Class Information</CardTitle></CardHeader><CardContent className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 [&>div]:min-w-0 [&>div]:break-words"><div><h2 className="font-semibold">Term</h2><p>{visibleSnapshot.term}</p></div><div><h2 className="font-semibold">Course ID</h2><p>{visibleSnapshot.courseId}</p></div><div><h2 className="font-semibold">Teacher ID</h2><p>{visibleSnapshot.teacherId}</p></div><div><h2 className="font-semibold">Schedule</h2><p>{visibleSnapshot.schedule || 'Not specified'}</p></div><div><h2 className="font-semibold">Created At</h2><p><StoredDate value={visibleSnapshot.createdAt} /></p></div><div><h2 className="font-semibold">Updated At</h2><p><StoredDate value={visibleSnapshot.updatedAt} /></p></div></CardContent></Card>
      <Card><CardHeader><CardTitle>Available student profiles ({profiles.length})</CardTitle></CardHeader><CardContent className="min-w-0 space-y-3"><p className="text-sm text-muted-foreground">This list reflects your current access. It does not imply that unavailable students have no enrolment.</p>{repeatedRows > 0 && <p role="status">The saved class record contains {repeatedRows} repeated profile entries. Each available profile is shown once; saved enrolment evidence is unchanged.</p>}{profiles.length === 0 ? <p>No student profiles are available in this class for your current account.</p> : <div className="overflow-x-auto rounded border" role="region" aria-label="Available class student profiles" tabIndex={0}><table className="w-full"><caption className="sr-only">Student profiles currently available in this class</caption><thead><tr className="border-b"><th scope="col" className="p-2 text-left">Name</th><th scope="col" className="p-2 text-left">Admission Number</th><th scope="col" className="p-2 text-left">Grade Level</th></tr></thead><tbody>{profiles.map(student => <tr key={student.id} data-class-profile-id={student.id} className="border-b"><td className="p-2 break-words">{student.firstName} {student.lastName}</td><td className="p-2 break-words">{student.admissionNumber}</td><td className="p-2"><Badge variant="secondary">{student.gradeLevel}</Badge></td></tr>)}</tbody></table></div>}</CardContent></Card>
    </>}
  </div></AppShell>;
}
