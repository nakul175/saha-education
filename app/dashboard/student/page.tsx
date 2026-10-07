/* eslint-disable @next/next/no-html-link-for-pages -- full-page navigation follows the tested vinext workspace behavior. */
import { redirect } from 'next/navigation';
import { getServerPrincipal } from '@/lib/education/auth';
import { getRoleDashboard } from '@/lib/education/dashboard';
import { AppShell } from '@/components/app-shell';
import { RoleGuide } from '@/components/role-guide';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function StudentDashboard() {
  const principal = await getServerPrincipal();
  if (!principal || principal.role !== 'student') redirect('/');
  const snapshot = await getRoleDashboard(principal);
  if (!snapshot || snapshot.role !== 'student') redirect('/');
  return <AppShell principal={principal}><div className="space-y-6 p-4">
    <div className="min-w-0 space-y-2 break-words"><h1>My progress</h1><p className="text-muted-foreground">Attendance records and published reports currently available to your account.</p><a href="/dashboard/student" className="inline-block underline">Refresh dashboard</a></div>
    <RoleGuide role="student" />
    {snapshot.profiles.total === 0 && <p role="status">No linked student profile is available for this account.</p>}
    {snapshot.profiles.truncated && <p role="status">Showing {snapshot.profiles.items.length} of {snapshot.profiles.total} linked profiles. Open <a href="/students" className="underline">Students</a> for the available list.</p>}
    <div className="grid gap-4 lg:grid-cols-2">{snapshot.profiles.items.map(profile => {
      const counts = profile.attendance.counts;
      const excusedOnly = profile.attendance.recordedRows > 0 && counts.excused === profile.attendance.recordedRows;
      return <Card key={profile.id} className="min-w-0" data-dashboard-profile={profile.id}><CardHeader><CardTitle className="break-words">{profile.firstName} {profile.lastName}</CardTitle></CardHeader><CardContent className="min-w-0 space-y-5 break-words">
        <p className="text-sm text-muted-foreground">Admission number: {profile.admissionNumber}</p>
        <section className="space-y-2" aria-labelledby={'attendance-' + profile.id}><h2 id={'attendance-' + profile.id}>Stored attendance</h2>
          {profile.attendance.recordedRows === 0 ? <p>No attendance records available.</p> : <>
            {excusedOnly && <p>Only excused attendance records are available.</p>}
            <p>Recorded rows: {profile.attendance.recordedRows}</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2"><dt>Present</dt><dd>{counts.present}</dd><dt>Absent</dt><dd>{counts.absent}</dd><dt>Late</dt><dd>{counts.late}</dd><dt>Excused</dt><dd>{counts.excused}</dd>{counts.other > 0 && <><dt>Other stored status</dt><dd>{counts.other}</dd></>}</dl>
            {profile.attendance.firstDate && <p>First valid recorded date: {profile.attendance.firstDate}</p>}
            {profile.attendance.lastDate && <p>Latest valid recorded date: {profile.attendance.lastDate}</p>}
            {profile.attendance.invalidDateRows > 0 && <p>Records with a date requiring review: {profile.attendance.invalidDateRows}.</p>}
          </>}
          <a href="/attendance" className="inline-block underline">Open attendance records</a>
        </section>
        <section className="space-y-2" aria-labelledby={'reports-' + profile.id}><h2 id={'reports-' + profile.id}>Published report cards</h2>
          {profile.reports.total === 0 && <p>No published report cards available.</p>}
          {profile.reports.truncated && <p role="status">Showing {profile.reports.items.length} of {profile.reports.total} published reports. Open <a href="/report-cards" className="underline">Report cards</a> and select the student for the available list.</p>}
          <ul className="space-y-3">{profile.reports.items.map(report => <li key={report.id} className="min-w-0 rounded border p-3 break-words"><p className="font-semibold">{report.term}</p><p>School supplied grade: {report.overallGrade}</p><p className="text-sm text-muted-foreground">Published: {new Date(report.publishedAt).toLocaleString()}</p><a href={'/report-cards/' + encodeURIComponent(report.id)} className="inline-block underline">View report: {report.term}</a></li>)}</ul>
        </section>
      </CardContent></Card>;
    })}</div>
    <p className="text-sm text-muted-foreground break-words">Snapshot: {new Date(snapshot.asOf).toLocaleString()}</p>
  </div></AppShell>;
}
