'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- vinext beta requires full-page navigation here. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatDay, formatWhen } from '@/lib/education/display';
import type { AssignmentSummaries, AssignmentSummary, WindowSummary } from '@/lib/education/submission-progress';

function readable(window: WindowSummary): string {
  if (!window.acceptingSubmissions) return window.state === 'closed' ? 'Submissions are closed.' : `Submissions closed ${formatWhen(window.closesAt)}.`;
  return window.closesAt ? `Open for new responses until ${formatWhen(window.closesAt)}.` : 'Open for new responses.';
}
function dueLine(item: AssignmentSummary): string {
  if (!item.dueDate) return 'No due date.';
  return item.dueDatePassed ? `Due ${formatDay(item.dueDate)} (date has passed; this is for information and does not block a response).` : `Due ${formatDay(item.dueDate)} (for information; it does not close the assignment).`;
}
function LearnerGroup({ title, empty, items }: { title: string; empty: string; items: AssignmentSummary[] }) {
  return <section className="space-y-3" aria-label={title}><h2 className="text-xl font-semibold">{title} ({items.length})</h2>
    {items.length === 0 ? <p className="text-sm">{empty}</p> : <ul className="space-y-3">{items.map(item => <li key={item.assignmentId} className="border rounded p-4 space-y-1 break-words">
      <a className="font-medium underline" href={`/assignments/${encodeURIComponent(item.assignmentId)}`}>{item.title}</a>
      <p className="text-sm">{item.className} · {item.type} · assigned version {item.resourceVersion}</p>
      <p className="text-sm">{item.mine && item.mine.attempts > 0 ? `${item.mine.attempts} ${item.mine.attempts === 1 ? 'response' : 'responses'} saved. Latest saved ${formatWhen(item.mine.latestAttemptAt)}${item.mine.latestAfterDueDate ? ' (after the due date)' : ''}.` : 'No response saved yet.'}</p>
      <p className="text-sm">{dueLine(item)} {readable(item.window)}</p>
    </li>)}</ul>}</section>;
}
export default function SubmissionsPage() {
  const [data, setData] = useState<AssignmentSummaries | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const generation = useRef(0);
  const load = useCallback(async () => {
    const ticket = ++generation.current;
    setLoading(true); setMessage('');
    try {
      const response = await fetch('/api/assignment-progress', { cache: 'no-store' });
      if (ticket !== generation.current) return;
      if (response.status === 401) { window.location.assign(new URL('/login', window.location.origin).href); setData(null); setMessage('Please sign in again.'); return; }
      if (response.status === 403 || response.status === 404) { setData(null); setMessage('Submission status is available to enrolled students and school staff. Contact your school administrator if your access needs updating.'); return; }
      if (!response.ok) throw new Error('progress');
      const body: AssignmentSummaries = await response.json();
      if (!Array.isArray(body.items) || (body.role !== 'student' && body.role !== 'staff')) throw new Error('progress');
      if (ticket === generation.current) setData(body);
    } catch {
      if (ticket === generation.current) { setData(null); setMessage('Could not load submission status. Reload to try again.'); }
    } finally { if (ticket === generation.current) setLoading(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(() => load()); const counter = generation; return () => { counter.current++; }; }, [load]);
  const items = data?.items ?? [];
  const todo = items.filter(item => item.mine?.status === 'not-submitted' && item.window.acceptingSubmissions);
  const missed = items.filter(item => item.mine?.status === 'not-submitted' && !item.window.acceptingSubmissions);
  const waiting = items.filter(item => item.mine?.status === 'awaiting-feedback');
  const received = items.filter(item => item.mine?.status === 'feedback-given');
  return <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6 break-words">
    <nav className="flex flex-wrap gap-4" aria-label="Workspace navigation"><a className="underline" href="/">← Dashboard</a><a className="underline" href="/learning">Assigned learning</a></nav>
    <h1 className="text-2xl font-bold">Submissions and feedback</h1>
    <p role="status" aria-live="polite">{loading ? 'Loading submission status…' : message}</p>
    <Button variant="outline" disabled={loading} onClick={() => { void load(); }}>Reload status</Button>
    {data && data.role === 'student' && <>
      <p>Your saved responses and the feedback your teacher has reviewed for you. Only you and your class teachers can see them. Responses are plain text; attachments are not supported.</p>
      {!loading && items.length === 0 && <p>No learning has been assigned to your classes yet.</p>}
      {items.length > 0 && <>
        <LearnerGroup title="To do" empty="Nothing is waiting for a response." items={todo} />
        <LearnerGroup title="Waiting for feedback" empty="No saved response is waiting for feedback." items={waiting} />
        <LearnerGroup title="Feedback received" empty="No reviewed feedback yet." items={received} />
        {missed.length > 0 && <LearnerGroup title="Closed without a response" empty="" items={missed} />}
      </>}
    </>}
    {data && data.role === 'staff' && <>
      <p>One line per assigned resource for the classes you can see. Counts use currently enrolled learners. Feedback is formative; no grade or late penalty is applied.</p>
      {!loading && items.length === 0 && <p>No approved resource has been assigned to your classes yet. Assign one from Teaching resources.</p>}
      <ul className="space-y-3">{items.map(item => <li key={item.assignmentId} className="border rounded p-4 space-y-2 break-words">
        <a className="font-medium underline" href={`/assignments/${encodeURIComponent(item.assignmentId)}/progress`}>{item.title}</a>
        <p className="text-sm">{item.className} · {item.type} · assigned version {item.resourceVersion}</p>
        {item.classProgress && <p>{item.classProgress.submitted} of {item.classProgress.enrolled} learners have responded · {item.classProgress.awaitingFeedback} waiting for feedback · {item.classProgress.feedbackGiven} with reviewed feedback</p>}
        <p className="text-sm">{dueLine(item)} {readable(item.window)}</p>
        <p className="flex flex-wrap gap-4"><a className="underline" href={`/assignments/${encodeURIComponent(item.assignmentId)}/progress`}>Learner progress</a><a className="underline" href={`/assignments/${encodeURIComponent(item.assignmentId)}`}>Review responses and feedback</a></p>
      </li>)}</ul>
    </>}
    {data?.truncated && <p className="text-sm">Only the newest {items.length} assignments are shown.</p>}
  </main>;
}
