'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- native navigation avoids the observed client transition failure. */

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { failureMessage, formatDay, formatStamp, jsonInit, kindLabel, lifecycleRequest, LifecycleRequestError } from '@/lib/education/lifecycle-client';
import { useSession } from '@/lib/education/use-session';
import type { ReportDetail } from '@/lib/education/report-compile';

export default function ReportCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const session = useSession();
  const principal = session.principal;
  const admin = principal?.role === 'admin';
  const staff = admin || principal?.role === 'teacher';
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const generation = useRef(0), inFlight = useRef(false);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const message = useRef<HTMLDivElement>(null);

  const load = useCallback(async (keepMessage = false) => {
    const ticket = ++generation.current;
    setLoading(true); setLoadError(null); if (!keepMessage) { setNotice(null); setError(null); setUnconfirmed(false); }
    try {
      const { body } = await lifecycleRequest<ReportDetail>('/api/report-cards/' + encodeURIComponent(id) + '/detail');
      if (ticket !== generation.current) return;
      if (!body?.report || body.report.id !== id || !Array.isArray(body.lines)) throw new LifecycleRequestError(200, null, true);
      setDetail(body); setReviewed(false);
    } catch (cause) {
      if (ticket !== generation.current) return;
      setDetail(null);
      setLoadError(cause instanceof LifecycleRequestError && [403, 404].includes(cause.status) ? 'This report card is not available to your account. Published report cards for your linked learners are listed under Report Cards.' : failureMessage(cause, 'loading the report card'));
    } finally { if (ticket === generation.current) setLoading(false); }
  }, [id]);
  useEffect(() => {
    if (session.status !== 'ready') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return invalidate;
  }, [session.status, load, invalidate]);
  useEffect(() => { if (error || notice) message.current?.focus(); }, [error, notice]);

  async function publish() {
    if (!detail || !admin || inFlight.current || detail.report.publishedAt || !reviewed) return;
    inFlight.current = true; setPublishing(true); setError(null); setNotice(null); setUnconfirmed(false);
    try {
      const { body } = await lifecycleRequest<{ id: string; publishedAt: string | null }>('/api/report-cards/' + encodeURIComponent(id), jsonInit('PATCH', { publish: true }));
      if (!body || body.id !== id || !body.publishedAt) throw new LifecycleRequestError(200, null, true);
      setNotice('Report published. Linked guardians and the learner can now read it. Publishing again never sends duplicate notices.');
      await load(true);
    } catch (cause) {
      const lost = cause instanceof LifecycleRequestError && cause.unconfirmed;
      setUnconfirmed(lost);
      setError(failureMessage(cause, 'publishing the report'));
      if (cause instanceof LifecycleRequestError && !lost) await load(true);
    } finally { inFlight.current = false; setPublishing(false); }
  }

  const report = detail?.report;
  const published = !!report?.publishedAt;
  return <AppShell principal={principal}><div className="mx-auto max-w-3xl min-w-0 space-y-6 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-3xl font-bold">Report Card</h1>
      {detail && <Button type="button" onClick={() => window.print()}>Print Report</Button>}
    </div>
    <div className="flex flex-wrap items-center gap-4 print:hidden"><a href="/report-cards" className="underline">Back to report cards</a>{admin && <a href="/report-cards/compile" className="underline">Compile a report card</a>}</div>
    {session.status === 'loading' && <p role="status">Checking your account…</p>}
    {session.status === 'denied' && <p role="alert">Sign in to read report cards.</p>}
    {session.status === 'error' && <div className="space-y-2"><p role="alert">Your account could not be confirmed. Try again.</p><Button type="button" variant="outline" onClick={session.reload}>Try again</Button></div>}
    {session.status === 'ready' && <>
      {loading && !detail && <p role="status">Loading the report card…</p>}
      {loadError && <div className="space-y-2"><p role="alert" className="break-words">{loadError}</p><Button type="button" variant="outline" onClick={() => void load()}>Try again</Button></div>}
      {(error || notice) && <div ref={message} tabIndex={-1} role={error ? 'alert' : 'status'} className="space-y-2 break-words rounded border p-3">
        <p>{error || notice}</p>
        {unconfirmed && <Button type="button" variant="outline" disabled={publishing} onClick={() => void publish()}>Send the same request again</Button>}
      </div>}
      {detail && report && <>
        {detail.supersededBy && <p role="note" data-superseded className="break-words rounded border border-amber-600 p-3">This report has been replaced by a corrected report{detail.supersededBy.publishedAt ? '' : ' (not yet published)'}: <a className="underline" href={'/report-cards/' + encodeURIComponent(detail.supersededBy.id)}>{detail.supersededBy.term}</a>. Reason: {detail.supersededBy.reason}</p>}
        {detail.corrects && <p role="note" data-corrects className="break-words rounded border p-3">This report corrects an earlier report: <a className="underline" href={'/report-cards/' + encodeURIComponent(detail.corrects.id)}>{detail.corrects.term}</a>. Reason: {detail.corrects.reason}</p>}
        <Card><CardHeader><CardTitle>Report Card Details</CardTitle></CardHeader>
          <CardContent className="min-w-0 break-words">
            <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 [&>div]:min-w-0">
              <div><p><span className="font-medium">Learner:</span> {detail.studentName}</p></div>
              <div><p><span className="font-medium">Term:</span> {report.term}</p></div>
              <div><p><span className="font-medium">Overall Grade:</span> {report.overallGrade}</p></div>
              <div><p><span className="font-medium">Published:</span> {report.publishedAt ? formatStamp(report.publishedAt) : staff ? 'Not published. Only staff can see this draft.' : 'Not published'}</p></div>
              <div className="md:col-span-2"><p><span className="font-medium">Summary:</span></p><p className="whitespace-pre-wrap">{report.summary || 'No summary available'}</p></div>
            </div>
          </CardContent></Card>

        <Card><CardHeader><CardTitle>Assessment results in this report</CardTitle><CardDescription>Published results as they were when the report was compiled. They are a snapshot and do not change.</CardDescription></CardHeader>
          <CardContent className="min-w-0">
            {detail.lines.length === 0 ? <p data-lines-empty>No assessment results are attached to this report. The grade and summary were entered by the school.</p>
              : <ul className="space-y-2">{detail.lines.map(line => <li key={line.assessmentId} data-report-line={line.assessmentId} className="min-w-0 break-words rounded border p-3 text-sm">
                <p className="font-medium">{line.title}</p>
                <p>{kindLabel(line.kind)} on <time dateTime={line.date}>{formatDay(line.date)}</time></p>
                <p data-score>Score: {line.score} out of {line.maxScore}{line.grade ? ', grade ' + line.grade : ''}</p>
                {staff && line.current === false && <p role="note" data-line-changed className="font-medium text-amber-800 dark:text-amber-300">The saved result or its publication changed after this report was compiled.</p>}
              </li>)}</ul>}
          </CardContent></Card>

        {admin && !published && <Card><CardHeader><CardTitle>Publish</CardTitle><CardDescription>Publishing makes this report readable by linked guardians and the learner, and sends each eligible guardian an in-app notice.</CardDescription></CardHeader>
          <CardContent className="min-w-0 space-y-4">
            {detail.resultsChanged ? <p role="alert" data-publish-blocked>Results in this draft changed after it was compiled, so it cannot be published. Compile a replacement report from the current published results.</p>
              : <>
                <Label className="flex items-start gap-2" htmlFor="report-reviewed"><input id="report-reviewed" type="checkbox" className="mt-1" checked={reviewed} disabled={publishing} onChange={event => setReviewed(event.target.checked)} /><span className="min-w-0">I reviewed this report for {detail.studentName} and intend to make it available to linked families.</span></Label>
                <Button type="button" disabled={!reviewed || publishing || loading} onClick={() => void publish()}>{publishing ? 'Publishing…' : 'Publish report'}</Button>
              </>}
          </CardContent></Card>}
        {admin && published && detail.resultsChanged && <p role="note" data-results-changed className="break-words rounded border border-amber-600 p-3">Some results changed after this report was published. The report still shows what families were told. To correct it, <a className="underline" href="/report-cards/compile">compile a replacement report</a> and choose this report as the one it replaces.</p>}
      </>}
    </>}
  </div></AppShell>;
}
