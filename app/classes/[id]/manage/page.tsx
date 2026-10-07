'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { SubmissionNotice, useChangeSubmission } from '@/components/academic-submission';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDayRange, formatMoment, readFailureMessage, readJson } from '@/lib/education/academic-lifecycle-client';
import type { ClassLifecycle, HistoryEvent } from '@/lib/education/academic-lifecycle-types';
import type { Course, Principal } from '@/lib/education/types';

type History = { items: HistoryEvent[]; limit: number; truncated: boolean };
type Teacher = { id: string; name: string };
type Loaded = { principal: Principal; cls: ClassLifecycle; history: History; courses: Course[]; teachers: Teacher[] };

export default function ManageClassPage({ params }: { params: Promise<{ id: string }> }) {
  const [classId, setClassId] = useState<string | null>(null);
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ courseId: '', name: '', term: '', schedule: '', capacity: '', startsOn: '', endsOn: '' });
  const [teacherId, setTeacherId] = useState('');
  const [reason, setReason] = useState('');
  const [completeActive, setCompleteActive] = useState(false);
  const generation = useRef(0), mounted = useRef(true), controller = useRef<AbortController | null>(null);
  const invalidate = useCallback(() => { generation.current++; controller.current?.abort(); }, []);
  useEffect(() => {
    let active = true; mounted.current = true;
    Promise.resolve(params).then(value => { if (active) setClassId(value.id); }).catch(() => { if (active) { setLoading(false); setError('This class could not be identified. Open it again from the class list.'); } });
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
      const manage = actor.role === 'admin' && cls.canManage;
      const [history, courses, teachers] = await Promise.all([readJson<History>(path + '/history', abort.signal),
        manage ? readJson<Course[]>('/api/courses', abort.signal) : Promise.resolve([] as Course[]), manage ? readJson<Teacher[]>('/api/users?role=teacher', abort.signal) : Promise.resolve([] as Teacher[])]);
      const verified = await readJson<Principal>('/api/session', abort.signal);
      if (!current()) return;
      if (!actor.id || actor.id !== verified.id || actor.role !== verified.role || cls.id !== classId) throw new Error('Unconfirmed class');
      setData({ principal: actor, cls, history, courses, teachers });
      setForm({ courseId: cls.courseId, name: cls.name, term: cls.term, schedule: cls.schedule ?? '', capacity: cls.settings.capacity === null ? '' : String(cls.settings.capacity), startsOn: cls.settings.startsOn ?? '', endsOn: cls.settings.endsOn ?? '' });
      setTeacherId(''); setReason(''); setCompleteActive(false);
    } catch (failure) { if (current()) setError(readFailureMessage(failure, 'This class')); }
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
  const capacityText = form.capacity.trim();
  const capacityInvalid = capacityText !== '' && !/^[0-9]{1,3}$/.test(capacityText);
  const send = (summary: string, change: Parameters<typeof submission.submit>[1][number]) => { void submission.submit(summary, [change], trimmed); };
  const saveSettings = (event: React.FormEvent) => {
    event.preventDefault(); if (!cls || capacityInvalid) return;
    send('Class settings', { kind: 'class.edit', classId: cls.id, expectedUpdatedAt: cls.updatedAt, courseId: form.courseId, name: form.name.trim(), term: form.term.trim(), schedule: form.schedule.trim() || null,
      capacity: capacityText ? Number(capacityText) : null, startsOn: form.startsOn || null, endsOn: form.endsOn || null });
  };
  const seats = !cls ? '' : cls.settings.capacity === null ? `${cls.activeCount ?? 0} students enrolled, no capacity limit` : `${cls.activeCount ?? 0} of ${cls.settings.capacity} places used`;
  return <AppShell principal={data?.principal ?? null}><div className="mx-auto max-w-4xl min-w-0 space-y-6 p-4">
    <div><a href="/academic" className="text-sm underline">Courses, classes and enrolments</a><h1 className="text-2xl font-bold break-words">{cls ? `Settings for ${cls.name}` : 'Class settings'}</h1></div>
    <Button type="button" variant="outline" onClick={() => void reload()} disabled={locked}>Reload this class</Button>
    {loading && <p role="status">Loading the current class…</p>}
    {error && <p role="alert" className="rounded border p-3">{error} <a className="underline" href="/academic">Back to classes</a></p>}
    <SubmissionNotice submission={submission} />
    {cls && data && <>
      <Card><CardHeader><CardTitle><h2>Class summary</h2></CardTitle></CardHeader><CardContent className="space-y-2 break-words">
        <p className="flex flex-wrap items-center gap-2"><Badge variant={closed ? 'outline' : 'secondary'}>{closed ? 'Closed' : 'Open'}</Badge>{cls.courseStatus === 'retired' && <Badge variant="outline">Course retired</Badge>}</p>
        <p>Course: {cls.courseTitle ?? 'Unknown course'}{cls.courseCode ? ` (${cls.courseCode})` : ''}</p><p>Term: {cls.term}</p><p>Schedule: {cls.schedule || 'Not specified'}</p>
        <p>Teacher: {cls.teacher?.name ?? 'No teacher available'}</p><p>{seats}</p><p>Class dates: {formatDayRange(cls.settings.startsOn, cls.settings.endsOn)}</p>
        {closed && <p role="status">This class is closed{cls.settings.closedAt ? ` since ${formatMoment(cls.settings.closedAt)}` : ''}. Reopen it to change its settings or roster.</p>}
        <p><a className="underline" href={'/classes/' + encodeURIComponent(cls.id) + '/roster'}>Open the roster for {cls.name}</a></p>
      </CardContent></Card>
      {!manage && <p role="status">Only a school administrator can change class settings.</p>}
      {manage && <>
        <Card><CardHeader><CardTitle><h2>Reason for changes</h2></CardTitle></CardHeader><CardContent>
          <Label htmlFor="class-reason">Reason (required for every change below, at least 5 characters)</Label><Input id="class-reason" value={reason} maxLength={500} onChange={event => setReason(event.target.value)} disabled={locked} aria-describedby="class-reason-help" />
          <p id="class-reason-help" className="text-sm text-muted-foreground">The reason is kept in the class history for administrators.</p>
        </CardContent></Card>
        <Card><CardHeader><CardTitle><h2>Edit class settings</h2></CardTitle></CardHeader><CardContent>
          <form onSubmit={saveSettings} className="space-y-4"><fieldset disabled={locked || closed} className="min-w-0 space-y-4">
            <div><Label htmlFor="class-course">Course</Label><select id="class-course" className="h-11 w-full rounded border bg-white px-3" value={form.courseId} onChange={event => setForm({ ...form, courseId: event.target.value })}>
              {data.courses.map(course => <option key={course.id} value={course.id}>{course.title} ({course.code})</option>)}</select></div>
            <div><Label htmlFor="class-name">Class name</Label><Input id="class-name" value={form.name} required maxLength={120} onChange={event => setForm({ ...form, name: event.target.value })} /></div>
            <div><Label htmlFor="class-term">Term</Label><Input id="class-term" value={form.term} required maxLength={80} onChange={event => setForm({ ...form, term: event.target.value })} /></div>
            <div><Label htmlFor="class-schedule">Schedule (optional)</Label><Input id="class-schedule" value={form.schedule} maxLength={200} onChange={event => setForm({ ...form, schedule: event.target.value })} /></div>
            <div><Label htmlFor="class-capacity">Capacity (1 to 500, blank for no limit)</Label><Input id="class-capacity" inputMode="numeric" value={form.capacity} aria-invalid={capacityInvalid} aria-describedby="class-capacity-help" onChange={event => setForm({ ...form, capacity: event.target.value })} />
              <p id="class-capacity-help" className={capacityInvalid ? 'text-sm text-red-700' : 'text-sm text-muted-foreground'}>{capacityInvalid ? 'Enter a whole number from 1 to 500, or leave blank for no limit.' : 'Capacity cannot be lower than the students currently enrolled.'}</p></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label htmlFor="class-starts">Start date</Label><Input id="class-starts" type="date" value={form.startsOn} onChange={event => setForm({ ...form, startsOn: event.target.value })} /></div>
              <div><Label htmlFor="class-ends">End date</Label><Input id="class-ends" type="date" value={form.endsOn} onChange={event => setForm({ ...form, endsOn: event.target.value })} /></div></div>
            <Button type="submit" disabled={trimmed.length < 5 || capacityInvalid}>{submission.busy ? 'Saving…' : 'Save class settings'}</Button>
          </fieldset></form>
        </CardContent></Card>
        <Card><CardHeader><CardTitle><h2>Change the teacher</h2></CardTitle></CardHeader><CardContent className="space-y-4">
          <p>Current teacher: {cls.teacher?.name ?? 'None available'}. The teacher assigned now is the one who can see this class and its roster; the previous teacher loses access immediately.</p>
          <fieldset disabled={locked || closed} className="min-w-0 space-y-4">
            <div><Label htmlFor="class-new-teacher">New teacher</Label><select id="class-new-teacher" className="h-11 w-full rounded border bg-white px-3" value={teacherId} onChange={event => setTeacherId(event.target.value)}>
              <option value="">Choose a teacher</option>{data.teachers.filter(teacher => teacher.id !== cls.teacher?.id).map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></div>
            <Button type="button" variant="outline" disabled={!teacherId || trimmed.length < 5} onClick={() => send('Teacher change', { kind: 'class.teacher', classId: cls.id, expectedUpdatedAt: cls.updatedAt, teacherId })}>Assign this teacher</Button>
          </fieldset>
        </CardContent></Card>
        <Card><CardHeader><CardTitle><h2>{closed ? 'Reopen class' : 'Close class'}</h2></CardTitle></CardHeader><CardContent className="space-y-4">
          {closed ? <p>Reopening lets students be enrolled, withdrawn and transferred again.</p> : <p>A closed class accepts no new enrolments, re-enrolments or setting changes. Existing enrolment records stay as they are unless you complete them below.</p>}
          <fieldset disabled={locked} className="min-w-0 space-y-4">
            {!closed && <div className="flex items-start gap-2"><input id="class-complete-active" type="checkbox" className="mt-1 size-5" checked={completeActive} onChange={event => setCompleteActive(event.target.checked)} /><Label htmlFor="class-complete-active">Also mark every active student as completed today</Label></div>}
            <Button type="button" variant="outline" disabled={trimmed.length < 5}
              onClick={() => send(closed ? 'Class reopening' : 'Class closure', closed ? { kind: 'class.reopen', classId: cls.id, expectedUpdatedAt: cls.updatedAt } : { kind: 'class.close', classId: cls.id, expectedUpdatedAt: cls.updatedAt, completeActive })}>{closed ? 'Reopen this class' : 'Close this class'}</Button>
          </fieldset>
        </CardContent></Card>
      </>}
      <Card><CardHeader><CardTitle><h2>Class history</h2></CardTitle></CardHeader><CardContent>
        {data.history.items.length === 0 ? <p>No reviewed changes have been recorded for this class.</p> : <ol className="space-y-3">{data.history.items.map(item => <li key={item.id} className="rounded border p-3 break-words">
          <p className="font-medium">{item.label}</p><p className="text-sm text-muted-foreground">{formatMoment(item.createdAt)}{item.actorName ? ` · ${item.actorName}` : ''}</p>{item.reason && <p>Reason: {item.reason}</p>}</li>)}</ol>}
        {data.history.truncated && <p className="mt-2 text-sm text-muted-foreground">Only the latest {data.history.limit} entries are shown.</p>}
      </CardContent></Card>
    </>}
  </div></AppShell>;
}
