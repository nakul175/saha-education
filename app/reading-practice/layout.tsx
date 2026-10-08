/* eslint-disable @next/next/no-html-link-for-pages -- use the established full-page staff navigation. */
import { AppShell } from '@/components/app-shell';
import { redirect } from 'next/navigation';
import { getServerPrincipal } from '@/lib/education/auth';

export const dynamic = 'force-dynamic';
export default async function ReadingPracticeLayout({ children }: { children: React.ReactNode }) {
  const principal = await getServerPrincipal();
  if (!principal) redirect('/login');
  if (!principal.schoolId || !['teacher', 'admin'].includes(principal.role))
    return (
      <AppShell principal={principal}>
        <div className="mx-auto max-w-3xl space-y-4 p-6">
          <a href="/" className="underline">
            ← Dashboard
          </a>
          <h1 className="text-2xl font-bold">Reading practice planner</h1>
          <p>The reading practice planner is available to school staff.</p>
        </div>
      </AppShell>
    );
  return <AppShell principal={principal}>{children}</AppShell>;
}
