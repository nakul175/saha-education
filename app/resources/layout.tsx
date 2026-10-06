/* eslint-disable @next/next/no-html-link-for-pages -- vinext beta client Link transitions crash in this workspace; use full-page navigation. */
import { redirect } from 'next/navigation';
import { getServerPrincipal } from '@/lib/education/auth';

export const dynamic = 'force-dynamic';
export default async function ResourceLayout({ children }: { children: React.ReactNode }) {
  const principal = await getServerPrincipal();
  if (!principal) redirect('/login');
  if (!['teacher', 'admin'].includes(principal.role)) return <main className="max-w-3xl mx-auto p-6 space-y-4">
    <a href="/">← Dashboard</a><h1 className="text-2xl font-bold">Teaching resources</h1>
    <p>This workspace is available to school staff.</p><a href="/learning" className="underline">View assigned learning</a>
  </main>;
  return children;
}
