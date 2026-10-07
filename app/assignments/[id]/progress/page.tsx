'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatDay, formatWhen } from '@/lib/education/display';
import type { AssignmentRoster, ProgressStatus } from '@/lib/education/submission-progress';

const statusText: Record<ProgressStatus, string> = {
  'not-submitted': 'No response yet', 'awaiting-feedback': 'Response waiting for feedback', 'feedback-given': 'Feedback given on the latest response',
};
export default function AssignmentProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params), path = `/api/assignments/${encodeURIComponent(id)}/progress`;
  const [roster, setRoster] = useState<AssignmentRoster | null>(null);
  const [filter, setFilter] = useState<'all' | ProgressStatus>('all');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const generation = useRef(0);
  const load = useCallback(async () => {
    const ticket = ++generation.current;
    setLoading(true); setMessage('');
    try {
      const response = await fetch(path, { cache: 'no-store' });
      if (ticket !== generation.current) return;
      if (response.status === 401) { window.location.assign(new URL('/login', window.location.origin).href); setRoster(null); setMessage('Please sign in again.'); return; }
      if (response.status === 403) { setRoster(null); setMessage('Student progress is available to the teachers and administrators of this class.'); return; }
      if (response.status === 404) { setRoster(null); setMessage('This assignment is unavailable to your account. It may have been removed, or the class may have changed.'); return; }
      if (!response.ok) throw new Error('roster');
      const body: AssignmentRoster = await response.json();
      if (body.assignmentId !== id || !Array.isArray(body.rows)) throw new Error('roster');
      if (ticket === generation.current) setRoster(body);
    } catch {
      if (ticket === generation.current) { setRoster(null); setMessage('Could not load student progress. Reload to try again.'); }
    } finally { if (ticket === generation.current) setLoading(false); }
  }, [path, id]);
  useEffect(() => { void Promise.resolve().then(() => load()); const counter = generation; return () => { counter.current++; }; }, [load]);
  const rows = roster ? roster.rows.filter(row => filter === 'all' || row.status === filter) : [];
  return <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6 break-words">
    <nav className="flex flex-wrap gap-4" aria-label="Workspace navigation"><a className="underline" href="/submissions">← Submissions and feedback</a><a className="underline" href={`/assignments/${encodeURIComponent(id)}`}>Review responses and feedback</a></nav>
    <h1 className="text-2xl font-bold">Student progress</h1>
    <p role="status" aria-live="polite">{loading ? 'Loading student progress…' : message}</p>
    <Button variant="outline" disabled={loading} onClick={() => { void load(); }}>Reload progress</Button>
    {roster && <>
      <section className="border rounded p-4 space-y-2" aria-labelledby="progress-summary-title">
        <h2 id="progress-summary-title" className="text-xl font-semibold">{roster.title}</h2>
        <p>{roster.className}</p>
        <p className="text-sm">{roster.dueDate ? `Due ${formatDay(roster.dueDate)}. ${roster.dueDatePassed ? 'The date has passed. ' : ''}The date is for information and does not close the assignment or change any mark.` : 'No due date.'}</p>
        <p>{roster.totals.submitted} of {roster.totals.enrolled} enrolled students have responded · {roster.totals.notSubmitted} have not · {roster.totals.awaitingFeedback} waiting for feedback · {roster.totals.feedbackGiven} with feedback given</p>
        <p className="text-sm">As of {formatWhen(roster.asOf)}. Status follows each student&apos;s latest saved response. No grade or late penalty is applied.</p>
      </section>
      <label className="block space-y-1 max-w-sm"><span>Show students</span>
        <select className="border rounded p-2 w-full bg-background" value={filter} onChange={event => setFilter(event.target.value as 'all' | ProgressStatus)}>
          <option value="all">Everyone</option><option value="not-submitted">No response yet</option><option value="awaiting-feedback">Waiting for feedback</option><option value="feedback-given">Feedback given</option></select></label>
      {roster.rows.length === 0 && <p>No students are enrolled in this class.</p>}
      {roster.rows.length > 0 && rows.length === 0 && <p>No students match this view.</p>}
      {rows.length > 0 && <div className="overflow-x-auto"><table className="w-full text-left border-collapse">
        <caption className="sr-only">Saved responses and feedback by student</caption>
        <thead><tr className="border-b"><th scope="col" className="p-2">Student</th><th scope="col" className="p-2">Status</th><th scope="col" className="p-2">Responses</th><th scope="col" className="p-2">Latest response</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.studentId} className="border-b align-top">
          <th scope="row" className="p-2 font-medium">{row.name}{row.enrolled ? '' : <span className="block text-sm font-normal">No longer in this class; saved history kept</span>}</th>
          <td className="p-2">{statusText[row.status]}{row.feedbackRevision ? ` (revision ${row.feedbackRevision})` : ''}</td>
          <td className="p-2">{row.attempts}</td>
          <td className="p-2">{row.latestAttemptAt ? `${formatWhen(row.latestAttemptAt)}${row.latestAfterDueDate ? ' · after the due date' : ''}` : 'None'}</td>
        </tr>)}</tbody></table></div>}
      {roster.truncated && <p className="text-sm">Only the first 200 students are shown.</p>}
    </>}
  </main>;
}
