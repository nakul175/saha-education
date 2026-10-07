'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- native navigation avoids the observed client transition failure. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { isExactCalendarDate } from '@/lib/education/calendar-date';
import type { Assessment, Class, Principal } from '@/lib/education/types';

type ListedAssessment = Omit<Assessment, 'maxScore' | 'date'> & { maxScore: unknown; date: unknown };
const scopeKey = (actor: Principal) => `${actor.id}:${actor.role}:${actor.schoolId ?? ''}`;
const isPrincipal = (value: unknown): value is Principal => !!value && typeof value === 'object' && 'id' in value && typeof value.id === 'string'
  && !!value.id && 'role' in value && ['admin', 'teacher', 'guardian', 'student'].includes(String(value.role))
  && 'schoolId' in value && typeof value.schoolId === 'string' && !!value.schoolId;
class ListResponseError extends Error { constructor(readonly status: number) { super('Assessment list unavailable'); } }
class ListDataError extends Error {}
async function read(response: Response): Promise<unknown> {
  const body = await response.text();
  if (!response.ok) throw new ListResponseError(response.status);
  return JSON.parse(body);
}

export default function AssessmentsPage() {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [assessments, setAssessments] = useState<ListedAssessment[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0), controller = useRef<AbortController | null>(null), mounted = useRef(true);
  const invalidate = useCallback(() => { generation.current++; controller.current?.abort(); }, []);
  const reload = useCallback(async () => {
    const version = ++generation.current;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const current = () => mounted.current && generation.current === version;
    setLoading(true); setError(null); setPrincipal(null); setClasses([]); setAssessments([]); setSelectedClassId('');
    try {
      const actor = await read(await fetch('/api/session', { cache: 'no-store', signal: abort.signal }));
      if (!current()) return;
      if (!isPrincipal(actor)) throw new Error('Current account unavailable');
      const classRows = await read(await fetch('/api/classes', { cache: 'no-store', signal: abort.signal }));
      if (!current()) return;
      const assessmentRows = await read(await fetch('/api/assessments', { cache: 'no-store', signal: abort.signal }));
      if (!current()) return;
      const verified = await read(await fetch('/api/session', { cache: 'no-store', signal: abort.signal }));
      if (!current()) return;
      if (!isPrincipal(verified) || scopeKey(actor) !== scopeKey(verified)) throw new ListResponseError(403);
      if (!Array.isArray(classRows) || classRows.some(row => !row || typeof row.id !== 'string' || typeof row.name !== 'string') || new Set(classRows.map(row => row.id)).size !== classRows.length
        || !Array.isArray(assessmentRows) || assessmentRows.some(row => !row || typeof row.id !== 'string' || !row.id || typeof row.classId !== 'string' || typeof row.title !== 'string' || typeof row.kind !== 'string')
        || new Set(assessmentRows.map(row => row.id)).size !== assessmentRows.length) throw new ListDataError('The returned class or assessment list contains duplicated or incomplete rows. Reload and ask a school administrator to review it if the problem persists.');
      setPrincipal(actor); setClasses(classRows); setAssessments(assessmentRows);
    } catch (cause) {
      if (!current() || abort.signal.aborted) return;
      setPrincipal(null); setClasses([]); setAssessments([]);
      if (cause instanceof ListResponseError && cause.status === 401) { setError('Sign in to reload assessments.'); window.location.assign(new URL('/login', window.location.origin).href); }
      else if (cause instanceof ListResponseError && [403, 404].includes(cause.status)) setError('Assessments are unavailable to your current account. Reload after access is restored.');
      else if (cause instanceof ListDataError) setError(cause.message);
      else setError('Could not reload current assessments. Try reloading again.');
    } finally { if (current()) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    return () => { mounted.current = false; invalidate(); };
  }, [reload, invalidate]);
  const staff = principal?.role === 'admin' || principal?.role === 'teacher';
  const filtered = selectedClassId ? assessments.filter(row => row.classId === selectedClassId) : assessments;
  return <AppShell principal={principal}><div className="mx-auto max-w-6xl min-w-0 space-y-6 p-4">
    <h1 className="text-2xl font-bold">Assessments</h1>
    <p>{staff ? 'View current assessments and review saved results for your authorised classes.' : principal ? 'View assessment details for your current classes. Individual assessment results are private staff records.' : 'Reload to view assessments available to your current account.'}</p>
    <div className="flex flex-wrap items-center gap-4"><a href="/" className="underline">Return to dashboard</a>{staff && <a href="/assessments/manage" className="underline">Manage and publish assessments</a>}{principal && <a href="/report-cards" className="underline">{staff ? 'Report cards' : 'Published report cards'}</a>}<Button type="button" variant="outline" onClick={() => void reload()}>Reload assessments</Button></div>
    {loading && <p role="status">Loading current assessments…</p>}
    {error && <p role="alert" className="break-words text-red-600">{error}</p>}
    {!loading && !error && principal && <Card><CardHeader><CardTitle>Assessment List</CardTitle><CardDescription>Filter the current list available to your account. Dates are stored calendar days.</CardDescription></CardHeader><CardContent className="min-w-0 space-y-4">
      <Label htmlFor="class-filter">Filter by Class</Label><select id="class-filter" value={selectedClassId} onChange={event => setSelectedClassId(event.target.value)} className="w-full min-w-0 rounded border bg-background px-3 py-2 sm:w-64"><option value="">All available classes</option>{classes.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
      <p role="status">Showing {filtered.length} of {assessments.length} assessments in the current authorised list.</p>
      <div className="min-w-0 overflow-x-auto rounded border" tabIndex={0} role="region" aria-label="Assessment metadata"><Table><TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Class</TableHead><TableHead>Type</TableHead><TableHead>Max Score</TableHead><TableHead>Date</TableHead></TableRow></TableHeader><TableBody>
        {filtered.length === 0 ? <TableRow><TableCell colSpan={5}>No assessments are available for this selection.</TableCell></TableRow> : filtered.map(row => <TableRow key={row.id} data-assessment-list-item={row.id}>
          <TableCell className="max-w-64 whitespace-normal break-words">{staff ? <a className="font-medium underline" href={'/assessments/' + encodeURIComponent(row.id)}>{row.title}</a> : <span className="font-medium">{row.title}</span>}</TableCell>
          <TableCell className="max-w-64 whitespace-normal break-words">{classes.find(cls => cls.id === row.classId)?.name ?? 'Current class label unavailable'}</TableCell><TableCell>{row.kind}</TableCell>
          <TableCell className="max-w-64 whitespace-normal break-words">{typeof row.maxScore === 'number' && Number.isSafeInteger(row.maxScore) && row.maxScore >= 0 ? row.maxScore : <span role="status">Stored maximum requires review.</span>}</TableCell>
          <TableCell className="max-w-64 whitespace-normal break-words">{isExactCalendarDate(row.date) ? <time dateTime={row.date}>{row.date}</time> : <span role="status">Stored date requires review: {String(row.date ?? '')}</span>}</TableCell>
        </TableRow>)}
      </TableBody></Table></div>
      {!staff && <p>Published report cards provide the school-supplied information currently available to families. This list does not publish assessment scores, grades or feedback.</p>}
    </CardContent></Card>}
  </div></AppShell>;
}
