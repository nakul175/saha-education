import { redirect } from 'next/navigation';
import { getServerPrincipal } from '@/lib/education/auth';

export const dynamic = 'force-dynamic';
// Sending notices is a staff task. The server routes enforce this again on every request.
export default async function NoticesLayout({ children }: { children: React.ReactNode }) {
  const principal = await getServerPrincipal();
  if (!principal) redirect('/login');
  if (principal.role !== 'admin' && principal.role !== 'teacher') return <main className="mx-auto max-w-3xl space-y-4 p-6">
    <a href="/notifications" className="underline">← Notifications</a>
    <h1 className="text-2xl font-bold">Send a notice</h1>
    <p>Sending notices is available to teachers and school administrators. You can read the notices sent to you on the notifications page.</p>
  </main>;
  return children;
}
