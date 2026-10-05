import { redirect } from 'next/navigation';
import { getServerPrincipal } from '@/lib/education/auth';
export const dynamic = 'force-dynamic';
export default async function HomePage() {
  const principal = await getServerPrincipal();
  if (!principal) redirect('/login');
  redirect('/dashboard/' + principal.role);
}
