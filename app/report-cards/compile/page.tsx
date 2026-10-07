'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- native navigation avoids the observed client transition failure. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { failureMessage, formatDay, formatStamp, jsonInit, kindLabel, lifecycleRequest, LifecycleRequestError } from '@/lib/education/lifecycle-client';
import { useSession } from '@/lib/education/use-session';
import type { EligibleResult } from '@/lib/education/report-compile';
import type { ReportCard, Student } from '@/lib/education/types';

const selectClass = 'w-full min-w-0 rounded border bg-background px-3 py-2';
const emptyForm = { term: '', overallGrade: '', summary: '', correctionId: '', correctionReason: '' };
type Field = keyof typeof emptyForm;
const reasonLength = (value: string) => [...value.trim()].length;

export default function CompileReportPage() {
  const session = useSession();
  const admin = session.principal?.role === 'admin';
  const [students, setStudents] = useState<Student[]>([]);
  const [studentState, setStudentState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [studentId, setStudentId] = useState('');
  const [eligible, setEligible] = useState<EligibleResult[]>([]);
  const [published, setPublished] = useState<ReportCard[]>([]);
  const [learnerState, setLearnerState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState(emptyForm);
  const [problems, setProblems] = useState<Partial<Record<Field, string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [created, setCreated] = useState<{ id: string; term: string; lines: number } | null>(null);
  const generation = useRef(0), inFlight = useRef(false);
  const message = useRef<HTMLDivElement>(null);

  const loadStudents = useCallback(async () => {
    setStudentState('loading');
    try {
      const { body } = await lifecycleRequest<Student[]>('/api/students');
      if (!Array.isArray(body)) throw new Error('shape');
      setStudents(body); setStudentState('ready');
    } catch { setStudentState('error'); }
  }, []);
  useEffect(() => {
    if (!admin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStudents();
  }, [admin, loadStudents]);
  useEffect(() => { if (error || created) message.current?.focus(); }, [error, created]);
  useEffect(() => () => { generation.current++; }, []);

  const loadLearner = useCallback(async (id: string) => {
    const ticket = ++generation.current;
    setEligible([]); setPublished([]); setChosen({}); setLearnerState(id ? 'loading' : 'idle');
    if (!id) return;
    try {
      const results = await lifecycleRequest<EligibleResult[]>('/api/report-cards/eligible?studentId=' + encodeURIComponent(id));
      const reports = await lifecycleRequest<ReportCard[]>('/api/report-cards?studentId=' + encodeURIComponent(id));
      if (ticket !== generation.current) return;
      if (!Array.isArray(results.body) || !Array.isArray(reports.body)) throw new Error('shape');
      setEligible(results.body); setPublished(reports.body.filter(row => row.publishedAt)); setLearnerState('ready');
    } catch { if (ticket === generation.current) setLearnerState('error'); }
  }, []);

  const pick = (id: string) => { setStudentId(id); setCreated(null); setError(null); setUnconfirmed(false); setForm(emptyForm); setProblems({}); void loadLearner(id); };
  const edit = (field: Field, value: string) => { setForm(previous => ({ ...previous, [field]: value })); setProblems(previous => ({ ...previous, [field]: undefined })); };
  const selected = eligible.filter(row => chosen[row.assessmentId]);
  const studentName = (() => { const row = students.find(item => item.id === studentId); return row ? row.firstName + ' ' + row.lastName : ''; })();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || saving || learnerState !== 'ready') return;
    const found: Partial<Record<Field, string>> = {};
    if (!form.term.trim()) found.term = 'Enter the term or period this report covers.';
    if (!form.overallGrade.trim()) found.overallGrade = 'Enter the overall grade. Your school decides it; it is not calculated here.';
    if (form.summary.length > 4000) found.summary = 'Use at most 4000 characters.';
    if (form.correctionId && (reasonLength(form.correctionReason) < 10 || reasonLength(form.correctionReason) > 500)) found.correctionReason = 'Give a reason of 10 to 500 characters for replacing the published report.';
    setProblems(found);
    if (Object.keys(found).length) { setError('Some details need attention. Fix the marked fields and save again.'); return; }
    inFlight.current = true; setSaving(true); setError(null); setUnconfirmed(false); setCreated(null);
    const payload = { studentId, term: form.term.trim(), overallGrade: form.overallGrade.trim(), ...(form.summary.trim() ? { summary: form.summary } : {}),
      ...(selected.length ? { assessmentIds: selected.map(row => row.assessmentId) } : {}),
      ...(form.correctionId ? { correction: { reportId: form.correctionId, reason: form.correctionReason.trim() } } : {}) };
    try {
      const { body } = await lifecycleRequest<ReportCard>('/api/report-cards', jsonInit('POST', payload));
      if (!body || typeof body.id !== 'string' || !body.id || body.studentId !== studentId || body.publishedAt) throw new LifecycleRequestError(201, null, true);
      setCreated({ id: body.id, term: body.term, lines: selected.length });
      setForm(emptyForm); setChosen({});
      void loadLearner(studentId);
    } catch (cause) {
      const lost = cause instanceof LifecycleRequestError && cause.unconfirmed;
      setUnconfirmed(lost);
      setError(lost ? 'Saving could not be confirmed, so the draft report may or may not exist. Open the report list for this student and check before creating it again; nothing is repeated automatically.' : failureMessage(cause, 'saving the draft report'));
      if (cause instanceof LifecycleRequestError && cause.code) void loadLearner(studentId);
    } finally { inFlight.current = false; setSaving(false); }
  }

  const invalid = (field: Field) => problems[field] ? { 'aria-invalid': true, 'aria-describedby': 'problem-' + field } : {};
  const note = (field: Field) => problems[field] && <p id={'problem-' + field} className="mt-1 text-sm text-red-700 dark:text-red-400">{problems[field]}</p>;
  return <div className="mx-auto max-w-3xl min-w-0 space-y-6 p-4">
    <h1 className="text-2xl font-bold">Compile a report card</h1>
    <p>Choose a student, pick from their published assessment results, then add the grade and summary your school has decided. The draft stays private until you review and publish it.</p>
    <div className="flex flex-wrap items-center gap-4"><a href="/report-cards" className="underline">Back to report cards</a><a href="/assessments/manage" className="underline">Manage assessments</a></div>
    {session.status === 'loading' && <p role="status">Checking your account…</p>}
    {session.status === 'denied' && <p role="alert">Sign in with an administrator account to compile report cards.</p>}
    {session.status === 'error' && <div className="space-y-2"><p role="alert">Your account could not be confirmed. Try again.</p><Button type="button" variant="outline" onClick={session.reload}>Try again</Button></div>}
    {session.status === 'ready' && !admin && <p role="alert">Compiling report cards is available to school administrators. Families can read published report cards.</p>}
    {admin && <>
      {(error || created) && <div ref={message} tabIndex={-1} role={error ? 'alert' : 'status'} className="space-y-2 break-words rounded border p-3">
        {error && <p>{error}</p>}
        {unconfirmed && <a className="underline" href="/report-cards">Open the report list</a>}
        {created && <><p>Draft saved for {studentName || 'the student'}: {created.term}, with {created.lines} published result{created.lines === 1 ? '' : 's'} attached. It is private until you publish it.</p>
          <a className="underline" href={'/report-cards/' + encodeURIComponent(created.id)}>Review and publish this draft</a></>}
      </div>}
      {studentState === 'loading' && <p role="status">Loading students…</p>}
      {studentState === 'error' && <div className="space-y-2"><p role="alert">The student list could not be loaded.</p><Button type="button" variant="outline" onClick={() => void loadStudents()}>Try again</Button></div>}
      {studentState === 'ready' && <Card><CardHeader><CardTitle>Student</CardTitle></CardHeader><CardContent className="space-y-3">
        <Label htmlFor="compile-student">Student</Label>
        <select id="compile-student" className={selectClass} value={studentId} disabled={saving} onChange={event => pick(event.target.value)}><option value="">Choose a student</option>{students.map(row => <option key={row.id} value={row.id}>{row.firstName} {row.lastName}</option>)}</select>
        {students.length === 0 && <p>No student records are available to your account.</p>}
      </CardContent></Card>}
      {studentId && learnerState === 'loading' && <p role="status">Loading published results for {studentName}…</p>}
      {studentId && learnerState === 'error' && <div className="space-y-2"><p role="alert">Published results could not be loaded for this student.</p><Button type="button" variant="outline" onClick={() => void loadLearner(studentId)}>Try again</Button></div>}
      {studentId && learnerState === 'ready' && <form noValidate onSubmit={submit} className="space-y-6">
        <fieldset disabled={saving} className="min-w-0 space-y-6">
          <Card><CardHeader><CardTitle>Published results for {studentName}</CardTitle><CardDescription>Only results from published assessments appear here. Unpublished and unreviewed scores are never included.</CardDescription></CardHeader>
            <CardContent className="min-w-0">
              {eligible.length === 0 ? <p data-eligible-empty>No published results are available for this student yet. Publish an assessment from Manage assessments first, or save a report without results.</p>
                : <ul className="space-y-2">{eligible.map(row => <li key={row.assessmentId} data-eligible-result={row.assessmentId} className="min-w-0 rounded border p-3">
                  <Label className="flex items-start gap-2" htmlFor={'pick-' + row.assessmentId}><input id={'pick-' + row.assessmentId} type="checkbox" className="mt-1" checked={chosen[row.assessmentId] === true} onChange={event => setChosen(previous => ({ ...previous, [row.assessmentId]: event.target.checked }))} />
                    <span className="min-w-0 break-words"><span className="font-medium">{row.title}</span> ({kindLabel(row.kind)}, {row.className}, {formatDay(row.date)}): <span data-score>{row.score} out of {row.maxScore}</span>{row.grade ? ', grade ' + row.grade : ', no grade entered'}. Published {formatStamp(row.publishedAt)}.{row.inReports > 0 ? ' Already used in ' + row.inReports + ' report' + (row.inReports === 1 ? '' : 's') + '.' : ''}</span></Label>
                </li>)}</ul>}
            </CardContent></Card>
          <Card><CardHeader><CardTitle>Report details</CardTitle></CardHeader><CardContent className="min-w-0 space-y-4">
            <div><Label htmlFor="compile-term">Term</Label><Input id="compile-term" value={form.term} maxLength={200} onChange={event => edit('term', event.target.value)} {...invalid('term')} />{note('term')}</div>
            <div><Label htmlFor="compile-grade">Overall grade</Label><Input id="compile-grade" value={form.overallGrade} maxLength={200} onChange={event => edit('overallGrade', event.target.value)} {...invalid('overallGrade')} />{note('overallGrade')}<p className="mt-1 text-sm text-muted-foreground">Entered by your school. Nothing is calculated from the scores.</p></div>
            <div><Label htmlFor="compile-summary">Summary (optional)</Label><Textarea id="compile-summary" rows={4} maxLength={4000} value={form.summary} onChange={event => edit('summary', event.target.value)} {...invalid('summary')} />{note('summary')}</div>
            <div><Label htmlFor="compile-correction">This report replaces a published report (optional)</Label>
              <select id="compile-correction" className={selectClass} value={form.correctionId} onChange={event => edit('correctionId', event.target.value)}><option value="">No, this is a new report</option>{published.map(row => <option key={row.id} value={row.id}>{row.term}, published {formatStamp(row.publishedAt)}</option>)}</select>
              <p className="mt-1 text-sm text-muted-foreground">The earlier report stays visible, marked as replaced once the new one is published.</p></div>
            {form.correctionId && <div><Label htmlFor="compile-correction-reason">Reason for replacing it</Label><Textarea id="compile-correction-reason" rows={3} maxLength={500} value={form.correctionReason} onChange={event => edit('correctionReason', event.target.value)} {...invalid('correctionReason')} />{note('correctionReason')}</div>}
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save draft report'}</Button>
          </CardContent></Card>
        </fieldset>
      </form>}
    </>}
  </div>;
}
