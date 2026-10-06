'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- full-page links avoid the observed vinext beta transition failure. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { SubmissionNotice, useChangeSubmission } from '@/components/academic-submission';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { readFailureMessage, readJson } from '@/lib/education/academic-lifecycle-client';
import type { ChangeResult } from '@/lib/education/academic-lifecycle-types';
import type { Course, Principal } from '@/lib/education/types';

type Teacher = { id: string; name: string };
const blank = { courseId: '', teacherId: '', name: '', term: '', schedule: '', capacity: '', startsOn: '', endsOn: '' };

export default function NewClassPage() {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [retired, setRetired] = useState<Set<string>>(new Set());
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(blank);
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  const mounted = useRef(true), generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const load = useCallback(async () => {
    const ticket = ++generation.current; const current = () => mounted.current && ticket === generation.current;
    setLoading(true); setError(null);
    try {
      const actor = await readJson<Principal>('/api/session');
      if (actor.role !== 'admin') { if (current()) setPrincipal(actor); return; }
      const [courseRows, states, teacherRows] = await Promise.all([readJson<Course[]>('/api/courses'), readJson<{ courseId: string; status: string }[]>('/api/course-lifecycles'), readJson<Teacher[]>('/api/users?role=teacher')]);
      if (!current()) return;
      setPrincipal(actor); setCourses(courseRows); setRetired(new Set(states.filter(row => row.status === 'retired').map(row => row.courseId))); setTeachers(teacherRows);
    } catch (failure) { if (current()) setError(readFailureMessage(failure, 'Class creation')); }
    finally { if (current()) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => { mounted.current = false; invalidate(); };
  }, [load, invalidate]);
  const saved = useCallback((result: ChangeResult) => {
    const item = result.receipt.items[0];
    setCreated({ id: item.subjectId, name: String(item.payload.name ?? 'the class') }); setForm(blank); void load();
  }, [load]);
  const submission = useChangeSubmission(saved);
  const locked = submission.busy || !!submission.pending || loading;
  const admin = principal?.role === 'admin';
  const active = courses.filter(course => !retired.has(course.id));
  const capacityText = form.capacity.trim();
  const capacityInvalid = capacityText !== '' && !/^[0-9]{1,3}$/.test(capacityText);
  const submit = (event: React.FormEvent) => {
    event.preventDefault(); if (capacityInvalid) return; setCreated(null);
    void submission.submit(`Class ${form.name.trim() || 'creation'}`, [{ kind: 'class.create', courseId: form.courseId, teacherId: form.teacherId, name: form.name.trim(), term: form.term.trim(),
      schedule: form.schedule.trim() || null, capacity: capacityText ? Number(capacityText) : null, startsOn: form.startsOn || null, endsOn: form.endsOn || null }]);
  };
  return <AppShell principal={principal}><div className="mx-auto max-w-2xl min-w-0 space-y-6 p-4">
    <div><a href="/academic" className="text-sm underline">Courses, classes and enrolments</a><h1 className="text-2xl font-bold">Add a class</h1>
      <p className="text-muted-foreground">A class belongs to one active course and one teacher. Capacity and dates are optional and can be changed later.</p></div>
    {loading && <p role="status">Loading courses and teachers…</p>}
    {error && <p role="alert" className="rounded border p-3">{error}</p>}
    {principal && !admin && <p role="alert" className="rounded border p-3">Only a school administrator can add classes.</p>}
    <SubmissionNotice submission={submission} />
    {created && <p role="status" className="rounded border p-3 break-words">Class {created.name} was added. <a className="underline" href={'/classes/' + encodeURIComponent(created.id) + '/manage'}>Open settings for {created.name}</a></p>}
    {admin && <Card><CardHeader><CardTitle>Class details</CardTitle></CardHeader><CardContent>
      {active.length === 0 && !loading && <p role="status" className="mb-3">No active course is available. <a className="underline" href="/courses/new">Add a course</a> or reinstate a retired one first.</p>}
      {teachers.length === 0 && !loading && <p role="status" className="mb-3">No teacher account is available in your school.</p>}
      <form onSubmit={submit} className="space-y-4"><fieldset disabled={locked} className="min-w-0 space-y-4">
        <div><Label htmlFor="new-class-course">Course</Label><select id="new-class-course" required className="h-11 w-full rounded border bg-white px-3" value={form.courseId} onChange={event => setForm({ ...form, courseId: event.target.value })}>
          <option value="">Choose a course</option>{active.map(course => <option key={course.id} value={course.id}>{course.title} ({course.code})</option>)}</select></div>
        <div><Label htmlFor="new-class-teacher">Teacher</Label><select id="new-class-teacher" required className="h-11 w-full rounded border bg-white px-3" value={form.teacherId} onChange={event => setForm({ ...form, teacherId: event.target.value })}>
          <option value="">Choose a teacher</option>{teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></div>
        <div><Label htmlFor="new-class-name">Class name</Label><Input id="new-class-name" value={form.name} required maxLength={120} onChange={event => setForm({ ...form, name: event.target.value })} /></div>
        <div><Label htmlFor="new-class-term">Term</Label><Input id="new-class-term" value={form.term} required maxLength={80} onChange={event => setForm({ ...form, term: event.target.value })} /></div>
        <div><Label htmlFor="new-class-schedule">Schedule (optional)</Label><Input id="new-class-schedule" value={form.schedule} maxLength={200} onChange={event => setForm({ ...form, schedule: event.target.value })} /></div>
        <div><Label htmlFor="new-class-capacity">Capacity (optional, 1 to 500)</Label><Input id="new-class-capacity" inputMode="numeric" value={form.capacity} aria-invalid={capacityInvalid} aria-describedby="new-class-capacity-help" onChange={event => setForm({ ...form, capacity: event.target.value })} />
          <p id="new-class-capacity-help" className={capacityInvalid ? 'text-sm text-red-700' : 'text-sm text-muted-foreground'}>{capacityInvalid ? 'Enter a whole number from 1 to 500, or leave blank for no limit.' : 'Leave blank for no limit.'}</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="new-class-starts">Start date (optional)</Label><Input id="new-class-starts" type="date" value={form.startsOn} onChange={event => setForm({ ...form, startsOn: event.target.value })} /></div>
          <div><Label htmlFor="new-class-ends">End date (optional)</Label><Input id="new-class-ends" type="date" value={form.endsOn} onChange={event => setForm({ ...form, endsOn: event.target.value })} /></div></div>
        <Button type="submit" disabled={capacityInvalid || !form.courseId || !form.teacherId}>{submission.busy ? 'Saving…' : 'Add class'}</Button>
      </fieldset></form>
    </CardContent></Card>}
  </div></AppShell>;
}
