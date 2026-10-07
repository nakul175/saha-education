'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Principal } from '@/lib/education/types';
import type { StudentAttendanceReport } from '@/lib/education/attendance-reports';
import { AttendanceReadFailure, isCalendarDate, rangeQuery, readAttendanceJson, statusLabel } from '@/lib/education/attendance-client';

const statuses = ['present', 'absent', 'late', 'excused', 'other'] as const;

export default function LearnerAttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [studentId, setStudentId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [report, setReport] = useState<StudentAttendanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0), controller = useRef<AbortController | null>(null);
  const message = useRef<HTMLDivElement>(null);
  const staff = principal?.role === 'admin' || principal?.role === 'teacher';

  const load = useCallback(async (id: string, rangeFrom: string, rangeTo: string) => {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const ticket = ++generation.current;
    setLoading(true); setError(null); setReport(null);
    if ((rangeFrom && !isCalendarDate(rangeFrom)) || (rangeTo && !isCalendarDate(rangeTo))) { setError('Enter each date as a real calendar date.'); setLoading(false); return; }
    if (rangeFrom && rangeTo && rangeFrom > rangeTo) { setError('The start date cannot be after the end date.'); setLoading(false); return; }
    try {
      const value = await readAttendanceJson<StudentAttendanceReport>('/api/students/' + encodeURIComponent(id) + '/attendance' + rangeQuery(rangeFrom, rangeTo), abort.signal);
      if (ticket !== generation.current) return;
      if (value.student.id !== id) throw new AttendanceReadFailure('The record did not match this learner. Reload the page.', 500);
      setReport(value);
    } catch (failure) {
      if (ticket !== generation.current || abort.signal.aborted) return;
      setReport(null); setError(failure instanceof Error ? failure.message : 'Attendance could not be loaded.');
    } finally { if (ticket === generation.current) setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      await Promise.resolve();
      try {
        const { id } = await params;
        const account = await readAttendanceJson<Principal>('/api/session');
        if (!active) return;
        setPrincipal(account); setStudentId(id);
        await load(id, '', '');
      } catch (failure) { if (active) { setError(failure instanceof Error ? failure.message : 'Attendance could not be loaded.'); setLoading(false); } }
    })();
    const counter = generation, running = controller;
    return () => { active = false; counter.current++; running.current?.abort(); };
  }, [params, load]);
  useEffect(() => { if (error) message.current?.focus(); }, [error]);

  const marked = report ? report.totals.recordedRows : 0;
  const attended = report ? report.totals.present + report.totals.late : 0;
  return <AppShell principal={principal}>
    <div className="mx-auto min-w-0 max-w-5xl space-y-6 p-4">
      <div className="space-y-2 break-words">
        <a href="/attendance" className="underline">Attendance records</a>
        <h1>Learner attendance</h1>
        {report && <p className="text-lg font-semibold" data-learner-name>{report.student.firstName} {report.student.lastName}</p>}
        {report && <p className="text-sm text-muted-foreground">Admission number: {report.student.admissionNumber}</p>}
        <p className="text-sm text-muted-foreground">These are the marks teachers saved for the classes your account can see. A date with no mark is not shown, and no percentage is calculated.</p>
      </div>
      {error && <div ref={message} tabIndex={-1} role="alert" className="rounded border border-destructive p-3 break-words">{error}</div>}
      {principal && <form className="flex min-w-0 flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); void load(studentId, from, to); }}>
        <div><Label htmlFor="learner-from">From date</Label><Input id="learner-from" type="date" value={from} onChange={event => setFrom(event.target.value)} className="max-w-full" /></div>
        <div><Label htmlFor="learner-to">To date</Label><Input id="learner-to" type="date" value={to} onChange={event => setTo(event.target.value)} className="max-w-full" /></div>
        <Button type="submit" disabled={loading || !studentId}>Show attendance</Button>
        <Button type="button" variant="outline" disabled={loading || !studentId || (!from && !to)} onClick={() => { setFrom(''); setTo(''); void load(studentId, '', ''); }}>All saved dates</Button>
      </form>}
      {loading && <p role="status">Loading attendance…</p>}
      {report && !loading && <div className="space-y-6" data-learner-attendance>
        <section aria-labelledby="learner-totals" className="space-y-3">
          <h2 id="learner-totals" className="text-xl font-semibold">Totals for {report.range.from || report.range.to ? (report.range.from ?? 'the first saved date') + ' to ' + (report.range.to ?? 'the last saved date') : 'all saved dates'}</h2>
          {marked === 0 ? <p>No attendance has been saved for this learner in these dates.</p> : <>
            <p>Present or late on {attended} of {marked} saved {marked === 1 ? 'mark' : 'marks'}.</p>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">{statuses.map(status => <div key={status} className="rounded border p-3"><dt className="text-sm text-muted-foreground">{statusLabel(status)}</dt><dd className="text-2xl font-semibold" data-total={status}>{report.totals[status]}</dd></div>)}</dl></>}
          {report.invalidDateRows > 0 && <p role="status">{report.invalidDateRows} saved {report.invalidDateRows === 1 ? 'mark has' : 'marks have'} a date that is not a real calendar date. {report.range.from || report.range.to ? 'Those marks are left out when dates are chosen.' : 'They are shown below without being changed.'}</p>}
          {report.classes.length > 1 && <ul className="list-disc space-y-1 pl-5 text-sm">{report.classes.map(item => <li key={item.id}>{item.name}: {item.recordedRows} saved {item.recordedRows === 1 ? 'mark' : 'marks'} ({item.present} present, {item.absent} absent, {item.late} late, {item.excused} excused{item.other ? ', ' + item.other + ' other' : ''})</li>)}</ul>}
        </section>
        <section aria-labelledby="learner-days" className="space-y-3">
          <h2 id="learner-days" className="text-xl font-semibold">Day by day</h2>
          {report.records.truncated && <p role="status">Showing the latest {report.records.items.length} of {report.records.total} saved marks. Choose dates to see earlier ones.</p>}
          {report.records.total === 0 ? <p>There are no saved marks to list.</p> : <div className="overflow-x-auto" role="region" aria-label="Saved marks by date" tabIndex={0}>
            <table className="w-full min-w-[22rem] text-left text-sm"><caption className="sr-only">Saved attendance marks for this learner, newest first</caption>
              <thead><tr><th scope="col" className="p-2">Date</th><th scope="col" className="p-2">Class</th><th scope="col" className="p-2">Status</th>{staff && <th scope="col" className="p-2">Note</th>}{staff && <th scope="col" className="p-2">Recorded by</th>}</tr></thead>
              <tbody>{report.records.items.map(item => <tr key={item.id} data-learner-record={item.id} className="border-t"><th scope="row" className="p-2 font-medium">{item.dateValid ? <time dateTime={item.date}>{item.date}</time> : <>{item.date} <span className="text-xs font-normal">(not a real date)</span></>}</th>
                <td className="p-2 break-words">{item.className}</td><td className="p-2">{statusLabel(item.status)}</td>{staff && <td className="p-2 whitespace-pre-wrap break-words">{item.note ?? ''}</td>}{staff && <td className="p-2 break-words">{item.recordedByName ?? ''}</td>}</tr>)}</tbody>
            </table></div>}
        </section>
      </div>}
    </div>
  </AppShell>;
}
