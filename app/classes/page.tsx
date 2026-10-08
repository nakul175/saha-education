'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- full-page links avoid the observed vinext beta transition failure. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Class, Course, Principal, School, User } from '@/lib/education/types';
type TeacherChoice = Pick<User, 'id' | 'name' | 'role'>;

const blank = { courseId: '', teacherId: '', name: '', term: '', schedule: '' };
async function read<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: 'no-store' });
  if (response.status === 401) {
    window.location.assign(new URL('/login', window.location.origin).href);
    throw new Error('Please sign in again.');
  }
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? 'Your account does not have permission for this view.'
        : 'Class choices could not be loaded. Reload and try again.',
    );
  return response.json() as Promise<T>;
}

export default function ClassesPage() {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const [school, setSchool] = useState<School | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<TeacherChoice[]>([]);
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [needsCheck, setNeedsCheck] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lock = useRef(false);
  const message = useRef<HTMLDivElement>(null);
  const isAdmin = principal?.role === 'admin';
  const busy = loading || saving;

  async function inventory(account: Principal) {
    if (account.role !== 'admin')
      return { rows: await read<Class[]>('/api/classes'), school: null, courses: [], teachers: [] };
    const [rows, schools, available, accounts] = await Promise.all([
      read<Class[]>('/api/classes'),
      read<School[]>('/api/schools'),
      read<Course[]>('/api/courses'),
      read<TeacherChoice[]>('/api/users?role=teacher'),
    ]);
    const currentSchool = schools.find((row) => row.id === account.schoolId);
    if (!currentSchool) throw new Error('Your school could not be verified. Reload before creating a class.');
    return {
      rows,
      school: currentSchool,
      courses: available.filter((row) => row.schoolId === account.schoolId),
      teachers: accounts.filter((row) => row.role === 'teacher'),
    };
  }
  const apply = useCallback((data: Awaited<ReturnType<typeof inventory>>) => {
    setClasses(data.rows);
    setSchool(data.school);
    setCourses(data.courses);
    setTeachers(data.teachers);
    setForm((previous) => ({
      ...previous,
      courseId: data.courses.some((row) => row.id === previous.courseId) ? previous.courseId : '',
      teacherId: data.teachers.some((row) => row.id === previous.teacherId) ? previous.teacherId : '',
    }));
    setReady(true);
  }, []);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const account = await read<Principal>('/api/session');
        if (active) setPrincipal(account);
        const data = await inventory(account);
        if (active) {
          setPrincipal(account);
          apply(data);
        }
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : 'Classes could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [apply]);
  useEffect(() => {
    if (error || notice) message.current?.focus();
  }, [error, notice]);

  async function reload() {
    if (lock.current || !principal) return;
    setLoading(true);
    setReady(false);
    setError(null);
    try {
      apply(await inventory(principal));
      setNeedsCheck(false);
      setNotice(
        'Classes and choices reloaded. Check the saved list before creating another class. Entered text is retained.',
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Classes could not be reloaded.');
    } finally {
      setLoading(false);
    }
  }
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (
      lock.current ||
      busy ||
      needsCheck ||
      !ready ||
      !isAdmin ||
      !school ||
      !courses.some((row) => row.id === form.courseId) ||
      !teachers.some((row) => row.id === form.teacherId)
    )
      return;
    lock.current = true;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, schoolId: school.id }),
      });
      if (!response.ok) {
        if (response.status === 401) window.location.assign(new URL('/login', window.location.origin).href);
        if (response.status >= 500) {
          setNeedsCheck(true);
          setError(
            'The class save could not be confirmed. Reload classes and check the saved list before creating another. Your entries are retained.',
          );
        } else {
          setNeedsCheck(response.status === 409);
          setError(
            response.status === 409
              ? 'Class choices or access changed. Reload classes before saving again. Your entries are retained.'
              : 'Class was not saved. Check your entries and permissions, then try again.',
          );
        }
        return;
      }
      setForm(blank);
      setNotice('Class created.');
      try {
        apply(await inventory(principal!));
      } catch {
        setNeedsCheck(true);
        setNotice(
          'Class created, but the list could not be refreshed. Reload classes before creating another.',
        );
      }
    } catch {
      setNeedsCheck(true);
      setError(
        'The class save could not be confirmed. Reload classes and check the saved list before creating another. Your entries are retained.',
      );
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  return (
    <AppShell principal={principal}>
      <div className="mx-auto max-w-6xl space-y-6 p-4">
        <div>
          <a href="/" className="text-sm underline">
            Dashboard
          </a>
          <h1>Classes</h1>
          <p className="text-muted-foreground">Classes available to your account.</p>
        </div>
        {(error || notice) && (
          <div
            ref={message}
            tabIndex={-1}
            role={error ? 'alert' : 'status'}
            className="rounded border p-3 break-words"
          >
            {error || notice}
          </div>
        )}
        {loading && <p role="status">Loading classes…</p>}
        <Button type="button" variant="outline" onClick={() => void reload()} disabled={busy || !principal}>
          Reload classes and check saved records
        </Button>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Class list</CardTitle>
            </CardHeader>
            <CardContent>
              {!loading && classes.length === 0 ? (
                <p>No classes found.</p>
              ) : (
                <ul className="space-y-3">
                  {classes.map((row) => (
                    <li key={row.id} className="rounded border p-3 break-words">
                      <a href={'/classes/' + encodeURIComponent(row.id)} className="font-semibold underline">
                        {row.name}
                      </a>
                      <p>
                        {row.term}
                        {row.schedule ? ' · ' + row.schedule : ''}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Course: {courses.find((course) => course.id === row.courseId)?.title ?? row.courseId}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle>Create class</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 break-words">School: {school?.name ?? 'Not verified'}</p>
                <form onSubmit={create} className="space-y-4">
                  <fieldset disabled={busy || needsCheck || !ready} className="min-w-0 space-y-4">
                    <div>
                      <Label htmlFor="class-course">Course</Label>
                      <select
                        id="class-course"
                        required
                        className="h-11 w-full rounded border bg-white px-3"
                        value={form.courseId}
                        onChange={(event) =>
                          setForm((previous) => ({ ...previous, courseId: event.target.value }))
                        }
                      >
                        <option value="">Choose a course</option>
                        {courses.map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.title} ({row.code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="class-teacher">Teacher</Label>
                      <select
                        id="class-teacher"
                        required
                        className="h-11 w-full rounded border bg-white px-3"
                        value={form.teacherId}
                        onChange={(event) =>
                          setForm((previous) => ({ ...previous, teacherId: event.target.value }))
                        }
                      >
                        <option value="">Choose a teacher</option>
                        {teachers.map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="class-name">Class name</Label>
                      <Input
                        id="class-name"
                        value={form.name}
                        required
                        onChange={(event) =>
                          setForm((previous) => ({ ...previous, name: event.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="class-term">Term</Label>
                      <Input
                        id="class-term"
                        value={form.term}
                        required
                        onChange={(event) =>
                          setForm((previous) => ({ ...previous, term: event.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="class-schedule">Schedule (optional)</Label>
                      <Input
                        id="class-schedule"
                        value={form.schedule}
                        onChange={(event) =>
                          setForm((previous) => ({ ...previous, schedule: event.target.value }))
                        }
                      />
                    </div>
                    <Button type="submit" disabled={!school || !courses.length || !teachers.length}>
                      {saving ? 'Saving…' : 'Create class'}
                    </Button>
                  </fieldset>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}
