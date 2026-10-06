'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- tested full-page navigation avoids the vinext transition failure. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Principal } from '@/lib/education/types';
import type { AssessmentResultEditorSnapshot, AssessmentResultReviewHistory, AssessmentResultReviewInput, AssessmentResultReviewResult, AssessmentResultSnapshot } from '@/lib/education/assessment-reviews';

type Mark = { score: string; scoreEdited: boolean; grade: string | null; feedback: string | null };
type Pending = { assessmentId: string; input: AssessmentResultReviewInput };
function initialMark(record: AssessmentResultSnapshot | null): Mark { return { score: record?.score == null ? '' : String(record.score), scoreEdited: false, grade: record?.grade ?? null, feedback: record?.feedback ?? null }; }
function scoreValue(value: string) { if (value.trim() === '') return null; const score = Number(value); return Number.isSafeInteger(score) && score >= 0 ? score : null; }
function changed(mark: Mark, record: AssessmentResultSnapshot | null) {
  const score = scoreValue(mark.score);
  const originalScore = record?.score == null ? '' : String(record.score);
  const scoreChanged = !mark.scoreEdited ? mark.score !== originalScore : record === null ? mark.score !== '' : (score === null ? mark.score !== originalScore : score !== record.score || record.scoreType !== 'integer');
  return scoreChanged || mark.grade !== (record?.grade ?? null) || mark.feedback !== (record?.feedback ?? null);
}
function intendedFields(mark: Mark, record: AssessmentResultSnapshot | null): Partial<Mark> {
  const fields: Partial<Mark> = {};
  if (changed({ ...initialMark(record), score: mark.score, scoreEdited: mark.scoreEdited }, record)) { fields.score = mark.score; fields.scoreEdited = mark.scoreEdited; }
  if (mark.grade !== (record?.grade ?? null)) fields.grade = mark.grade;
  if (mark.feedback !== (record?.feedback ?? null)) fields.feedback = mark.feedback;
  return fields;
}
class ReadFailure extends Error { constructor(message: string, readonly status: number) { super(message); } }
async function read<T>(path: string, signal?: AbortSignal, retainPending = false): Promise<T> {
  const response = await fetch(path, { cache: 'no-store', signal });
  if (!response.ok) await response.arrayBuffer();
  if (response.status === 401) { if (!retainPending) window.location.assign(new URL('/login', window.location.origin).href); throw new ReadFailure('Please sign in again.', 401); }
  if (!response.ok) throw new ReadFailure(response.status === 403 ? 'Your account does not have permission to review results for this assessment.' : response.status === 404 ? 'This assessment is unavailable in your current school or teaching scope.' : 'Saved results could not be loaded. Try reloading the current records.', response.status);
  return response.json() as Promise<T>;
}
function RecordEvidence({ record }: { record: AssessmentResultSnapshot | null }) {
  return record ? <dl className="grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
    <dt>Stored score</dt><dd>{record.score == null ? 'No score' : String(record.score)} ({record.scoreType})</dd>
    <dt>School-supplied grade</dt><dd className="whitespace-pre-wrap break-words">{record.grade == null ? 'No grade' : record.grade === '' ? 'Empty grade' : record.grade}</dd>
    <dt>Feedback</dt><dd className="whitespace-pre-wrap break-words">{record.feedback == null ? 'No feedback' : record.feedback === '' ? 'Empty feedback' : record.feedback}</dd>
    <dt>Last saved</dt><dd className="break-words">{record.updatedAt}</dd>
  </dl> : <p className="text-sm">No saved result.</p>;
}
function ReviewEvidence({ review, snapshot }: { review: AssessmentResultReviewResult['review']; snapshot: AssessmentResultEditorSnapshot }) {
  return <div className="space-y-3 break-words"><p className="whitespace-pre-wrap">Reason: {review.reason}</p><p className="text-sm break-all">Reviewed by account: {review.reviewedBy}</p><p className="text-sm">Saved: {review.createdAt}.</p><p className="text-sm">Original assessment: {review.assessment.title}. Stored date: {review.assessment.date}. Stored maximum: {String(review.assessment.maxScore)} ({review.assessment.maxScoreType}).</p>{review.changes.map(change => {
    const student = snapshot.roster.items.find(row => row.student.id === change.studentId)?.student;
    return <div key={change.studentId} className="space-y-2 rounded border p-2"><h3 className="font-semibold">{student ? `${student.firstName} ${student.lastName}` : change.studentId}</h3><div><h4 className="font-medium">Before this review</h4><RecordEvidence record={change.beforeRecord} /></div><div><h4 className="font-medium">After this review</h4><RecordEvidence record={change.afterRecord} /></div></div>;
  })}</div>;
}

export default function AssessmentResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [assessmentId, setAssessmentId] = useState('');
  const [snapshot, setSnapshot] = useState<AssessmentResultEditorSnapshot | null>(null);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [history, setHistory] = useState<AssessmentResultReviewHistory | null>(null);
  const [confirmed, setConfirmed] = useState<AssessmentResultReviewResult['review'] | null>(null);
  const [reason, setReason] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [pendingAccessDenied, setPendingAccessDenied] = useState(false);
  const [signinRequired, setSigninRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const generation = useRef(0), controller = useRef<AbortController | null>(null);
  const snapshotRef = useRef<AssessmentResultEditorSnapshot | null>(null), marksRef = useRef<Record<string, Mark>>({});
  const assessmentRef = useRef(''), pending = useRef<Pending | null>(null), inFlight = useRef(false);
  const savedNeedsRefresh = useRef(false);
  const message = useRef<HTMLDivElement>(null);
  const staff = principal?.role === 'admin' || principal?.role === 'teacher';

  useEffect(() => {
    let active = true;
    const invalidate = () => { generation.current++; controller.current?.abort(); };
    invalidate(); snapshotRef.current = null; marksRef.current = {}; assessmentRef.current = '';
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      setAssessmentId(''); setPrincipal(null); setSnapshot(null); setMarks({}); setHistory(null); setConfirmed(null); setReviewed(false); setReason(''); setLoading(true); setError(null); setNotice(null); setUncertain(false); setPendingAccessDenied(false); setSigninRequired(false); pending.current = null; savedNeedsRefresh.current = false;
      try {
        const { id } = await params;
        const account = await read<Principal>('/api/session');
        if (!active) return;
        assessmentRef.current = id; setAssessmentId(id); setPrincipal(account);
        if (account.role !== 'admin' && account.role !== 'teacher') { setError('Assessment result review is available to authorised school staff. Assessment results are private staff records.'); setLoading(false); }
      } catch (failure) { if (active) { setError(failure instanceof Error ? failure.message : 'The assessment could not be loaded.'); setLoading(false); } }
    })();
    return () => { active = false; invalidate(); };
  }, [params]);

  const loadCurrent = useCallback(async (retainEdits: boolean, afterSave = false) => {
    if (!assessmentId || !principal || (principal.role !== 'admin' && principal.role !== 'teacher')) return;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const ticket = ++generation.current;
    const intended: Record<string, Partial<Mark>> = pending.current ? Object.fromEntries(pending.current.input.entries.map(entry => [entry.studentId, { score: String(entry.score), scoreEdited: true, grade: entry.grade, feedback: entry.feedback }])) : Object.fromEntries((snapshotRef.current?.roster.items ?? []).filter(row => marksRef.current[row.student.id] && changed(marksRef.current[row.student.id], row.record)).map(row => [row.student.id, intendedFields(marksRef.current[row.student.id], row.record)]));
    setLoading(true); setNeedsReload(true); setReviewed(false); setError(null); setHistory(null); setHistoryError(null);
    const path = '/api/assessments/' + encodeURIComponent(assessmentId) + '/result-editor';
    try {
      const saved = await read<AssessmentResultEditorSnapshot>(path, abort.signal, Boolean(pending.current));
      if (ticket !== generation.current || assessmentRef.current !== assessmentId) return;
      if (saved.assessment.id !== assessmentId) throw new Error('Saved results did not match this assessment. Reload current records before continuing.');
      const next = Object.fromEntries(saved.roster.items.map(row => [row.student.id, { ...initialMark(row.record), ...(retainEdits ? intended[row.student.id] : {}) }]));
      snapshotRef.current = saved; marksRef.current = next; setSnapshot(saved); setMarks(next); setNeedsReload(false); setLoading(false);
      setPendingAccessDenied(false); setSigninRequired(false);
      savedNeedsRefresh.current = false;
      if (pending.current) setNotice('Current records reloaded and access verified. The original reviewed request is still pending. Retry that request to confirm its outcome.');
      else if (retainEdits && !afterSave) setNotice('Current records reloaded. Your intended edits are retained. Compare them with the saved records, then review again before saving.');
      if (afterSave) { setReason(''); setNotice(previous => (previous ?? 'Result review saved.') + ' Current records reloaded.'); }
      try {
        const savedHistory = await read<AssessmentResultReviewHistory>(path + '/history', abort.signal, Boolean(pending.current));
        if (ticket === generation.current) setHistory(savedHistory);
      } catch (failure) {
        if (ticket !== generation.current || abort.signal.aborted) return;
        if (failure instanceof ReadFailure && [401, 403, 404].includes(failure.status)) {
          snapshotRef.current = null; setSnapshot(null); setHistory(null); setConfirmed(null); setNeedsReload(true); setReviewed(false); setError(failure.message);
          setNotice(afterSave ? 'Result review saved. Current access could not be verified. Reload current records after access is restored.' : pending.current ? 'The original reviewed request remains pending. Current access could not be verified. Reload current records after access is restored before retrying.' : null);
          if (pending.current) { setPendingAccessDenied(true); setSigninRequired(failure.status === 401); }
        } else setHistoryError(failure instanceof Error ? failure.message : 'Review history could not be loaded.');
      }
    } catch (failure) {
      if (ticket !== generation.current || abort.signal.aborted) return;
      setLoading(false); setNeedsReload(true);
      if (failure instanceof ReadFailure && [401, 403, 404].includes(failure.status)) {
        snapshotRef.current = null; setSnapshot(null); setHistory(null); setConfirmed(null);
        if (pending.current) { setPendingAccessDenied(true); setSigninRequired(failure.status === 401); }
      }
      if (afterSave) setNotice(previous => (previous ?? 'Result review saved.') + ' Current records could not be refreshed. Reload them before another save.');
      else setError(failure instanceof Error ? failure.message : 'Saved results could not be loaded.');
    }
  }, [assessmentId, principal]);
  useEffect(() => {
    let active = true;
    const invalidate = () => { generation.current++; controller.current?.abort(); };
    void Promise.resolve().then(() => { if (active && staff && assessmentId) return loadCurrent(false); });
    return () => { active = false; invalidate(); };
  }, [staff, assessmentId, loadCurrent]);
  useEffect(() => { if (error || notice) message.current?.focus(); }, [error, notice]);

  function edit(studentId: string, value: Partial<Mark>) {
    if (inFlight.current || pending.current) return;
    const next = { ...marksRef.current, [studentId]: { ...marksRef.current[studentId], ...value } };
    marksRef.current = next; setMarks(next); setReviewed(false); setNotice(null);
  }
  const dirty = snapshot?.roster.items.filter(row => marks[row.student.id] && changed(marks[row.student.id], row.record)) ?? [];
  const maximum = snapshot && !snapshot.invalidMaximum && typeof snapshot.assessment.maxScore === 'number' ? snapshot.assessment.maxScore : null;
  const invalidDirty = dirty.some(row => {
    const mark = marks[row.student.id], score = scoreValue(mark.score);
    return score === null || maximum === null || score > maximum || (row.invalidResult && !mark.scoreEdited) ||
      (mark.grade !== (row.record?.grade ?? null) && mark.grade !== null && Array.from(mark.grade).length > 2000) ||
      (mark.feedback !== (row.record?.feedback ?? null) && mark.feedback !== null && Array.from(mark.feedback).length > 2000);
  });
  const reasonLength = Array.from(reason.trim()).length;
  const validReason = reasonLength >= 10 && reasonLength <= 500 && !/[\x00-\x1f\x7f]/.test(reason.trim());
  const blocked = loading || saving || needsReload || uncertain || !snapshot?.canReview;

  async function save(event: React.FormEvent, retry = false) {
    event.preventDefault();
    if (inFlight.current) return;
    let request = pending.current;
    if (!retry) {
      const current = snapshotRef.current;
      if (blocked || !current || current.assessment.id !== assessmentRef.current || !reviewed || !validReason || !dirty.length || invalidDirty) return;
      const entries = current.roster.items.filter(row => marksRef.current[row.student.id] && changed(marksRef.current[row.student.id], row.record)).map(row => {
        const mark = marksRef.current[row.student.id];
        return { studentId: row.student.id, score: scoreValue(mark.score)!, grade: mark.grade, feedback: mark.feedback, expectedRecord: row.record };
      });
      request = { assessmentId: current.assessment.id, input: { expectedAssessment: current.assessment, clientRequestId: crypto.randomUUID(), reviewConfirmed: true, reason: reason.trim(), entries } };
      pending.current = request;
    }
    if (!request) return;
    inFlight.current = true; setSaving(true); setError(null); setNotice(null);
    const currentRequest = request;
    try {
      const response = await fetch('/api/assessments/' + encodeURIComponent(currentRequest.assessmentId) + '/result-editor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(currentRequest.input) });
      if (!response.ok) {
        await response.arrayBuffer();
        if (response.status >= 500) throw new Error('Unconfirmed save');
        if ([401, 403, 404].includes(response.status)) {
          setUncertain(true); setPendingAccessDenied(true); setSigninRequired(response.status === 401); setNeedsReload(true); setReviewed(false);
          snapshotRef.current = null; setSnapshot(null); setHistory(null); setConfirmed(null);
          setError(response.status === 401 ? 'Your session is no longer available. The save outcome is not confirmed and the original request is retained. Sign in again in another tab, then reload current records.' : 'Result access is no longer available. The save outcome is not confirmed and the original request is retained. Reload current records after access is restored before retrying.');
          return;
        }
        pending.current = null; setUncertain(false); setReviewed(false);
        if (response.status === 409) { setNeedsReload(true); setError('Saved results, assessment details or access changed. Your intended edits are retained. Reload current records and compare them before reviewing another save.'); }
        else { setNeedsReload(response.status === 401 || response.status === 403 || response.status === 404); setError(response.status === 403 ? 'Your account no longer has permission to save results for this assessment.' : response.status === 404 ? 'This assessment is no longer available in your current scope.' : 'The result review was rejected. Your entries are retained; check them before trying again.'); }
        return;
      }
      const result = await response.json() as AssessmentResultReviewResult;
      pending.current = null; setUncertain(false); setPendingAccessDenied(false); setSigninRequired(false); setReviewed(false); setNeedsReload(true);
      if (currentRequest.assessmentId !== assessmentRef.current) return;
      setConfirmed(result.review);
      savedNeedsRefresh.current = true;
      setNotice(result.replayed ? 'Original result review confirmed. This receipt records the original save; current marks may have changed since then.' : 'Result review saved.');
      await loadCurrent(false, true);
    } catch {
      if (currentRequest.assessmentId !== assessmentRef.current) return;
      setUncertain(true); setError('The save outcome is not confirmed. Your entries and the original request are retained. Retry this pending save to confirm its outcome before making further changes.');
    } finally { inFlight.current = false; setSaving(false); }
  }

  return <AppShell principal={principal}><div className="mx-auto max-w-6xl space-y-6 p-4 min-w-0">
    <div className="space-y-2 break-words"><a href="/assessments" className="underline">Assessments</a><h1>Review assessment results</h1><p>Review explicit changes to saved results for the current active roster. Grades are supplied by the school and are not calculated here.</p></div>
    {(error || notice) && <div ref={message} tabIndex={-1} className="space-y-2 rounded border p-3 break-words">{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}</div>}
    {signinRequired && <a href="/login" target="_blank" rel="noopener noreferrer" className="inline-block underline">Sign in again in another tab</a>}
    {staff && <Button type="button" variant="outline" className="whitespace-normal" disabled={loading || saving || (uncertain && !pendingAccessDenied) || !assessmentId} onClick={() => void loadCurrent(!savedNeedsRefresh.current, savedNeedsRefresh.current)}>Reload current results</Button>}
    {loading && <p role="status">Loading saved results and current roster…</p>}
    {staff && snapshot && <>
      <Card className="min-w-0"><CardHeader><CardTitle>{snapshot.assessment.title}</CardTitle></CardHeader><CardContent className="space-y-2 break-words"><p>Class: {snapshot.class.name}</p><p>Kind: {snapshot.assessment.kind}</p><p>Stored assessment date: {snapshot.assessment.date}</p><p>Stored maximum score: {String(snapshot.assessment.maxScore)} ({snapshot.assessment.maxScoreType})</p>{snapshot.invalidDate && <p role="alert">The stored assessment date requires review. It is displayed unchanged; no calendar date is inferred.</p>}{snapshot.invalidMaximum && <p role="alert">The stored maximum score requires review. Saving is unavailable.</p>}</CardContent></Card>
      <Card className="min-w-0"><CardHeader><CardTitle>Current saved results and intended changes</CardTitle><p className="text-sm text-muted-foreground">Unrecorded scores remain blank. Zero is a valid score. Only explicit changes are submitted.</p></CardHeader><CardContent className="space-y-4">
        {snapshot.roster.truncated && <p role="alert">Showing {snapshot.roster.items.length} of {snapshot.roster.total} active learners. This roster exceeds the editor limit of {snapshot.roster.limit}; saving is unavailable.</p>}
        {!snapshot.canReview && !snapshot.roster.truncated && !snapshot.invalidMaximum && snapshot.roster.total > 0 && <p role="alert">{snapshot.roster.items.some(row => row.resultRows > 1) ? 'Multiple saved results exist for a learner.' : snapshot.roster.items.some(row => row.enrolmentRows > 1) ? 'Multiple enrolment records require review.' : 'Stored result evidence requires review.'} Saving is unavailable; no duplicate records are selected or removed.</p>}
        {snapshot.roster.total === 0 && <p>No active learners are available for this assessment.</p>}
        <form onSubmit={event => void save(event)} className="space-y-5"><fieldset disabled={blocked} className="min-w-0 space-y-4">
          {snapshot.roster.items.map(row => {
            const mark = marks[row.student.id] ?? initialMark(row.record), name = `${row.student.firstName} ${row.student.lastName}`;
            return <article key={row.student.id} data-result-student={row.student.id} className="min-w-0 rounded border p-3 space-y-3 break-words"><h2 className="font-semibold">{name}</h2><p className="text-sm">Admission number: {row.student.admissionNumber}</p>
              <div className="rounded bg-muted/30 p-2"><h3 className="font-medium">Loaded saved result</h3>{row.resultRows > 1 ? <><p>{row.resultRows} stored result records. No result is chosen as the current value.</p>{row.records.map(record => <div key={record.id} className="mt-2 rounded border p-2"><p className="text-sm break-all">Record: {record.id}</p><RecordEvidence record={record} /></div>)}{row.recordsTruncated && <p>Only {row.records.length} stored records are displayed.</p>}</> : <RecordEvidence record={row.record} />}</div>
              {row.invalidResult && <p role="alert">{snapshot.canReview ? 'The stored score requires review. Re-enter a valid whole-number score before reviewing a repair.' : 'The stored score requires review. This roster is read-only; no score repair is offered from unsupported or ambiguous evidence.'}</p>}
              <div className="grid min-w-0 gap-3 sm:grid-cols-3"><div className="min-w-0"><Label htmlFor={'score-' + row.student.id}>Score for {name}</Label><Input id={'score-' + row.student.id} type="number" min={0} max={maximum ?? undefined} step={1} value={mark.score} onChange={event => edit(row.student.id, { score: event.target.value, scoreEdited: true })} className="mt-1 w-full min-w-0" /></div>
              <div className="min-w-0"><Label htmlFor={'grade-' + row.student.id}>School-supplied grade for {name}</Label><textarea id={'grade-' + row.student.id} value={mark.grade ?? ''} rows={3} onChange={event => edit(row.student.id, { grade: event.target.value })} className="mt-1 w-full min-w-0 rounded border bg-background p-2" /><Button type="button" variant="outline" className="mt-1 max-w-full whitespace-normal" disabled={mark.grade === null} onClick={() => edit(row.student.id, { grade: null })}>Set no grade for {name}</Button></div>
              <div className="min-w-0"><Label htmlFor={'feedback-' + row.student.id}>Feedback for {name}</Label><textarea id={'feedback-' + row.student.id} value={mark.feedback ?? ''} rows={3} onChange={event => edit(row.student.id, { feedback: event.target.value })} className="mt-1 w-full min-w-0 rounded border bg-background p-2" /><Button type="button" variant="outline" className="mt-1 max-w-full whitespace-normal" disabled={mark.feedback === null} onClick={() => edit(row.student.id, { feedback: null })}>Set no feedback for {name}</Button></div></div>
              <p className="text-sm text-muted-foreground">New or replacement grades and feedback: up to 2,000 characters each. Unchanged saved text is retained.</p>{changed(mark, row.record) && <p className="text-sm font-medium">Intended change</p>}
            </article>;
          })}
          <div><Label htmlFor="result-reason">Reason for result changes</Label><textarea id="result-reason" value={reason} rows={3} aria-describedby="result-reason-guidance" onChange={event => { setReason(event.target.value); setReviewed(false); setNotice(null); }} className="mt-1 w-full min-w-0 rounded border bg-background p-2" /><p id="result-reason-guidance" className="text-sm text-muted-foreground">Enter a single-line explanation of 10–500 characters. Current length: {reasonLength}.</p></div>
          <label className="flex items-start gap-2"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} className="mt-1" /><span>I reviewed the loaded assessment, saved results and these intended changes.</span></label><p>{dirty.length} learner{dirty.length === 1 ? '' : 's'} with intended changes.</p>
          {invalidDirty && <p role="alert">Enter a whole-number score from 0 to {maximum ?? 'the reviewed maximum'} for every changed learner. Explicitly repair invalid saved scores and keep new grades/feedback within 2,000 characters each.</p>}
          <Button type="submit" className="max-w-full whitespace-normal" disabled={blocked || !reviewed || !dirty.length || invalidDirty || !validReason}>{saving ? 'Saving reviewed results…' : 'Save reviewed results'}</Button>
        </fieldset></form>
        {uncertain && !pendingAccessDenied && <form onSubmit={event => void save(event, true)}><Button type="submit" disabled={saving} className="max-w-full whitespace-normal">{saving ? 'Confirming pending save…' : 'Retry pending save'}</Button><p className="mt-2 text-sm">This retries the original reviewed request, including the original assessment and saved-result expectations.</p></form>}
        <p className="text-sm text-muted-foreground break-words">Loaded snapshot: {snapshot.asOf}</p>
      </CardContent></Card>
      {confirmed && <Card className="min-w-0" data-confirmed-result-review={confirmed.id}><CardHeader><CardTitle>Confirmed saved review</CardTitle><p className="text-sm text-muted-foreground">This is the immutable original save receipt. It does not assert that these results remain current.</p></CardHeader><CardContent><ReviewEvidence review={confirmed} snapshot={snapshot} /></CardContent></Card>}
      <Card className="min-w-0"><CardHeader><CardTitle>Saved result review history</CardTitle><p className="text-sm text-muted-foreground">Immutable before-and-after evidence. Current records are shown above.</p></CardHeader><CardContent className="space-y-3">{historyError && <p role="alert">Review history could not be loaded. Reload current results to try again.</p>}{!history && !historyError && <p role="status">Loading review history…</p>}{history?.total === 0 && <p>No saved result reviews for this assessment.</p>}{history?.truncated && <p role="status">Showing {history.items.length} of {history.total} saved reviews (limit {history.limit}). Earlier evidence is not loaded here.</p>}{history && !history.truncated && history.total > 0 && <p>{history.total} saved review{history.total === 1 ? '' : 's'}.</p>}{history?.items.map(review => <details key={review.id} data-result-review={review.id} className="min-w-0 rounded border p-3 break-words"><summary className="cursor-pointer font-medium">Review saved {review.createdAt}</summary><div className="mt-3"><ReviewEvidence review={review} snapshot={snapshot} /></div></details>)}</CardContent></Card>
    </>}
  </div></AppShell>;
}
