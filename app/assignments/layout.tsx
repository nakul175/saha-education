/* eslint-disable @next/next/no-html-link-for-pages -- vinext beta requires full-page navigation here. */
import { AppShell } from '@/components/app-shell';
import { redirect } from 'next/navigation';
import { getServerPrincipal } from '@/lib/education/auth';

export const dynamic = 'force-dynamic';
export default async function AssignmentLayout({ children }: { children: React.ReactNode }) {
  const principal = await getServerPrincipal();
  if (!principal) redirect('/login');
  if (principal.role === 'guardian') return <AppShell principal={principal}><div className="max-w-3xl mx-auto p-6 space-y-4">
    <a href="/" className="underline">← Dashboard</a><h1 className="text-2xl font-bold">Assignment responses</h1>
    <p>Responses and formative feedback are available to enrolled students and school staff. Guardian access is not available.</p>
  </div></AppShell>;
  return <AppShell principal={principal}>{children}</AppShell>;
}
