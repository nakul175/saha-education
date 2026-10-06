'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { SubmissionNotice, useChangeSubmission } from '@/components/academic-submission';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { END_LABELS, STATUS_LABELS, formatDay, readFailureMessage, readJson, todayUtc } from '@/lib/education/academic-lifecycle-client';
import type { ChangeInput, ClassLifecycle, RosterRow } from '@/lib/education/academic-lifecycle-types';
import type { Class, Principal, Student } from '@/lib/education/types';

type Loaded = { principal: Principal; cls: ClassLifecycle; roster: RosterRow[]; classes: Class[]; students: Student[] };
type Action = { kind: 'withdraw' | 'complete' | 'reenrol' | 'transfer'; row: RosterRow };
const ACTION_TEXT = { withdraw: 'Withdraw', complete: 'Complete', reenrol: 'Re-enrol', transfer: 'Transfer' } as const;
const MAX_BATCH = 25;

export default function ClassRosterPage({ params }: { params: Promise<{ id: string }> }) {
  const [classId, setClassId] = useState<string | null>(null);
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [effectiveOn, setEffectiveOn] = useState(todayUtc());
  const [reason, setReason] = useState('');
  const [toClassId, setToClassId] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [enrolOn, setEnrolOn] = useState(todayUtc());
  const generation = useRef(0), mounted = useRef(true), controller = useRef<AbortController | null>(null);
  const invalidate = useCallback(() => { generation.current++; controller.current?.abort(); }, []);
  useEffect(() => {
    let active = true; mounted.current = true;
    params.then(value => { if (active) setClassId(value.id); }).catch(() => { if (active) { setLoading(false); setError('This class could not be identified. Open it again from the class list.'); } });
    return () => { active = false; mounted.current = false; invalidate(); };
  }, [params, invalidate]);
  const reload = useCallback(async () => {
    if (!classId) return;
    const ticket = ++generation.current;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const current = () => mounted.current && ticket === generation.current && !abort.signal.aborted;
    setLoading(true); setError(null); setData(null);
    try {
      const path = '/api/classes/' + encodeURIComponent(classId);
      const actor = await readJson<Principal>('/api/session', abort.signal);
      const cls = await readJson<ClassLifecycle>(path + '/lifecycle', abort.signal);
      const roster = await readJson<RosterRow[]>(path + '/roster', abort.signal);
      const manage = actor.role === 'admin' && cls.canManage;
      const [classes, students] = manage ? await Promise.all([readJson<Class[]>('/api/classes', abort.signal), readJson<Student[]>('/api/students', abort.signal)]) : [[] as Class[], [] as Student[]];
      const verified = await readJson<Principal>('/api/session', abort.signal);
      if (!current()) return;
      if (!actor.id || actor.id !== verified.id || actor.role !== verified.role || cls.id !== classId) throw new Error('Unconfirmed roster');
      setData({ principal: actor, cls, roster, classes, students });
      setAction(null); setReason(''); setToClassId(''); setPicked([]); setEffectiveOn(todayUtc()); setEnrolOn(cls.settings.startsOn && cls.settings.startsOn > todayUtc() ? cls.settings.startsOn : todayUtc());
    } catch (failure) { if (current()) setError(readFailureMessage(failure, 'This roster')); }
    finally { if (current()) setLoading(false); }
  }, [classId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);
  const submission = useChangeSubmission(reload);
  const locked = submission.busy || !!submission.pending || loading;
  const cls = data?.cls;
  const manage = data?.principal.role === 'admin' && cls?.canManage === true;
  const closed = cls?.settings.status === 'closed';
  const trimmed = reason.trim();
  const rostered = useMemo(() => new Set((data?.roster ?? []).map(row => row.studentId)), [data]);
  const candidates = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.students ?? []).filter(student => !rostered.has(student.id) && (!needle || `${student.firstName} ${student.lastName} ${student.admissionNumber}`.toLowerCase().includes(needle)));
  }, [data, rostered, search]);
  const destinations = (data?.classes ?? []).filter(row => row.id !== cls?.id);
  const confirmAction = (event: React.FormEvent) => {
    event.preventDefault(); if (!action) return;
    const { row, kind } = action; const base = { enrolmentId: row.enrolmentId, expectedUpdatedAt: row.updatedAt, effectiveOn };
    const name = `${row.firstName} ${row.lastName}`;
    const change: ChangeInput = kind === 'transfer' ? { kind: 'enrolment.transfer', ...base, toClassId } : { kind: kind === 'withdraw' ? 'enrolment.withdraw' : kind === 'complete' ? 'enrolment.complete' : 'enrolment.reenrol', ...base };
    void submission.submit(`${ACTION_TEXT[kind]} for ${name}`, [change], trimmed);
  };
  const enrolPicked = () => {
    if (!cls || picked.length === 0 || picked.length > MAX_BATCH) return;
    void submission.submit(picked.length === 1 ? 'Enrolment' : `Enrolment of ${picked.length} learners`, picked.map(studentId => ({ kind: 'enrolment.enrol' as const, studentId, classId: cls.id, effectiveOn: enrolOn })));
  };
  const seats = !cls ? '' : cls.settings.capacity === null ? `${cls.activeCount ?? 0} active learners, no capacity limit` : `${cls.activeCount ?? 0} of ${cls.settings.capacity} places used`;
  return <AppShell principal={data?.principal ?? null}><div className="mx-auto max-w-4xl min-w-0 space-y-6 p-4">
    <div><a href="/academic" className="text-sm underline">Courses, classes and enrolments</a><h1 className="text-2xl font-bold break-words">{cls ? `Roster for ${cls.name}` : 'Class roster'}</h1>
      <p className="text-muted-foreground">Everyone who is or was enrolled in this class, with the dates of each enrolment.</p></div>
    <Button type="button" variant="outline" onClick={() => void reload()} disabled={locked}>Reload this roster</Button>
    {loading && <p role="status">Loading the current roster…</p>}
    {error && <p role="alert" className="rounded border p-3">{error} <a className="underline" href="/academic">Back to classes</a></p>}
    <SubmissionNotice submission={submission} />
    {cls && data && <>
      <Card><CardHeader><CardTitle>Class summary</CardTitle></CardHeader><CardContent className="space-y-1 break-words">
        <p className="flex flex-wrap items-center gap-2"><Badge variant={closed ? 'outline' : 'secondary'}>{closed ? 'Closed' : 'Open'}</Badge><span>{cls.courseTitle ?? 'Course'} · Term {cls.term}</span></p>
        <p>Teacher: {cls.teacher?.name ?? 'No teacher available'}</p><p role="status">{seats}</p><p>Dates: {formatDay(cls.settings.startsOn)} to {formatDay(cls.settings.endsOn)}</p>
        {closed && <p role="status">This class is closed. {manage ? 'Reopen it from the class settings to change the roster.' : 'The roster cannot change until an administrator reopens it.'}</p>}
        {manage && <p><a className="underline" href={'/classes/' + encodeURIComponent(cls.id) + '/manage'}>Open settings for {cls.name}</a></p>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Learners ({data.roster.length})</CardTitle></CardHeader><CardContent>
        {data.roster.length === 0 ? <p>No learner has been enrolled in this class yet.</p> : <ul className="space-y-3">{data.roster.map(row => {
          const name = `${row.firstName} ${row.lastName}`;
          return <li key={row.enrolmentId} className="rounded border p-3 break-words">
            <div className="flex flex-wrap items-center gap-2"><h2 className="font-medium">{name}</h2><Badge variant={row.status === 'active' ? 'secondary' : 'outline'}>{STATUS_LABELS[row.status] ?? row.status}</Badge></div>
            <p className="text-sm text-muted-foreground">Admission number {row.admissionNumber} · Grade level {row.gradeLevel}</p>
            <p>Started {formatDay(row.startedOn)}{row.endedOn ? ` · Ended ${formatDay(row.endedOn)}${row.endKind ? ` (${END_LABELS[row.endKind] ?? row.endKind})` : ''}` : ''}</p>
            {manage && <div className="mt-2 flex flex-wrap gap-2">
              {row.status === 'active' && (['withdraw', 'complete', 'transfer'] as const).map(kind => <Button key={kind} type="button" variant="outline" size="sm" disabled={locked || closed} onClick={() => { setAction({ kind, row }); setEffectiveOn(todayUtc()); }}>{ACTION_TEXT[kind]} {name}</Button>)}
              {row.status === 'withdrawn' && <Button type="button" variant="outline" size="sm" disabled={locked || closed} onClick={() => { setAction({ kind: 'reenrol', row }); setEffectiveOn(todayUtc()); }}>{ACTION_TEXT.reenrol} {name}</Button>}
            </div>}
          </li>; })}</ul>}
      </CardContent></Card>
      {manage && action && <Card><CardHeader><CardTitle>{ACTION_TEXT[action.kind]} {action.row.firstName} {action.row.lastName}</CardTitle></CardHeader><CardContent>
        <form onSubmit={confirmAction} className="space-y-4"><fieldset disabled={locked} className="min-w-0 space-y-4">
          <div><Label htmlFor="action-date">Effective date</Label><Input id="action-date" type="date" required value={effectiveOn} onChange={event => setEffectiveOn(event.target.value)} aria-describedby="action-date-help" />
            <p id="action-date-help" className="text-sm text-muted-foreground">Withdrawals and completions cannot be dated in the future, or before the enrolment started.</p></div>
          {action.kind === 'transfer' && <div><Label htmlFor="action-destination">Move to class</Label><select id="action-destination" required className="h-11 w-full rounded border bg-white px-3" value={toClassId} onChange={event => setToClassId(event.target.value)}>
            <option value="">Choose a class</option>{destinations.map(row => <option key={row.id} value={row.id}>{row.name} (term {row.term})</option>)}</select></div>}
          <div><Label htmlFor="action-reason">Reason (required, at least 5 characters)</Label><Input id="action-reason" value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /></div>
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={trimmed.length < 5 || !effectiveOn || (action.kind === 'transfer' && !toClassId)}>{submission.busy ? 'Saving…' : `Confirm ${ACTION_TEXT[action.kind].toLowerCase()}`}</Button>
            <Button type="button" variant="outline" onClick={() => setAction(null)}>Cancel</Button></div>
        </fieldset></form>
      </CardContent></Card>}
      {manage && <Card><CardHeader><CardTitle>Enrol learners</CardTitle></CardHeader><CardContent className="space-y-4">
        {closed ? <p>This class is closed, so no learner can be enrolled.</p> : <>
          <p>Choose up to {MAX_BATCH} learners. They are enrolled together: if one cannot be enrolled (for example the class is full), none are.</p>
          <div><Label htmlFor="enrol-search">Find a learner by name or admission number</Label><Input id="enrol-search" value={search} onChange={event => setSearch(event.target.value)} disabled={locked} /></div>
          <fieldset disabled={locked} className="min-w-0 space-y-2"><legend className="font-medium">Learners not yet on this roster</legend>
            {candidates.length === 0 ? <p>{search.trim() ? 'No learner matches your search.' : 'Every learner in your school is already on this roster.'}</p> : <ul className="max-h-72 space-y-1 overflow-y-auto rounded border p-2">{candidates.slice(0, 50).map(student => <li key={student.id} className="flex items-start gap-2">
              <input id={'pick-' + student.id} type="checkbox" className="mt-1 size-5" checked={picked.includes(student.id)} onChange={event => setPicked(previous => event.target.checked ? [...previous, student.id] : previous.filter(id => id !== student.id))} />
              <Label htmlFor={'pick-' + student.id}>{student.firstName} {student.lastName} · {student.admissionNumber}</Label></li>)}</ul>}
            {candidates.length > 50 && <p className="text-sm text-muted-foreground">Showing the first 50 matches. Use the search box to narrow the list.</p>}
          </fieldset>
          <div><Label htmlFor="enrol-date">Enrolment start date</Label><Input id="enrol-date" type="date" value={enrolOn} onChange={event => setEnrolOn(event.target.value)} disabled={locked} aria-describedby="enrol-date-help" />
            <p id="enrol-date-help" className="text-sm text-muted-foreground">Use today, or the class start date to enrol ahead of a class that has not begun.</p></div>
          {picked.length > MAX_BATCH && <p role="alert">Choose at most {MAX_BATCH} learners at a time.</p>}
          <Button type="button" disabled={locked || picked.length === 0 || picked.length > MAX_BATCH || !enrolOn} onClick={enrolPicked}>{submission.busy ? 'Saving…' : picked.length === 1 ? 'Enrol 1 learner' : `Enrol ${picked.length} learners`}</Button>
        </>}
      </CardContent></Card>}
    </>}
  </div></AppShell>;
}
