'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- native navigation avoids the observed vinext transition failure. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isExactStoredTimestamp } from '@/lib/education/stored-timestamp';
import type { Principal } from '@/lib/education/types';
import type { AssessmentMetadataSnapshot, AssessmentResultEditorSnapshot, AssessmentResultReview, AssessmentResultReviewHistory, AssessmentResultReviewInput, AssessmentResultReviewResult, AssessmentResultSnapshot } from '@/lib/education/assessment-reviews';

type Mark = { score: string; scoreEdited: boolean; grade: string | null; feedback: string | null };
type Pending = { actorKey: string; reviewerId: string; assessmentId: string; classId: string; endpoint: string; body: string; input: AssessmentResultReviewInput };
type View = { actor: Principal; snapshot: AssessmentResultEditorSnapshot; history: AssessmentResultReviewHistory | null; historyError: string | null };
type Draft = { actorKey: string; assessmentId: string; classId: string; intended: Record<string, Partial<Mark>>; reason: string };
type Acknowledged = { actorKey: string; assessmentId: string; classId: string; review: AssessmentResultReview };
const actorKey = (actor: Principal) => JSON.stringify([actor.id, actor.role, actor.schoolId]);
const metadataFields = ['id', 'classId', 'title', 'kind', 'maxScore', 'date', 'createdAt', 'updatedAt', 'maxScoreType'] as const;
const recordFields = ['id', 'assessmentId', 'studentId', 'score', 'scoreType', 'grade', 'feedback', 'createdAt', 'updatedAt'] as const;
const storageTypes = ['integer', 'real', 'text', 'blob', 'null'];
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 120;
const raw = (value: unknown) => value === null || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const nullableText = (value: unknown) => value === null || typeof value === 'string';
function isPrincipal(value: unknown): value is Principal { return object(value) && identifier(value.id) && identifier(value.schoolId) && ['admin', 'teacher', 'guardian', 'student'].includes(String(value.role)); }
function isMetadata(value: unknown): value is AssessmentMetadataSnapshot {
  return object(value) && identifier(value.id) && identifier(value.classId) && ['title', 'kind', 'date', 'createdAt', 'updatedAt'].every(key => typeof value[key] === 'string') && raw(value.maxScore) && storageTypes.includes(String(value.maxScoreType));
}
function isRecord(value: unknown, assessmentId: string, studentId: string): value is AssessmentResultSnapshot {
  return object(value) && identifier(value.id) && value.assessmentId === assessmentId && value.studentId === studentId && raw(value.score) && storageTypes.includes(String(value.scoreType)) && nullableText(value.grade) && nullableText(value.feedback) && typeof value.createdAt === 'string' && typeof value.updatedAt === 'string';
}
function sameMetadata(left: AssessmentMetadataSnapshot, right: AssessmentMetadataSnapshot) { return metadataFields.every(key => left[key] === right[key]); }
function sameRecord(left: AssessmentResultSnapshot | null, right: AssessmentResultSnapshot | null) { return left === null || right === null ? left === right : recordFields.every(key => left[key] === right[key]); }
function isSnapshot(value: unknown, assessmentId: string): value is AssessmentResultEditorSnapshot {
  if (!object(value) || !isMetadata(value.assessment) || value.assessment.id !== assessmentId || !object(value.class) || value.class.id !== value.assessment.classId || typeof value.class.name !== 'string' || !isExactStoredTimestamp(value.asOf) || typeof value.invalidDate !== 'boolean' || typeof value.invalidMaximum !== 'boolean' || typeof value.canReview !== 'boolean' || !object(value.roster)) return false;
  const roster = value.roster;
  if (!Array.isArray(roster.items) || !count(roster.total) || roster.limit !== 100 || roster.truncated !== (roster.total > 100) || roster.items.length !== Math.min(roster.total, 100)) return false;
  const ids = new Set<string>();
  for (const item of roster.items) {
    if (!object(item) || !object(item.student)) return false;
    const student = item.student;
    if (!identifier(student.id) || ids.has(student.id) || !['firstName', 'lastName', 'admissionNumber'].every(key => typeof student[key] === 'string') || !count(item.resultRows) || !count(item.enrolmentRows) || item.enrolmentRows < 1 || typeof item.needsReview !== 'boolean' || typeof item.invalidResult !== 'boolean' || !Array.isArray(item.records) || item.records.length !== Math.min(item.resultRows, 10) || item.recordsTruncated !== (item.resultRows > 10)) return false;
    const studentId = student.id; ids.add(studentId);
    if (item.records.some(record => !isRecord(record, assessmentId, studentId))) return false;
    if (item.resultRows === 1 ? !isRecord(item.record, assessmentId, studentId) || !sameRecord(item.record, item.records[0] as AssessmentResultSnapshot) : item.record !== null) return false;
    if (value.canReview && (item.needsReview || item.enrolmentRows > 1 || item.resultRows > 1)) return false;
  }
  return !value.canReview || (!value.invalidMaximum && roster.total > 0 && roster.total <= 100 && value.assessment.maxScoreType === 'integer' && count(value.assessment.maxScore));
}
function isReview(value: unknown, assessmentId: string, classId: string): value is AssessmentResultReview {
  if (!object(value) || !identifier(value.id) || value.assessmentId !== assessmentId || value.classId !== classId || !isMetadata(value.assessment) || value.assessment.id !== assessmentId || value.assessment.classId !== classId || !identifier(value.reviewedBy) || typeof value.reason !== 'string' || !isExactStoredTimestamp(value.createdAt) || !Array.isArray(value.changes) || !value.changes.length || value.changes.length > 100) return false;
  const ids = new Set<string>();
  return value.changes.every(change => { if (!object(change) || !identifier(change.studentId) || ids.has(change.studentId) || (change.beforeRecord !== null && !isRecord(change.beforeRecord, assessmentId, change.studentId)) || !isRecord(change.afterRecord, assessmentId, change.studentId)) return false; ids.add(change.studentId); return true; });
}
function isHistory(value: unknown, assessmentId: string, classId: string): value is AssessmentResultReviewHistory {
  return object(value) && Array.isArray(value.items) && count(value.total) && value.limit === 100 && value.truncated === (value.total > 100) && value.items.length === Math.min(value.total, 100) && value.items.every(review => isReview(review, assessmentId, classId)) && new Set(value.items.map(review => (review as AssessmentResultReview).id)).size === value.items.length;
}
function matchesReceipt(value: unknown, status: number, request: Pending): value is AssessmentResultReviewResult {
  if (!object(value) || (status !== 201 && status !== 200) || value.replayed !== (status === 200) || !isReview(value.review, request.assessmentId, request.classId)) return false;
  const review = value.review;
  if (review.id !== request.input.clientRequestId || review.reviewedBy !== request.reviewerId || review.reason !== request.input.reason || !sameMetadata(review.assessment, request.input.expectedAssessment) || review.changes.length !== request.input.entries.length) return false;
  const changes = new Map(review.changes.map(change => [change.studentId, change]));
  return request.input.entries.every(entry => {
    const change = changes.get(entry.studentId), after = change?.afterRecord;
    return Boolean(change && after && sameRecord(change.beforeRecord, entry.expectedRecord) && after.score === entry.score && after.scoreType === 'integer' && after.grade === entry.grade && after.feedback === entry.feedback && after.updatedAt === review.createdAt && after.createdAt === (entry.expectedRecord?.createdAt ?? review.createdAt) && (entry.expectedRecord === null || after.id === entry.expectedRecord.id));
  });
}
class ReadFailure extends Error { constructor(readonly status: number) { super('Current assessment access could not be verified'); } }
class EvidenceFailure extends Error {}
async function consume(response: Response): Promise<unknown> { const body = await response.text(); if (!response.ok) throw new ReadFailure(response.status); return JSON.parse(body) as unknown; }
async function readCurrent(id: string, signal: AbortSignal, current: () => boolean): Promise<View> {
  const get = async (path: string) => { const response = await fetch(path, { cache: 'no-store', signal }); const value = await consume(response); if (!current()) throw new Error('Obsolete assessment read'); if (response.status !== 200) throw new EvidenceFailure('Current assessment evidence could not be verified. Reload current results.'); return value; };
  const before = await get('/api/session');
  if (!isPrincipal(before)) throw new EvidenceFailure('Your current account and school could not be verified. Reload current results.');
  if (before.role !== 'admin' && before.role !== 'teacher') throw new EvidenceFailure('Assessment result review is available to authorised school staff. Assessment results are private staff records.');
  const path = '/api/assessments/' + encodeURIComponent(id) + '/result-editor';
  const snapshot = await get(path);
  if (!isSnapshot(snapshot, id)) throw new EvidenceFailure('The current assessment, class, roster or saved results could not be verified. Reload current results.');
  let history: AssessmentResultReviewHistory | null = null, historyError: string | null = null;
  try { const value = await get(path + '/history'); if (!isHistory(value, id, snapshot.class.id)) throw new EvidenceFailure('Review history unavailable'); history = value; }
  catch (failure) { if (!current()) throw failure; if (failure instanceof ReadFailure && [401, 403, 404].includes(failure.status)) throw failure; historyError = 'Review history could not be loaded. Reload current results to try again.'; }
  const after = await get('/api/session');
  if (!isPrincipal(after) || actorKey(after) !== actorKey(before)) throw new EvidenceFailure('Your account changed while assessment records were loading. Reload current results.');
  return { actor: after, snapshot, history, historyError };
}
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
  const [view, setView] = useState<{ params: Promise<{ id: string }>; data: View } | null>(null);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [reason, setReason] = useState(''), [reviewed, setReviewed] = useState(false);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [pendingView, setPendingView] = useState<Pending | null>(null);
  const [pendingOutcome, setPendingOutcome] = useState<'not-sent' | 'uncertain' | 'rejected'>('not-sent');
  const [acknowledged, setAcknowledged] = useState<Acknowledged | null>(null);
  const generation = useRef(0), controller = useRef<AbortController | null>(null), mounted = useRef(true), inFlight = useRef(false);
  const latestParams = useRef(params), startedRequests = useRef(new Set<string>());
  const route = useRef<{ params: Promise<{ id: string }>; id: string } | null>(null);
  const currentView = useRef<View | null>(null), marksRef = useRef<Record<string, Mark>>({}), reasonRef = useRef(''), reviewedRef = useRef(false);
  const draft = useRef<Draft | null>(null), pending = useRef<Pending | null>(null), message = useRef<HTMLDivElement>(null);
  const invalidate = useCallback(() => { generation.current++; controller.current?.abort(); }, []);
  const hide = useCallback(() => { invalidate(); currentView.current = null; marksRef.current = {}; reasonRef.current = ''; reviewedRef.current = false; setView(null); setMarks({}); setReason(''); setReviewed(false); setLoading(false); }, [invalidate]);
  const reload = useCallback(async (): Promise<View | null> => {
    const context = route.current;
    if (!mounted.current || !context || context.params !== latestParams.current) return null;
    invalidate(); const ticket = generation.current, abort = new AbortController(); controller.current = abort;
    const current = () => mounted.current && ticket === generation.current && !abort.signal.aborted && route.current === context && latestParams.current === context.params;
    currentView.current = null; marksRef.current = {}; reasonRef.current = ''; reviewedRef.current = false; setView(null); setMarks({}); setReason(''); setReviewed(false); setLoading(true); setError(null);
    try {
      const fresh = await readCurrent(context.id, abort.signal, current); if (!current()) return null;
      const key = actorKey(fresh.actor), previous = draft.current;
      const retained = !pending.current && previous?.actorKey === key && previous.assessmentId === context.id && previous.classId === fresh.snapshot.class.id ? previous : null;
      const next = Object.fromEntries(fresh.snapshot.roster.items.map(row => [row.student.id, { ...initialMark(row.record), ...(retained?.intended[row.student.id] ?? {}) }]));
      const nextReason = retained?.reason ?? '';
      currentView.current = fresh; marksRef.current = next; reasonRef.current = nextReason;
      setView({ params: context.params, data: fresh }); setMarks(next); setReason(nextReason); return fresh;
    } catch (failure) {
      if (!current()) return null;
      setError(failure instanceof EvidenceFailure ? failure.message : failure instanceof ReadFailure && failure.status === 401 ? 'Please sign in again in another tab, then reload current results.' : failure instanceof ReadFailure && [403, 404].includes(failure.status) ? 'This assessment or review history is unavailable in your current school or teaching scope. Reload after access is restored.' : 'Saved results could not be verified. Reload current results and try again.'); return null;
    } finally { if (current()) setLoading(false); }
  }, [invalidate]);
  useLayoutEffect(() => { latestParams.current = params; invalidate(); currentView.current = null; }, [invalidate, params]);
  useEffect(() => {
    mounted.current = true; let active = true;
    void (async () => { await Promise.resolve(); if (!active) return; route.current = null; hide(); setLoading(true); setError(null); setNotice(null); try { const value = await params; if (!active || latestParams.current !== params) return; if (!identifier(value.id)) throw new Error('Invalid assessment route'); route.current = { params, id: value.id }; await reload(); } catch { if (active && latestParams.current === params) { setLoading(false); setError('This assessment route could not be verified. Open an assessment from the assessment list.'); } } })();
    return () => { active = false; mounted.current = false; invalidate(); };
  }, [hide, invalidate, params, reload]);
  useEffect(() => { if (error || notice) message.current?.focus(); }, [error, notice]);
  const authorized = view?.params === params && !loading ? view.data : null;
  const principal = authorized?.actor ?? null, snapshot = authorized?.snapshot ?? null;
  const history = authorized?.history ?? null, historyError = authorized?.historyError ?? null;
  const staff = principal?.role === 'admin' || principal?.role === 'teacher';
  const originalScope = Boolean(authorized && pendingView && actorKey(authorized.actor) === pendingView.actorKey && authorized.snapshot.assessment.id === pendingView.assessmentId && authorized.snapshot.class.id === pendingView.classId);
  const confirmed = authorized && acknowledged && actorKey(authorized.actor) === acknowledged.actorKey && authorized.snapshot.assessment.id === acknowledged.assessmentId && authorized.snapshot.class.id === acknowledged.classId ? acknowledged.review : null;
  function canEdit() { return mounted.current && !inFlight.current && !pending.current && authorized && currentView.current === authorized && route.current?.params === latestParams.current && authorized.snapshot.canReview; }
  function remember() {
    if (!authorized) return;
    draft.current = { actorKey: actorKey(authorized.actor), assessmentId: authorized.snapshot.assessment.id, classId: authorized.snapshot.class.id, reason: reasonRef.current, intended: Object.fromEntries(authorized.snapshot.roster.items.filter(row => marksRef.current[row.student.id] && changed(marksRef.current[row.student.id], row.record)).map(row => [row.student.id, intendedFields(marksRef.current[row.student.id], row.record)])) };
  }
  function edit(studentId: string, value: Partial<Mark>) {
    if (!canEdit() || !authorized?.snapshot.roster.items.some(row => row.student.id === studentId)) return;
    const next = { ...marksRef.current, [studentId]: { ...marksRef.current[studentId], ...value } }; marksRef.current = next; setMarks(next); reviewedRef.current = false; setReviewed(false); setNotice(null); remember();
  }
  function editReason(value: string) { if (!canEdit()) return; reasonRef.current = value; setReason(value); reviewedRef.current = false; setReviewed(false); setNotice(null); remember(); }
  function confirmReview(value: boolean) { if (!canEdit()) return; reviewedRef.current = value; setReviewed(value); }
  const dirty = snapshot?.roster.items.filter(row => marks[row.student.id] && changed(marks[row.student.id], row.record)) ?? [];
  const maximum = snapshot && !snapshot.invalidMaximum && typeof snapshot.assessment.maxScore === 'number' ? snapshot.assessment.maxScore : null;
  const invalidDirty = dirty.some(row => { const mark = marks[row.student.id], score = scoreValue(mark.score); return score === null || maximum === null || score > maximum || (row.invalidResult && !mark.scoreEdited) || (mark.grade !== (row.record?.grade ?? null) && mark.grade !== null && Array.from(mark.grade).length > 2000) || (mark.feedback !== (row.record?.feedback ?? null) && mark.feedback !== null && Array.from(mark.feedback).length > 2000); });
  const reasonLength = Array.from(reason.trim()).length, validReason = reasonLength >= 10 && reasonLength <= 500 && !/[\x00-\x1f\x7f]/.test(reason.trim());
  const blocked = loading || saving || Boolean(pendingView) || !snapshot?.canReview;
  async function save(event: React.FormEvent, retry = false) {
    event.preventDefault(); if (!mounted.current || inFlight.current || !authorized || currentView.current !== authorized || route.current?.params !== latestParams.current) return;
    let request = pending.current;
    if (retry) { if (!request || actorKey(authorized.actor) !== request.actorKey || authorized.snapshot.assessment.id !== request.assessmentId || authorized.snapshot.class.id !== request.classId) return; }
    else {
      if (!canEdit() || request || !reviewedRef.current) return;
      const currentReason = reasonRef.current.trim(), currentLength = Array.from(currentReason).length;
      const rows = authorized.snapshot.roster.items.filter(row => marksRef.current[row.student.id] && changed(marksRef.current[row.student.id], row.record));
      const currentMaximum = authorized.snapshot.assessment.maxScore;
      if (!rows.length || currentLength < 10 || currentLength > 500 || /[\x00-\x1f\x7f]/.test(currentReason) || typeof currentMaximum !== 'number' || rows.some(row => {
        const mark = marksRef.current[row.student.id], score = scoreValue(mark.score);
        return score === null || score > currentMaximum || (row.invalidResult && !mark.scoreEdited) || (mark.grade !== (row.record?.grade ?? null) && mark.grade !== null && Array.from(mark.grade).length > 2000) || (mark.feedback !== (row.record?.feedback ?? null) && mark.feedback !== null && Array.from(mark.feedback).length > 2000);
      })) return;
      const entries = rows.map(row => { const mark = marksRef.current[row.student.id]; return { studentId: row.student.id, score: scoreValue(mark.score)!, grade: mark.grade, feedback: mark.feedback, expectedRecord: row.record }; });
      const input: AssessmentResultReviewInput = structuredClone({ expectedAssessment: authorized.snapshot.assessment, clientRequestId: crypto.randomUUID(), reviewConfirmed: true as const, reason: currentReason, entries });
      request = { actorKey: actorKey(authorized.actor), reviewerId: authorized.actor.id, assessmentId: input.expectedAssessment.id, classId: input.expectedAssessment.classId, endpoint: '/api/assessments/' + encodeURIComponent(input.expectedAssessment.id) + '/result-editor', body: JSON.stringify(input), input };
      pending.current = request; setPendingView(request); setPendingOutcome('not-sent'); setAcknowledged(null);
    }
    if (!request) return;
    const original = request, context = route.current;
    inFlight.current = true; setSaving(true); setError(null); setNotice(null); hide();
    const ticket = generation.current, abort = new AbortController(); controller.current = abort;
    const current = () => mounted.current && generation.current === ticket && !abort.signal.aborted && route.current === context && latestParams.current === context?.params;
    let sentThisAttempt = false;
    try {
      const fresh = await readCurrent(original.assessmentId, abort.signal, current);
      if (!current()) return;
      if (actorKey(fresh.actor) !== original.actorKey || fresh.snapshot.assessment.id !== original.assessmentId || fresh.snapshot.class.id !== original.classId) throw new EvidenceFailure('Return as the original reviewer in the original assessment and class, then reload before retrying.');
      startedRequests.current.add(original.input.clientRequestId); sentThisAttempt = true; setPendingOutcome('uncertain');
      // A started review can persist after navigation; it is not cancelled or rebased.
      const response = await fetch(original.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: original.body });
      const result = await consume(response);
      if (!matchesReceipt(result, response.status, original)) throw new Error('Uncorrelated original review');
      if (!current()) return;
      pending.current = null; setPendingView(null); draft.current = null;
      setAcknowledged({ actorKey: original.actorKey, assessmentId: original.assessmentId, classId: original.classId, review: result.review });
      setNotice(result.replayed ? 'Original result review confirmed. The receipt records the original save; current results may have changed.' : 'Result review saved. The original reviewed update was acknowledged.');
      await reload();
    } catch (failure) {
      if (!current()) return;
      if (sentThisAttempt && failure instanceof ReadFailure && [400, 409].includes(failure.status)) { setPendingOutcome('rejected'); setError(failure.status === 409 ? 'The reviewed update was rejected because saved results, assessment details or access changed. No save acknowledgement was received. The original request is retained; reload, compare and explicitly discard it before reviewing current results.' : 'The reviewed update was rejected. No save acknowledgement was received. Reload and check the original request before retrying or explicitly discarding it.'); }
      else setError(failure instanceof EvidenceFailure ? failure.message : startedRequests.current.has(original.input.clientRequestId) ? 'The save outcome is not confirmed. The exact original reviewed request is retained. Reload as the original reviewer before explicitly retrying it.' : 'Current access could not be verified. This reviewed request has not been sent and remains retained. Reload as the original reviewer.');
      hide();
    } finally { inFlight.current = false; if (mounted.current) setSaving(false); }
  }
  async function discard() {
    const original = pending.current, captured = authorized;
    if (!mounted.current || inFlight.current || !original || !captured || currentView.current !== captured || actorKey(captured.actor) !== original.actorKey || captured.snapshot.assessment.id !== original.assessmentId || captured.snapshot.class.id !== original.classId || route.current?.params !== latestParams.current) return;
    inFlight.current = true; setSaving(true); setNotice(null);
    try {
      const fresh = await reload(); if (!mounted.current || pending.current !== original || !fresh) return;
      if (actorKey(fresh.actor) !== original.actorKey || fresh.snapshot.assessment.id !== original.assessmentId || fresh.snapshot.class.id !== original.classId) { hide(); setError('Return as the original reviewer in the original assessment and class before discarding the pending request.'); return; }
      pending.current = null; setPendingView(null); draft.current = null; reasonRef.current = ''; reviewedRef.current = false; setReason(''); setReviewed(false);
      setNotice('Pending request discarded from this page. This does not cancel or confirm a started save. Review the current saved results and make a separate explicit review before another save.');
    } finally { inFlight.current = false; if (mounted.current) setSaving(false); }
  }
  return <AppShell principal={principal}><div className="mx-auto max-w-6xl space-y-6 p-4 min-w-0">
    <div className="space-y-2 break-words"><a href="/assessments" className="underline">Assessments</a><h1>Review assessment results</h1><p>Review explicit changes to saved results for the current active roster. Grades are supplied by the school and are not calculated here.</p></div>
    {(error || notice) && <div ref={message} tabIndex={-1} className="space-y-2 rounded border p-3 break-words">{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}</div>}
    {error && <a href="/login" target="_blank" rel="noopener noreferrer" className="inline-block underline">Sign in again in another tab</a>}
    <Button type="button" variant="outline" className="whitespace-normal" disabled={saving} onClick={() => { if (!inFlight.current) void reload(); }}>Reload current results</Button>
    {loading && <p role="status">Loading saved results and current roster…</p>}
    {pendingView && <section aria-label="Pending reviewed request" className="space-y-3 rounded border p-3 break-words"><p>{pendingOutcome === 'rejected' ? 'The last review response rejected this request; no save was acknowledged.' : pendingOutcome === 'not-sent' ? 'This original reviewed request has not been sent.' : 'The original save outcome is unconfirmed.'} The original request is retained only in this page. Navigation or a hard reload loses this recovery context. A started save may persist after you leave.</p>
      {originalScope ? <><p className="whitespace-pre-wrap">Original reason: {pendingView.input.reason}</p><p>Original assessment: {pendingView.input.expectedAssessment.title}. Stored date: {pendingView.input.expectedAssessment.date}. Stored maximum: {String(pendingView.input.expectedAssessment.maxScore)} ({pendingView.input.expectedAssessment.maxScoreType}).</p>{pendingView.input.entries.map(entry => <div key={entry.studentId} className="space-y-2 rounded border p-2"><p>Original changed learner: {entry.studentId}</p><RecordEvidence record={entry.expectedRecord} /><p>Original intended score: {entry.score}</p><p className="whitespace-pre-wrap">Original intended grade: {entry.grade === null ? 'No grade' : entry.grade === '' ? 'Empty grade' : entry.grade}</p><p className="whitespace-pre-wrap">Original intended feedback: {entry.feedback === null ? 'No feedback' : entry.feedback === '' ? 'Empty feedback' : entry.feedback}</p></div>)}<form data-assessment-review-form="retry" onSubmit={event => void save(event, true)}><Button type="submit" disabled={saving} className="max-w-full whitespace-normal">Retry pending save</Button><p className="mt-2 text-sm">This sends the exact original reviewed request, including its original saved-result and assessment expectations. It does not replace them with current records.</p></form><p>Discarding removes this page’s pending request. It does not cancel or confirm a started save and does not erase saved history.</p><Button type="button" disabled={saving} className="max-w-full whitespace-normal" onClick={() => void discard()}>Discard pending request and review current results</Button></> : <p>Return as the original reviewer in the original assessment and class, then reload to view or recover the pending request.</p>}
    </section>}
    {staff && snapshot && <>
      <Card className="min-w-0"><CardHeader><CardTitle>{snapshot.assessment.title}</CardTitle></CardHeader><CardContent className="space-y-2 break-words"><p>Class: {snapshot.class.name}</p><p>Kind: {snapshot.assessment.kind}</p><p>Stored assessment date: {snapshot.assessment.date}</p><p>Stored maximum score: {String(snapshot.assessment.maxScore)} ({snapshot.assessment.maxScoreType})</p>{snapshot.invalidDate && <p role="alert">The stored assessment date requires review. It is displayed unchanged; no calendar date is inferred.</p>}{snapshot.invalidMaximum && <p role="alert">The stored maximum score requires review. Saving is unavailable.</p>}</CardContent></Card>
      <Card className="min-w-0"><CardHeader><CardTitle>Current saved results and intended changes</CardTitle><p className="text-sm text-muted-foreground">Unrecorded scores remain blank. Zero is a valid score. Only explicit changes are submitted.</p></CardHeader><CardContent className="space-y-4">
        {snapshot.roster.truncated && <p role="alert">Showing {snapshot.roster.items.length} of {snapshot.roster.total} active learners. This roster exceeds the editor limit of {snapshot.roster.limit}; saving is unavailable.</p>}
        {!snapshot.canReview && !snapshot.roster.truncated && !snapshot.invalidMaximum && snapshot.roster.total > 0 && <p role="alert">{snapshot.roster.items.some(row => row.resultRows > 1) ? 'Multiple saved results exist for a learner.' : snapshot.roster.items.some(row => row.enrolmentRows > 1) ? 'Multiple enrolment records require review.' : 'Stored result evidence requires review.'} Saving is unavailable; no duplicate records are selected or removed.</p>}
        {snapshot.roster.total === 0 && <p>No active learners are available for this assessment.</p>}
        <form data-assessment-review-form="new" onSubmit={event => void save(event)} className="space-y-5"><fieldset disabled={blocked} className="min-w-0 space-y-4">
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
          <div><Label htmlFor="result-reason">Reason for result changes</Label><textarea id="result-reason" value={reason} rows={3} aria-describedby="result-reason-guidance" onChange={event => editReason(event.target.value)} className="mt-1 w-full min-w-0 rounded border bg-background p-2" /><p id="result-reason-guidance" className="text-sm text-muted-foreground">Enter a single-line explanation of 10–500 characters. Current length: {reasonLength}.</p></div>
          <label className="flex items-start gap-2"><input type="checkbox" checked={reviewed} onChange={event => confirmReview(event.target.checked)} className="mt-1" /><span>I reviewed the loaded assessment, saved results and these intended changes.</span></label><p>{dirty.length} learner{dirty.length === 1 ? '' : 's'} with intended changes.</p>
          {invalidDirty && <p role="alert">Enter a whole-number score from 0 to {maximum ?? 'the reviewed maximum'} for every changed learner. Explicitly repair invalid saved scores and keep new grades/feedback within 2,000 characters each.</p>}
          <Button type="submit" className="max-w-full whitespace-normal" disabled={blocked || !reviewed || !dirty.length || invalidDirty || !validReason}>{saving ? 'Saving reviewed results…' : 'Save reviewed results'}</Button>
        </fieldset></form>
        <p className="text-sm text-muted-foreground break-words">Loaded snapshot: {snapshot.asOf}</p>
      </CardContent></Card>
      {confirmed && <Card className="min-w-0" data-confirmed-result-review={confirmed.id}><CardHeader><CardTitle>Confirmed saved review</CardTitle><p className="text-sm text-muted-foreground">This is the immutable original save receipt. It does not assert that these results remain current.</p></CardHeader><CardContent><ReviewEvidence review={confirmed} snapshot={snapshot} /></CardContent></Card>}
      <Card className="min-w-0"><CardHeader><CardTitle>Saved result review history</CardTitle><p className="text-sm text-muted-foreground">Immutable before-and-after evidence. Current records are shown above.</p></CardHeader><CardContent className="space-y-3">{historyError && <p role="alert">Review history could not be loaded. Reload current results to try again.</p>}{!history && !historyError && <p role="status">Loading review history…</p>}{history?.total === 0 && <p>No saved result reviews for this assessment.</p>}{history?.truncated && <p role="status">Showing {history.items.length} of {history.total} saved reviews (limit {history.limit}). Earlier evidence is not loaded here.</p>}{history && !history.truncated && history.total > 0 && <p>{history.total} saved review{history.total === 1 ? '' : 's'}.</p>}{history?.items.map(review => <details key={review.id} data-result-review={review.id} className="min-w-0 rounded border p-3 break-words"><summary className="cursor-pointer font-medium">Review saved {review.createdAt}</summary><div className="mt-3"><ReviewEvidence review={review} snapshot={snapshot} /></div></details>)}</CardContent></Card>
    </>}
  </div></AppShell>;
}
