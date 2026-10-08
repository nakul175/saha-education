/* eslint-disable @next/next/no-html-link-for-pages -- full-page navigation preserves the verified vinext recovery behavior. */
import { redirect } from 'next/navigation';
import { Users, BookOpen, School, FileCheck, ShieldCheck, AudioLines, Bell, ArrowRight } from 'lucide-react';
import { getServerPrincipal } from '@/lib/education/auth';
import { getRoleDashboard } from '@/lib/education/dashboard';
import { AppShell } from '@/components/app-shell';
import { RoleGuide } from '@/components/role-guide';
import { WorkspaceHeading } from '@/components/workspace-heading';
export default async function AdminDashboard() {
  const principal = await getServerPrincipal();
  if (!principal || principal.role !== 'admin') redirect('/');
  const snapshot = await getRoleDashboard(principal);
  if (!snapshot || snapshot.role !== 'admin') redirect('/');
  const metrics = [
    { title: 'Students', value: snapshot.counts.students, href: '/students' },
    { title: 'Courses', value: snapshot.counts.courses, href: '/courses' },
    { title: 'Classes', value: snapshot.counts.classes, href: '/classes' },
    {
      title: 'Enabled teachers',
      value: snapshot.counts.enabledMappedTeachers,
      href: '/admin/users',
      description: 'Enabled accounts with a school sign-in mapping.',
    },
  ];
  const schoolLinks = [
    {
      href: '/classes',
      label: 'Classes',
      detail: 'Class lists, teaching teams and attendance.',
      Icon: School,
    },
    {
      href: '/records',
      label: 'Student records',
      detail: 'Student details, family links and record history.',
      Icon: Users,
    },
    { href: '/schools', label: 'School details', detail: 'School information and setup.', Icon: School },
    {
      href: '/curriculum',
      label: 'Curriculum library',
      detail: 'Teaching references and approved versions.',
      Icon: BookOpen,
    },
  ];
  const reviewLinks = [
    {
      href: '/report-cards',
      label: 'Review report cards',
      detail: 'Review private drafts before sharing with families.',
      Icon: FileCheck,
    },
    {
      href: '/admin/profile-links',
      label: 'Review profile links',
      detail: 'Connect each account to the right profile.',
      Icon: ShieldCheck,
    },
    {
      href: '/reading-review',
      label: 'Reading history',
      detail: 'Reading observations and teacher reviews.',
      Icon: AudioLines,
    },
    {
      href: '/notices',
      label: 'Send a notice',
      detail: 'Create and review an in-app school update.',
      Icon: Bell,
    },
  ];
  return (
    <AppShell principal={principal}>
      <div className="space-y-6">
        <WorkspaceHeading
          eyebrow={snapshot.school.name}
          title="Admin Dashboard"
          description="A clear view of your school, with the everyday work close at hand."
          action={
            <a href="/dashboard/admin" className="saha-text-link">
              Refresh dashboard
            </a>
          }
        />
        <section className="saha-hero">
          <div>
            <p className="saha-eyebrow">School workspace</p>
            <h2>Keep the school day moving.</h2>
            <p>Start with your classes, then review the updates your teaching team is ready to share.</p>
          </div>
          <a href="/classes" className="saha-primary-link">
            Open classes
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </section>
        <div className="saha-metric-grid">
          {metrics.map((metric) => (
            <section key={metric.title} className="saha-metric" aria-label={metric.title}>
              <p>{metric.title}</p>
              <p className="saha-metric-value" data-dashboard-count={metric.title}>
                {metric.value}
              </p>
              {metric.description && <p className="saha-field-hint">{metric.description}</p>}
              <a href={metric.href}>View {metric.title.toLowerCase()}</a>
            </section>
          ))}
        </div>
        <div className="saha-dashboard-grid">
          <section className="saha-workspace-panel">
            <div className="saha-panel-heading">
              <h2>School workspace</h2>
            </div>
            {schoolLinks.map(({ href, label, detail, Icon }) => (
              <div className="saha-list-row" key={href}>
                <Icon size={19} aria-hidden="true" />
                <div>
                  <h3>
                    <a href={href}>{label}</a>
                  </h3>
                  <p>{detail}</p>
                </div>
              </div>
            ))}
          </section>
          <section className="saha-workspace-panel">
            <div className="saha-panel-heading">
              <h2>Review and share</h2>
            </div>
            {reviewLinks.map(({ href, label, detail, Icon }) => (
              <div className="saha-list-row" key={href}>
                <Icon size={19} aria-hidden="true" />
                <div>
                  <h3>
                    <a href={href}>{label}</a>
                  </h3>
                  <p>{detail}</p>
                </div>
              </div>
            ))}
          </section>
        </div>
        <div className="saha-task-links">
          <a href="/notifications" className="saha-text-link">
            Your notices
          </a>
          <a href="/admin/audit" className="saha-text-link">
            Audit trail
          </a>
        </div>
        <RoleGuide role="admin" />
        <p className="saha-snapshot-label">Snapshot: {new Date(snapshot.asOf).toLocaleString()}</p>
      </div>
    </AppShell>
  );
}
