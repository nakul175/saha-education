'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatDay, formatWhen } from '@/lib/education/display';
import type {
  CurriculumReference,
  CurriculumStatus,
  CurriculumStatusEvent,
  CurriculumStatusResult,
  CurriculumUsage,
} from '@/lib/education/curriculum';

const inputStyle = 'border rounded p-2 w-full min-w-0 bg-background';
function problem(status: number): string {
  if (status === 401) return 'Please sign in again. Your text is kept.';
  if (status === 403) return 'Your account does not have permission for this action.';
  if (status === 404) return 'This reference is unavailable to your account.';
  if (status === 409)
    return 'The reference changed after you opened this page. Reload it and check its current availability before trying again. Your reason is kept.';
  if (status === 400) return 'Enter a reason of 10 to 500 characters. Your text is kept.';
  return 'Could not confirm this change. Your text is kept; retrying the same request is safe.';
}

export function CurriculumLifecycle({
  reference,
  onStatusChanged,
}: {
  reference: CurriculumReference;
  onStatusChanged: (status: CurriculumStatus) => void;
}) {
  const path = `/api/curriculum/${encodeURIComponent(reference.id)}`;
  const retired = reference.status.state === 'retired';
  const [usage, setUsage] = useState<CurriculumUsage | null>(null);
  const [usageError, setUsageError] = useState('');
  const [events, setEvents] = useState<CurriculumStatusEvent[]>([]);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  const pending = useRef<{ payload: string; id: string } | null>(null);
  const manage = reference.canManage;
  const loadUsage = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch(`${path}/usage`, { cache: 'no-store', signal });
        if (!response.ok) throw new Error('usage');
        const body: CurriculumUsage = await response.json();
        if (!Array.isArray(body.copies)) throw new Error('usage');
        if (!signal?.aborted) {
          setUsage(body);
          setUsageError('');
        }
      } catch {
        if (!signal?.aborted)
          setUsageError('Where this reference is used could not be loaded. Reload the page to try again.');
      }
    },
    [path],
  );
  const loadEvents = useCallback(
    async (signal?: AbortSignal) => {
      if (!manage) return;
      try {
        const response = await fetch(`${path}/status`, { cache: 'no-store', signal });
        if (!response.ok) throw new Error('history');
        const body: CurriculumStatusEvent[] = await response.json();
        if (Array.isArray(body) && !signal?.aborted) setEvents(body);
      } catch {
        /* The availability history is supporting evidence; the current status is already shown. */
      }
    },
    [path, manage],
  );
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) {
        void loadUsage(controller.signal);
        void loadEvents(controller.signal);
      }
    });
    return () => controller.abort();
  }, [loadUsage, loadEvents, reference.status.revision]);
  async function change(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !manage || !confirmed || reason.trim().length < 10) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    const next = retired ? 'active' : 'retired';
    const payload = JSON.stringify({
      expectedRevision: reference.status.revision,
      status: next,
      reason: reason.trim(),
    });
    const id = pending.current?.payload === payload ? pending.current.id : crypto.randomUUID();
    pending.current = { payload, id };
    try {
      const response = await fetch(`${path}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientEventId: id, ...JSON.parse(payload) }),
      });
      if (!response.ok) throw new Error(problem(response.status));
      const result: CurriculumStatusResult = await response.json();
      if (result.event?.id !== id || !result.status) throw new Error(problem(500));
      pending.current = null;
      setReason('');
      setConfirmed(false);
      onStatusChanged(result.status);
      setMessage(
        next === 'retired'
          ? 'Reference retired. It is hidden from other staff and cannot be copied again until it is reinstated. Existing copies and assignments are unchanged.'
          : 'Reference reinstated. It is available again to the staff who can see it.',
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : problem(500));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <section className="border rounded p-4 space-y-3" aria-labelledby="curriculum-usage-title">
        <h2 id="curriculum-usage-title" className="text-xl font-semibold">
          Where this reference is used
        </h2>
        {usageError && <p role="alert">{usageError}</p>}
        {!usage && !usageError && <p>Loading usage…</p>}
        {usage && (
          <>
            <p className="text-sm">
              {usage.scope === 'own'
                ? 'Showing teaching drafts you created from this reference.'
                : 'Showing teaching drafts created from this reference in your school.'}
              {usage.copiesInSchool !== null
                ? ` ${usage.copiesInSchool} ${usage.copiesInSchool === 1 ? 'copy exists' : 'copies exist'} in your school in total.`
                : ''}
            </p>
            {usage.copies.length === 0 && (
              <p>No teaching drafts have been created from this reference yet.</p>
            )}
            <ul className="space-y-3">
              {usage.copies.map((copy) => (
                <li key={copy.resourceId} className="border rounded p-3 space-y-1 break-words">
                  <a
                    className="font-medium underline"
                    href={`/resources/${encodeURIComponent(copy.resourceId)}`}
                  >
                    {copy.title}
                  </a>
                  <p className="text-sm">
                    {copy.type} · copied from reviewed version {copy.copiedFromVersion} on{' '}
                    {formatDay(copy.copiedAt)} · by {copy.authorName}
                  </p>
                  <p className="text-sm">
                    {copy.latestApproved
                      ? `Latest teaching version ${copy.latestResourceVersion} is reviewed.`
                      : `Latest teaching version ${copy.latestResourceVersion} is not yet reviewed.`}
                  </p>
                  {copy.assignments.length === 0 ? (
                    <p className="text-sm">Not assigned to a class.</p>
                  ) : (
                    <ul className="text-sm list-disc pl-5">
                      {copy.assignments.map((item) => (
                        <li key={item.assignmentId}>
                          Assigned to {item.className}
                          {item.dueDate ? `, due ${formatDay(item.dueDate)}` : ''} (teaching version{' '}
                          {item.assignedVersion})
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      {manage && (
        <section className="border rounded p-4 space-y-4" aria-labelledby="curriculum-availability-title">
          <h2 id="curriculum-availability-title" className="text-xl font-semibold">
            Availability
          </h2>
          <p>
            {retired
              ? `This reference is retired (${formatWhen(reference.status.changedAt)}). Reason: ${reference.status.reason}`
              : 'This reference is in use. Retiring it hides it from other staff and stops new copies. Existing teaching drafts, assignments and saved versions are not changed or deleted.'}
          </p>
          <form onSubmit={change} className="space-y-3">
            <fieldset disabled={busy} className="space-y-3">
              <legend className="sr-only">
                {retired ? 'Reinstate this reference' : 'Retire this reference'}
              </legend>
              <label className="block space-y-1">
                <span>
                  {retired
                    ? 'Why is this reference being reinstated? *'
                    : 'Why is this reference being retired? *'}
                </span>
                <textarea
                  className={inputStyle}
                  rows={3}
                  minLength={10}
                  maxLength={500}
                  required
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                    setConfirmed(false);
                  }}
                />
              </label>
              <p className="text-sm">
                10 to 500 characters. The reason is recorded with your name and the time.
              </p>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={reason.trim().length < 10}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>
                  {retired
                    ? 'I understand this makes the reference available to school staff again.'
                    : 'I understand this stops new copies and hides the reference from other staff. Existing copies stay as they are.'}
                </span>
              </label>
            </fieldset>
            <Button type="submit" disabled={busy || !confirmed || reason.trim().length < 10}>
              {busy ? 'Working…' : retired ? 'Reinstate this reference' : 'Retire this reference'}
            </Button>
          </form>
          <p aria-live="polite">{message}</p>
          {error && <p role="alert">{error}</p>}
          {events.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold">Availability history</h3>
              <ol className="space-y-2">
                {events.map((item) => (
                  <li key={item.id} className="border rounded p-3 break-words text-sm">
                    <p className="font-medium">
                      {item.status === 'retired' ? 'Retired' : 'Reinstated'} · {formatWhen(item.changedAt)} ·{' '}
                      {item.changedByName ?? 'School staff member'}
                    </p>
                    <p>{item.reason}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}
    </>
  );
}
