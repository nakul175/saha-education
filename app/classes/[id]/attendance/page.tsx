'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- tested full-page navigation avoids the vinext transition failure. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Principal } from '@/lib/education/types';
import type { AttendanceEditorSnapshot, AttendanceReviewHistory, AttendanceReviewInput, AttendanceReviewResult, AttendanceRecordSnapshot } from '@/lib/education/attendance-reviews';

type Mark = { status: string; note: string };
type Pending = { classId: string; input: AttendanceReviewInput };
const statuses = ['present', 'absent', 'late', 'excused'] as const;
function today() {
  const value = new Date();
  return `${value.getFullYear().toString().padStart(4, '0')}-${(value.getMonth() + 1).toString().padStart(2, '0')}-${value.getDate().toString().padStart(2, '0')}`;
}
function calendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}
function initialMark(record: AttendanceRecordSnapshot | null): Mark { return { status: record?.status ?? '', note: record?.note ?? '' }; }
function changed(mark: Mark, record: AttendanceRecordSnapshot | null) { return mark.status !== (record?.status ?? '') || mark.note !== (record?.note ?? ''); }
function validStatus(value: string): value is typeof statuses[number] { return statuses.some(status => status === value); }
class ReadFailure extends Error { constructor(message: string, readonly status: number) { super(message); } }
async function read<T>(path: string, signal?: AbortSignal, retainPending = false): Promise<T> {
  const response = await fetch(path, { cache: 'no-store', signal });
  if (!response.ok) await response.arrayBuffer();
  if (response.status === 401) { if (!retainPending) window.location.assign(new URL('/login', window.location.origin).href); throw new ReadFailure('Please sign in again.', 401); }
  if (!response.ok) throw new ReadFailure(response.status === 403 ? 'Your account does not have permission to record attendance for this class.' : response.status === 404 ? 'This class is unavailable in your current school or teaching scope.' : 'Saved attendance could not be loaded. Try reloading the current records.', response.status);
  return response.json() as Promise<T>;
}
function RecordEvidence({ record }: { record: AttendanceRecordSnapshot | null }) {
  return record ? <dl className="grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
    <dt>Status</dt><dd>{record.status}</dd><dt>Note</dt><dd className="whitespace-pre-wrap break-words">{record.note == null ? 'No note' : record.note === '' ? 'Empty note' : record.note}</dd>
    <dt>Recorded by account</dt><dd className="break-all">{record.recordedBy}</dd><dt>Last saved</dt><dd className="break-words">{record.updatedAt}</dd>
  </dl> : <p className="text-sm">No attendance record.</p>;
}
function ReviewEvidence({ review, snapshot }: { review: AttendanceReviewResult['review']; snapshot: AttendanceEditorSnapshot }) {
  return <div className="space-y-3 break-words"><p className="whitespace-pre-wrap">Reason: {review.reason}</p><p className="text-sm break-all">Reviewed by account: {review.reviewedBy}</p><p className="text-sm">Saved: {review.createdAt}. Date: {review.date}.</p>{review.changes.map(change => {
    const student = snapshot.roster.items.find(row => row.student.id === change.studentId)?.student;
    return <div key={change.studentId} className="space-y-2 rounded border p-2"><h3 className="font-semibold">{student ? `${student.firstName} ${student.lastName}` : change.studentId}</h3><div><h4 className="font-medium">Before this review</h4><RecordEvidence record={change.beforeRecord} /></div><div><h4 className="font-medium">After this review</h4><RecordEvidence record={change.afterRecord} /></div></div>;
  })}</div>;
}

export default function TakeAttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(today);
  const [snapshot, setSnapshot] = useState<AttendanceEditorSnapshot | null>(null);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [history, setHistory] = useState<AttendanceReviewHistory | null>(null);
  const [confirmed, setConfirmed] = useState<AttendanceReviewResult['review'] | null>(null);
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
  const snapshotRef = useRef<AttendanceEditorSnapshot | null>(null), marksRef = useRef<Record<string, Mark>>({});
  const classRef = useRef(''), dateRef = useRef(date), pending = useRef<Pending | null>(null), inFlight = useRef(false);
  const savedNeedsRefresh = useRef(false);
  const message = useRef<HTMLDivElement>(null);
  const staff = principal?.role === 'admin' || principal?.role === 'teacher';

  useEffect(() => {
    let active = true;
    const invalidate = () => { generation.current++; controller.current?.abort(); };
    invalidate(); snapshotRef.current = null; marksRef.current = {}; classRef.current = '';
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      setClassId(''); setPrincipal(null); setSnapshot(null); setMarks({}); setHistory(null); setConfirmed(null); setReviewed(false); setReason(''); setLoading(true); setError(null); setNotice(null); setUncertain(false); setPendingAccessDenied(false); setSigninRequired(false); pending.current = null; savedNeedsRefresh.current = false;
      try {
        const { id } = await params;
        const account = await read<Principal>('/api/session');
        if (!active) return;
        classRef.current = id; setClassId(id); setPrincipal(account);
        if (account.role !== 'admin' && account.role !== 'teacher') { setError('Attendance recording is available to authorised school staff. Use Attendance to view the records available to your account.'); setLoading(false); }
      } catch (failure) { if (active) { setError(failure instanceof Error ? failure.message : 'The class could not be loaded.'); setLoading(false); } }
    })();
    return () => { active = false; invalidate(); };
  }, [params]);

  const loadCurrent = useCallback(async (retainEdits: boolean, afterSave = false) => {
    if (!classId || !principal || (principal.role !== 'admin' && principal.role !== 'teacher')) return;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const ticket = ++generation.current;
    const intended = pending.current ? Object.fromEntries(pending.current.input.entries.map(entry => [entry.studentId, { status: entry.status, note: entry.note ?? '' }])) : Object.fromEntries((snapshotRef.current?.roster.items ?? []).filter(row => marksRef.current[row.student.id] && changed(marksRef.current[row.student.id], row.record)).map(row => [row.student.id, marksRef.current[row.student.id]]));
    setLoading(true); setNeedsReload(true); setReviewed(false); setError(null); setHistory(null); setHistoryError(null);
    if (!calendarDate(date)) { setError('Choose a real calendar date in YYYY-MM-DD format.'); setLoading(false); return; }
    const path = '/api/classes/' + encodeURIComponent(classId) + '/attendance-editor';
    try {
      const saved = await read<AttendanceEditorSnapshot>(path + '?date=' + encodeURIComponent(date), abort.signal, Boolean(pending.current));
      if (ticket !== generation.current || dateRef.current !== date || classRef.current !== classId) return;
      if (saved.class.id !== classId || saved.date !== date) throw new Error('Saved attendance did not match this class and date. Reload current records before continuing.');
      const next = Object.fromEntries(saved.roster.items.map(row => [row.student.id, retainEdits ? intended[row.student.id] ?? initialMark(row.record) : initialMark(row.record)]));
      snapshotRef.current = saved; marksRef.current = next; setSnapshot(saved); setMarks(next); setNeedsReload(false); setLoading(false);
      setPendingAccessDenied(false); setSigninRequired(false);
      savedNeedsRefresh.current = false;
      if (pending.current) setNotice('Current records reloaded and access verified. The original reviewed request is still pending. Retry that request to confirm its outcome.');
      else if (retainEdits && !afterSave) setNotice('Current records reloaded. Your intended edits are retained. Compare them with the saved records, then review again before saving.');
      if (afterSave) { setReason(''); setNotice(previous => (previous ?? 'Attendance review saved.') + ' Current records reloaded.'); }
      try {
        const savedHistory = await read<AttendanceReviewHistory>(path + '/history?date=' + encodeURIComponent(date), abort.signal, Boolean(pending.current));
        if (ticket === generation.current) setHistory(savedHistory);
      } catch (failure) { if (ticket === generation.current && !abort.signal.aborted) setHistoryError(failure instanceof Error ? failure.message : 'Review history could not be loaded.'); }
    } catch (failure) {
      if (ticket !== generation.current || abort.signal.aborted) return;
      setLoading(false); setNeedsReload(true);
      if (failure instanceof ReadFailure && [401, 403, 404].includes(failure.status)) {
        snapshotRef.current = null; setSnapshot(null); setHistory(null); setConfirmed(null);
        if (pending.current) { setPendingAccessDenied(true); setSigninRequired(failure.status === 401); }
      }
      if (afterSave) setNotice(previous => (previous ?? 'Attendance review saved.') + ' Current records could not be refreshed. Reload them before another save.');
      else setError(failure instanceof Error ? failure.message : 'Saved attendance could not be loaded.');
    }
  }, [classId, date, principal]);
  useEffect(() => {
    let active = true;
    const invalidate = () => { generation.current++; controller.current?.abort(); };
    void Promise.resolve().then(() => { if (active && staff && classId) return loadCurrent(false); });
    return () => { active = false; invalidate(); };
  }, [staff, classId, loadCurrent]);
  useEffect(() => { if (error || notice) message.current?.focus(); }, [error, notice]);

  function changeDate(value: string) {
    if (inFlight.current || pending.current) return;
    dateRef.current = value; generation.current++; controller.current?.abort(); snapshotRef.current = null; marksRef.current = {};
    savedNeedsRefresh.current = false;
    setDate(value); setSnapshot(null); setMarks({}); setHistory(null); setConfirmed(null); setReason(''); setReviewed(false); setNotice(null); setError(null); setHistoryError(null); setNeedsReload(true);
  }
  function edit(studentId: string, value: Partial<Mark>) {
    if (inFlight.current || pending.current) return;
    const next = { ...marksRef.current, [studentId]: { ...marksRef.current[studentId], ...value } };
    marksRef.current = next; setMarks(next); setReviewed(false); setNotice(null);
  }
  const dirty = snapshot?.roster.items.filter(row => marks[row.student.id] && changed(marks[row.student.id], row.record)) ?? [];
  const invalidDirty = dirty.some(row => !validStatus(marks[row.student.id].status) || (marks[row.student.id].note !== (row.record?.note ?? '') && Array.from(marks[row.student.id].note).length > 2000));
  const reasonLength = Array.from(reason.trim()).length;
  const validReason = reasonLength >= 10 && reasonLength <= 500 && !/[\x00-\x1f\x7f]/.test(reason.trim());
  const blocked = loading || saving || needsReload || uncertain || !snapshot?.canReview;

  async function save(event: React.FormEvent, retry = false) {
    event.preventDefault();
    if (inFlight.current) return;
    let request = pending.current;
    if (!retry) {
      const current = snapshotRef.current;
      if (blocked || !current || current.date !== dateRef.current || current.class.id !== classRef.current || !reviewed || !validReason || !dirty.length || invalidDirty) return;
      const entries = current.roster.items.filter(row => marksRef.current[row.student.id] && changed(marksRef.current[row.student.id], row.record)).map(row => {
        const mark = marksRef.current[row.student.id];
        return { studentId: row.student.id, status: mark.status as typeof statuses[number], note: mark.note === (row.record?.note ?? '') ? row.record?.note ?? null : mark.note === '' ? null : mark.note, expectedRecord: row.record };
      });
      request = { classId: current.class.id, input: { date: current.date, clientRequestId: crypto.randomUUID(), reviewConfirmed: true, reason: reason.trim(), entries } };
      pending.current = request;
    }
    if (!request) return;
    inFlight.current = true; setSaving(true); setError(null); setNotice(null);
    const currentRequest = request;
    try {
      const response = await fetch('/api/classes/' + encodeURIComponent(currentRequest.classId) + '/attendance-editor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(currentRequest.input) });
      if (!response.ok) {
        await response.arrayBuffer();
        if (response.status >= 500) throw new Error('Unconfirmed save');
        if ([401, 403, 404].includes(response.status)) {
          setUncertain(true); setPendingAccessDenied(true); setSigninRequired(response.status === 401); setNeedsReload(true); setReviewed(false);
          snapshotRef.current = null; setSnapshot(null); setHistory(null); setConfirmed(null);
          setError(response.status === 401 ? 'Your session is no longer available. The save outcome is not confirmed and the original request is retained. Sign in again in another tab, then reload current records.' : 'Attendance access is no longer available. The save outcome is not confirmed and the original request is retained. Reload current records after access is restored before retrying.');
          return;
        }
        pending.current = null; setUncertain(false); setReviewed(false);
        if (response.status === 409) { setNeedsReload(true); setError('Saved attendance or class access changed. Your intended edits are retained. Reload current records and compare them before reviewing another save.'); }
        else { setNeedsReload(response.status === 401 || response.status === 403 || response.status === 404); setError(response.status === 403 ? 'Your account no longer has permission to save attendance for this class.' : response.status === 404 ? 'This class is no longer available in your current scope.' : 'The attendance review was rejected. Your entries are retained; check them before trying again.'); }
        return;
      }
      const result = await response.json() as AttendanceReviewResult;
      pending.current = null; setUncertain(false); setPendingAccessDenied(false); setSigninRequired(false); setReviewed(false); setNeedsReload(true);
      if (currentRequest.classId !== classRef.current || currentRequest.input.date !== dateRef.current) return;
      setConfirmed(result.review);
      savedNeedsRefresh.current = true;
      setNotice(result.replayed ? 'Original attendance review confirmed. This receipt records the original save; current marks may have changed since then.' : 'Attendance review saved.');
      await loadCurrent(false, true);
    } catch {
      if (currentRequest.classId !== classRef.current || currentRequest.input.date !== dateRef.current) return;
      setUncertain(true); setError('The save outcome is not confirmed. Your entries and the original request are retained. Retry this pending save to confirm its outcome before making further changes.');
    } finally { inFlight.current = false; setSaving(false); }
  }

  return <AppShell principal={principal}><div className="mx-auto max-w-6xl space-y-6 p-4 min-w-0">
    <div className="space-y-2 break-words"><a href="/classes" className="underline">Classes</a><h1>Take Attendance</h1><p>Review changes to saved attendance for the current active roster.</p>{snapshot && <p className="font-semibold">{snapshot.class.name}</p>}<a href="/attendance" className="inline-block underline">Attendance records</a></div>
    {(error || notice) && <div ref={message} tabIndex={-1} className="space-y-2 rounded border p-3 break-words">{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}</div>}
    {signinRequired && <a href="/login" target="_blank" rel="noopener noreferrer" className="inline-block underline">Sign in again in another tab</a>}
    {staff && <div className="flex min-w-0 flex-wrap items-end gap-3"><div><Label htmlFor="attendance-date">Attendance date</Label><Input id="attendance-date" type="date" value={date} disabled={saving || uncertain} onChange={event => changeDate(event.target.value)} className="max-w-full" /></div><Button type="button" variant="outline" className="whitespace-normal" disabled={loading || saving || (uncertain && !pendingAccessDenied) || !classId} onClick={() => void loadCurrent(!savedNeedsRefresh.current, savedNeedsRefresh.current)}>Reload current records</Button></div>}
    {loading && <p role="status">Loading saved attendance and current roster…</p>}
    {staff && snapshot && <>
      <Card className="min-w-0"><CardHeader><CardTitle>Current saved records and intended changes</CardTitle><p className="text-sm text-muted-foreground">Date: {snapshot.date}. Unrecorded learners remain blank. Only explicit changes are submitted.</p></CardHeader><CardContent className="space-y-4">
        {snapshot.roster.truncated && <p role="alert">Showing {snapshot.roster.items.length} of {snapshot.roster.total} active learners. This roster exceeds the editor limit of {snapshot.roster.limit}; saving is unavailable.</p>}
        {!snapshot.canReview && !snapshot.roster.truncated && snapshot.roster.total > 0 && <p role="alert">The stored roster or attendance requires review. Saving is unavailable; no duplicate records are selected or removed.</p>}
        {snapshot.roster.total === 0 && <p>No active learners are available for this class.</p>}
        <form onSubmit={event => void save(event)} className="space-y-5">
          <fieldset disabled={blocked} className="min-w-0 space-y-4">
            {snapshot.roster.items.map(row => {
              const mark = marks[row.student.id] ?? initialMark(row.record), name = `${row.student.firstName} ${row.student.lastName}`;
              return <article key={row.student.id} data-attendance-student={row.student.id} className="min-w-0 rounded border p-3 space-y-3 break-words">
                <h2 className="font-semibold">{name}</h2><p className="text-sm">Admission number: {row.student.admissionNumber}</p>
                <div className="rounded bg-muted/30 p-2"><h3 className="font-medium">Loaded saved record</h3><RecordEvidence record={row.record} /></div>
                {row.needsReview && <p role="alert">This learner has stored records requiring review; changes are unavailable.</p>}
                <div className="grid min-w-0 gap-3 sm:grid-cols-2"><div className="min-w-0"><Label htmlFor={'status-' + row.student.id}>Attendance status for {name}</Label><select id={'status-' + row.student.id} value={mark.status} onChange={event => edit(row.student.id, { status: event.target.value })} className="mt-1 w-full min-w-0 rounded border bg-background p-2"><option value="" disabled={row.record !== null}>Choose a status</option>{!validStatus(mark.status) && mark.status !== '' && <option value={mark.status}>{mark.status} (stored status requires review)</option>}{statuses.map(status => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></div>
                <div className="min-w-0"><Label htmlFor={'note-' + row.student.id}>Attendance note for {name}</Label><textarea id={'note-' + row.student.id} value={mark.note} rows={3} aria-describedby={'note-guidance-' + row.student.id} onChange={event => edit(row.student.id, { note: event.target.value })} className="mt-1 w-full min-w-0 rounded border bg-background p-2" /><p id={'note-guidance-' + row.student.id} className="text-sm text-muted-foreground">New or replacement notes: up to 2,000 characters. An unchanged saved note is retained.</p></div></div>
                {changed(mark, row.record) && <p className="text-sm font-medium">Intended change</p>}
              </article>;
            })}
            <div><Label htmlFor="attendance-reason">Reason for attendance changes</Label><textarea id="attendance-reason" value={reason} rows={3} aria-describedby="attendance-reason-guidance" onChange={event => { setReason(event.target.value); setReviewed(false); setNotice(null); }} className="mt-1 w-full min-w-0 rounded border bg-background p-2" /><p id="attendance-reason-guidance" className="text-sm text-muted-foreground">Enter a single-line explanation of 10–500 characters. Current length: {reasonLength}.</p></div>
            <label className="flex items-start gap-2"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} className="mt-1" /><span>I reviewed the loaded records and these intended attendance changes.</span></label>
            <p>{dirty.length} learner{dirty.length === 1 ? '' : 's'} with intended changes.</p>
            {invalidDirty && <p role="alert">Choose a status for every changed learner and keep new notes within 2,000 characters.</p>}
            <Button type="submit" className="max-w-full whitespace-normal" disabled={blocked || !reviewed || !dirty.length || invalidDirty || !validReason}>{saving ? 'Saving reviewed attendance…' : 'Save reviewed attendance'}</Button>
          </fieldset>
        </form>
        {uncertain && !pendingAccessDenied && <form onSubmit={event => void save(event, true)}><Button type="submit" disabled={saving} className="max-w-full whitespace-normal">{saving ? 'Confirming pending save…' : 'Retry pending save'}</Button><p className="mt-2 text-sm">This retries the original reviewed request, including its original date and saved-record expectations.</p></form>}
        <p className="text-sm text-muted-foreground break-words">Loaded snapshot: {snapshot.asOf}</p>
      </CardContent></Card>
      {confirmed && <Card className="min-w-0" data-confirmed-attendance-review={confirmed.id}><CardHeader><CardTitle>Confirmed saved review</CardTitle><p className="text-sm text-muted-foreground">This is the immutable original save receipt. It does not assert that these marks remain current.</p></CardHeader><CardContent><ReviewEvidence review={confirmed} snapshot={snapshot} /></CardContent></Card>}
      <Card className="min-w-0"><CardHeader><CardTitle>Saved attendance review history</CardTitle><p className="text-sm text-muted-foreground">Immutable before-and-after evidence for {snapshot.date}. Current records are shown above.</p></CardHeader><CardContent className="space-y-3">
        {historyError && <p role="alert">Review history could not be loaded. Reload current records to try again.</p>}
        {!history && !historyError && <p role="status">Loading review history…</p>}
        {history?.total === 0 && <p>No saved attendance reviews for this date.</p>}
        {history?.truncated && <p role="status">Showing {history.items.length} of {history.total} saved reviews (limit {history.limit}). Earlier evidence is not loaded here.</p>}
        {history && !history.truncated && history.total > 0 && <p>{history.total} saved review{history.total === 1 ? '' : 's'}.</p>}
        {history?.items.map(review => <details key={review.id} data-attendance-review={review.id} className="min-w-0 rounded border p-3 break-words"><summary className="cursor-pointer font-medium">Review saved {review.createdAt}</summary><div className="mt-3"><ReviewEvidence review={review} snapshot={snapshot} /></div></details>)}
      </CardContent></Card>
    </>}
  </div></AppShell>;
}
