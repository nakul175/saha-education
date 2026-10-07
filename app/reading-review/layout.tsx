/* eslint-disable @next/next/no-html-link-for-pages -- full-page navigation avoids the observed vinext beta transition failure. */
import { redirect } from 'next/navigation';
import { getServerPrincipal } from '@/lib/education/auth';

export const dynamic = 'force-dynamic';
export default async function ReadingReviewLayout({ children }: { children: React.ReactNode }) {
  const principal = await getServerPrincipal();
  if (!principal) redirect('/login');
  if (!principal.schoolId || (principal.role !== 'teacher' && principal.role !== 'admin')) return <main className="max-w-3xl mx-auto p-6 space-y-4">
    <a href="/" className="underline">← Dashboard</a>
    <h1 className="text-2xl font-bold">Reading review</h1>
    <p>Reading review is available to school staff. Contact your school administrator if your access needs updating.</p>
    <p>Reading check results are private to school staff and are not shown to learners or families until your school publishes them. Nothing is published yet, so there is nothing to see on this page. Reports your school publishes appear under <a href="/report-cards" className="underline">Reports</a>.</p>
  </main>;
  return children;
}
