'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- full-page links avoid the observed vinext beta transition failure. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { readFailureMessage, readJson } from '@/lib/education/academic-lifecycle-client';
import type { Class, Course, Principal } from '@/lib/education/types';

type CourseState = { courseId: string; status: 'active' | 'retired' };
const isStaff = (actor: Principal | null) => actor?.role === 'admin' || actor?.role === 'teacher';

export default function AcademicHubPage() {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [states, setStates] = useState<Record<string, 'active' | 'retired'>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0),
    mounted = useRef(true),
    controller = useRef<AbortController | null>(null);
  const invalidate = useCallback(() => {
    generation.current++;
    controller.current?.abort();
  }, []);
  const reload = useCallback(async () => {
    const ticket = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const current = () => mounted.current && ticket === generation.current && !abort.signal.aborted;
    setLoading(true);
    setError(null);
    setPrincipal(null);
    setCourses([]);
    setClasses([]);
    try {
      const actor = await readJson<Principal>('/api/session', abort.signal);
      const [courseRows, classRows, courseStates] = await Promise.all([
        readJson<Course[]>('/api/courses', abort.signal),
        readJson<Class[]>('/api/classes', abort.signal),
        readJson<CourseState[]>('/api/course-lifecycles', abort.signal),
      ]);
      const verified = await readJson<Principal>('/api/session', abort.signal);
      if (!current()) return;
      if (
        !actor.id ||
        actor.id !== verified.id ||
        actor.role !== verified.role ||
        actor.schoolId !== verified.schoolId
      )
        throw new Error('Unconfirmed account');
      setPrincipal(actor);
      setCourses(courseRows);
      setClasses(classRows);
      setStates(Object.fromEntries(courseStates.map((row) => [row.courseId, row.status])));
    } catch (failure) {
      if (!current()) return;
      setError(readFailureMessage(failure, 'Courses and classes'));
    } finally {
      if (current()) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    return () => {
      mounted.current = false;
      invalidate();
    };
  }, [reload, invalidate]);
  const admin = principal?.role === 'admin';
  const courseTitle = (id: string) => courses.find((row) => row.id === id)?.title ?? 'Course';
  return (
    <AppShell principal={principal}>
      <div className="mx-auto max-w-6xl min-w-0 space-y-6 p-4">
        <div>
          <a href="/" className="text-sm underline">
            Dashboard
          </a>
          <h1 className="text-2xl font-bold">Courses, classes and enrolments</h1>
          <p className="text-muted-foreground">
            Review courses and class rosters. Changes are made through reviewed requests that are recorded
            with their reason.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void reload()} disabled={loading}>
          Reload courses and classes
        </Button>
        {loading && <p role="status">Loading courses and classes…</p>}
        {error && (
          <p role="alert" className="rounded border p-3">
            {error}
          </p>
        )}
        {principal && !error && (
          <>
            {!isStaff(principal) && (
              <p role="status">
                This page is for school staff. Open Enrolment history to see your student&apos;s classes.
              </p>
            )}
            <nav aria-label="Enrolment tasks" className="flex flex-wrap gap-3">
              {admin && (
                <a className="underline" href="/courses/new">
                  Add a course
                </a>
              )}
              {admin && (
                <a className="underline" href="/classes/new">
                  Add a class
                </a>
              )}
              <a className="underline" href="/enrolments/history">
                Enrolment history
              </a>
            </nav>
            {isStaff(principal) && (
              <div className="grid min-w-0 gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>
                      <h2>Courses</h2>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="mb-3" role="status">
                      {courses.length} {courses.length === 1 ? 'course' : 'courses'} in your school.
                    </p>
                    {courses.length === 0 ? (
                      <p>No courses have been added yet.</p>
                    ) : (
                      <ul className="space-y-3">
                        {courses.map((course) => (
                          <li key={course.id} className="rounded border p-3 break-words">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-medium">{course.title}</h3>
                              <Badge variant={states[course.id] === 'retired' ? 'outline' : 'secondary'}>
                                {states[course.id] === 'retired' ? 'Retired' : 'Active'}
                              </Badge>
                            </div>
                            <p>
                              Code: {course.code} · Grade level: {course.gradeLevel}
                            </p>
                            <a className="underline" href={'/courses/' + encodeURIComponent(course.id)}>
                              Open course {course.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>
                      <h2>Classes</h2>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="mb-3" role="status">
                      {classes.length} {classes.length === 1 ? 'class' : 'classes'}{' '}
                      {admin ? 'in your school' : 'assigned to you'}.
                    </p>
                    {classes.length === 0 ? (
                      <p>
                        {admin
                          ? 'No classes have been added yet.'
                          : 'No classes are currently assigned to you.'}
                      </p>
                    ) : (
                      <ul className="space-y-3">
                        {classes.map((row) => (
                          <li key={row.id} className="rounded border p-3 break-words">
                            <h3 className="font-medium">{row.name}</h3>
                            <p>
                              {courseTitle(row.courseId)} · Term {row.term}
                            </p>
                            <p className="flex flex-wrap gap-3">
                              <a
                                className="underline"
                                href={'/classes/' + encodeURIComponent(row.id) + '/roster'}
                              >
                                Roster for {row.name}
                              </a>
                              {admin && (
                                <a
                                  className="underline"
                                  href={'/classes/' + encodeURIComponent(row.id) + '/manage'}
                                >
                                  Settings for {row.name}
                                </a>
                              )}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
