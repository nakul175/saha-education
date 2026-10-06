'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { Principal } from '@/lib/education/types';
import type { AttendanceSummary } from '@/lib/education/attendance-summary';

type ClassChoice = { id: string; name: string };
async function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { cache: 'no-store', signal });
  if (response.status === 401) {
    await response.text();
    window.location.assign(new URL('/login', window.location.origin).href);
    throw new Error('Please sign in again.');
  }
  if (!response.ok) {
    await response.text();
    throw new Error(response.status === 403 || response.status === 404
      ? 'This class is no longer available. Refresh the class choices before continuing.'
      : 'Attendance could not be loaded. Refresh to try again.');
  }
  return response.json() as Promise<T>;
}

export default function AttendancePage() {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [choices, setChoices] = useState<ClassChoice[]>([]);
  const [selected, setSelected] = useState('');
  const [snapshot, setSnapshot] = useState<AttendanceSummary | null>(null);
  const [loadingChoices, setLoadingChoices] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const selectionGeneration = useRef(0);
  const inventoryGeneration = useRef(0);
  const inventoryAbort = useRef<AbortController | null>(null);
  const message = useRef<HTMLDivElement>(null);

  const reload = useCallback(async (preferred: string) => {
    const generation = ++inventoryGeneration.current;
    ++selectionGeneration.current;
    inventoryAbort.current?.abort();
    const controller = new AbortController();
    inventoryAbort.current = controller;
    setSnapshot(null); setLoadingRecords(false); setLoadingChoices(true); setError(null);
    try {
      const [account, rows] = await Promise.all([
        read<Principal>('/api/session', controller.signal), read<ClassChoice[]>('/api/classes', controller.signal),
      ]);
      if (generation !== inventoryGeneration.current) return;
      const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
      setPrincipal(account); setChoices(sorted);
      setSelected(sorted.some(row => row.id === preferred) ? preferred : sorted[0]?.id ?? '');
      setRefresh(value => value + 1);
    } catch (failure) {
      if (generation !== inventoryGeneration.current || controller.signal.aborted) return;
      setChoices([]); setSelected(''); setSnapshot(null);
      setError(failure instanceof Error ? failure.message : 'Class choices could not be loaded. Refresh to try again.');
    } finally {
      if (generation === inventoryGeneration.current) setLoadingChoices(false);
    }
  }, []);

  useEffect(() => {
    const inventory = inventoryGeneration, selection = selectionGeneration, abort = inventoryAbort;
    let active = true;
    queueMicrotask(() => { if (active) void reload(''); });
    return () => { active = false; ++inventory.current; ++selection.current; abort.current?.abort(); };
  }, [reload]);

  useEffect(() => {
    if (!selected || loadingChoices) return;
    const selection = selectionGeneration;
    const generation = ++selection.current;
    const controller = new AbortController();
    void (async () => {
      setLoadingRecords(true);
      try {
        const data = await read<AttendanceSummary>('/api/classes/' + encodeURIComponent(selected) + '/attendance-summary', controller.signal);
        if (generation !== selectionGeneration.current || controller.signal.aborted) return;
        if (data.class.id !== selected) throw new Error('Attendance did not match the selected class. Refresh before continuing.');
        setSnapshot(data); setError(null);
      } catch (failure) {
        if (generation !== selectionGeneration.current || controller.signal.aborted) return;
        setSnapshot(null);
        setError(failure instanceof Error ? failure.message : 'Attendance could not be loaded. Refresh to try again.');
      } finally {
        if (generation === selectionGeneration.current) setLoadingRecords(false);
      }
    })();
    return () => { ++selection.current; controller.abort(); };
  }, [selected, refresh, loadingChoices]);

  useEffect(() => { if (error) message.current?.focus(); }, [error]);
  function choose(value: string) {
    if (value === selected) return;
    ++selectionGeneration.current;
    setSnapshot(null); setError(null); setLoadingRecords(Boolean(value)); setSelected(value);
  }
  const current = snapshot?.class.id === selected ? snapshot : null;
  const staff = current?.role === 'admin' || current?.role === 'teacher';

  return <AppShell principal={principal}>
    <div className="min-w-0 space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Attendance Summary</h1>
        <p className="text-muted-foreground">Observed records for the selected class. Counts describe saved rows; they do not infer missing school days.</p>
      </header>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-56 space-y-2">
          <Label htmlFor="attendance-class">Select Class</Label>
          <select id="attendance-class" className="w-full min-w-0 rounded-md border bg-background px-3 py-2" value={selected}
            onChange={event => choose(event.target.value)} disabled={loadingChoices}>
            <option value="">{loadingChoices ? 'Loading class choices…' : 'Choose a class'}</option>
            {choices.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </div>
        <Button variant="outline" onClick={() => void reload(selected)} disabled={loadingChoices}>Refresh</Button>
      </div>
      {error && <div ref={message} tabIndex={-1} role="alert" className="rounded-md border border-destructive p-4">{error}</div>}
      {(loadingChoices || loadingRecords) && <p role="status">{loadingChoices ? 'Loading class choices…' : 'Loading attendance records…'}</p>}
      {!loadingChoices && choices.length === 0 && !error && <p>No classes are currently available to your account.</p>}
      {!loadingChoices && !loadingRecords && !selected && choices.length > 0 && <p>Choose a class to view its available records.</p>}
      {current && !loadingChoices && !loadingRecords && <section className="min-w-0 space-y-4" aria-labelledby="attendance-class-heading">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 break-words">
            <h2 id="attendance-class-heading" className="text-xl font-semibold">{current.class.name}</h2>
            <p className="text-sm text-muted-foreground">Records loaded at <time dateTime={current.asOf}>{new Date(current.asOf).toLocaleString()}</time>.</p>
          </div>
          {staff && <a className="rounded-md border px-3 py-2 underline" href={'/classes/' + encodeURIComponent(current.class.id) + '/attendance'}>Review attendance marks</a>}
        </div>
        {current.pupils.truncated && <p role="status" className="rounded-md border p-3">Showing {current.pupils.items.length} of {current.pupils.total} available learners. This view is limited to {current.pupils.limit}; omitted learners are not counted as having no records.</p>}
        {current.pupils.total === 0 && <p>No learner profiles or saved attendance rows are currently available for this class.</p>}
        {current.pupils.items.map(pupil => <article key={pupil.id} data-attendance-pupil={pupil.id} aria-labelledby={'attendance-pupil-' + pupil.id}
          className="min-w-0 space-y-3 rounded-lg border p-4">
          <div className="min-w-0 break-words">
            <h3 id={'attendance-pupil-' + pupil.id} className="text-lg font-semibold">{pupil.firstName} {pupil.lastName}</h3>
            <p className="text-sm text-muted-foreground">Admission number: {pupil.admissionNumber}</p>
            <p className="text-sm">{pupil.currentActive ? 'Current active enrolment' : 'Saved records; no current active enrolment in this class'}</p>
          </div>
          {pupil.attendance.recordedRows === 0 ? <p>No attendance has been recorded for this learner in this class.</p> : <>
            <p>{pupil.attendance.recordedRows} saved {pupil.attendance.recordedRows === 1 ? 'row' : 'rows'}.</p>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Object.entries(pupil.attendance.counts).map(([status, count]) => <div key={status}>
                <dt className="text-sm capitalize text-muted-foreground">{status === 'other' ? 'Other saved status' : status}</dt>
                <dd className="font-semibold">{count}</dd>
              </div>)}
            </dl>
            <p className="break-words">{pupil.attendance.firstDate && pupil.attendance.lastDate
              ? <>Recorded date coverage: <time dateTime={pupil.attendance.firstDate}>{pupil.attendance.firstDate}</time> to <time dateTime={pupil.attendance.lastDate}>{pupil.attendance.lastDate}</time>.</>
              : 'No valid calendar-date coverage is available for these saved rows.'}</p>
            {pupil.attendance.invalidDateRows > 0 && <p role="status">{pupil.attendance.invalidDateRows} saved {pupil.attendance.invalidDateRows === 1 ? 'row has' : 'rows have'} an invalid date and are excluded from the date range. Original rows are retained.</p>}
          </>}
        </article>)}
      </section>}
    </div>
  </AppShell>;
}
