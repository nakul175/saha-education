import { redirect } from 'next/navigation';
import { getServerPrincipal } from '@/lib/education/auth';

export const dynamic = 'force-dynamic';
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const principal = await getServerPrincipal();
  if (!principal) redirect('/login');
  // The inbox deliberately has no school navigation (the mounted family procedure asserts it); it still needs a main landmark and page margins.
  return <main className="container px-4 py-8">{children}</main>;
}
