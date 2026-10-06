import { redirect } from 'next/navigation';
import { getServerPrincipal } from '@/lib/education/auth';
import { AppShell } from '@/components/app-shell';

export const dynamic = 'force-dynamic';
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const principal = await getServerPrincipal();
  if (!principal) redirect('/login');
  // The shared school navigation, skip link and main landmark frame this page; the page keeps its own access checks.
  return <AppShell principal={principal}>{children}</AppShell>;
}
