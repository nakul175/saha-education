import { redirect } from 'next/navigation';
import { AppShell } from "@/components/app-shell";
import { getServerPrincipal, requireRole } from "@/lib/education/auth";
import { listStudents } from "@/lib/education/students";
import { listAttendance } from "@/lib/education/attendance";
import { listReportCards } from "@/lib/education/report-cards";
import { attendancePercentage } from "@/lib/education/attendance";

export default async function GuardianDashboard() {
  const principal = await getServerPrincipal();
  
  if (!principal) {
    redirect("/login");
  }
  
  requireRole(principal, "guardian");
  
  // Get the guardian's children
  const students = await listStudents(principal);
  
  return (
    <AppShell principal={principal}>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Guardian Dashboard</h1>
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {students.map(async (student) => {
            // Get attendance records for this student
            const attendanceRecords = await listAttendance(principal, { studentId: student.id });
            const attendancePercent = attendancePercentage(attendanceRecords);
            
            // Get latest published report card
            const reportCards = await listReportCards(principal, student.id);
            const latestReportCard = reportCards
              .filter(card => card.publishedAt)
              .sort((a, b) => new Date(b.publishedAt!).getTime() - new Date(a.publishedAt!).getTime())[0];
            
            return (
              <div key={student.id} className="border rounded-lg p-4">
                <h2 className="text-xl font-semibold">{student.firstName} {student.lastName}</h2>
                <p className="text-muted-foreground">Admission Number: {student.admissionNumber}</p>
                
                <div className="mt-4 space-y-2">
                  <div>
                    <p className="text-sm font-medium">Attendance</p>
                    <p>{attendancePercent.toFixed(1)}%</p>
                  </div>
                  
                  <div>
                    <p className="text-sm font-medium">Latest Report Card</p>
                    {latestReportCard ? (
                      <p>Term: {latestReportCard.term}, Grade: {latestReportCard.overallGrade}</p>
                    ) : (
                      <p>No published report card available</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {students.length === 0 && (
          <p className="text-center text-muted-foreground">No children enrolled</p>
        )}
      </div>
    </AppShell>
  );
}