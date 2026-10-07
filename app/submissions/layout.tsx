/* eslint-disable @next/next/no-html-link-for-pages -- vinext beta requires full-page navigation here. */
import { redirect } from 'next/navigation';
import { getServerPrincipal } from '@/lib/education/auth';

export const dynamic = 'force-dynamic';
export default async function SubmissionsLayout({ children }: { children: React.ReactNode }) {
  const principal = await getServerPrincipal();
  if (!principal) redirect('/login');
  if (principal.role === 'guardian') return <main className="max-w-3xl mx-auto p-6 space-y-4">
    <a href="/" className="underline">← Dashboard</a>
    <h1 className="text-2xl font-bold">Submissions and feedback</h1>
    <p>Submission status and formative feedback are available to enrolled students and school staff. Guardian access is not available yet.</p>
  </main>;
  return children;
}
