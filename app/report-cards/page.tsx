'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Principal, ReportCard, Student } from '@/lib/education/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const emptyDraft = { term: '', summary: '', overallGrade: '' };
type Draft = typeof emptyDraft;
type Pending = { actorKey: string; studentId: string; studentName: string; body: string; kind: 'create'; draft: Draft } | { actorKey: string; studentId: string; studentName: string; body: string; kind: 'publish'; id: string };
const scopeKey = (actor: Principal) => `${actor.id}:${actor.role}:${actor.schoolId ?? ''}`;
class ReadFailure extends Error { constructor(readonly status: number) { super('Report request unavailable'); } }
async function responseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) throw new ReadFailure(response.status);
  return JSON.parse(text) as T;
}
async function read<T>(path: string, signal?: AbortSignal) { return responseJson<T>(await fetch(path, { cache: 'no-store', signal })); }

export default function ReportCardsPage() {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draftForm, setDraftForm] = useState(emptyDraft);
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const [pendingView, setPendingView] = useState<Pending | null>(null);
  const [compared, setCompared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const generation = useRef(0), controller = useRef<AbortController | null>(null), mounted = useRef(true);
  const inFlight = useRef(false), currentScope = useRef<string | null>(null), selectedStudent = useRef('');
  const pending = useRef<Pending | null>(null), draft = useRef<{ actorKey: string; studentId: string; value: Draft } | null>(null);
  const message = useRef<HTMLDivElement>(null);
  const isAdmin = principal?.role === 'admin';
  const invalidate = useCallback(() => { generation.current++; controller.current?.abort(); }, []);
  const hidePrivate = useCallback(() => {
    currentScope.current = null;
    setPrincipal(null); setStudents([]); setReportCards([]); setReviewed({}); setDraftForm(emptyDraft); setReady(false); setCompared(false);
  }, []);
  const reload = useCallback(async (requestedStudent = selectedStudent.current) => {
    const ticket = ++generation.current;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const current = () => mounted.current && ticket === generation.current && !abort.signal.aborted;
    hidePrivate(); setLoading(true); setError(null);
    try {
      const actor = await read<Principal>('/api/session', abort.signal);
      if (!current()) return;
      const rows = await read<Student[]>('/api/students', abort.signal);
      if (!current()) return;
      if (!actor.id || !Array.isArray(rows)) throw new Error('Unconfirmed report choices');
      const id = rows.some(row => row.id === requestedStudent) ? requestedStudent : '';
      const reports = id ? await read<ReportCard[]>('/api/report-cards?' + new URLSearchParams({ studentId: id }), abort.signal) : [];
      if (!current()) return;
      const verified = await read<Principal>('/api/session', abort.signal);
      if (!current()) return;
      if (scopeKey(actor) !== scopeKey(verified) || !Array.isArray(reports) || reports.some(row => row.studentId !== id) || (actor.role === 'guardian' || actor.role === 'student') && reports.some(row => !row.publishedAt)) throw new Error('Account or student changed during reload');
      const key = scopeKey(actor);
      selectedStudent.current = id; currentScope.current = key;
      setSelectedStudentId(id); setPrincipal(actor); setStudents(rows.map(row => ({ id: row.id, name: `${row.firstName} ${row.lastName}` }))); setReportCards(reports); setReady(true);
      if (actor.role === 'admin' && draft.current?.actorKey === key && draft.current.studentId === id) setDraftForm(draft.current.value);
      else if (!pending.current) draft.current = null;
    } catch (failure) {
      if (!current()) return;
      hidePrivate();
      setError(failure instanceof ReadFailure && failure.status === 401 ? 'Sign in again, then reload current reports.' : failure instanceof ReadFailure && [403, 404].includes(failure.status) ? 'Current report access is unavailable. Reload after access is restored.' : 'Current students and reports could not be verified. Reload before continuing.');
    } finally { if (current()) setLoading(false); }
  }, [hidePrivate]);
  useEffect(() => {
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    return () => { mounted.current = false; invalidate(); };
  }, [reload, invalidate]);
  useEffect(() => { if (error || notice) message.current?.focus(); }, [error, notice]);

  function selectStudent(value: string) {
    if (inFlight.current || pending.current) return;
    selectedStudent.current = value; draft.current = null; setSelectedStudentId(value); setNotice(null);
    void reload(value);
  }
  function editDraft(field: keyof Draft, value: string) {
    if (!principal || !ready || inFlight.current || pending.current || selectedStudentId !== selectedStudent.current || currentScope.current !== scopeKey(principal)) return;
    const currentDraft = draft.current?.actorKey === scopeKey(principal) && draft.current.studentId === selectedStudent.current ? draft.current.value : emptyDraft;
    const next = { ...currentDraft, [field]: value };
    draft.current = { actorKey: scopeKey(principal), studentId: selectedStudent.current, value: next };
    setDraftForm(next); setNotice(null);
  }
  async function execute(request: Pending, retry = false) {
    const actor = principal;
    if (inFlight.current || !ready || loading || !actor || actor.role !== 'admin' || currentScope.current !== request.actorKey || scopeKey(actor) !== request.actorKey || selectedStudent.current !== request.studentId || (pending.current && (!retry || pending.current !== request))) return;
    inFlight.current = true; setSaving(true); setError(null); setNotice(null);
    pending.current = request; let sent = false;
    try {
      const verified = await read<Principal>('/api/session');
      if (scopeKey(verified) !== request.actorKey) throw new ReadFailure(403);
      if (!mounted.current) { if (!retry) pending.current = null; return; }
      sent = true;
      const response = await fetch(request.kind === 'create' ? '/api/report-cards' : '/api/report-cards/' + encodeURIComponent(request.id), { method: request.kind === 'create' ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: request.body });
      const card = await responseJson<ReportCard>(response);
      if (response.status !== (request.kind === 'create' ? 201 : 200) || !card || typeof card.id !== 'string' || !card.id || card.studentId !== request.studentId || typeof card.updatedAt !== 'string' || !Number.isFinite(Date.parse(card.updatedAt)) || (request.kind === 'publish' ? card.id !== request.id || typeof card.publishedAt !== 'string' || !Number.isFinite(Date.parse(card.publishedAt)) : card.publishedAt !== null || card.term !== request.draft.term || card.overallGrade !== request.draft.overallGrade || card.summary !== request.draft.summary)) throw new Error('Unconfirmed report response');
      pending.current = null;
      if (!mounted.current) return;
      setPendingView(null); setReviewed({}); setCompared(false);
      if (request.kind === 'create') { draft.current = null; setDraftForm(emptyDraft); }
      setNotice(request.kind === 'create' ? 'Draft saved. Reloading current reports before another action.' : retry ? 'Publication confirmed for the original report. Reloading current records; publication does not send duplicate notices.' : 'Report published. Eligible linked guardian accounts receive an in-app notice. Reloading current records.');
      await reload(request.studentId);
    } catch (failure) {
      if (!mounted.current) return;
      invalidate(); hidePrivate(); setLoading(false);
      if ((!sent && !retry) || (failure instanceof ReadFailure && [400, 409].includes(failure.status))) {
        pending.current = null; setPendingView(null);
        setError(!sent ? 'Current administrator access could not be verified. Reload before making a change.' : failure instanceof ReadFailure && failure.status === 409 ? 'Saved records or access changed. Reload and review current reports before another action.' : 'The report action was rejected. Reload and review the retained draft or saved report before trying again.');
      } else {
        setPendingView(request);
        setError(request.kind === 'create' ? 'The draft save could not be confirmed. Reload with the original administrator account and compare saved reports before creating another draft.' : 'Publication could not be confirmed. Reload with the original administrator account, then retry publication of the exact original report. No new report is published automatically.');
      }
    } finally { inFlight.current = false; if (mounted.current) setSaving(false); }
  }
  function createDraft(event: React.FormEvent) {
    event.preventDefault(); const actor = principal, student = students.find(row => row.id === selectedStudent.current);
    if (!actor || !student || pending.current || selectedStudentId !== selectedStudent.current || draft.current?.actorKey !== scopeKey(actor) || draft.current.studentId !== student.id || !draft.current.value.term || !draft.current.value.overallGrade) return;
    const values = { ...draft.current.value };
    draft.current = { actorKey: scopeKey(actor), studentId: student.id, value: values };
    void execute({ actorKey: scopeKey(actor), studentId: student.id, studentName: student.name, kind: 'create', draft: values, body: JSON.stringify({ studentId: student.id, ...values }) });
  }
  function publish(id: string) {
    const actor = principal, student = students.find(row => row.id === selectedStudent.current), card = reportCards.find(row => row.id === id && row.studentId === selectedStudent.current);
    if (!actor || !student || !card || card.publishedAt || !reviewed[id] || pending.current) return;
    void execute({ actorKey: scopeKey(actor), studentId: student.id, studentName: student.name, kind: 'publish', id, body: JSON.stringify({ publish: true }) });
  }
  const originalScope = !!pendingView && !!principal && principal.role === 'admin' && ready && !loading && scopeKey(principal) === pendingView.actorKey && selectedStudentId === pendingView.studentId;
  const blocked = loading || saving || !ready || !!pendingView;
  const selectedName = students.find(student => student.id === selectedStudentId)?.name;
  return <div className="container mx-auto space-y-6 p-4">
    <div><h1 className="text-2xl font-bold">Report Cards</h1><p className="text-muted-foreground">{isAdmin ? 'Create a draft, review the saved details and publish to linked families.' : 'View reports available for your linked or assigned students.'}</p></div>
    {(error || notice) && <div ref={message} tabIndex={-1} role={error ? 'alert' : 'status'} className="rounded border p-3 break-words">{error || notice}</div>}
    <Button type="button" variant="outline" disabled={saving} onClick={() => { setNotice(null); void reload(pending.current?.studentId ?? selectedStudent.current); }}>Reload current reports</Button>
    {loading && <p role="status">Loading current reports…</p>}
    {pendingView && <section aria-label="Unconfirmed report action" className="space-y-3 rounded border p-3">
      <p>The previous report action is unconfirmed. Keep this tab open; a hard reload discards its in-page reminder. This screen never retries an action automatically.</p>
      {originalScope ? pendingView.kind === 'publish' ? <><p className="break-words">Original publication: report {pendingView.id} for {pendingView.studentName}. Retrying this report confirms its existing publication and does not send duplicate notices.</p><Button type="button" variant="outline" disabled={saving} onClick={() => { if (pending.current?.kind === 'publish') void execute(pending.current, true); }}>Retry original report publication</Button></> : <><p className="break-words">Submitted draft for {pendingView.studentName}. Term: {pendingView.draft.term}. Grade: {pendingView.draft.overallGrade}.</p><p className="whitespace-pre-wrap break-words">Submitted summary: {pendingView.draft.summary || 'No summary supplied.'}</p><Label className="flex items-start gap-2" htmlFor="report-draft-compared"><input id="report-draft-compared" type="checkbox" checked={compared} onChange={event => setCompared(event.target.checked)} /><span>I compared the saved reports with the submitted draft before starting another draft.</span></Label><Button type="button" variant="outline" disabled={!compared || saving} onClick={() => { if (!compared || !originalScope || !pending.current || currentScope.current !== pending.current.actorKey) return; pending.current = null; draft.current = null; setPendingView(null); setDraftForm(emptyDraft); setCompared(false); setNotice('Saved reports compared. Enter and review any new draft separately.'); }}>Finish comparing saved reports</Button></> : <p>Reload with the original administrator account before viewing the submitted action. <a href="/login" target="_blank" rel="noreferrer" className="underline">Sign in in another tab</a> if needed.</p>}
    </section>}
    {ready && <><Card><CardHeader><CardTitle>Select Student</CardTitle></CardHeader><CardContent className="space-y-3"><Label htmlFor="report-student">Student</Label><select id="report-student" className="w-full min-w-0 rounded border bg-background p-2" value={selectedStudentId} disabled={saving || !!pendingView} onChange={event => selectStudent(event.target.value)}><option value="">Select a student</option>{students.map(student => <option key={student.id} value={student.id}>{student.name}</option>)}</select>{students.length === 0 && <p>No student records are available for your current account.</p>}</CardContent></Card>
    {selectedStudentId && <>{isAdmin && <Card><CardHeader><CardTitle>Create Draft Report Card</CardTitle></CardHeader><CardContent><p className="mb-4 break-words">Student: {selectedName}. Grades and summaries are entered by your school; they are not calculated here.</p><form onSubmit={createDraft} className="space-y-4"><fieldset disabled={blocked} className="min-w-0 space-y-4"><div><Label htmlFor="term">Term</Label><Input id="term" value={draftForm.term} onChange={event => editDraft('term', event.target.value)} required /></div><div><Label htmlFor="overallGrade">Overall Grade</Label><Input id="overallGrade" value={draftForm.overallGrade} onChange={event => editDraft('overallGrade', event.target.value)} required /></div><div><Label htmlFor="summary">Summary</Label><Textarea id="summary" value={draftForm.summary} onChange={event => editDraft('summary', event.target.value)} rows={4} /></div><Button type="submit" disabled={blocked}>{saving ? 'Saving…' : 'Create Draft'}</Button></fieldset></form></CardContent></Card>}
    <Card><CardHeader><CardTitle>Reports for {selectedName}</CardTitle></CardHeader><CardContent>{reportCards.length === 0 ? <p>No report cards available for this student.</p> : <div className="space-y-4">{reportCards.map(card => <Card key={card.id} data-report-card-id={card.id} className="min-w-0 p-4" aria-label={'Report ' + card.term}><div className="min-w-0 space-y-3 break-words"><h3 className="font-semibold">{card.term}</h3><p>Grade: {card.overallGrade}</p><p className="whitespace-pre-wrap">{card.summary || 'No summary supplied.'}</p><p>{card.publishedAt ? 'Published on: ' + new Date(card.publishedAt).toLocaleString() : 'Unpublished draft'}</p><a className="inline-block underline" href={'/report-cards/' + encodeURIComponent(card.id)}>Open report</a>{isAdmin && !card.publishedAt && <div className="space-y-3"><Label className="flex items-start gap-2" htmlFor={'review-' + card.id}><input id={'review-' + card.id} type="checkbox" className="mt-1" checked={reviewed[card.id] === true} disabled={blocked} onChange={event => setReviewed(previous => ({ ...previous, [card.id]: event.target.checked }))} /><span className="min-w-0">I reviewed this saved report for {selectedName} and intend to make it available to linked families.</span></Label><Button type="button" onClick={() => publish(card.id)} variant="outline" disabled={blocked || !reviewed[card.id]}>Publish</Button></div>}</div></Card>)}</div>}</CardContent></Card>
    </>}
    </>}
  </div>;
}
