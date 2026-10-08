'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { SubmissionNotice, useChangeSubmission } from '@/components/academic-submission';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { readFailureMessage, readJson } from '@/lib/education/academic-lifecycle-client';
import type { ChangeResult } from '@/lib/education/academic-lifecycle-types';
import type { Principal } from '@/lib/education/types';

const blank = { code: '', title: '', description: '', gradeLevel: '' };

export default function NewCoursePage() {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(blank);
  const [created, setCreated] = useState<{ id: string; title: string } | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    readJson<Principal>('/api/session')
      .then((actor) => {
        if (mounted.current) setPrincipal(actor);
      })
      .catch((failure) => {
        if (mounted.current) setError(readFailureMessage(failure, 'Course creation'));
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
    return () => {
      mounted.current = false;
    };
  }, []);
  const saved = useCallback((result: ChangeResult) => {
    const item = result.receipt.items[0];
    setCreated({ id: item.subjectId, title: String(item.payload.title ?? 'the course') });
    setForm(blank);
  }, []);
  const submission = useChangeSubmission(saved);
  const locked = submission.busy || !!submission.pending;
  const admin = principal?.role === 'admin';
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setCreated(null);
    void submission.submit(`Course ${form.title.trim() || 'creation'}`, [
      {
        kind: 'course.create',
        code: form.code.trim(),
        title: form.title.trim(),
        description: form.description.trim() || null,
        gradeLevel: form.gradeLevel.trim(),
      },
    ]);
  };
  return (
    <AppShell principal={principal}>
      <div className="mx-auto max-w-2xl min-w-0 space-y-6 p-4">
        <div>
          <a href="/academic" className="text-sm underline">
            Courses, classes and enrolments
          </a>
          <h1 className="text-2xl font-bold">Add a course</h1>
          <p className="text-muted-foreground">
            New courses are recorded in the school history. Course codes are unique across the whole system.
          </p>
        </div>
        {loading && <p role="status">Checking your account…</p>}
        {error && (
          <p role="alert" className="rounded border p-3">
            {error}
          </p>
        )}
        {principal && !admin && (
          <p role="alert" className="rounded border p-3">
            Only a school administrator can add courses.
          </p>
        )}
        <SubmissionNotice submission={submission} />
        {created && (
          <p role="status" className="rounded border p-3 break-words">
            Course {created.title} was added.{' '}
            <a className="underline" href={'/courses/' + encodeURIComponent(created.id)}>
              Open course {created.title}
            </a>
          </p>
        )}
        {admin && (
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Course details</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4">
                <fieldset disabled={locked} className="min-w-0 space-y-4">
                  <div>
                    <Label htmlFor="new-course-code">Course code</Label>
                    <Input
                      id="new-course-code"
                      value={form.code}
                      required
                      maxLength={60}
                      onChange={(event) => setForm({ ...form, code: event.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-course-title">Course title</Label>
                    <Input
                      id="new-course-title"
                      value={form.title}
                      required
                      maxLength={200}
                      onChange={(event) => setForm({ ...form, title: event.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-course-description">Description (optional)</Label>
                    <Textarea
                      id="new-course-description"
                      value={form.description}
                      maxLength={2000}
                      onChange={(event) => setForm({ ...form, description: event.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-course-grade">Grade level</Label>
                    <Input
                      id="new-course-grade"
                      value={form.gradeLevel}
                      required
                      maxLength={40}
                      onChange={(event) => setForm({ ...form, gradeLevel: event.target.value })}
                    />
                  </div>
                  <Button type="submit">{submission.busy ? 'Saving…' : 'Add course'}</Button>
                </fieldset>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
