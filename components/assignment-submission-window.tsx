'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { SubmissionWindow, SubmissionWindowResult, SubmissionWindowReview } from '@/lib/education/submission-windows';

const localTime = (value: string | null) => value ? new Date(Date.parse(value) - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 23) : '';
const readableTime = (value: string) => new Date(value).toLocaleString(undefined, { timeZoneName: 'short' });
export function AssignmentSubmissionWindow({ assignmentId, window, staff, onChanged }: {
  assignmentId: string; window: SubmissionWindow; staff: boolean; onChanged: (value: SubmissionWindow) => void;
}) {
  const path = `/api/assignments/${encodeURIComponent(assignmentId)}/submission-window`;
  const [state, setState] = useState<'open' | 'closed'>(window.state);
  const [closingTime, setClosingTime] = useState(localTime(window.closesAt));
  const [reason, setReason] = useState('');
  const [confirmedRevision, setConfirmedRevision] = useState<number | null>(null);
  const [reviews, setReviews] = useState<SubmissionWindowReview[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const pending = useRef<{ payload: string; id: string } | null>(null);
  const lock = useRef(false);
  const notice = useRef<HTMLDivElement>(null);
  const reviewed = confirmedRevision === window.revision;
  async function history(signal?: AbortSignal) {
    const response = await fetch(path + '/history', { cache: 'no-store', signal });
    if (!response.ok) throw new Error('The review history could not load. Your access may have changed.');
    return response.json() as Promise<SubmissionWindowReview[]>;
  }
  useEffect(() => {
    if (!staff) return;
    const controller = new AbortController();
    void history(controller.signal).then(items => { if (!controller.signal.aborted) setReviews(items); })
      .catch(() => { if (!controller.signal.aborted) setError('The review history could not load. Try refreshing the window.'); });
    return () => controller.abort();
  // The current assignment/role determines the read, not unsaved form values.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, staff]);
  useEffect(() => {
    if (!window.closesAt || !window.acceptingSubmissions) return;
    const remaining = Date.parse(window.closesAt) - Date.parse(window.asOf);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch(path, { cache: 'no-store', signal: controller.signal }).then(async response => {
        if (response.ok && !controller.signal.aborted) onChanged(await response.json());
      }).catch(() => { /* The attempt INSERT still enforces the server window. */ });
    }, Math.max(0, Math.min(remaining + 100, 2147483647)));
    return () => { clearTimeout(timer); controller.abort(); };
  }, [path, window.closesAt, window.asOf, window.acceptingSubmissions, onChanged]);
  async function reload() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage(''); setConfirmedRevision(null);
    try {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) throw new Error('The assignment window is unavailable to your account.');
      onChanged(await response.json());
      if (staff) setReviews(await history());
      setMessage('Window refreshed. Your unsaved closing time and reason are kept; review again before saving.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The window could not refresh.'); }
    finally { lock.current = false; setBusy(false); notice.current?.focus(); }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !staff || !reviewed) return;
    const date = closingTime ? new Date(closingTime) : null;
    if (state === 'open' && date && !Number.isFinite(date.getTime())) { setError('Choose a valid closing time.'); return; }
    lock.current = true; setBusy(true); setError(''); setMessage('');
    const input = { state, closesAt: state === 'open' && date ? date.toISOString() : null, reason: reason.trim(), reviewConfirmed: true, expectedRevision: window.revision };
    const payload = JSON.stringify(input), clientPolicyId = pending.current?.payload === payload ? pending.current.id : crypto.randomUUID();
    pending.current = { payload, id: clientPolicyId };
    let acknowledged = false;
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, clientPolicyId }) });
      if (!response.ok) {
        if (response.status === 401) globalThis.window.location.assign(new URL('/login', globalThis.window.location.origin).href);
        if (response.status === 409) { setConfirmedRevision(null); throw new Error('Another window review or request conflicts with this one. Refresh the window; your input is kept.'); }
        throw new Error(response.status === 400 ? 'Check the closing time, review confirmation and reason (10–500 characters).' : 'The window review could not be confirmed. Your access may have changed.');
      }
      acknowledged = true;
      const saved: SubmissionWindowResult = await response.json();
      onChanged(saved.window); pending.current = null; setConfirmedRevision(null);
      setMessage(`Window review revision ${saved.review.revision} saved. Responses are currently ${saved.window.acceptingSubmissions ? 'open' : 'closed'}.`);
      try { setReviews(await history()); }
      catch { setMessage(`Window review revision ${saved.review.revision} saved. Review history could not refresh; reload when available.`); }
    } catch (caught) {
      if (acknowledged) { setConfirmedRevision(null); setMessage('Window review saved. Refresh the current state and review history to confirm its revision. Your text is kept.'); }
      else setError(`${caught instanceof Error ? caught.message : 'Could not confirm the review.'} Retrying the same review is safe.`);
    } finally { lock.current = false; setBusy(false); notice.current?.focus(); }
  }
  return <section className="border rounded p-4 space-y-4 break-words" aria-labelledby="submission-window-title">
    <h2 id="submission-window-title" className="text-xl font-semibold">Submission window</h2>
    <p className="font-medium">New responses are {window.acceptingSubmissions ? 'open' : 'closed'}.</p>
    {!window.configured && <p>No submission cutoff has been configured. The assignment due date stays informational.</p>}
    {window.closesAt && <p>Closing time: {readableTime(window.closesAt)}.</p>}
    <p>Saved attempts and reviewed feedback remain available. A previously committed response can still be safely retried after closure.</p>
    <div ref={notice} tabIndex={-1} className="space-y-2 focus:outline-2"><p role="status" aria-live="polite">{message}</p>{error && <p role="alert">{error}</p>}</div>
    <Button variant="outline" disabled={busy} onClick={() => { void reload(); }}>Refresh submission window</Button>
    {staff && <>
      <form onSubmit={save} aria-label="Review submission window" className="space-y-3">
        <fieldset disabled={busy} className="space-y-3 min-w-0">
          <legend className="font-semibold">Review a change to this assignment</legend>
          <label className="block space-y-1"><span>New response access</span><select className="w-full border rounded p-2 bg-background" value={state} onChange={event => { setState(event.target.value as typeof state); setConfirmedRevision(null); }}><option value="open">Open responses</option><option value="closed">Close responses now</option></select></label>
          {state === 'open' && <label className="block space-y-1"><span>Closing time in your device time zone (optional)</span><input className="w-full min-w-0 border rounded p-2 bg-background" type="datetime-local" step="0.001" value={closingTime} onChange={event => { setClosingTime(event.target.value); setConfirmedRevision(null); }} /></label>}
          <p className="text-sm">Leave the closing time blank to keep responses open. An elapsed closing time closes new responses immediately. There is no automatic late penalty or grade.</p>
          <label className="block space-y-1"><span>Reason for window change</span><input className="w-full border rounded p-2 bg-background" required minLength={10} maxLength={500} value={reason} onChange={event => { setReason(event.target.value); setConfirmedRevision(null); }} /></label>
          <label className="flex items-start gap-3"><input type="checkbox" checked={reviewed} onChange={event => setConfirmedRevision(event.target.checked ? window.revision : null)} /><span>I reviewed this change to new response access and its closing time for this assignment.</span></label>
          <Button type="submit" disabled={busy || !reviewed || reason.trim().length < 10}>Save reviewed submission window</Button>
        </fieldset>
      </form>
      <details><summary className="cursor-pointer font-medium">Window review history (latest 100)</summary>
        {reviews.length === 0 ? <p>No window reviews yet.</p> : <ol className="space-y-3 mt-3">{reviews.map(item => <li className="border rounded p-3 space-y-1" key={item.id}>
          <h3 className="font-semibold">Window revision {item.revision} · {item.state}</h3><p>Reviewed {readableTime(item.reviewedAt)} · Staff ID {item.reviewedBy}</p>
          {item.closesAt && <p>Closing time: {readableTime(item.closesAt)}</p>}<p>Reason: {item.reason}</p>
        </li>)}</ol>}
      </details>
    </>}
  </section>;
}
