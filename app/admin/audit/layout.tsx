/* eslint-disable @next/next/no-html-link-for-pages -- Use full-page navigation while vinext beta Link transitions are unreliable. */
import { redirect } from 'next/navigation';
import { getServerPrincipal } from '@/lib/education/auth';

export const dynamic = 'force-dynamic';
// app/admin/layout.tsx already limits this area to administrators; this repeats the check so the
// audit trail never depends on a parent layout.
export default async function AuditLayout({ children }: { children: React.ReactNode }) {
  const principal = await getServerPrincipal();
  if (!principal) redirect('/login');
  if (principal.role !== 'admin')
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <a href="/" className="underline">
          ← Dashboard
        </a>
        <h1 className="text-2xl font-bold">Audit trail</h1>
        <p>The audit trail is available to school administrators.</p>
      </div>
    );
  return children;
}
