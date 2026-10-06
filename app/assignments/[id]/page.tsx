'use client';

// Full-page navigation avoids the observed vinext transition failure.
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { SubmissionAttempt, SubmissionFeedback } from '@/db/submission-schema';
import type { ResourceAssignment } from '@/lib/education/resource-types';
import type { Principal, Student } from '@/lib/education/types';
import type { SubmissionWindow } from '@/lib/education/submission-windows';
import { AssignmentSubmissionWindow } from '@/components/assignment-submission-window';

const inputStyle = 'border rounded p-2 w-full min-w-0 bg-background';
type Pending = { kind: 'response' | 'feedback'; assignmentId: string; actorId: string; endpoint: string; body: string; uuid: string; version: number; versionId: string; submissionId?: string; attemptNumber?: number };
type Confirmed = { actorId: string; version: number } & ({ kind: 'response'; attempt: SubmissionAttempt } | { kind: 'feedback'; feedback: SubmissionFeedback; attemptNumber: number });
class ReadFailure extends Error { constructor(readonly status: number, message: string) { super(message); } }
function responseError(status: number): string {
  if (status === 401) return 'Please sign in again.';
  if (status === 403) return 'Your account does not have permission for this assignment action.';
  if (status === 404) return 'This assignment or response is unavailable to your account. Students must be actively enrolled in its class.';
  if (status === 409) return 'A newer response or review was saved. Your text is kept. Refresh the saved history before continuing.';
  if (status === 400) return 'Enter valid plain text within the displayed length limit. Your text is kept.';
  return 'Could not confirm this action. Your text is kept.';
}
function ordered(items: SubmissionAttempt[]): SubmissionAttempt[] { return [...items].sort((a, b) => b.attempt - a.attempt || b.createdAt.localeCompare(a.createdAt)); }
function latestReview(attempt: SubmissionAttempt): SubmissionFeedback | undefined { return [...attempt.feedback].sort((a, b) => b.revision - a.revision)[0]; }
function ReviewHistory({ items }: { items: SubmissionFeedback[] }) {
  if (items.length === 0) return <p>No reviewed feedback yet.</p>;
  return <ol className="space-y-3">{[...items].sort((a, b) => b.revision - a.revision).map(item => <li key={item.id} data-feedback-id={item.id} className="border rounded p-3 space-y-2 break-words"><p className="font-medium">Reviewed feedback · Revision {item.revision}</p><p className="whitespace-pre-wrap break-words">{item.feedback}</p><p className="text-sm">Reviewed {item.reviewedAt}</p></li>)}</ol>;
}
export default function AssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params), path = `/api/assignments/${encodeURIComponent(id)}/submissions`;
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [assignment, setAssignment] = useState<ResourceAssignment | null>(null);
  const [submissionWindow, setSubmissionWindow] = useState<SubmissionWindow | null>(null);
  const [privateWindow, setPrivateWindow] = useState<SubmissionWindow | null>(null);
  const [attempts, setAttempts] = useState<SubmissionAttempt[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState('');
  const [responseText, setResponseText] = useState('');
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});
  const [reviewed, setReviewed] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [needsReload, setNeedsReload] = useState(false);
  const [message, setMessage] = useState(''), [error, setError] = useState('');
  const [pendingView, setPendingView] = useState<Pending | null>(null), [pendingVerified, setPendingVerified] = useState(false);
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null), [signinRequired, setSigninRequired] = useState(false);
  const pending = useRef<Pending | null>(null), lock = useRef(false), notice = useRef<HTMLDivElement>(null);
  const confirmedNeedsRefresh = useRef<Confirmed | null>(null), lastConfirmed = useRef<Confirmed | null>(null);
  const generation = useRef(0), controller = useRef<AbortController | null>(null), routeId = useRef(id), viewActor = useRef(''), available = useRef(false);
  const selected = attempts.find(attempt => attempt.id === selectedId);
  const student = principal?.role === 'student', staff = principal?.role === 'teacher' || principal?.role === 'admin';
  const maxAttempt = attempts.reduce((maximum, attempt) => Math.max(maximum, attempt.attempt), 0), latestAttempt = attempts.find(attempt => attempt.attempt === maxAttempt);
  const feedbackText = selected ? feedbackDrafts[selected.id] ?? latestReview(selected)?.feedback ?? '' : '';
  const maxRevision = selected?.feedback.reduce((maximum, item) => Math.max(maximum, item.revision), 0) ?? 0;
  const frozen = busy || Boolean(pendingView);

  const clearPrivateView = useCallback((status: number) => {
    generation.current++; controller.current?.abort(); available.current = false;
    setAssignment(null); setSubmissionWindow(null); setAttempts([]); setLabels({}); setSelectedId(''); setConfirmed(null); setReviewed(false); setNeedsReload(true); setPendingVerified(false); setSigninRequired(status === 401); setLoading(false);
    setError(responseError(status));
    setMessage(pending.current ? 'The original request remains pending. Current access could not be verified. Sign in with the original account and refresh saved history before retrying.' : lastConfirmed.current ? 'The original save was confirmed. Current assignment access could not be verified, so protected material and history are hidden.' : 'Current assignment access could not be verified. Protected material and history are hidden.');
  }, []);
  const readHistory = useCallback(async (signal?: AbortSignal) => {
    const reads = await Promise.allSettled([fetch('/api/session', { cache: 'no-store', signal }), fetch('/api/resource-assignments', { cache: 'no-store', signal }), fetch(path, { cache: 'no-store', signal }), fetch(`/api/assignments/${encodeURIComponent(id)}/submission-window`, { cache: 'no-store', signal })]);
    const replies = reads.map(result => result.status === 'fulfilled' ? result.value : null);
    const buffered = await Promise.allSettled(replies.map(reply => reply ? reply.text() : Promise.resolve('')));
    const failed = replies.find(reply => reply?.status === 401) ?? replies.find(reply => reply && !reply.ok);
    if (failed) throw new ReadFailure(failed.status, responseError(failed.status));
    const unavailable = reads.find(result => result.status === 'rejected') ?? buffered.find(result => result.status === 'rejected');
    if (unavailable?.status === 'rejected') throw unavailable.reason;
    const bodies = buffered.map(result => result.status === 'fulfilled' ? result.value : '');
    const account = JSON.parse(bodies[0]) as Principal, assigned = JSON.parse(bodies[1]) as ResourceAssignment[], history = JSON.parse(bodies[2]) as SubmissionAttempt[], window = JSON.parse(bodies[3]) as SubmissionWindow;
    if (!['admin', 'teacher', 'student'].includes(account.role)) throw new ReadFailure(403, responseError(403));
    const current = assigned.find(item => item.id === id);
    if (!current) throw new ReadFailure(404, responseError(404));
    return { account, current, window, history: ordered(history) };
  }, [id, path]);
  const loadLabels = useCallback(async (history: SubmissionAttempt[], actorId: string, ticket: number, signal?: AbortSignal) => {
    const results = await Promise.allSettled([...new Set(history.map(attempt => attempt.studentId))].map(async studentId => {
      const reply = await fetch(`/api/students/${encodeURIComponent(studentId)}`, { cache: 'no-store', signal }); const body = await reply.text();
      if (!reply.ok) { if (reply.status === 401 && generation.current === ticket) clearPrivateView(401); return null; }
      const profile = JSON.parse(body) as Student; return [studentId, `${profile.firstName} ${profile.lastName}`] as const;
    }));
    if (signal?.aborted || generation.current !== ticket || viewActor.current !== actorId || !available.current) return;
    const found: Record<string, string> = {}; for (const result of results) if (result.status === 'fulfilled' && result.value) found[result.value[0]] = result.value[1]; setLabels(found);
  }, [clearPrivateView]);
  const loadCurrent = useCallback(async (initial = false, afterSave?: Confirmed) => {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort; const ticket = ++generation.current;
    setLoading(true); setError(''); setReviewed(false); setPendingVerified(false);
    try {
      const current = await readHistory(abort.signal);
      if (ticket !== generation.current || abort.signal.aborted || routeId.current !== id) return;
      if (pending.current && current.account.id !== pending.current.actorId) {
        clearPrivateView(403); setPrincipal(current.account); setError('The pending request belongs to the original signed-in account. Sign in with that account in another tab, then refresh saved history.'); return;
      }
      if (pending.current?.kind === 'feedback' && !current.history.some(attempt => attempt.id === pending.current?.submissionId)) throw new ReadFailure(404, responseError(404));
      const receipt = afterSave?.actorId === current.account.id ? afterSave : undefined;
      const changedActor = Boolean(viewActor.current && viewActor.current !== current.account.id);
      if (changedActor) { setResponseText(''); setFeedbackDrafts({}); setConfirmed(null); lastConfirmed.current = null; }
      viewActor.current = current.account.id; available.current = true; setPrincipal(current.account); setAssignment(current.current); setSubmissionWindow(current.window); setPrivateWindow(current.window); setAttempts(current.history); setSigninRequired(false);
      setSelectedId(previous => pending.current?.submissionId ?? (current.history.some(attempt => attempt.id === previous) && !changedActor ? previous : current.history[0]?.id ?? ''));
      if (initial || changedActor || receipt?.kind === 'response') setResponseText(current.history[0]?.response ?? (receipt?.kind === 'response' ? receipt.attempt.response : ''));
      if (receipt?.kind === 'feedback') setFeedbackDrafts(previous => { const next = { ...previous }; delete next[receipt.feedback.submissionId]; return next; });
      confirmedNeedsRefresh.current = null;
      setNeedsReload(false); setPendingVerified(Boolean(pending.current));
      setMessage(pending.current ? 'Saved history refreshed and current account access verified. The original request is still pending; its saved expectations and UUID have not changed.' : afterSave ? 'Original save confirmed. Current history refreshed separately; later records may differ from the original receipt.' : initial ? '' : 'Saved response and review history refreshed. Your unsaved text and selected response are kept.');
      if (current.account.role !== 'student') void loadLabels(current.history, current.account.id, ticket, abort.signal);
    } catch (failure) {
      if (ticket !== generation.current || abort.signal.aborted) return;
      setNeedsReload(true); setPendingVerified(false);
      if (failure instanceof ReadFailure && [401, 403, 404].includes(failure.status)) {
        clearPrivateView(failure.status);
        if (afterSave) setMessage('The original save was confirmed. Current assignment access could not be verified, so protected material and history are hidden.');
        if (failure.status === 401 && initial && !pending.current && !afterSave) globalThis.window.location.assign(new URL('/login', globalThis.window.location.origin).href);
      } else { setError(failure instanceof Error ? failure.message : 'Could not refresh saved history.'); if (afterSave) setMessage('The original save was confirmed. Current history could not refresh; the original receipt is shown separately. Refresh before another save.'); }
    } finally { if (ticket === generation.current) setLoading(false); }
  }, [id, readHistory, loadLabels, clearPrivateView]);
  useEffect(() => {
    let active = true; const lifecycle = { generation, controller };
    void Promise.resolve().then(() => {
      if (!active) return; routeId.current = id; available.current = false; viewActor.current = ''; pending.current = null;
      setPendingView(null); setPendingVerified(false); setPrincipal(null); setAssignment(null); setSubmissionWindow(null); setPrivateWindow(null); setAttempts([]); setLabels({}); setSelectedId(''); setResponseText(''); setFeedbackDrafts({}); setConfirmed(null); setNeedsReload(false); setReviewed(false); setMessage(''); setError(''); setSigninRequired(false);
      confirmedNeedsRefresh.current = null; lastConfirmed.current = null;
      return loadCurrent(true);
    });
    return () => { active = false; lifecycle.generation.current++; lifecycle.controller.current?.abort(); };
  }, [id, loadCurrent]);
  useEffect(() => { if (message || error) notice.current?.focus(); }, [message, error]);
  async function reload() {
    if (lock.current) return; lock.current = true; setBusy(true); setMessage('');
    try { await loadCurrent(false, confirmedNeedsRefresh.current ?? undefined); } finally { lock.current = false; setBusy(false); }
  }
  async function execute(request: Pending) {
    if (lock.current || !principal || request.actorId !== principal.id || routeId.current !== request.assignmentId) return;
    lock.current = true; pending.current = request; setPendingView(request); setPendingVerified(false); setBusy(true); setReviewed(false); setError(''); setMessage('');
    try {
      const response = await fetch(request.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: request.body }); const body = await response.text();
      if (routeId.current !== request.assignmentId) return;
      if (!response.ok) {
        if ([401, 403, 404].includes(response.status)) { clearPrivateView(response.status); setError(responseError(response.status) + ' The save outcome is not confirmed. The original request is retained.'); return; }
        if (response.status === 400 || response.status === 409) {
          pending.current = null; setPendingView(null); setPendingVerified(false); setNeedsReload(response.status === 409);
          const detail = (() => { try { return JSON.parse(body); } catch { return null; } })();
          setError(response.status === 409 && detail?.code === 'submission-window-closed' ? 'The submission window is closed. Refresh the window and history; your unsaved response is kept.' : responseError(response.status)); return;
        }
        throw new Error('Unconfirmed response');
      }
      const saved = JSON.parse(body) as SubmissionAttempt | SubmissionFeedback;
      if (saved.id !== request.uuid) throw new Error('Unconfirmed original receipt');
      const original = JSON.parse(request.body);
      if (request.kind === 'response') {
        const attempt = saved as SubmissionAttempt;
        if (attempt.assignmentId !== request.assignmentId || attempt.versionId !== request.versionId || attempt.submittedBy !== request.actorId || attempt.attempt !== original.expectedAttempt + 1 || attempt.response !== original.response.trim() || typeof attempt.studentId !== 'string' || typeof attempt.createdAt !== 'string' || !Array.isArray(attempt.feedback)) throw new Error('Unconfirmed original response');
      } else {
        const feedback = saved as SubmissionFeedback;
        if (feedback.submissionId !== request.submissionId || feedback.reviewedBy !== request.actorId || feedback.revision !== original.expectedRevision + 1 || feedback.feedback !== original.feedback.trim() || typeof feedback.reviewedAt !== 'string') throw new Error('Unconfirmed original feedback');
      }
      const receipt: Confirmed = request.kind === 'response' ? { kind: 'response', actorId: request.actorId, version: request.version, attempt: saved as SubmissionAttempt } : { kind: 'feedback', actorId: request.actorId, version: request.version, feedback: saved as SubmissionFeedback, attemptNumber: request.attemptNumber! };
      pending.current = null; setPendingView(null); setPendingVerified(false); setConfirmed(receipt); setNeedsReload(true); setReviewed(false);
      confirmedNeedsRefresh.current = receipt; lastConfirmed.current = receipt;
      if (receipt.kind === 'response') { setResponseText(receipt.attempt.response); if (available.current) { setAttempts(previous => ordered([receipt.attempt, ...previous.filter(attempt => attempt.id !== receipt.attempt.id)])); setSelectedId(receipt.attempt.id); } setMessage(`Response attempt ${receipt.attempt.attempt} saved for assigned version ${request.version}. Earlier responses are preserved.`); }
      else { if (available.current) setAttempts(previous => previous.map(attempt => attempt.id === receipt.feedback.submissionId ? { ...attempt, feedback: [receipt.feedback, ...attempt.feedback.filter(item => item.id !== receipt.feedback.id)] } : attempt)); setFeedbackDrafts(previous => ({ ...previous, [receipt.feedback.submissionId]: receipt.feedback.feedback })); setSelectedId(receipt.feedback.submissionId); setMessage(`Reviewed formative feedback revision ${receipt.feedback.revision} saved for response attempt ${request.attemptNumber}.`); }
      await loadCurrent(false, receipt);
    } catch {
      if (routeId.current !== request.assignmentId) return;
      setPendingVerified(false); setError('The save outcome is not confirmed. The exact original request and UUID are retained. Refresh saved history to verify your account, then retry this pending request before making another change.');
    } finally { lock.current = false; setBusy(false); }
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current || pending.current || !student || !principal || !assignment || needsReload || !submissionWindow?.acceptingSubmissions || !responseText.trim()) return;
    const uuid = crypto.randomUUID(); void execute({ kind: 'response', assignmentId: id, actorId: principal.id, endpoint: path, uuid, version: assignment.resource.version, versionId: assignment.versionId, body: JSON.stringify({ response: responseText, expectedAttempt: maxAttempt, clientSubmissionId: uuid }) });
  }
  function publishFeedback(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current || pending.current || !staff || !principal || !assignment || !selected || !reviewed || needsReload || !feedbackText.trim()) return;
    const uuid = crypto.randomUUID(); void execute({ kind: 'feedback', assignmentId: id, actorId: principal.id, endpoint: `${path}/${encodeURIComponent(selected.id)}/feedback`, uuid, version: assignment.resource.version, versionId: assignment.versionId, submissionId: selected.id, attemptNumber: selected.attempt, body: JSON.stringify({ feedback: feedbackText, reviewed: true, expectedRevision: maxRevision, clientFeedbackId: uuid }) });
  }
  const windowChanged = useCallback((value: SubmissionWindow) => { if (available.current) { setSubmissionWindow(value); setPrivateWindow(value); } }, []);
  const learnerLabel = (attempt: SubmissionAttempt) => labels[attempt.studentId] ?? 'Learner (name unavailable)';
  return <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6 min-w-0 break-words">
    <nav className="flex flex-wrap gap-4" aria-label="Assignment navigation"><a className="underline" href="/learning">← Assigned learning</a><a className="underline" href="/submissions">Submissions and feedback</a>{staff && <a className="underline" href={`/assignments/${encodeURIComponent(id)}/progress`}>Learner progress</a>}</nav><h1 className="text-2xl font-bold">Assignment responses and feedback</h1>
    <div ref={notice} tabIndex={-1} className="space-y-2 rounded focus:outline-2 focus:outline-offset-2"><p role="status" aria-live="polite">{loading ? 'Loading approved assignment and saved responses…' : message}</p>{error && <p role="alert">{error}</p>}</div>
    {signinRequired && <a href="/login" target="_blank" rel="noopener noreferrer" className="underline">Sign in again in another tab</a>}
    <Button variant="outline" className="max-w-full whitespace-normal" disabled={busy || loading} onClick={() => void reload()}>Refresh saved history (keep text)</Button>
    {pendingView && assignment && <section className="border rounded p-4 space-y-3" aria-label="Pending original save"><h2 className="font-semibold">Pending original {pendingView.kind === 'response' ? 'response' : 'feedback'}</h2><p>New saves, text edits and response selection are locked until this original request is confirmed or explicitly rejected. Refreshing saved history here never changes its original expectations or UUID. Keep this tab open until recovery; navigating away or reloading the browser discards this private pending request.</p><Button type="button" className="max-w-full whitespace-normal" disabled={busy || loading || !pendingVerified || pendingView.actorId !== principal?.id} onClick={() => void execute(pendingView)}>{pendingView.kind === 'response' ? 'Retry pending response' : 'Retry pending feedback'}</Button>{!pendingVerified && <p>Refresh saved history to verify the current account and assignment before retrying.</p>}</section>}
    {assignment && <>
      <article data-assigned-material={assignment.id} className="border rounded p-4 space-y-3 break-words" lang={assignment.resource.language} aria-labelledby="assigned-material-title"><h2 id="assigned-material-title" className="text-xl font-semibold">{assignment.resource.title}</h2><p>{assignment.resource.type} · {assignment.resource.gradeLevel} · {assignment.resource.subject} · {assignment.resource.language} · Assigned version {assignment.resource.version}</p><p>Curriculum: {assignment.resource.curriculum}</p>{assignment.dueDate && <p>Due date: {assignment.dueDate}. This date is informational; no automatic late penalty or submission cutoff is applied.</p>}<h3 className="font-semibold">Learning objectives</h3><p className="whitespace-pre-wrap">{assignment.resource.objectives}</p><h3 className="font-semibold">Student material</h3><p className="whitespace-pre-wrap">{assignment.resource.body}</p></article>
      {confirmed && confirmed.actorId === principal?.id && <section data-confirmed-original-save={confirmed.kind === 'response' ? confirmed.attempt.id : confirmed.feedback.id} className="border rounded p-4 space-y-3"><h2 className="font-semibold">Confirmed original save</h2><p>This records the original saved {confirmed.kind}. Current history is read separately and may contain later records.</p>{confirmed.kind === 'response' ? <><h3>Response attempt {confirmed.attempt.attempt} · Assigned version {confirmed.version}</h3><p className="whitespace-pre-wrap break-words">{confirmed.attempt.response}</p></> : <><h3>Feedback revision {confirmed.feedback.revision} · Response attempt {confirmed.attemptNumber}</h3><p className="whitespace-pre-wrap break-words">{confirmed.feedback.feedback}</p></>}</section>}
      {student && <section className="border rounded p-4 space-y-4" aria-labelledby="response-form-title"><h2 id="response-form-title" className="text-xl font-semibold">{maxAttempt ? 'Submit a revised response' : 'Submit your response'}</h2><p>Your text is saved as a new attempt for assigned version {assignment.resource.version}. Earlier responses and reviewed feedback are preserved. You must remain actively enrolled in the assignment class.</p><form onSubmit={submit} className="space-y-3"><label className="block space-y-1"><span>Your response *</span><textarea required className={inputStyle} maxLength={20000} rows={10} disabled={frozen} value={responseText} onChange={event => { if (!lock.current && !pending.current) setResponseText(event.target.value); }} /></label><p className="text-sm">Plain text, up to 20,000 characters. File attachments are not supported; describe your work in words.</p><Button type="submit" className="max-w-full whitespace-normal" disabled={frozen || needsReload || !responseText.trim() || latestAttempt?.response === responseText.trim() || !submissionWindow?.acceptingSubmissions}>{busy ? 'Working…' : `Save response attempt ${maxAttempt + 1}`}</Button>{needsReload && <p>Refresh saved history before sending another response. Your text is kept.</p>}</form></section>}
      <section className="space-y-4" aria-labelledby="attempt-history-title"><h2 id="attempt-history-title" className="text-xl font-semibold">{student ? 'Your saved response history' : 'Saved student responses'}</h2>{attempts.length === 0 && <p>{student ? 'You have not submitted a response yet.' : 'No student responses are available for this assignment yet.'}</p>}{student && <ol className="space-y-4">{attempts.map(attempt => <li key={attempt.id} data-submission-attempt={attempt.id} className="border rounded p-4 space-y-3"><h3 className="font-semibold">Response attempt {attempt.attempt} · Assigned version {assignment.resource.version}</h3><p className="text-sm">Saved {attempt.createdAt}</p><p className="whitespace-pre-wrap break-words">{attempt.response}</p><h4 className="font-semibold">Reviewed formative feedback for this attempt</h4><ReviewHistory items={attempt.feedback} /></li>)}</ol>}{staff && attempts.length > 0 && <div className="border rounded p-4 space-y-4"><label className="block space-y-1"><span>Saved response to review</span><select className={inputStyle} disabled={frozen} value={selectedId} onChange={event => { if (!lock.current && !pending.current) { setSelectedId(event.target.value); setReviewed(false); } }}>{attempts.map(attempt => <option key={attempt.id} value={attempt.id}>{learnerLabel(attempt)} · Attempt {attempt.attempt} · {attempt.createdAt}</option>)}</select></label>{selected && <><article data-selected-submission={selected.id} className="border rounded p-4 space-y-3" aria-labelledby="selected-response-title"><h3 id="selected-response-title" className="font-semibold">{learnerLabel(selected)} · Saved attempt {selected.attempt}</h3><p className="text-sm">Assigned version {assignment.resource.version} · Saved {selected.createdAt}</p><p className="whitespace-pre-wrap break-words">{selected.response}</p></article><h3 className="font-semibold">Reviewed feedback history for this exact attempt</h3><ReviewHistory items={selected.feedback} /><form onSubmit={publishFeedback} className="space-y-3"><label className="block space-y-1"><span>{maxRevision ? 'New formative feedback revision' : 'Formative feedback'} *</span><textarea className={inputStyle} rows={6} required maxLength={8000} disabled={frozen} value={feedbackText} onChange={event => { if (!lock.current && !pending.current) { setFeedbackDrafts(previous => ({ ...previous, [selected.id]: event.target.value })); setReviewed(false); } }} /></label><p className="text-sm">Plain text, up to 8,000 characters. Reviewed feedback is visible to the student; no automatic score or grade is assigned.</p><label className="flex items-start gap-3"><input type="checkbox" checked={reviewed} disabled={frozen || needsReload || !feedbackText.trim()} onChange={event => setReviewed(event.target.checked)} /><span>I reviewed this feedback against {learnerLabel(selected)}’s saved response attempt {selected.attempt} above. I confirm it is suitable to share with that student.</span></label><Button type="submit" className="max-w-full whitespace-normal" disabled={frozen || needsReload || !reviewed || !feedbackText.trim()}>{busy ? 'Working…' : `Save reviewed feedback revision ${maxRevision + 1}`}</Button>{needsReload && <p>Refresh saved history before reviewing again. Your draft feedback for this selected response is kept.</p>}</form></>}</div>}</section>
    </>}
    {privateWindow && principal && <AssignmentSubmissionWindow assignmentId={id} actorId={principal.id} window={submissionWindow ?? privateWindow} staff={staff} available={Boolean(assignment && submissionWindow)} onChanged={windowChanged} onAccessLost={clearPrivateView} />}
  </main>;
}
