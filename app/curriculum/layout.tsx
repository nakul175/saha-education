/* eslint-disable @next/next/no-html-link-for-pages -- vinext beta requires full-page navigation here. */
import { redirect } from 'next/navigation';
import { getServerPrincipal } from '@/lib/education/auth';

export const dynamic = 'force-dynamic';
export default async function CurriculumLayout({ children }: { children: React.ReactNode }) {
  const principal = await getServerPrincipal();
  if (!principal) redirect('/login');
  if (principal.role !== 'teacher' && principal.role !== 'admin') return <main className="max-w-3xl mx-auto p-6 space-y-4">
    <a href="/" className="underline">← Dashboard</a>
    <h1 className="text-2xl font-bold">Curriculum references</h1>
    <p>This library is available to school staff. Contact your school administrator if your access needs updating.</p>
  </main>;
  return children;
}
