'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { SubmissionNotice, useChangeSubmission } from '@/components/academic-submission';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatMoment, readFailureMessage, readJson } from '@/lib/education/academic-lifecycle-client';
import type { CourseLifecycle, HistoryEvent } from '@/lib/education/academic-lifecycle-types';
import type { Principal } from '@/lib/education/types';

type History = { items: HistoryEvent[]; limit: number; truncated: boolean };

export default function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [courseId, setCourseId] = useState<string | null>(null);
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [course, setCourse] = useState<CourseLifecycle | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', title: '', description: '', gradeLevel: '' });
  const [reason, setReason] = useState('');
  const generation = useRef(0), mounted = useRef(true), controller = useRef<AbortController | null>(null);
  const invalidate = useCallback(() => { generation.current++; controller.current?.abort(); }, []);
  useEffect(() => {
    let active = true; mounted.current = true;
    params.then(value => { if (active) setCourseId(value.id); }).catch(() => { if (active) { setLoading(false); setError('This course could not be identified. Open it again from the course list.'); } });
    return () => { active = false; mounted.current = false; invalidate(); };
  }, [params, invalidate]);
  const reload = useCallback(async () => {
    if (!courseId) return;
    const ticket = ++generation.current;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const current = () => mounted.current && ticket === generation.current && !abort.signal.aborted;
    setLoading(true); setError(null); setCourse(null); setHistory(null); setPrincipal(null);
    try {
      const actor = await readJson<Principal>('/api/session', abort.signal);
      const detail = await readJson<CourseLifecycle>('/api/courses/' + encodeURIComponent(courseId) + '/lifecycle', abort.signal);
      const log = actor.role === 'admin' ? await readJson<History>('/api/courses/' + encodeURIComponent(courseId) + '/history', abort.signal) : null;
      const verified = await readJson<Principal>('/api/session', abort.signal);
      if (!current()) return;
      if (!actor.id || actor.id !== verified.id || actor.role !== verified.role || detail.id !== courseId) throw new Error('Unconfirmed course');
      setPrincipal(actor); setCourse(detail); setHistory(log);
      setForm({ code: detail.code, title: detail.title, description: detail.description ?? '', gradeLevel: detail.gradeLevel }); setReason('');
    } catch (failure) {
      if (current()) setError(readFailureMessage(failure, 'This course'));
    } finally { if (current()) setLoading(false); }
  }, [courseId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);
  const submission = useChangeSubmission(reload);
  const locked = submission.busy || !!submission.pending || loading;
  const admin = principal?.role === 'admin' && course?.canManage === true;
  const retired = course?.status === 'retired';
  const trimmed = reason.trim();
  const edit = (event: React.FormEvent) => {
    event.preventDefault(); if (!course) return;
    void submission.submit('Course edit', [{ kind: 'course.edit', courseId: course.id, expectedUpdatedAt: course.updatedAt, code: form.code.trim(), title: form.title.trim(), description: form.description.trim() || null, gradeLevel: form.gradeLevel.trim() }], trimmed);
  };
  const toggle = () => { if (course) void submission.submit(retired ? 'Course reinstatement' : 'Course retirement', [{ kind: retired ? 'course.reinstate' : 'course.retire', courseId: course.id, expectedUpdatedAt: course.updatedAt }], trimmed); };
  return <AppShell principal={principal}><div className="mx-auto max-w-4xl min-w-0 space-y-6 p-4">
    <div><a href="/academic" className="text-sm underline">Courses, classes and enrolments</a><h1 className="text-2xl font-bold break-words">{course?.title ?? 'Course'}</h1></div>
    <Button type="button" variant="outline" onClick={() => void reload()} disabled={locked}>Reload this course</Button>
    {loading && <p role="status">Loading the current course…</p>}
    {error && <p role="alert" className="rounded border p-3">{error} <a className="underline" href="/academic">Back to courses</a></p>}
    <SubmissionNotice submission={submission} />
    {course && principal && <>
      <Card><CardHeader><CardTitle><h2>Course details</h2></CardTitle></CardHeader><CardContent className="space-y-2 break-words">
        <p><Badge variant={retired ? 'outline' : 'secondary'}>{retired ? 'Retired' : 'Active'}</Badge></p>
        <p>Code: {course.code}</p><p>Grade level: {course.gradeLevel}</p><p className="whitespace-pre-wrap">{course.description || 'No description.'}</p>
        {admin && <p>Classes using this course: {course.classCount ?? 0}</p>}
        {retired && <p role="status">This course is retired. No new classes can be created for it; existing classes and enrolments are unchanged.{admin && course.statusReason ? ` Reason: ${course.statusReason}` : ''}</p>}
      </CardContent></Card>
      {admin && <Card><CardHeader><CardTitle><h2>Edit course</h2></CardTitle></CardHeader><CardContent>
        <form onSubmit={edit} className="space-y-4"><fieldset disabled={locked} className="min-w-0 space-y-4">
          <div><Label htmlFor="course-code">Course code</Label><Input id="course-code" value={form.code} required maxLength={60} onChange={event => setForm({ ...form, code: event.target.value })} /></div>
          <div><Label htmlFor="course-title">Course title</Label><Input id="course-title" value={form.title} required maxLength={200} onChange={event => setForm({ ...form, title: event.target.value })} /></div>
          <div><Label htmlFor="course-description">Description (optional)</Label><Textarea id="course-description" value={form.description} maxLength={2000} onChange={event => setForm({ ...form, description: event.target.value })} /></div>
          <div><Label htmlFor="course-grade">Grade level</Label><Input id="course-grade" value={form.gradeLevel} required maxLength={40} onChange={event => setForm({ ...form, gradeLevel: event.target.value })} /></div>
          <div><Label htmlFor="course-reason">Reason for the change (required, at least 5 characters)</Label><Input id="course-reason" value={reason} maxLength={500} onChange={event => setReason(event.target.value)} aria-describedby="course-reason-help" />
            <p id="course-reason-help" className="text-sm text-muted-foreground">The reason is kept in the course history for administrators.</p></div>
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={trimmed.length < 5}>{submission.busy ? 'Saving…' : 'Save course changes'}</Button>
            <Button type="button" variant="outline" disabled={trimmed.length < 5 || locked} onClick={toggle}>{retired ? 'Reinstate this course' : 'Retire this course'}</Button></div>
        </fieldset></form>
      </CardContent></Card>}
      {admin && history && <Card><CardHeader><CardTitle><h2>Course history</h2></CardTitle></CardHeader><CardContent>
        {history.items.length === 0 ? <p>No reviewed changes have been recorded for this course.</p> : <ol className="space-y-3">{history.items.map(item => <li key={item.id} className="rounded border p-3 break-words">
          <p className="font-medium">{item.label}</p><p className="text-sm text-muted-foreground">{formatMoment(item.createdAt)}{item.actorName ? ` · ${item.actorName}` : ''}</p>{item.reason && <p>Reason: {item.reason}</p>}</li>)}</ol>}
        {history.truncated && <p className="mt-2 text-sm text-muted-foreground">Only the latest {history.limit} entries are shown.</p>}
      </CardContent></Card>}
    </>}
  </div></AppShell>;
}
