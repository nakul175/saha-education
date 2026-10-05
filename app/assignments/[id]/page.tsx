'use client';

// Use full-page anchors because vinext beta client transitions fail in this workspace.
import { use, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { SubmissionAttempt, SubmissionFeedback } from '@/db/submission-schema';
import type { ResourceAssignment } from '@/lib/education/resource-types';
import type { Principal, Student } from '@/lib/education/types';

const inputStyle = 'border rounded p-2 w-full min-w-0 bg-background';
function responseError(status: number): string {
  if (status === 401) { window.location.assign(new URL('/login', window.location.origin).href); return 'Please sign in again.'; }
  if (status === 403) return 'Your account does not have permission for this assignment action.';
  if (status === 404) return 'This assignment or response is unavailable to your account. Students must be actively enrolled in its class.';
  if (status === 409) return 'A newer response or review was saved. Your text is kept. Refresh the saved history before continuing.';
  if (status === 400) return 'Enter valid plain text within the displayed length limit. Your text is kept.';
  return 'Could not confirm this action. Your text is kept.';
}
function ordered(items: SubmissionAttempt[]): SubmissionAttempt[] {
  return [...items].sort((a, b) => b.attempt - a.attempt || b.createdAt.localeCompare(a.createdAt));
}
function latestReview(attempt: SubmissionAttempt): SubmissionFeedback | undefined {
  return [...attempt.feedback].sort((a, b) => b.revision - a.revision)[0];
}
function ReviewHistory({ items }: { items: SubmissionFeedback[] }) {
  if (items.length === 0) return <p>No reviewed feedback yet.</p>;
  return <ol className="space-y-3">{[...items].sort((a, b) => b.revision - a.revision).map(item => <li key={item.id} className="border rounded p-3 space-y-2">
    <p className="font-medium">Reviewed feedback · Revision {item.revision}</p>
    <p className="whitespace-pre-wrap break-words">{item.feedback}</p><p className="text-sm">Reviewed {new Date(item.reviewedAt).toLocaleString()}</p>
  </li>)}</ol>;
}

export default function AssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params), path = `/api/assignments/${encodeURIComponent(id)}/submissions`;
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [assignment, setAssignment] = useState<ResourceAssignment | null>(null);
  const [attempts, setAttempts] = useState<SubmissionAttempt[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState('');
  const [responseText, setResponseText] = useState('');
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});
  const [reviewed, setReviewed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  const attemptRetry = useRef<{ payload: string; id: string } | null>(null);
  const feedbackRetry = useRef<{ payload: string; id: string } | null>(null);
  const notice = useRef<HTMLDivElement>(null);
  const selected = attempts.find(attempt => attempt.id === selectedId);
  const student = principal?.role === 'student';
  const staff = principal?.role === 'teacher' || principal?.role === 'admin';
  const maxAttempt = attempts.reduce((maximum, attempt) => Math.max(maximum, attempt.attempt), 0);
  const latestAttempt = attempts.find(attempt => attempt.attempt === maxAttempt);
  const feedbackText = selected ? feedbackDrafts[selected.id] ?? latestReview(selected)?.feedback ?? '' : '';
  const maxRevision = selected?.feedback.reduce((maximum, item) => Math.max(maximum, item.revision), 0) ?? 0;

  async function readHistory(signal?: AbortSignal) {
    const responses = await Promise.all([fetch('/api/session', { cache: 'no-store', signal }), fetch('/api/resource-assignments', { cache: 'no-store', signal }), fetch(path, { cache: 'no-store', signal })]);
    const failed = responses.find(response => response.status === 401) ?? responses.find(response => !response.ok);
    if (failed) throw new Error(responseError(failed.status));
    const account: Principal = await responses[0].json(), assigned: ResourceAssignment[] = await responses[1].json(), history: SubmissionAttempt[] = await responses[2].json();
    const current = assigned.find(item => item.id === id);
    if (!current) throw new Error('This approved assignment is unavailable to your account. Students must be actively enrolled in its class.');
    return { account, current, history: ordered(history) };
  }
  async function loadLabels(history: SubmissionAttempt[], signal?: AbortSignal) {
    // Fetch only learners referenced by authorized attempts, never a full roster.
    const results = await Promise.allSettled([...new Set(history.map(attempt => attempt.studentId))].map(async studentId => {
      const response = await fetch(`/api/students/${encodeURIComponent(studentId)}`, { cache: 'no-store', signal });
      if (!response.ok) return null;
      const profile: Student = await response.json();
      return [studentId, `${profile.firstName} ${profile.lastName}`] as const;
    }));
    if (signal?.aborted) return;
    const found: Record<string, string> = {};
    for (const result of results) if (result.status === 'fulfilled' && result.value) found[result.value[0]] = result.value[1];
    setLabels(previous => ({ ...previous, ...found }));
  }
  useEffect(() => {
    const controller = new AbortController();
    void readHistory(controller.signal).then(({ account, current, history }) => {
      if (controller.signal.aborted) return;
      setPrincipal(account); setAssignment(current); setAttempts(history); setSelectedId(history[0]?.id ?? '');
      if (account.role === 'student') setResponseText(history[0]?.response ?? '');
      else void loadLabels(history, controller.signal);
      setNeedsReload(false); setReviewed(false);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load this assignment.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  // The assignment route determines this read; mutation state does not reload it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  async function reload() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const { account, current, history } = await readHistory();
      setPrincipal(account); setAssignment(current); setAttempts(history); setSelectedId(previous => history.some(attempt => attempt.id === previous) ? previous : history[0]?.id ?? '');
      setReviewed(false); setNeedsReload(false);
      if (account.role !== 'student') void loadLabels(history);
      setMessage('Saved response and review history refreshed. Your unsaved text and selected response are kept.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not refresh saved history.'); }
    finally { lock.current = false; setBusy(false); notice.current?.focus(); }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !student || !assignment || needsReload || !responseText.trim()) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    const payload = JSON.stringify({ response: responseText, expectedAttempt: maxAttempt });
    const clientId = attemptRetry.current?.payload === payload ? attemptRetry.current.id : crypto.randomUUID();
    attemptRetry.current = { payload, id: clientId };
    let acknowledged = false;
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ response: responseText, expectedAttempt: maxAttempt, clientSubmissionId: clientId }) });
      if (!response.ok) { if (response.status === 409) setNeedsReload(true); throw new Error(responseError(response.status)); }
      acknowledged = true;
      const saved: SubmissionAttempt = await response.json();
      setAttempts(previous => ordered([saved, ...previous.filter(attempt => attempt.id !== saved.id)])); setSelectedId(saved.id); setResponseText(saved.response);
      attemptRetry.current = null; setNeedsReload(false);
      setMessage(`Response attempt ${saved.attempt} saved for assigned version ${assignment.resource.version}. Your earlier responses are preserved.`);
      try {
        const { history } = await readHistory();
        setAttempts(history); setSelectedId(saved.id);
      } catch { setMessage(`Response attempt ${saved.attempt} saved. History could not refresh; your saved response is shown below. Reload history when available.`); }
    } catch (reason) {
      if (acknowledged) { setNeedsReload(true); setMessage('Your response was saved. Reload history to see its exact saved attempt. Your text is kept.'); }
      else setError(`${reason instanceof Error ? reason.message : 'Could not confirm the submission.'} Retrying the same response is safe.`);
    } finally { lock.current = false; setBusy(false); notice.current?.focus(); }
  }
  async function publishFeedback(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !staff || !selected || !reviewed || needsReload || !feedbackText.trim()) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    const exactAttemptId = selected.id, attemptNumber = selected.attempt;
    const payload = JSON.stringify({ submissionId: exactAttemptId, feedback: feedbackText, expectedRevision: maxRevision });
    const clientId = feedbackRetry.current?.payload === payload ? feedbackRetry.current.id : crypto.randomUUID();
    feedbackRetry.current = { payload, id: clientId };
    let acknowledged = false;
    try {
      const response = await fetch(`${path}/${encodeURIComponent(exactAttemptId)}/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feedback: feedbackText, reviewed: true, expectedRevision: maxRevision, clientFeedbackId: clientId }) });
      if (!response.ok) { if (response.status === 409) setNeedsReload(true); throw new Error(responseError(response.status)); }
      acknowledged = true;
      const saved: SubmissionFeedback = await response.json();
      setAttempts(previous => previous.map(attempt => attempt.id === exactAttemptId ? { ...attempt, feedback: [saved, ...attempt.feedback.filter(item => item.id !== saved.id)] } : attempt));
      setFeedbackDrafts(previous => ({ ...previous, [exactAttemptId]: saved.feedback })); setReviewed(false); setNeedsReload(false); feedbackRetry.current = null;
      setMessage(`Reviewed formative feedback revision ${saved.revision} saved for response attempt ${attemptNumber}. It is visible to that student.`);
      try {
        const { history } = await readHistory();
        setAttempts(history); setSelectedId(exactAttemptId);
      } catch { setMessage(`Reviewed feedback revision ${saved.revision} saved for response attempt ${attemptNumber}. History could not refresh; reload when available.`); }
    } catch (reason) {
      if (acknowledged) { setNeedsReload(true); setReviewed(false); setMessage(`Reviewed feedback was saved for response attempt ${attemptNumber}. Reload history to display its exact revision. Your text is kept.`); }
      else setError(`${reason instanceof Error ? reason.message : 'Could not confirm the review.'} Retrying the same reviewed text for this response is safe.`);
    } finally { lock.current = false; setBusy(false); notice.current?.focus(); }
  }
  const learnerLabel = (attempt: SubmissionAttempt) => labels[attempt.studentId] ?? `Learner ${attempt.studentId}`;
  return <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
    <a className="underline" href="/learning">← Assigned learning</a><h1 className="text-2xl font-bold">Assignment responses and feedback</h1>
    <div ref={notice} tabIndex={-1} className="space-y-2 rounded focus:outline-2 focus:outline-offset-2"><p role="status" aria-live="polite">{loading ? 'Loading approved assignment and saved responses…' : message}</p>{error && <p role="alert">{error}</p>}</div>
    <Button variant="outline" disabled={busy || loading} onClick={() => { void reload(); }}>Refresh saved history (keep text)</Button>
    {assignment && <>
      <article className="border rounded p-4 space-y-3 break-words" lang={assignment.resource.language} aria-labelledby="assigned-material-title">
        <h2 id="assigned-material-title" className="text-xl font-semibold">{assignment.resource.title}</h2>
        <p>{assignment.resource.type} · {assignment.resource.gradeLevel} · {assignment.resource.subject} · {assignment.resource.language} · Assigned version {assignment.resource.version}</p>
        <p>Curriculum: {assignment.resource.curriculum}</p>
        {assignment.dueDate && <p>Due date: {assignment.dueDate}. This date is informational; no automatic late penalty or submission cutoff is applied.</p>}
        <h3 className="font-semibold">Learning objectives</h3><p className="whitespace-pre-wrap">{assignment.resource.objectives}</p>
        <h3 className="font-semibold">Student material</h3><p className="whitespace-pre-wrap">{assignment.resource.body}</p>
      </article>
      {student && <section className="border rounded p-4 space-y-4" aria-labelledby="response-form-title">
        <h2 id="response-form-title" className="text-xl font-semibold">{maxAttempt ? 'Submit a revised response' : 'Submit your response'}</h2>
        <p>Your text is saved as a new attempt for assigned version {assignment.resource.version}. Earlier responses and reviewed feedback are preserved. You must remain actively enrolled in the assignment class.</p>
        <form onSubmit={submit} className="space-y-3">
          <label className="block space-y-1"><span>Your response *</span><textarea required className={inputStyle} maxLength={20000} rows={10} disabled={busy} value={responseText} onChange={event => setResponseText(event.target.value)} /></label>
          <p className="text-sm">Plain text, up to 20,000 characters.</p>
          <Button type="submit" disabled={busy || needsReload || !responseText.trim() || (latestAttempt?.response === responseText.trim())}>{busy ? 'Working…' : `Save response attempt ${maxAttempt + 1}`}</Button>
          {needsReload && <p>Refresh saved history before sending another response. Your text is kept.</p>}
        </form>
      </section>}
      <section className="space-y-4" aria-labelledby="attempt-history-title">
        <h2 id="attempt-history-title" className="text-xl font-semibold">{student ? 'Your saved response history' : 'Saved student responses'}</h2>
        {attempts.length === 0 && <p>{student ? 'You have not submitted a response yet.' : 'No student responses are available for this assignment yet.'}</p>}
        {student && <ol className="space-y-4">{attempts.map(attempt => <li key={attempt.id} className="border rounded p-4 space-y-3">
          <h3 className="font-semibold">Response attempt {attempt.attempt} · Assigned version {assignment.resource.version}</h3><p className="text-sm">Saved {new Date(attempt.createdAt).toLocaleString()}</p><p className="whitespace-pre-wrap break-words">{attempt.response}</p>
          <h4 className="font-semibold">Reviewed formative feedback for this attempt</h4><ReviewHistory items={attempt.feedback} />
        </li>)}</ol>}
        {staff && attempts.length > 0 && <div className="border rounded p-4 space-y-4">
          <label className="block space-y-1"><span>Saved response to review</span><select className={inputStyle} disabled={busy} value={selectedId} onChange={event => { setSelectedId(event.target.value); setReviewed(false); }}>{attempts.map(attempt => <option key={attempt.id} value={attempt.id}>{learnerLabel(attempt)} · Attempt {attempt.attempt} · {new Date(attempt.createdAt).toLocaleString()}</option>)}</select></label>
          {selected && <>
            <article className="border rounded p-4 space-y-3" aria-labelledby="selected-response-title"><h3 id="selected-response-title" className="font-semibold">{learnerLabel(selected)} · Saved attempt {selected.attempt}</h3><p className="text-sm">Assigned version {assignment.resource.version} · Saved {new Date(selected.createdAt).toLocaleString()}</p><p className="whitespace-pre-wrap break-words">{selected.response}</p></article>
            <h3 className="font-semibold">Reviewed feedback history for this exact attempt</h3><ReviewHistory items={selected.feedback} />
            <form onSubmit={publishFeedback} className="space-y-3">
              <label className="block space-y-1"><span>{maxRevision ? 'New formative feedback revision' : 'Formative feedback'} *</span><textarea className={inputStyle} rows={6} required maxLength={8000} disabled={busy} value={feedbackText} onChange={event => { setFeedbackDrafts(previous => ({ ...previous, [selected.id]: event.target.value })); setReviewed(false); }} /></label>
              <p className="text-sm">Plain text, up to 8,000 characters. Reviewed feedback is visible to the student; no automatic score or grade is assigned.</p>
              <label className="flex items-start gap-3"><input type="checkbox" checked={reviewed} disabled={busy || needsReload || !feedbackText.trim()} onChange={event => setReviewed(event.target.checked)} /><span>I reviewed this feedback against {learnerLabel(selected)}’s saved response attempt {selected.attempt} above. I confirm it is suitable to share with that student.</span></label>
              <Button type="submit" disabled={busy || needsReload || !reviewed || !feedbackText.trim()}>{busy ? 'Working…' : `Save reviewed feedback revision ${maxRevision + 1}`}</Button>
              {needsReload && <p>Refresh saved history before reviewing again. Your draft feedback for this selected response is kept.</p>}
            </form>
          </>}
        </div>}
      </section>
    </>}
  </main>;
}
