'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- full-page links avoid the observed vinext beta transition failure. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { END_LABELS, STATUS_LABELS, formatDay, formatMoment, readFailureMessage, readJson } from '@/lib/education/academic-lifecycle-client';
import type { StudentHistory } from '@/lib/education/academic-lifecycle-types';
import type { Principal, Student } from '@/lib/education/types';

export default function EnrolmentHistoryPage() {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [learners, setLearners] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState('');
  const [history, setHistory] = useState<StudentHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const generation = useRef(0), mounted = useRef(true), historyTicket = useRef(0), controller = useRef<AbortController | null>(null);
  const invalidate = useCallback(() => { generation.current++; historyTicket.current++; controller.current?.abort(); }, []);
  const loadHistory = useCallback(async (id: string) => {
    const ticket = ++historyTicket.current; const current = () => mounted.current && ticket === historyTicket.current;
    setHistory(null); setHistoryError(null);
    if (!id) { setLoadingHistory(false); return; }
    setLoadingHistory(true);
    try {
      const result = await readJson<StudentHistory>('/api/enrolments/history?studentId=' + encodeURIComponent(id));
      if (current()) setHistory(result);
    } catch (failure) { if (current()) setHistoryError(readFailureMessage(failure, 'This learner’s enrolment history')); }
    finally { if (current()) setLoadingHistory(false); }
  }, []);
  const reload = useCallback(async () => {
    const ticket = ++generation.current;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const current = () => mounted.current && ticket === generation.current && !abort.signal.aborted;
    setLoading(true); setError(null); setPrincipal(null); setLearners([]); setStudentId(''); setHistory(null);
    try {
      const actor = await readJson<Principal>('/api/session', abort.signal);
      const rows = await readJson<Student[]>('/api/students', abort.signal);
      const verified = await readJson<Principal>('/api/session', abort.signal);
      if (!current()) return;
      if (!actor.id || actor.id !== verified.id || actor.role !== verified.role) throw new Error('Unconfirmed account');
      setPrincipal(actor); setLearners(rows);
      if (rows.length === 1) { setStudentId(rows[0].id); void loadHistory(rows[0].id); }
    } catch (failure) { if (current()) setError(readFailureMessage(failure, 'Enrolment history')); }
    finally { if (current()) setLoading(false); }
  }, [loadHistory]);
  useEffect(() => {
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    return () => { mounted.current = false; invalidate(); };
  }, [reload, invalidate]);
  const staff = principal?.role === 'admin' || principal?.role === 'teacher';
  return <AppShell principal={principal}><div className="mx-auto max-w-4xl min-w-0 space-y-6 p-4">
    <div><a href="/" className="text-sm underline">Dashboard</a><h1 className="text-2xl font-bold">Enrolment history</h1>
      <p className="text-muted-foreground">{staff ? 'The classes a learner is or was enrolled in, with dates and recorded changes.' : 'The classes your learner is or was enrolled in, with dates.'}</p></div>
    <Button type="button" variant="outline" onClick={() => void reload()} disabled={loading}>Reload enrolment history</Button>
    {loading && <p role="status">Loading learners…</p>}
    {error && <p role="alert" className="rounded border p-3">{error}</p>}
    {principal && !error && <>
      {learners.length === 0 ? <p role="status">No learner is available to your account.</p> : learners.length > 1 && <div><Label htmlFor="history-learner">Learner</Label>
        <select id="history-learner" className="h-11 w-full rounded border bg-white px-3" value={studentId} onChange={event => { setStudentId(event.target.value); void loadHistory(event.target.value); }}>
          <option value="">Choose a learner</option>{learners.map(row => <option key={row.id} value={row.id}>{row.firstName} {row.lastName} · {row.admissionNumber}</option>)}</select></div>}
      {loadingHistory && <p role="status">Loading enrolment history…</p>}
      {historyError && <p role="alert" className="rounded border p-3">{historyError}</p>}
      {history && <>
        <Card><CardHeader><CardTitle>Classes for {history.student.name}</CardTitle></CardHeader><CardContent>
          {history.enrolments.length === 0 ? <p>{staff ? 'No enrolment is available for this learner in your classes.' : 'No enrolment has been recorded for this learner.'}</p> : <ul className="space-y-3">{history.enrolments.map(row => <li key={row.enrolmentId} className="rounded border p-3 break-words">
            <div className="flex flex-wrap items-center gap-2"><h2 className="font-medium">{row.className}</h2><Badge variant={row.status === 'active' ? 'secondary' : 'outline'}>{STATUS_LABELS[row.status] ?? row.status}</Badge></div>
            <p>{row.courseTitle ?? 'Course'} · Term {row.term}</p>
            <p>Started {formatDay(row.startedOn)}{row.endedOn ? ` · Ended ${formatDay(row.endedOn)}${row.endKind ? ` (${END_LABELS[row.endKind] ?? row.endKind})` : ''}` : ''}</p></li>)}</ul>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Recorded changes</CardTitle></CardHeader><CardContent>
          {history.events.length === 0 ? <p>No enrolment change has been recorded through the reviewed process for this learner.</p> : <ol className="space-y-3">{history.events.map(item => <li key={item.id} className="rounded border p-3 break-words">
            <p className="font-medium">{item.label}</p><p className="text-sm text-muted-foreground">Recorded {formatMoment(item.createdAt)}{item.actorName ? ` · ${item.actorName}` : ''}</p>{item.reason && <p>Reason: {item.reason}</p>}</li>)}</ol>}
          {history.truncated && <p className="mt-2 text-sm text-muted-foreground">Only the latest {history.limit} entries are shown.</p>}
        </CardContent></Card>
      </>}
    </>}
  </div></AppShell>;
}
