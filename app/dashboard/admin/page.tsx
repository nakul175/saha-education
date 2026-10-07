/* eslint-disable @next/next/no-html-link-for-pages -- full-page navigation follows the tested vinext workspace behavior. */
import { redirect } from 'next/navigation';
import { getServerPrincipal } from '@/lib/education/auth';
import { getRoleDashboard } from '@/lib/education/dashboard';
import { AppShell } from '@/components/app-shell';
import { RoleGuide } from '@/components/role-guide';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function AdminDashboard() {
  const principal = await getServerPrincipal();
  if (!principal || principal.role !== 'admin') redirect('/');
  const snapshot = await getRoleDashboard(principal);
  if (!snapshot || snapshot.role !== 'admin') redirect('/');
  const metrics = [
    { title: 'Students', value: snapshot.counts.students, href: '/students' },
    { title: 'Courses', value: snapshot.counts.courses, href: '/courses' },
    { title: 'Classes', value: snapshot.counts.classes, href: '/classes' },
    { title: 'Enabled teachers', value: snapshot.counts.enabledMappedTeachers, href: '/admin/users', description: 'Enabled accounts with a school sign-in mapping.' },
  ];
  return <AppShell principal={principal}><div className="space-y-6 p-4">
    <div className="min-w-0 space-y-2 break-words"><h1>Admin Dashboard</h1><p>{snapshot.school.name}</p><p className="text-sm text-muted-foreground">Current records in your school.</p><a href="/dashboard/admin" className="inline-block underline">Refresh dashboard</a></div>
    <RoleGuide role="admin" />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(metric => <Card key={metric.title} className="min-w-0" aria-label={metric.title}><CardHeader><CardTitle>{metric.title}</CardTitle></CardHeader><CardContent className="space-y-2 break-words"><p className="text-3xl font-semibold" data-dashboard-count={metric.title}>{metric.value}</p>{metric.description && <p className="text-sm text-muted-foreground">{metric.description}</p>}<a href={metric.href} className="inline-block underline">View {metric.title.toLowerCase()}</a></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle>School workspace</CardTitle></CardHeader><CardContent><ul className="grid gap-3 sm:grid-cols-2">
      <li><a href="/schools" className="underline">School details</a></li><li><a href="/admin/profile-links" className="underline">Review profile links</a></li><li><a href="/report-cards" className="underline">Review report cards</a></li><li><a href="/curriculum" className="underline">Curriculum library</a></li><li><a href="/reading-review" className="underline">Reading history</a></li><li><a href="/notifications" className="underline">Your notices</a></li><li><a href="/notices" className="underline">Send a notice</a></li><li><a href="/admin/audit" className="underline">Audit trail</a></li>
    </ul></CardContent></Card>
    <p className="text-sm text-muted-foreground break-words">Snapshot: {new Date(snapshot.asOf).toLocaleString()}</p>
  </div></AppShell>;
}
