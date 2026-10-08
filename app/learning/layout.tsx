import { AppShell } from '@/components/app-shell';
import { redirect } from 'next/navigation';
import { getServerPrincipal } from '@/lib/education/auth';

export const dynamic = 'force-dynamic';
export default async function LearningLayout({ children }: { children: React.ReactNode }) {
  const principal = await getServerPrincipal();
  if (!principal) redirect('/login');
  return <AppShell principal={principal}>{children}</AppShell>;
}
