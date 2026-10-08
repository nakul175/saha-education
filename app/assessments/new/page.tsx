'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- native navigation avoids the observed client transition failure. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isExactCalendarDate } from '@/lib/education/calendar-date';
import {
  failureMessage,
  formatDay,
  jsonInit,
  kindLabel,
  kindLabels,
  lifecycleRequest,
  LifecycleRequestError,
  maximumPattern,
} from '@/lib/education/lifecycle-client';
import { useSession } from '@/lib/education/use-session';
import type { Assessment, Class } from '@/lib/education/types';

const selectClass = 'w-full min-w-0 rounded border bg-background px-3 py-2';
const empty = { classId: '', title: '', kind: 'exam', date: '', maxScore: '' };
type Field = keyof typeof empty;

export default function NewAssessmentPage() {
  const session = useSession();
  const staff = session.principal?.role === 'admin' || session.principal?.role === 'teacher';
  const [classes, setClasses] = useState<Class[]>([]);
  const [classState, setClassState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [form, setForm] = useState(empty);
  const [problems, setProblems] = useState<Partial<Record<Field, string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [created, setCreated] = useState<{
    id: string;
    title: string;
    className: string;
    kind: string;
    date: string;
    maxScore: number;
  } | null>(null);
  const inFlight = useRef(false);
  const message = useRef<HTMLDivElement>(null);

  const loadClasses = useCallback(async () => {
    setClassState('loading');
    try {
      const { body } = await lifecycleRequest<Class[]>('/api/classes');
      if (!Array.isArray(body)) throw new Error('shape');
      setClasses(body);
      setClassState('ready');
    } catch {
      setClassState('error');
    }
  }, []);
  useEffect(() => {
    if (!staff) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadClasses();
  }, [staff, loadClasses]);
  useEffect(() => {
    if (error || created) message.current?.focus();
  }, [error, created]);

  const edit = (field: Field, value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    setProblems((previous) => ({ ...previous, [field]: undefined }));
  };

  function validate(): Partial<Record<Field, string>> {
    const found: Partial<Record<Field, string>> = {};
    if (!form.classId) found.classId = 'Choose the class this assessment belongs to.';
    if (!form.title.trim()) found.title = 'Enter a title.';
    else if (form.title.trim().length > 200) found.title = 'Use at most 200 characters.';
    if (!(form.kind in kindLabels)) found.kind = 'Choose a type.';
    if (!form.date) found.date = 'Choose the assessment date.';
    else if (!isExactCalendarDate(form.date)) found.date = 'Enter a real calendar date.';
    if (!form.maxScore.trim()) found.maxScore = 'Enter the maximum score.';
    else if (!maximumPattern.test(form.maxScore.trim()))
      found.maxScore = 'Enter a whole number from 0 to 9999999 using digits only.';
    return found;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || saving) return;
    const found = validate();
    setProblems(found);
    if (Object.keys(found).length) {
      setError('Some details need attention. Fix the marked fields and save again.');
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError(null);
    setUnconfirmed(false);
    const maxScore = Number(form.maxScore.trim());
    try {
      const { body } = await lifecycleRequest<Assessment>(
        '/api/assessments',
        jsonInit('POST', {
          classId: form.classId,
          title: form.title.trim(),
          kind: form.kind,
          date: form.date,
          maxScore,
        }),
      );
      if (!body || typeof body.id !== 'string' || !body.id || body.classId !== form.classId)
        throw new LifecycleRequestError(201, null, true);
      setCreated({
        id: body.id,
        title: body.title,
        className: classes.find((row) => row.id === form.classId)?.name ?? 'the selected class',
        kind: body.kind,
        date: body.date,
        maxScore: body.maxScore,
      });
      setForm(empty);
    } catch (cause) {
      const lost = cause instanceof LifecycleRequestError && cause.unconfirmed;
      setUnconfirmed(lost);
      setError(
        lost
          ? 'Saving could not be confirmed, so the assessment may or may not exist. Open the assessment list and check before creating it again; nothing is repeated automatically.'
          : failureMessage(cause, 'saving the assessment'),
      );
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  const invalid = (field: Field) =>
    problems[field] ? { 'aria-invalid': true, 'aria-describedby': 'problem-' + field } : {};
  const note = (field: Field) =>
    problems[field] && (
      <p id={'problem-' + field} className="mt-1 text-sm text-red-700 dark:text-red-400">
        {problems[field]}
      </p>
    );
  return (
    <AppShell principal={session.principal}>
      <div className="mx-auto max-w-2xl min-w-0 space-y-6 p-4">
        <h1 className="text-2xl font-bold">New assessment</h1>
        <p>
          Add an exam, quiz, assignment or project to one of your classes. You record results afterwards;
          nothing is visible to families until results are published.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <a href="/assessments/manage" className="underline">
            Back to manage assessments
          </a>
        </div>
        {session.status === 'loading' && <p role="status">Checking your account…</p>}
        {session.status === 'denied' && (
          <p role="alert">Sign in with a staff account to create assessments.</p>
        )}
        {session.status === 'error' && (
          <div className="space-y-2">
            <p role="alert">Your account could not be confirmed. Try again.</p>
            <Button type="button" variant="outline" onClick={session.reload}>
              Try again
            </Button>
          </div>
        )}
        {session.status === 'ready' && !staff && (
          <p role="alert">Creating assessments is available to teachers and school administrators.</p>
        )}
        {staff && (
          <>
            {(error || created) && (
              <div
                ref={message}
                tabIndex={-1}
                role={error ? 'alert' : 'status'}
                className="space-y-2 break-words rounded border p-3"
              >
                {error && <p>{error}</p>}
                {unconfirmed && (
                  <a className="underline" href="/assessments/manage">
                    Check the assessment list
                  </a>
                )}
                {created && (
                  <>
                    <p>
                      Assessment saved: {created.title} for {created.className}, {kindLabel(created.kind)} on{' '}
                      {formatDay(created.date)}, maximum {created.maxScore}.
                    </p>
                    <div className="flex flex-wrap gap-4">
                      <a className="underline" href={'/assessments/' + encodeURIComponent(created.id)}>
                        Enter results
                      </a>
                      <a
                        className="underline"
                        href={'/assessments/' + encodeURIComponent(created.id) + '/manage'}
                      >
                        Details and publication
                      </a>
                      <button type="button" className="underline" onClick={() => setCreated(null)}>
                        Create another
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            {classState === 'loading' && <p role="status">Loading your classes…</p>}
            {classState === 'error' && (
              <div className="space-y-2">
                <p role="alert">Your classes could not be loaded.</p>
                <Button type="button" variant="outline" onClick={() => void loadClasses()}>
                  Try again
                </Button>
              </div>
            )}
            {classState === 'ready' && classes.length === 0 && (
              <p role="status">
                You have no classes yet, so there is nowhere to add an assessment. Ask a school administrator
                to assign you to a class.
              </p>
            )}
            {classState === 'ready' && classes.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Assessment details</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={submit} noValidate className="space-y-4">
                    <fieldset disabled={saving} className="min-w-0 space-y-4">
                      <div>
                        <Label htmlFor="new-class">Class</Label>
                        <select
                          id="new-class"
                          className={selectClass}
                          value={form.classId}
                          onChange={(event) => edit('classId', event.target.value)}
                          {...invalid('classId')}
                        >
                          <option value="">Choose a class</option>
                          {classes.map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.name}
                            </option>
                          ))}
                        </select>
                        {note('classId')}
                      </div>
                      <div>
                        <Label htmlFor="new-title">Title</Label>
                        <Input
                          id="new-title"
                          value={form.title}
                          maxLength={200}
                          onChange={(event) => edit('title', event.target.value)}
                          {...invalid('title')}
                        />
                        {note('title')}
                      </div>
                      <div>
                        <Label htmlFor="new-kind">Type</Label>
                        <select
                          id="new-kind"
                          className={selectClass}
                          value={form.kind}
                          onChange={(event) => edit('kind', event.target.value)}
                          {...invalid('kind')}
                        >
                          {Object.entries(kindLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                        {note('kind')}
                      </div>
                      <div>
                        <Label htmlFor="new-date">Date</Label>
                        <Input
                          id="new-date"
                          type="date"
                          value={form.date}
                          onChange={(event) => edit('date', event.target.value)}
                          {...invalid('date')}
                        />
                        {note('date')}
                      </div>
                      <div>
                        <Label htmlFor="new-max">Maximum score</Label>
                        <Input
                          id="new-max"
                          inputMode="numeric"
                          autoComplete="off"
                          value={form.maxScore}
                          onChange={(event) => edit('maxScore', event.target.value)}
                          {...invalid('maxScore')}
                        />
                        {note('maxScore')}
                        <p className="mt-1 text-sm text-muted-foreground">
                          A whole number. A score of 0 is a real result and is kept as 0.
                        </p>
                      </div>
                      <Button type="submit" disabled={saving}>
                        {saving ? 'Saving…' : 'Save assessment'}
                      </Button>
                    </fieldset>
                  </form>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
