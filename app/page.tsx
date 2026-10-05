import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getPrincipal } from '@/lib/education/auth';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const cookieStore = cookies();
  const principal = getPrincipal();
  
  if (!principal) {
    redirect('/login');
  }
  
  switch (principal.role) {
    case 'admin':
      redirect('/dashboard/admin');
    case 'teacher':
      redirect('/dashboard/teacher');
    case 'guardian':
      redirect('/dashboard/guardian');
    case 'student':
      redirect('/students');
    default:
      redirect('/login');
  }
}