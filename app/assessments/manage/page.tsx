'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- native navigation avoids the observed client transition failure. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { failureMessage, formatDay, formatStamp, kindLabel, lifecycleRequest, stateLabels } from '@/lib/education/lifecycle-client';
import { useSession } from '@/lib/education/use-session';
import type { AssessmentOverview, AssessmentOverviewRow, PublicationState } from '@/lib/education/assessment-lifecycle';
import type { Class } from '@/lib/education/types';

const selectClass = 'w-full min-w-0 rounded border bg-background px-3 py-2 sm:w-64';
const stateStyle: Record<PublicationState, string> = {
  draft: 'border-border text-foreground',
  published: 'border-emerald-600 text-emerald-800 dark:text-emerald-300',
  unpublished: 'border-amber-600 text-amber-800 dark:text-amber-300',
};

function Row({ row }: { row: AssessmentOverviewRow }) {
  const problems: string[] = [];
  if (row.invalidMaximum) problems.push('The stored maximum needs review.');
  if (row.invalidDate) problems.push('The stored date needs review.');
  if (row.invalidResults > 0) problems.push(row.invalidResults + (row.invalidResults === 1 ? ' saved result needs' : ' saved results need') + ' review.');
  if (row.ambiguous) problems.push('Duplicate records need an administrator review.');
  return <li data-assessment-row={row.id} className="min-w-0 rounded border p-4">
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
      <h3 className="min-w-0 break-words text-lg font-semibold"><a className="underline" href={'/assessments/' + encodeURIComponent(row.id) + '/manage'}>{row.title}</a></h3>
      <span data-assessment-state={row.state} className={'rounded-full border px-2 py-0.5 text-xs font-medium ' + stateStyle[row.state]}>{stateLabels[row.state]}</span>
    </div>
    <dl className="mt-3 grid min-w-0 grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      <div className="flex gap-2"><dt className="font-medium">Class:</dt><dd className="min-w-0 break-words">{row.className ?? 'Class unavailable'}</dd></div>
      <div className="flex gap-2"><dt className="font-medium">Type:</dt><dd>{kindLabel(row.kind)}</dd></div>
      <div className="flex gap-2"><dt className="font-medium">Date:</dt><dd>{row.invalidDate ? 'Needs review' : <time dateTime={row.date}>{formatDay(row.date)}</time>}</dd></div>
      <div className="flex gap-2"><dt className="font-medium">Maximum:</dt><dd>{row.invalidMaximum || row.maxScore === null ? 'Needs review' : row.maxScore}</dd></div>
      <div className="flex gap-2"><dt className="font-medium">Results recorded:</dt><dd>{row.recordedResults} of {row.expectedPupils} pupils</dd></div>
      <div className="flex gap-2"><dt className="font-medium">Review:</dt><dd>{row.reviewCount === 0 ? 'No corrections reviewed' : row.reviewCount + (row.reviewCount === 1 ? ' correction' : ' corrections') + ' reviewed, latest ' + formatStamp(row.lastReviewedAt)}</dd></div>
      {row.stateAt && <div className="flex gap-2 sm:col-span-2"><dt className="font-medium">Status changed:</dt><dd>{formatStamp(row.stateAt)}</dd></div>}
    </dl>
    {problems.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm" role="note">{problems.map(item => <li key={item}>{item}</li>)}</ul>}
    <div className="mt-3 flex flex-wrap gap-4 text-sm">
      <a className="underline" href={'/assessments/' + encodeURIComponent(row.id) + '/manage'}>Details and publication</a>
      <a className="underline" href={'/assessments/' + encodeURIComponent(row.id)}>Enter or review results</a>
    </div>
  </li>;
}

export default function AssessmentOverviewPage() {
  const session = useSession();
  const staff = session.principal?.role === 'admin' || session.principal?.role === 'teacher';
  const [classes, setClasses] = useState<Class[]>([]);
  const [classId, setClassId] = useState('');
  const [stateFilter, setStateFilter] = useState<'all' | PublicationState>('all');
  const [overview, setOverview] = useState<AssessmentOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async (filterClass: string) => {
    const ticket = ++generation.current;
    setLoading(true); setError(null);
    try {
      const [classRows, list] = await Promise.all([
        lifecycleRequest<Class[]>('/api/classes'),
        lifecycleRequest<AssessmentOverview>('/api/assessments/overview' + (filterClass ? '?classId=' + encodeURIComponent(filterClass) : '')),
      ]);
      if (ticket !== generation.current) return;
      if (!Array.isArray(list.body.items)) throw new Error('shape');
      setClasses(Array.isArray(classRows.body) ? classRows.body : []); setOverview(list.body);
    } catch (cause) {
      if (ticket !== generation.current) return;
      setOverview(null); setError(failureMessage(cause, 'loading the assessments'));
    } finally { if (ticket === generation.current) setLoading(false); }
  }, []);
  useEffect(() => {
    if (!staff) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(classId);
  }, [staff, classId, load]);
  useEffect(() => () => { generation.current++; }, []);

  const items = overview ? overview.items.filter(row => stateFilter === 'all' || row.state === stateFilter) : [];
  return <AppShell principal={session.principal}><div className="mx-auto max-w-5xl min-w-0 space-y-6 p-4">
    <h1 className="text-2xl font-bold">Manage assessments</h1>
    <p>Create assessments, see which results are recorded and reviewed, and publish results once they are ready. Published results become available for report cards; they are never shown to families directly.</p>
    <div className="flex flex-wrap items-center gap-4"><a href="/assessments" className="underline">Back to assessments</a>{staff && <a href="/assessments/new" className="underline">New assessment</a>}<a href="/report-cards" className="underline">Report cards</a></div>
    {session.status === 'loading' && <p role="status">Checking your account…</p>}
    {session.status === 'denied' && <p role="alert">Sign in with a staff account to manage assessments.</p>}
    {session.status === 'error' && <div className="space-y-2"><p role="alert">Your account could not be confirmed. Try again.</p><Button type="button" variant="outline" onClick={session.reload}>Try again</Button></div>}
    {session.status === 'ready' && !staff && <p role="alert">Assessment management is available to teachers and school administrators. Families can read published report cards instead.</p>}
    {staff && <Card><CardHeader><CardTitle>Assessments</CardTitle></CardHeader><CardContent className="min-w-0 space-y-4">
      <div className="flex flex-wrap gap-4">
        <div className="min-w-0"><Label htmlFor="manage-class">Class</Label><select id="manage-class" className={selectClass} value={classId} onChange={event => setClassId(event.target.value)}><option value="">All my classes</option>{classes.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
        <div className="min-w-0"><Label htmlFor="manage-state">Status</Label><select id="manage-state" className={selectClass} value={stateFilter} onChange={event => setStateFilter(event.target.value as 'all' | PublicationState)}><option value="all">Any status</option><option value="draft">Not published</option><option value="published">Published</option><option value="unpublished">Unpublished</option></select></div>
        <div className="flex items-end"><Button type="button" variant="outline" disabled={loading} onClick={() => void load(classId)}>Reload list</Button></div>
      </div>
      {loading && <p role="status">Loading assessments…</p>}
      {error && <div className="space-y-2"><p role="alert" className="break-words">{error}</p><Button type="button" variant="outline" onClick={() => void load(classId)}>Try again</Button></div>}
      {!loading && !error && overview && <>
        <p role="status">Showing {items.length} of {overview.items.length} assessments{overview.truncated ? ' (the ' + overview.items.length + ' most recent of ' + overview.total + '; choose a class to narrow the list)' : ''}.</p>
        {items.length === 0 ? <p>{overview.items.length === 0 ? 'No assessments exist for your classes yet. Use New assessment to create the first one.' : 'No assessments match this status. Choose another status to see the rest.'}</p>
          : <ul className="space-y-3">{items.map(row => <Row key={row.id} row={row} />)}</ul>}
      </>}
    </CardContent></Card>}
  </div></AppShell>;
}
