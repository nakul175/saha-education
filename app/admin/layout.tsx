/* eslint-disable @next/next/no-html-link-for-pages -- Use full-page navigation while vinext beta Link transitions are unreliable. */
import { AppShell } from '@/components/app-shell';
import { redirect } from 'next/navigation';
import { getServerPrincipal } from '@/lib/education/auth';

export const dynamic = 'force-dynamic';
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const principal = await getServerPrincipal();
  if (!principal) redirect('/login');
  if (principal.role !== 'admin') return <AppShell principal={principal}><div className="mx-auto max-w-3xl space-y-4 p-6">
    <a href="/" className="underline">← Dashboard</a>
    <h1 className="text-2xl font-bold">Account administration</h1>
    <p>This workspace is available to school administrators.</p>
  </div></AppShell>;
  return <AppShell principal={principal}>{children}</AppShell>;
}
