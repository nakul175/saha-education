'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- full-page links avoid the observed vinext beta transition failure. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Course, Principal, School } from '@/lib/education/types';

const blank = { code: '', title: '', description: '', gradeLevel: '' };
async function read<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: 'no-store' });
  if (response.status === 401) { window.location.assign(new URL('/login', window.location.origin).href); throw new Error('Please sign in again.'); }
  if (!response.ok) throw new Error(response.status === 403 ? 'Your account does not have permission for this view.' : 'Courses could not be loaded. Reload and try again.');
  return response.json() as Promise<T>;
}

export default function CoursesPage() {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [needsCheck, setNeedsCheck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lock = useRef(false);
  const message = useRef<HTMLDivElement>(null);
  const busy = loading || saving;
  const isAdmin = principal?.role === 'admin';
  async function inventory(account: Principal) {
    const rows = await read<Course[]>('/api/courses');
    if (account.role !== 'admin') return { rows, school: null };
    const schools = await read<School[]>('/api/schools');
    const currentSchool = schools.find(row => row.id === account.schoolId);
    if (!currentSchool) throw new Error('Your school could not be verified. Reload before creating a course.');
    return { rows, school: currentSchool };
  }
  const apply = useCallback((data: Awaited<ReturnType<typeof inventory>>) => { setCourses(data.rows); setSchool(data.school); setReady(true); }, []);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const account = await read<Principal>('/api/session');
        if (active) setPrincipal(account);
        const data = await inventory(account);
        if (active) { setPrincipal(account); apply(data); }
      } catch (failure) { if (active) setError(failure instanceof Error ? failure.message : 'Courses could not be loaded.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [apply]);
  useEffect(() => { if (error || notice) message.current?.focus(); }, [error, notice]);
  async function reload() {
    if (lock.current || !principal) return;
    setLoading(true); setReady(false); setError(null);
    try { apply(await inventory(principal)); setNeedsCheck(false); setNotice('Courses reloaded. Check the saved list before creating another course. Entered text is retained.'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Courses could not be reloaded.'); }
    finally { setLoading(false); }
  }
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || busy || needsCheck || !ready || !isAdmin || !school) return;
    lock.current = true; setSaving(true); setError(null); setNotice(null);
    try {
      const response = await fetch('/api/courses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, schoolId: school.id }) });
      if (!response.ok) {
        if (response.status === 401) window.location.assign(new URL('/login', window.location.origin).href);
        if (response.status >= 500) { setNeedsCheck(true); setError('The course save could not be confirmed. Reload courses and check the saved list before creating another. Your entries are retained.'); }
        else { setNeedsCheck(response.status === 409); setError(response.status === 409 ? 'Course choices or access changed. Reload courses before saving again. Your entries are retained.' : 'Course was not saved. Check your entries and permissions, then try again.'); }
        return;
      }
      setForm(blank); setNotice('Course created.');
      try { apply(await inventory(principal!)); }
      catch { setNeedsCheck(true); setNotice('Course created, but the list could not be refreshed. Reload courses before creating another.'); }
    } catch { setNeedsCheck(true); setError('The course save could not be confirmed. Reload courses and check the saved list before creating another. Your entries are retained.'); }
    finally { lock.current = false; setSaving(false); }
  }
  return <div className="mx-auto max-w-6xl space-y-6 p-4">
    <div><a href="/" className="text-sm underline">Dashboard</a><h1>Course catalog</h1><p className="text-muted-foreground">Courses available in your school.</p></div>
    {(error || notice) && <div ref={message} tabIndex={-1} role={error ? 'alert' : 'status'} className="rounded border p-3 break-words">{error || notice}</div>}
    {loading && <p role="status">Loading courses…</p>}
    <Button type="button" variant="outline" onClick={() => void reload()} disabled={busy || !principal}>Reload courses and check saved records</Button>
    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Course list</CardTitle></CardHeader><CardContent>
        {!loading && courses.length === 0 ? <p>No courses found.</p> : <ul className="space-y-3">{courses.map(row => <li key={row.id} className="rounded border p-3 break-words"><h2>{row.title}</h2><p>Code: {row.code}</p><p>Grade level: {row.gradeLevel}</p>{row.description && <p className="whitespace-pre-wrap">{row.description}</p>}</li>)}</ul>}
      </CardContent></Card>
      {isAdmin && <Card><CardHeader><CardTitle>Create course</CardTitle></CardHeader><CardContent>
        <p className="mb-4 break-words">School: {school?.name ?? 'Not verified'}</p>
        <form onSubmit={create} className="space-y-4"><fieldset disabled={busy || needsCheck || !ready} className="min-w-0 space-y-4">
          <div><Label htmlFor="course-code">Course code</Label><Input id="course-code" value={form.code} required onChange={event => setForm(previous => ({ ...previous, code: event.target.value }))} /></div>
          <div><Label htmlFor="course-title">Course title</Label><Input id="course-title" value={form.title} required onChange={event => setForm(previous => ({ ...previous, title: event.target.value }))} /></div>
          <div><Label htmlFor="course-description">Description (optional)</Label><Textarea id="course-description" value={form.description} onChange={event => setForm(previous => ({ ...previous, description: event.target.value }))} /></div>
          <div><Label htmlFor="course-grade">Grade level</Label><Input id="course-grade" value={form.gradeLevel} required onChange={event => setForm(previous => ({ ...previous, gradeLevel: event.target.value }))} /></div>
          <Button type="submit" disabled={!school}>{saving ? 'Saving…' : 'Create course'}</Button>
        </fieldset></form>
      </CardContent></Card>}
    </div>
  </div>;
}
