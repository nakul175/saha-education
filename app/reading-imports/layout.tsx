/* eslint-disable @next/next/no-html-link-for-pages -- full-page navigation avoids the known vinext beta client transition failure. */
import { AppShell } from '@/components/app-shell';
import { redirect } from 'next/navigation';
import { getServerPrincipal } from '@/lib/education/auth';
export const dynamic = 'force-dynamic';
export default async function ImportLayout({ children }: { children: React.ReactNode }) {
  const principal = await getServerPrincipal();
  if (!principal) redirect('/login');
  if (!principal.schoolId || !['teacher', 'admin'].includes(principal.role))
    return (
      <AppShell principal={principal}>
        <div className="mx-auto max-w-3xl p-6 space-y-4">
          <a href="/" className="underline">
            ← Dashboard
          </a>
          <h1 className="text-2xl font-bold">Reviewed reading imports</h1>
          <p>Manual reading import review is available to school staff.</p>
        </div>
      </AppShell>
    );
  return <AppShell principal={principal}>{children}</AppShell>;
}
