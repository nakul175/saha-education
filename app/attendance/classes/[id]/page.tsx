'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Principal } from '@/lib/education/types';
import type { AttendanceCalendar } from '@/lib/education/attendance-calendar';
import type { ClassAttendanceReport } from '@/lib/education/attendance-reports';
import { AttendanceReadFailure, isCalendarDate, rangeQuery, readAttendanceJson, shiftCalendarDate } from '@/lib/education/attendance-client';

const statuses = ['present', 'absent', 'late', 'excused', 'other'] as const;
const heading: Record<typeof statuses[number], string> = { present: 'Present', absent: 'Absent', late: 'Late', excused: 'Excused', other: 'Other saved status' };

export default function ClassAttendanceReportPage({ params }: { params: Promise<{ id: string }> }) {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [classId, setClassId] = useState('');
  const [calendar, setCalendar] = useState<AttendanceCalendar | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [report, setReport] = useState<ClassAttendanceReport | null>(null);
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
      const value = await readAttendanceJson<ClassAttendanceReport>('/api/classes/' + encodeURIComponent(id) + '/attendance-report' + rangeQuery(rangeFrom, rangeTo), abort.signal);
      if (ticket !== generation.current) return;
      if (value.class.id !== id) throw new AttendanceReadFailure('The report did not match this class. Reload the page.', 500);
      setReport(value);
    } catch (failure) {
      if (ticket !== generation.current || abort.signal.aborted) return;
      setReport(null); setError(failure instanceof Error ? failure.message : 'The report could not be loaded.');
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
        setPrincipal(account); setClassId(id);
        if (account.role !== 'admin' && account.role !== 'teacher') { setLoading(false); return; }
        const school = await readAttendanceJson<AttendanceCalendar>('/api/attendance/calendar').catch(() => null);
        if (!active) return;
        setCalendar(school);
        // The default window is the 30 school days ending today at the school, never the device clock.
        const end = school?.schoolDate ?? '', start = end ? shiftCalendarDate(end, -29) : '';
        setFrom(start); setTo(end);
        await load(id, start, end);
      } catch (failure) { if (active) { setError(failure instanceof Error ? failure.message : 'The report could not be loaded.'); setLoading(false); } }
    })();
    const counter = generation, running = controller;
    return () => { active = false; counter.current++; running.current?.abort(); };
  }, [params, load]);
  useEffect(() => { if (error) message.current?.focus(); }, [error]);

  function preset(days: number | null) {
    const end = calendar?.schoolDate ?? '';
    const start = days === null || !end ? '' : shiftCalendarDate(end, -(days - 1));
    const finish = days === null ? '' : end;
    setFrom(start); setTo(finish); void load(classId, start, finish);
  }

  return <AppShell principal={principal}>
    <div className="mx-auto min-w-0 max-w-6xl space-y-6 p-4">
      <div className="space-y-2 break-words">
        <a href="/attendance" className="underline">Attendance records</a>
        <h1>Class attendance report</h1>
        {report && <p className="font-semibold">{report.class.name}</p>}
        <p className="text-sm text-muted-foreground">Counts describe marks that teachers saved. A date with no saved marks is not listed, and no percentage is shown because the school has no recorded calendar of school days.</p>
        {classId && staff && <p><a className="underline" href={'/classes/' + encodeURIComponent(classId) + '/attendance'}>Take or correct attendance for this class</a></p>}
      </div>
      {principal && !staff && <p role="alert">Class attendance reports are available to school staff. Use Attendance records to see the records available to your account.</p>}
      {error && <div ref={message} tabIndex={-1} role="alert" className="rounded border border-destructive p-3 break-words">{error}</div>}
      {staff && <form className="flex min-w-0 flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); void load(classId, from, to); }}>
        <div><Label htmlFor="report-from">From date</Label><Input id="report-from" type="date" value={from} onChange={event => setFrom(event.target.value)} className="max-w-full" /></div>
        <div><Label htmlFor="report-to">To date</Label><Input id="report-to" type="date" value={to} onChange={event => setTo(event.target.value)} className="max-w-full" /></div>
        <Button type="submit" disabled={loading || !classId}>Show report</Button>
        <Button type="button" variant="outline" disabled={loading || !calendar} onClick={() => preset(7)}>Last 7 days</Button>
        <Button type="button" variant="outline" disabled={loading || !calendar} onClick={() => preset(30)}>Last 30 days</Button>
        <Button type="button" variant="outline" disabled={loading || !classId} onClick={() => preset(null)}>All saved dates</Button>
      </form>}
      {staff && calendar && <p className="text-sm">Dates are school calendar dates. Today at the school is {calendar.schoolDate} ({calendar.timezone}).</p>}
      {loading && staff && <p role="status">Loading the attendance report…</p>}
      {report && staff && !loading && <div className="space-y-6" data-class-attendance-report>
        <section aria-labelledby="report-totals" className="space-y-3">
          <h2 id="report-totals" className="text-xl font-semibold">Totals for {report.range.from || report.range.to ? (report.range.from ?? 'the first saved date') + ' to ' + (report.range.to ?? 'the last saved date') : 'all saved dates'}</h2>
          <p>{report.totals.recordedRows} saved {report.totals.recordedRows === 1 ? 'mark' : 'marks'} for {report.rosterActive} current {report.rosterActive === 1 ? 'student' : 'students'}.</p>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">{statuses.map(status => <div key={status} className="rounded border p-3"><dt className="text-sm text-muted-foreground">{heading[status]}</dt><dd className="text-2xl font-semibold" data-total={status}>{report.totals[status]}</dd></div>)}</dl>
          {report.invalidDateRows > 0 && <p role="status">{report.invalidDateRows} saved {report.invalidDateRows === 1 ? 'mark has' : 'marks have'} a date that is not a real calendar date. {report.invalidDateRows === 1 ? 'It is' : 'They are'} kept but left out of these dates and totals.</p>}
        </section>
        <section aria-labelledby="report-days" className="space-y-3">
          <h2 id="report-days" className="text-xl font-semibold">Day by day</h2>
          {report.days.truncated && <p role="status">Showing the latest {report.days.items.length} of {report.days.total} dates.</p>}
          {report.days.total === 0 ? <p>No attendance marks were saved in this range.</p> : <div className="overflow-x-auto" role="region" aria-label="Attendance by date" tabIndex={0}>
            <table className="w-full min-w-[34rem] text-left text-sm"><caption className="sr-only">Saved attendance marks for each date</caption>
              <thead><tr><th scope="col" className="p-2">Date</th><th scope="col" className="p-2">Saved marks</th>{statuses.map(status => <th key={status} scope="col" className="p-2">{heading[status]}</th>)}<th scope="col" className="p-2">Current students with no mark</th></tr></thead>
              <tbody>{report.days.items.map(day => <tr key={day.date} data-report-day={day.date} className="border-t"><th scope="row" className="p-2 font-medium"><time dateTime={day.date}>{day.date}</time></th><td className="p-2">{day.recordedRows}</td>{statuses.map(status => <td key={status} className="p-2">{day[status]}</td>)}<td className="p-2">{day.unmarkedCurrentPupils}</td></tr>)}</tbody>
            </table></div>}
        </section>
        <section aria-labelledby="report-learners" className="space-y-3">
          <h2 id="report-learners" className="text-xl font-semibold">By student</h2>
          {report.pupils.truncated && <p role="status">Showing {report.pupils.items.length} of {report.pupils.total} students. The list is limited to {report.pupils.limit}; totals above include every student.</p>}
          {report.pupils.total === 0 ? <p>No current students or saved marks for this class.</p> : <div className="overflow-x-auto" role="region" aria-label="Attendance by student" tabIndex={0}>
            <table className="w-full min-w-[34rem] text-left text-sm"><caption className="sr-only">Saved attendance marks for each student in the selected dates</caption>
              <thead><tr><th scope="col" className="p-2">Student</th><th scope="col" className="p-2">Saved marks</th>{statuses.map(status => <th key={status} scope="col" className="p-2">{heading[status]}</th>)}</tr></thead>
              <tbody>{report.pupils.items.map(pupil => <tr key={pupil.id} data-report-pupil={pupil.id} className="border-t"><th scope="row" className="p-2 font-medium">
                <a className="underline" href={'/attendance/learners/' + encodeURIComponent(pupil.id)}>{pupil.firstName} {pupil.lastName}</a>
                <span className="block text-xs font-normal text-muted-foreground">Admission {pupil.admissionNumber}{pupil.currentActive ? '' : ' (no longer in this class)'}</span></th>
                <td className="p-2">{pupil.recordedRows}</td>{statuses.map(status => <td key={status} className="p-2">{pupil[status]}</td>)}</tr>)}</tbody>
            </table></div>}
        </section>
      </div>}
    </div>
  </AppShell>;
}
