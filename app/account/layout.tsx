import { AppShell } from '@/components/app-shell';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerPrincipal } from '@/lib/education/auth';
import { SESSION_COOKIE } from '@/lib/education/session';

export const dynamic = 'force-dynamic';
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const principal = await getServerPrincipal();
  if (!principal) {
    // A cookie that no longer resolves means the session ended; a visitor with none is simply signed out.
    const jar = await cookies();
    redirect(jar.getAll(SESSION_COOKIE).length ? '/login?reason=expired' : '/login');
  }
  return <AppShell principal={principal}>{children}</AppShell>;
}
