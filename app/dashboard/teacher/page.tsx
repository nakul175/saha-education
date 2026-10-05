/* eslint-disable @next/next/no-html-link-for-pages -- full-page navigation follows the tested vinext workspace behavior. */
import { redirect } from 'next/navigation';
import { getServerPrincipal } from '@/lib/education/auth';
import { getRoleDashboard } from '@/lib/education/dashboard';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const coverageLabels = {
  'no-current-roster': 'No current roster',
  'missing-results': 'Missing results',
  'recorded-for-current-roster': 'Results recorded for current roster',
  'needs-review': 'Result coverage needs review',
};
export default async function TeacherDashboard() {
  const principal = await getServerPrincipal();
  if (!principal || principal.role !== 'teacher') redirect('/');
  const snapshot = await getRoleDashboard(principal);
  if (!snapshot || snapshot.role !== 'teacher') redirect('/');
  return <AppShell principal={principal}><div className="space-y-6 p-4">
    <div className="min-w-0 space-y-2 break-words"><h1>Teacher Dashboard</h1><p className="text-muted-foreground">Your assigned classes and their stored result coverage.</p><a href="/dashboard/teacher" className="inline-block underline">Refresh dashboard</a></div>
    <Card><CardHeader><CardTitle>My classes</CardTitle></CardHeader><CardContent className="space-y-4">
      {snapshot.classes.total === 0 && <p>No classes are currently assigned to you.</p>}
      {snapshot.classes.truncated && <p role="status">Showing {snapshot.classes.items.length} of {snapshot.classes.total} assigned classes. Open <a href="/classes" className="underline">Classes</a> for the available list.</p>}
      <div className="grid gap-4 md:grid-cols-2">{snapshot.classes.items.map(record => <article key={record.id} data-dashboard-class={record.id} className="min-w-0 space-y-2 rounded border p-4 break-words"><h2>{record.name}</h2><p>{record.courseTitle ?? 'Course details unavailable'}</p><p>Term: {record.term}</p><p>Active students: {record.activeStudents}</p><div className="flex flex-wrap gap-4"><a href={'/classes/' + encodeURIComponent(record.id)} className="underline">Open class</a><a href={'/classes/' + encodeURIComponent(record.id) + '/attendance'} className="underline">Take attendance</a></div></article>)}</div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Assessment result coverage</CardTitle></CardHeader><CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Coverage uses the current active roster and stored results. A valid score of zero counts as a recorded result.</p>
      {snapshot.assessments.total === 0 && <p>No assessments are available for your assigned classes.</p>}
      {snapshot.assessments.truncated && <p role="status">Showing {snapshot.assessments.items.length} of {snapshot.assessments.total} assessments. Open <a href="/assessments" className="underline">Assessments</a> for the available list.</p>}
      <div className="space-y-4">{snapshot.assessments.items.map(record => <article key={record.id} data-dashboard-assessment={record.id} data-coverage-state={record.coverage.state} className="min-w-0 space-y-3 rounded border p-4 break-words">
        <h2>{record.title}</h2><p className="text-sm text-muted-foreground">{record.kind} · Date: {record.date} · {record.maxScore === null ? 'Maximum score unavailable' : 'Maximum score: ' + record.maxScore}</p>
        <p className="font-semibold">{coverageLabels[record.coverage.state]}</p>
        {record.coverage.state === 'no-current-roster' ? <p>No active students are available for result coverage.</p> : <>
          <p>Active students: {record.coverage.activeStudents}. Recorded results: {record.coverage.recordedStudents}. Missing results: {record.coverage.missingStudents}.</p>
          {record.coverage.ambiguousEnrolmentStudents > 0 && <p>Students with multiple enrolment records: {record.coverage.ambiguousEnrolmentStudents}.</p>}
          {record.coverage.ambiguousResultStudents > 0 && <p>Students with multiple stored result records: {record.coverage.ambiguousResultStudents}.</p>}
          {record.coverage.invalidResultStudents > 0 && <p>Students with a stored score requiring review: {record.coverage.invalidResultStudents}.</p>}
          {record.coverage.invalidMaximum && <p>The stored maximum score requires review.</p>}
        </>}
        <a href={'/assessments/' + encodeURIComponent(record.id)} className="inline-block underline">Open saved results</a>
      </article>)}</div>
    </CardContent></Card>
    <p className="text-sm text-muted-foreground break-words">Snapshot: {new Date(snapshot.asOf).toLocaleString()}</p>
  </div></AppShell>;
}
