'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- native navigation avoids the observed client transition failure. */

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isExactCalendarDate } from '@/lib/education/calendar-date';
import {
  failureMessage,
  formatDay,
  formatStamp,
  jsonInit,
  kindLabel,
  kindLabels,
  lifecycleRequest,
  LifecycleRequestError,
  maximumPattern,
  requestIdFor,
  stateLabels,
} from '@/lib/education/lifecycle-client';
import { useSession } from '@/lib/education/use-session';
import type {
  AssessmentLifecycle,
  PublicationOutcome,
  RevisionOutcome,
} from '@/lib/education/assessment-lifecycle';

const selectClass = 'w-full min-w-0 rounded border bg-background px-3 py-2';
type Form = { title: string; kind: string; date: string; maxScore: string; reason: string };
type Slot = { current: { body: string; id: string } | null };
const reasonLength = (value: string) => [...value.trim()].length;
const toForm = (data: AssessmentLifecycle): Form => ({
  title: data.assessment.title,
  kind: data.assessment.kind,
  date: data.assessment.invalidDate ? '' : data.assessment.date,
  maxScore: data.assessment.maxScore === null ? '' : String(data.assessment.maxScore),
  reason: '',
});

export default function ManageAssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const session = useSession();
  const staff = session.principal?.role === 'admin' || session.principal?.role === 'teacher';
  const [data, setData] = useState<AssessmentLifecycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({ title: '', kind: 'exam', date: '', maxScore: '', reason: '' });
  const [problems, setProblems] = useState<Partial<Record<keyof Form, string>>>({});
  const [partial, setPartial] = useState(false);
  const [unpublishReason, setUnpublishReason] = useState('');
  const [busy, setBusy] = useState<null | 'edit' | 'publish' | 'unpublish'>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState<null | 'edit' | 'publish' | 'unpublish'>(null);
  const generation = useRef(0),
    inFlight = useRef(false);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  const editSlot: Slot = useRef<Slot['current']>(null) as Slot,
    publishSlot: Slot = useRef<Slot['current']>(null) as Slot,
    unpublishSlot: Slot = useRef<Slot['current']>(null) as Slot;
  const message = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (keepMessage = false) => {
      const ticket = ++generation.current;
      setLoading(true);
      setLoadError(null);
      if (!keepMessage) {
        setNotice(null);
        setError(null);
        setRetryable(null);
      }
      try {
        const { body } = await lifecycleRequest<AssessmentLifecycle>(
          '/api/assessments/' + encodeURIComponent(id) + '/lifecycle',
        );
        if (ticket !== generation.current) return;
        if (!body?.assessment || body.assessment.id !== id) throw new LifecycleRequestError(200, null, true);
        setData(body);
        setForm(toForm(body));
        setProblems({});
        setPartial(false);
        setUnpublishReason('');
      } catch (cause) {
        if (ticket !== generation.current) return;
        setData(null);
        setLoadError(
          cause instanceof LifecycleRequestError && cause.status === 404
            ? 'This assessment was not found among your classes. Return to the list and choose again.'
            : failureMessage(cause, 'loading this assessment'),
        );
      } finally {
        if (ticket === generation.current) setLoading(false);
      }
    },
    [id],
  );
  useEffect(() => {
    if (!staff) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return invalidate;
  }, [staff, load, invalidate]);
  useEffect(() => {
    if (error || notice) message.current?.focus();
  }, [error, notice]);

  const assessment = data?.assessment;
  const readiness = data?.readiness;
  const edit = (field: keyof Form, value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    setProblems((previous) => ({ ...previous, [field]: undefined }));
  };

  async function act(kind: 'edit' | 'publish' | 'unpublish') {
    if (!data || !assessment || !readiness || inFlight.current) return;
    let path = '/api/assessments/' + encodeURIComponent(id),
      init: RequestInit;
    if (kind === 'edit') {
      const found: Partial<Record<keyof Form, string>> = {};
      if (!form.title.trim()) found.title = 'Enter a title.';
      else if (form.title.trim().length > 200) found.title = 'Use at most 200 characters.';
      if (!(form.kind in kindLabels)) found.kind = 'Choose a type.';
      if (!form.date) found.date = 'Choose the assessment date.';
      else if (!isExactCalendarDate(form.date)) found.date = 'Enter a real calendar date.';
      if (!maximumPattern.test(form.maxScore.trim()))
        found.maxScore = 'Enter a whole number from 0 to 9999999 using digits only.';
      if (form.reason.trim() && (reasonLength(form.reason) < 10 || reasonLength(form.reason) > 500))
        found.reason = 'Use between 10 and 500 characters.';
      if (assessment.recordedResults > 0 && !found.reason && reasonLength(form.reason) < 10)
        found.reason = 'Results are already saved, so give a reason of at least 10 characters.';
      setProblems(found);
      if (Object.keys(found).length) {
        setError('Some details need attention. Fix the marked fields and save again.');
        setNotice(null);
        return;
      }
      const details = {
        title: form.title.trim(),
        kind: form.kind,
        maxScore: Number(form.maxScore.trim()),
        date: form.date,
      };
      if (
        details.title === assessment.title &&
        details.kind === assessment.kind &&
        details.maxScore === assessment.maxScore &&
        details.date === assessment.date
      ) {
        setError(null);
        setNotice('Nothing has changed, so there is nothing to save.');
        return;
      }
      const expected = {
        title: assessment.title,
        kind: assessment.kind,
        maxScore: assessment.maxScore as number,
        date: assessment.date,
        updatedAt: assessment.updatedAt,
      };
      const reason = form.reason.trim() || undefined;
      const body = { expected, details, ...(reason ? { reason } : {}) };
      init = jsonInit('PATCH', { clientRequestId: requestIdFor(editSlot, JSON.stringify(body)), ...body });
    } else if (kind === 'publish') {
      if (readiness.needsPartialConfirmation && !partial) {
        setError('Confirm that you want to publish with some pupils missing a result.');
        setNotice(null);
        return;
      }
      path += '/lifecycle';
      const body = {
        action: 'publish',
        ...(readiness.needsPartialConfirmation ? { partialConfirmed: true } : {}),
      };
      init = jsonInit('POST', { clientRequestId: requestIdFor(publishSlot, JSON.stringify(body)), ...body });
    } else {
      if (reasonLength(unpublishReason) < 10 || reasonLength(unpublishReason) > 500) {
        setError('Give a reason of 10 to 500 characters before unpublishing.');
        setNotice(null);
        return;
      }
      path += '/lifecycle';
      const body = { action: 'unpublish', reason: unpublishReason.trim() };
      init = jsonInit('POST', {
        clientRequestId: requestIdFor(unpublishSlot, JSON.stringify(body)),
        ...body,
      });
    }
    inFlight.current = true;
    setBusy(kind);
    setError(null);
    setNotice(null);
    setRetryable(null);
    const slot = kind === 'edit' ? editSlot : kind === 'publish' ? publishSlot : unpublishSlot;
    try {
      const { body } = await lifecycleRequest<PublicationOutcome | RevisionOutcome>(path, init);
      const replayed = !!body && typeof body === 'object' && 'replayed' in body && body.replayed === true;
      slot.current = null;
      setNotice(
        kind === 'edit'
          ? replayed
            ? 'These details were already saved.'
            : 'Details saved. The change is recorded in the history below.'
          : kind === 'publish'
            ? replayed
              ? 'These results were already published.'
              : 'Results published. They can now be used in report cards.'
            : replayed
              ? 'These results were already unpublished.'
              : 'Results unpublished. They are no longer available for new report cards.',
      );
      await load(true);
    } catch (cause) {
      const lost = cause instanceof LifecycleRequestError && cause.unconfirmed;
      if (!lost) slot.current = null;
      setRetryable(lost ? kind : null);
      setError(
        failureMessage(
          cause,
          kind === 'edit'
            ? 'saving the details'
            : kind === 'publish'
              ? 'publishing the results'
              : 'unpublishing the results',
        ),
      );
      if (
        cause instanceof LifecycleRequestError &&
        !lost &&
        cause.code &&
        ['stale', 'changed', 'published', 'not_ready', 'in_published_report'].includes(cause.code)
      )
        await load(true);
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  const invalid = (field: keyof Form) =>
    problems[field] ? { 'aria-invalid': true, 'aria-describedby': 'problem-' + field } : {};
  const note = (field: keyof Form) =>
    problems[field] && (
      <p id={'problem-' + field} className="mt-1 text-sm text-red-700 dark:text-red-400">
        {problems[field]}
      </p>
    );
  const disabled = busy !== null || loading;
  const state = assessment?.state;

  return (
    <AppShell principal={session.principal}>
      <div className="mx-auto max-w-3xl min-w-0 space-y-6 p-4">
        <h1 className="text-2xl font-bold">Assessment details and publication</h1>
        <div className="flex flex-wrap items-center gap-4">
          <a href="/assessments/manage" className="underline">
            Back to manage assessments
          </a>
          {assessment && (
            <a href={'/assessments/' + encodeURIComponent(id)} className="underline">
              Enter or review results
            </a>
          )}
        </div>
        {session.status === 'loading' && <p role="status">Checking your account…</p>}
        {session.status === 'denied' && (
          <p role="alert">Sign in with a staff account to manage this assessment.</p>
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
          <p role="alert">Assessment management is available to teachers and school administrators.</p>
        )}
        {staff && (
          <>
            {loading && !data && <p role="status">Loading this assessment…</p>}
            {loadError && (
              <div className="space-y-2">
                <p role="alert" className="break-words">
                  {loadError}
                </p>
                <Button type="button" variant="outline" onClick={() => void load()}>
                  Try again
                </Button>
              </div>
            )}
            {(error || notice) && (
              <div
                ref={message}
                tabIndex={-1}
                role={error ? 'alert' : 'status'}
                className="space-y-2 break-words rounded border p-3"
              >
                <p>{error || notice}</p>
                {retryable && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => void act(retryable)}
                  >
                    Send the same request again
                  </Button>
                )}
                {error && !retryable && (
                  <Button type="button" variant="outline" disabled={disabled} onClick={() => void load()}>
                    Reload current details
                  </Button>
                )}
              </div>
            )}
            {data && assessment && readiness && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="break-words">{assessment.title}</CardTitle>
                    <CardDescription>
                      {assessment.className}. Status:{' '}
                      <strong data-assessment-state={assessment.state}>
                        {stateLabels[assessment.state]}
                      </strong>
                      {assessment.stateAt ? ' since ' + formatStamp(assessment.stateAt) : ''}.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="min-w-0">
                    <dl className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                      <div className="flex gap-2">
                        <dt className="font-medium">Type:</dt>
                        <dd>{kindLabel(assessment.kind)}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="font-medium">Date:</dt>
                        <dd>
                          {assessment.invalidDate ? (
                            'Needs review'
                          ) : (
                            <time dateTime={assessment.date}>{formatDay(assessment.date)}</time>
                          )}
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="font-medium">Maximum:</dt>
                        <dd>{assessment.maxScore === null ? 'Needs review' : assessment.maxScore}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="font-medium">Results recorded:</dt>
                        <dd>
                          {assessment.recordedResults} of {assessment.expectedPupils} pupils
                        </dd>
                      </div>
                      <div className="flex gap-2 sm:col-span-2">
                        <dt className="font-medium">Review:</dt>
                        <dd>
                          {assessment.reviewCount === 0
                            ? 'No corrections reviewed'
                            : assessment.reviewCount +
                              (assessment.reviewCount === 1 ? ' correction' : ' corrections') +
                              ' reviewed, latest ' +
                              formatStamp(assessment.lastReviewedAt)}
                        </dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Publication</CardTitle>
                    <CardDescription>
                      Publishing makes the saved results available for report cards. Families only ever see a
                      report card an administrator has published.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="min-w-0 space-y-4">
                    {state !== 'published' && (
                      <>
                        <div>
                          <h3 className="font-medium">Readiness</h3>
                          {readiness.blockers.length === 0 ? (
                            <p data-readiness="ready">Everything needed to publish is in place.</p>
                          ) : (
                            <ul data-readiness="blocked" className="list-disc space-y-1 pl-5">
                              {readiness.blockers.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                        {readiness.needsPartialConfirmation && (
                          <Label className="flex items-start gap-2" htmlFor="partial-confirmed">
                            <input
                              id="partial-confirmed"
                              type="checkbox"
                              className="mt-1"
                              checked={partial}
                              disabled={disabled}
                              onChange={(event) => setPartial(event.target.checked)}
                            />
                            <span className="min-w-0">
                              Only {assessment.recordedResults} of {assessment.expectedPupils} pupils have a
                              result. I understand the others will show no result, not a zero.
                            </span>
                          </Label>
                        )}
                        <Button
                          type="button"
                          disabled={
                            disabled ||
                            !readiness.canPublish ||
                            (readiness.needsPartialConfirmation && !partial)
                          }
                          onClick={() => void act('publish')}
                        >
                          {busy === 'publish' ? 'Publishing…' : 'Publish results'}
                        </Button>
                      </>
                    )}
                    {state === 'published' && (
                      <>
                        <p data-readiness="published">
                          These results are published. The details are locked; a published result can only
                          change through the reviewed correction path in the result editor, which keeps the
                          earlier value in its history.
                        </p>
                        {readiness.unpublishBlockedByReports > 0 && (
                          <p role="note">
                            Published report cards include {readiness.unpublishBlockedByReports} result line
                            {readiness.unpublishBlockedByReports === 1 ? '' : 's'} from this assessment, so it
                            cannot be unpublished until those reports are replaced.
                          </p>
                        )}
                        <div>
                          <Label htmlFor="unpublish-reason">Reason for unpublishing</Label>
                          <Textarea
                            id="unpublish-reason"
                            rows={3}
                            maxLength={500}
                            value={unpublishReason}
                            disabled={disabled || !readiness.canUnpublish}
                            onChange={(event) => setUnpublishReason(event.target.value)}
                          />
                          <p className="mt-1 text-sm text-muted-foreground">
                            At least 10 characters. The reason is kept in the history.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={disabled || !readiness.canUnpublish}
                          onClick={() => void act('unpublish')}
                        >
                          {busy === 'unpublish' ? 'Unpublishing…' : 'Unpublish results'}
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Edit details</CardTitle>
                    <CardDescription>
                      Change the title, type, date or maximum. Each change is recorded with the earlier
                      values.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="min-w-0">
                    {!readiness.canEdit ? (
                      <p data-edit-locked>
                        The details are locked while results are published. Unpublish them first to change the
                        title, type, date or maximum.
                      </p>
                    ) : (
                      <form
                        noValidate
                        onSubmit={(event) => {
                          event.preventDefault();
                          void act('edit');
                        }}
                        className="space-y-4"
                      >
                        <fieldset disabled={disabled} className="min-w-0 space-y-4">
                          <div>
                            <Label htmlFor="edit-title">Title</Label>
                            <Input
                              id="edit-title"
                              value={form.title}
                              maxLength={200}
                              onChange={(event) => edit('title', event.target.value)}
                              {...invalid('title')}
                            />
                            {note('title')}
                          </div>
                          <div>
                            <Label htmlFor="edit-kind">Type</Label>
                            <select
                              id="edit-kind"
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
                            <Label htmlFor="edit-date">Date</Label>
                            <Input
                              id="edit-date"
                              type="date"
                              value={form.date}
                              onChange={(event) => edit('date', event.target.value)}
                              {...invalid('date')}
                            />
                            {note('date')}
                          </div>
                          <div>
                            <Label htmlFor="edit-max">Maximum score</Label>
                            <Input
                              id="edit-max"
                              inputMode="numeric"
                              autoComplete="off"
                              value={form.maxScore}
                              onChange={(event) => edit('maxScore', event.target.value)}
                              {...invalid('maxScore')}
                            />
                            {note('maxScore')}
                            <p className="mt-1 text-sm text-muted-foreground">
                              Cannot be lower than a score that is already saved.
                            </p>
                          </div>
                          <div>
                            <Label htmlFor="edit-reason">
                              {assessment.recordedResults > 0
                                ? 'Reason for the change'
                                : 'Reason for the change (optional)'}
                            </Label>
                            <Textarea
                              id="edit-reason"
                              rows={3}
                              maxLength={500}
                              value={form.reason}
                              onChange={(event) => edit('reason', event.target.value)}
                              {...invalid('reason')}
                            />
                            {note('reason')}
                            {assessment.recordedResults > 0 && (
                              <p className="mt-1 text-sm text-muted-foreground">
                                Results are already saved, so a reason of at least 10 characters is required.
                              </p>
                            )}
                          </div>
                          <Button type="submit" disabled={disabled}>
                            {busy === 'edit' ? 'Saving…' : 'Save details'}
                          </Button>
                        </fieldset>
                      </form>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>History</CardTitle>
                    <CardDescription>
                      Publication changes and detail edits, newest first. History is never removed.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="min-w-0 space-y-4">
                    <div>
                      <h3 className="font-medium">Publication</h3>
                      {data.events.length === 0 ? (
                        <p>These results have never been published.</p>
                      ) : (
                        <ul data-history="publication" className="space-y-2">
                          {data.events.map((event) => (
                            <li key={event.id} className="min-w-0 break-words rounded border p-3 text-sm">
                              <p>
                                <strong>{event.action === 'publish' ? 'Published' : 'Unpublished'}</strong> by{' '}
                                {event.actorName ?? 'a former staff member'} on {formatStamp(event.createdAt)}
                                .
                              </p>
                              <p>
                                {event.recordedResults} of {event.expectedPupils} pupils had a result
                                {event.partialConfirmed ? ' (published with the gap confirmed)' : ''}.
                              </p>
                              {event.reason && <p>Reason: {event.reason}</p>}
                            </li>
                          ))}
                        </ul>
                      )}
                      {data.eventTotal > data.events.length && (
                        <p className="text-sm">
                          Showing the latest {data.events.length} of {data.eventTotal} changes.
                        </p>
                      )}
                    </div>
                    <div>
                      <h3 className="font-medium">Detail edits</h3>
                      {data.edits.length === 0 ? (
                        <p>The details have not been edited since the assessment was created.</p>
                      ) : (
                        <ul data-history="edits" className="space-y-2">
                          {data.edits.map((entry) => (
                            <li key={entry.id} className="min-w-0 break-words rounded border p-3 text-sm">
                              <p>
                                Edited by {entry.actorName ?? 'a former staff member'} on{' '}
                                {formatStamp(entry.createdAt)}.
                              </p>
                              <p>
                                Before: {entry.before.title}, {kindLabel(entry.before.kind)},{' '}
                                {formatDay(entry.before.date)}, maximum {entry.before.maxScore}.
                              </p>
                              <p>
                                After: {entry.after.title}, {kindLabel(entry.after.kind)},{' '}
                                {formatDay(entry.after.date)}, maximum {entry.after.maxScore}.
                              </p>
                              {entry.reason && <p>Reason: {entry.reason}</p>}
                            </li>
                          ))}
                        </ul>
                      )}
                      {data.editTotal > data.edits.length && (
                        <p className="text-sm">
                          Showing the latest {data.edits.length} of {data.editTotal} edits.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
