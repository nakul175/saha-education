'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type {
  SubmissionWindow,
  SubmissionWindowResult,
  SubmissionWindowReview,
} from '@/lib/education/submission-windows';

const localTime = (value: string | null) =>
  value
    ? new Date(Date.parse(value) - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 23)
    : '';
const readableTime = (value: string) => new Date(value).toLocaleString(undefined, { timeZoneName: 'short' });
type PendingWindowReview = { path: string; body: string; actorId: string };
class WindowResponseError extends Error {
  constructor(readonly status: number) {
    super('The window request could not be completed.');
  }
}
async function readJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: 'no-store' });
  const body = await response.text();
  if (!response.ok) throw new WindowResponseError(response.status);
  return JSON.parse(body) as T;
}
function isWindow(value: unknown, assignmentId: string): value is SubmissionWindow {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<SubmissionWindow>;
  return (
    item.assignmentId === assignmentId &&
    Number.isSafeInteger(item.revision) &&
    (item.revision ?? -1) >= 0 &&
    (item.state === 'open' || item.state === 'closed') &&
    (item.closesAt === null ||
      (typeof item.closesAt === 'string' && Number.isFinite(Date.parse(item.closesAt)))) &&
    typeof item.configured === 'boolean' &&
    typeof item.acceptingSubmissions === 'boolean' &&
    typeof item.asOf === 'string' &&
    Number.isFinite(Date.parse(item.asOf))
  );
}
function isReview(value: unknown, assignmentId: string): value is SubmissionWindowReview {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<SubmissionWindowReview>;
  return (
    typeof item.id === 'string' &&
    item.id.length > 0 &&
    item.assignmentId === assignmentId &&
    Number.isSafeInteger(item.revision) &&
    (item.revision ?? 0) > 0 &&
    (item.state === 'open' || item.state === 'closed') &&
    (item.closesAt === null ||
      (typeof item.closesAt === 'string' && Number.isFinite(Date.parse(item.closesAt)))) &&
    typeof item.reviewedBy === 'string' &&
    item.reviewedBy.length > 0 &&
    typeof item.reviewedAt === 'string' &&
    Number.isFinite(Date.parse(item.reviewedAt)) &&
    typeof item.reason === 'string'
  );
}
function isReceipt(
  value: unknown,
  request: PendingWindowReview,
  assignmentId: string,
): value is SubmissionWindowResult {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<SubmissionWindowResult>,
    input = JSON.parse(request.body);
  return (
    isWindow(item.window, assignmentId) &&
    isReview(item.review, assignmentId) &&
    item.review.id === input.clientPolicyId &&
    item.review.assignmentId === assignmentId &&
    item.review.revision === input.expectedRevision + 1 &&
    item.window.revision >= item.review.revision &&
    (!request.actorId || item.review.reviewedBy === request.actorId) &&
    item.review.state === input.state &&
    item.review.closesAt === input.closesAt &&
    item.review.reason === input.reason
  );
}
export function AssignmentSubmissionWindow({
  assignmentId,
  window,
  staff,
  actorId = '',
  available = true,
  onChanged,
  onAccessLost,
}: {
  assignmentId: string;
  window: SubmissionWindow;
  staff: boolean;
  actorId?: string;
  available?: boolean;
  onChanged: (value: SubmissionWindow) => void;
  onAccessLost?: (status: number) => void;
}) {
  const path = `/api/assignments/${encodeURIComponent(assignmentId)}/submission-window`;
  const [state, setState] = useState<'open' | 'closed'>(window.state);
  const [closingTime, setClosingTime] = useState(localTime(window.closesAt));
  const [reason, setReason] = useState('');
  const [confirmedRevision, setConfirmedRevision] = useState<number | null>(null);
  const [reviews, setReviews] = useState<SubmissionWindowReview[]>([]);
  const [historyState, setHistoryState] = useState<'loading' | 'loaded' | 'unavailable'>('loading');
  const [loadedScope, setLoadedScope] = useState({ path, actorId });
  const [formScope, setFormScope] = useState({ path, actorId });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [denied, setDenied] = useState<number | null>(null);
  const [needsReload, setNeedsReload] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<PendingWindowReview | null>(null);
  const pending = useRef<PendingWindowReview | null>(null);
  const lock = useRef(false);
  const notice = useRef<HTMLDivElement>(null);
  const generation = useRef({ value: 0 });
  const mounted = useRef({ active: true });
  const scope = useRef({ path, actorId, available, staff });
  useEffect(() => {
    scope.current = { path, actorId, available, staff };
  }, [path, actorId, available, staff]);
  const accessible = available && denied === null;
  const samePendingActor = !pendingRequest || pendingRequest.actorId === actorId;
  const sameFormActor = formScope.path === path && formScope.actorId === actorId;
  const visibleReviews = loadedScope.path === path && loadedScope.actorId === actorId ? reviews : [];
  function showReviews(items: SubmissionWindowReview[], savedScope: { path: string; actorId: string }) {
    setReviews(items);
    setLoadedScope({ path: savedScope.path, actorId: savedScope.actorId });
    setHistoryState('loaded');
  }
  const reviewed = confirmedRevision === window.revision && accessible && !needsReload && !pendingRequest;
  function loseAccess(status: number) {
    setDenied(status);
    setReviews([]);
    setHistoryState('unavailable');
    setConfirmedRevision(null);
    onAccessLost?.(status);
    if (status === 401 && !pending.current && !onAccessLost)
      globalThis.window.location.assign(new URL('/login', globalThis.window.location.origin).href);
  }
  function stillCurrent(sequence: number, savedScope: typeof scope.current, signal?: AbortSignal) {
    return (
      mounted.current.active &&
      !signal?.aborted &&
      generation.current.value === sequence &&
      scope.current.path === savedScope.path &&
      scope.current.actorId === savedScope.actorId &&
      scope.current.available === savedScope.available &&
      scope.current.staff === savedScope.staff
    );
  }
  useEffect(() => {
    const lifecycle = mounted.current,
      counter = generation.current;
    lifecycle.active = true;
    return () => {
      lifecycle.active = false;
      counter.value++;
    };
  }, []);
  async function history(signal?: AbortSignal) {
    const items = await readJson<unknown>(path + '/history', { signal });
    if (!Array.isArray(items) || !items.every((item) => isReview(item, assignmentId)))
      throw new Error('Unconfirmed window history.');
    return items as SubmissionWindowReview[];
  }
  useEffect(() => {
    const controller = new AbortController(),
      sequence = ++generation.current.value,
      savedScope = { path, actorId, available, staff };
    void Promise.resolve().then(async () => {
      if (!stillCurrent(sequence, savedScope, controller.signal)) return;
      setReviews([]);
      setHistoryState('loading');
      setConfirmedRevision(null);
      if (!available) {
        setDenied((previous) => previous ?? 404);
        setHistoryState('unavailable');
        return;
      }
      setDenied(null);
      if (!pending.current && !sameFormActor) {
        setState(window.state);
        setClosingTime(localTime(window.closesAt));
        setReason('');
        setFormScope({ path, actorId });
      }
      if (!staff) return;
      try {
        const items = await history(controller.signal);
        if (stillCurrent(sequence, savedScope, controller.signal)) showReviews(items, savedScope);
      } catch (caught) {
        if (!stillCurrent(sequence, savedScope, controller.signal)) return;
        if (caught instanceof WindowResponseError && [401, 403, 404].includes(caught.status))
          loseAccess(caught.status);
        setHistoryState('unavailable');
        setError('The review history could not load. Refresh the assignment to confirm current access.');
      }
    });
    return () => controller.abort();
    // This read follows the verified assignment/account scope, never unsaved input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, staff, actorId, available]);
  useEffect(() => {
    if (!accessible || !window.closesAt || !window.acceptingSubmissions) return;
    const remaining = Date.parse(window.closesAt) - Date.parse(window.asOf);
    const controller = new AbortController(),
      savedScope = scope.current;
    const timer = setTimeout(
      () => {
        void readJson<unknown>(path, { signal: controller.signal })
          .then((value) => {
            if (
              controller.signal.aborted ||
              scope.current.path !== savedScope.path ||
              scope.current.actorId !== savedScope.actorId ||
              !scope.current.available
            )
              return;
            if (isWindow(value, assignmentId)) onChanged(value);
          })
          .catch((caught) => {
            if (
              !controller.signal.aborted &&
              mounted.current.active &&
              scope.current.available &&
              scope.current.path === savedScope.path &&
              scope.current.actorId === savedScope.actorId &&
              caught instanceof WindowResponseError &&
              [401, 403, 404].includes(caught.status)
            )
              loseAccess(caught.status);
            // The actual attempt INSERT also enforces the current server window.
          });
      },
      Math.max(0, Math.min(remaining + 100, 2147483647)),
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // Access-loss handling is scoped to the captured assignment and account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    path,
    assignmentId,
    actorId,
    accessible,
    window.closesAt,
    window.asOf,
    window.acceptingSubmissions,
    onChanged,
  ]);
  async function reload() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    setConfirmedRevision(null);
    const controller = new AbortController(),
      sequence = ++generation.current.value,
      savedScope = scope.current;
    if (staff) setHistoryState('loading');
    try {
      const value = await readJson<unknown>(path, { signal: controller.signal });
      if (!isWindow(value, assignmentId)) throw new Error('Unconfirmed current window.');
      if (!stillCurrent(sequence, savedScope, controller.signal)) return;
      onChanged(value);
      setDenied(null);
      if (staff) {
        const items = await history(controller.signal);
        if (!stillCurrent(sequence, savedScope, controller.signal)) return;
        showReviews(items, savedScope);
      }
      setNeedsReload(false);
      setMessage(
        pending.current
          ? 'Current window refreshed. The unresolved review retains its original request; use Retry pending window review.'
          : 'Window refreshed. Your unsaved closing time and reason are kept; review again before saving.',
      );
    } catch (caught) {
      if (!stillCurrent(sequence, savedScope, controller.signal)) return;
      setReviews([]);
      setHistoryState('unavailable');
      if (caught instanceof WindowResponseError && [401, 403, 404].includes(caught.status))
        loseAccess(caught.status);
      setError(
        'The assignment window could not be confirmed. Refresh saved history to confirm current access.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
      notice.current?.focus();
    }
  }
  async function send(request: PendingWindowReview) {
    if (lock.current || !accessible || !staff || request.path !== path || request.actorId !== actorId) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const value = await readJson<unknown>(request.path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: request.body,
      });
      if (!isReceipt(value, request, assignmentId)) throw new Error('Unconfirmed review receipt.');
      pending.current = null;
      setPendingRequest(null);
      setConfirmedRevision(null);
      setNeedsReload(false);
      if (
        scope.current.actorId !== request.actorId ||
        scope.current.path !== request.path ||
        !scope.current.available
      ) {
        loseAccess(403);
        setMessage('The saved review was acknowledged. Refresh the assignment to confirm current access.');
        return;
      }
      onChanged(value.window);
      setState(value.window.state);
      setClosingTime(localTime(value.window.closesAt));
      setReason('');
      setFormScope({ path, actorId });
      setMessage(
        `Window review revision ${value.review.revision} saved. Responses are currently ${value.window.acceptingSubmissions ? 'open' : 'closed'}.`,
      );
      const sequence = ++generation.current.value,
        savedScope = scope.current;
      setHistoryState('loading');
      try {
        const items = await history();
        if (stillCurrent(sequence, savedScope)) showReviews(items, savedScope);
      } catch (caught) {
        if (!stillCurrent(sequence, savedScope)) return;
        setReviews([]);
        setHistoryState('unavailable');
        if (caught instanceof WindowResponseError && [401, 403, 404].includes(caught.status))
          loseAccess(caught.status);
        setMessage(
          `Window review revision ${value.review.revision} saved. Current review history could not refresh; reload when available.`,
        );
      }
    } catch (caught) {
      if (caught instanceof WindowResponseError && [400, 409].includes(caught.status)) {
        pending.current = null;
        setPendingRequest(null);
        setConfirmedRevision(null);
        if (caught.status === 409) {
          setNeedsReload(true);
          setError(
            'This review request was rejected by a conflict. Refresh the window, compare the current state, and review your intended change again. Your input is kept.',
          );
        } else
          setError(
            'This review request was rejected. Check the closing time, confirmation and reason (10–500 characters). Your input is kept.',
          );
      } else {
        if (caught instanceof WindowResponseError && [401, 403, 404].includes(caught.status))
          loseAccess(caught.status);
        setError(
          'The window review outcome could not be confirmed. Its original request and retry ID are retained. Recover the pending review before starting another change.',
        );
      }
    } finally {
      lock.current = false;
      setBusy(false);
      notice.current?.focus();
    }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !accessible || !staff || !reviewed || pending.current || needsReload) return;
    const date = closingTime ? new Date(closingTime) : null;
    if (state === 'open' && date && !Number.isFinite(date.getTime())) {
      setError('Choose a valid closing time.');
      return;
    }
    const input = {
      state,
      closesAt: state === 'open' && date ? date.toISOString() : null,
      reason: reason.trim(),
      reviewConfirmed: true,
      expectedRevision: window.revision,
      clientPolicyId: crypto.randomUUID(),
    };
    const request = { path, actorId, body: JSON.stringify(input) };
    pending.current = request;
    setPendingRequest(request);
    await send(request);
  }
  return (
    <section className="border rounded p-4 space-y-4 break-words" aria-labelledby="submission-window-title">
      <h2 id="submission-window-title" className="text-xl font-semibold">
        Submission window
      </h2>
      <div ref={notice} tabIndex={-1} className="space-y-2 focus:outline-2">
        <p role="status" aria-live="polite">
          {message}
        </p>
        {error && <p role="alert">{error}</p>}
      </div>
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => {
          void reload();
        }}
      >
        Refresh submission window
      </Button>
      {!accessible && (
        <p>
          Current assignment access is unavailable. Refresh saved history to restore access before viewing or
          changing its window.
        </p>
      )}
      {denied === 401 && pendingRequest && (
        <a className="underline" href="/login" target="_blank" rel="noreferrer">
          Sign in in another tab, then refresh saved history here
        </a>
      )}
      {pendingRequest && (
        <div className="border rounded p-3 space-y-2" role="status">
          <p>A window review outcome is unresolved. Its original request and retry ID are retained.</p>
          {!samePendingActor && (
            <p>Sign back in with the original account and refresh saved history to recover this review.</p>
          )}
          <Button
            type="button"
            disabled={busy || !accessible || !staff || !samePendingActor || pendingRequest.path !== path}
            onClick={() => {
              if (pending.current) void send(pending.current);
            }}
          >
            Retry pending window review
          </Button>
        </div>
      )}
      {accessible && (
        <>
          <p className="font-medium">New responses are {window.acceptingSubmissions ? 'open' : 'closed'}.</p>
          {!window.configured && (
            <p>No submission cutoff has been configured. The assignment due date stays informational.</p>
          )}
          {window.closesAt && <p>Closing time: {readableTime(window.closesAt)}.</p>}
          <p>
            Saved attempts and reviewed feedback remain available. A previously committed response can still
            be safely retried after closure.
          </p>
          {staff && samePendingActor && sameFormActor && (
            <>
              <form onSubmit={save} aria-label="Review submission window" className="space-y-3">
                <fieldset
                  disabled={busy || !!pendingRequest || !samePendingActor}
                  className="space-y-3 min-w-0"
                >
                  <legend className="font-semibold">Review a change to this assignment</legend>
                  <label className="block space-y-1">
                    <span>New response access</span>
                    <select
                      className="w-full border rounded p-2 bg-background"
                      value={state}
                      onChange={(event) => {
                        setState(event.target.value as typeof state);
                        setConfirmedRevision(null);
                      }}
                    >
                      <option value="open">Open responses</option>
                      <option value="closed">Close responses now</option>
                    </select>
                  </label>
                  {state === 'open' && (
                    <label className="block space-y-1">
                      <span>Closing time in your device time zone (optional)</span>
                      <input
                        className="w-full min-w-0 border rounded p-2 bg-background"
                        type="datetime-local"
                        step="0.001"
                        value={closingTime}
                        onChange={(event) => {
                          setClosingTime(event.target.value);
                          setConfirmedRevision(null);
                        }}
                      />
                    </label>
                  )}
                  <p className="text-sm">
                    Leave the closing time blank to keep responses open. An elapsed closing time closes new
                    responses immediately. There is no automatic late penalty or grade.
                  </p>
                  <label className="block space-y-1">
                    <span>Reason for window change</span>
                    <input
                      className="w-full border rounded p-2 bg-background"
                      required
                      minLength={10}
                      maxLength={500}
                      value={reason}
                      onChange={(event) => {
                        setReason(event.target.value);
                        setConfirmedRevision(null);
                      }}
                    />
                  </label>
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={reviewed}
                      disabled={needsReload}
                      onChange={(event) =>
                        setConfirmedRevision(event.target.checked ? window.revision : null)
                      }
                    />
                    <span>
                      I reviewed this change to new response access and its closing time for this assignment.
                    </span>
                  </label>
                  <Button
                    type="submit"
                    disabled={
                      busy || !!pendingRequest || needsReload || !reviewed || reason.trim().length < 10
                    }
                  >
                    Save reviewed submission window
                  </Button>
                  {needsReload && (
                    <p>
                      Refresh the window and compare its current state before confirming a new review. Your
                      intended change is kept.
                    </p>
                  )}
                </fieldset>
              </form>
              <details>
                <summary className="cursor-pointer font-medium">Window review history (latest 100)</summary>
                {historyState === 'loading' ||
                loadedScope.path !== path ||
                loadedScope.actorId !== actorId ? (
                  <p>Loading current window review history…</p>
                ) : historyState === 'unavailable' ? (
                  <p>Review history is unavailable. Refresh the window to try again.</p>
                ) : visibleReviews.length === 0 ? (
                  <p>No window reviews yet.</p>
                ) : (
                  <ol className="space-y-3 mt-3">
                    {visibleReviews.map((item) => (
                      <li className="border rounded p-3 space-y-1" key={item.id}>
                        <h3 className="font-semibold">
                          Window revision {item.revision} · {item.state}
                        </h3>
                        <p>
                          Reviewed {readableTime(item.reviewedAt)} ·{' '}
                          {actorId && item.reviewedBy === actorId ? 'by you' : 'by another staff member'}
                        </p>
                        {item.closesAt && <p>Closing time: {readableTime(item.closesAt)}</p>}
                        <p>Reason: {item.reason}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </details>
            </>
          )}
        </>
      )}
    </section>
  );
}
