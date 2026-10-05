import { redirect } from 'next/navigation';
import { getServerPrincipal } from '@/lib/education/auth';
import { listStudents } from '@/lib/education/students';
import { listReportCards } from '@/lib/education/report-cards';
import { AppShell } from '@/components/app-shell';
export default async function StudentDashboard() {
  const principal = await getServerPrincipal();
  if (!principal || principal.role !== 'student') redirect('/');
  const students = await listStudents(principal);
  const cards = await listReportCards(principal);
  return <AppShell principal={principal}><h1 className="text-2xl font-bold">My progress</h1>
    {students.map(student => <p key={student.id}>{student.firstName} {student.lastName}</p>)}
    {cards.map(card => <p key={card.id}>{card.term}: {card.overallGrade}</p>)}
    {!cards.length && <p>No published report cards yet.</p>}
  </AppShell>;
}
