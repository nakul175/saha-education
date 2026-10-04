import { AppShell } from "@/components/app-shell";
import { requirePrincipal } from "@/lib/education/auth";
import type { Principal } from "@/lib/education/types";
import { listClasses } from "@/lib/education/classes";
import { listAssessments } from "@/lib/education/assessments";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default async function TeacherDashboardPage() {
  const principal = requirePrincipal();
  
  // Get teacher's classes
  const classes = await listClasses(principal.schoolId);

  // Filter to only include the teacher's classes (the ones where the teacher is the teacherId)
  const teacherClasses = classes.filter(cls => cls.teacherId === principal.id);

  // Get assessments that still need results
  // For this, we need to filter based on which assessments have no results recorded yet
  const allAssessments = await listAssessments();
  
  // Filter to only include assessments from the teacher's classes
  const classAssessments = allAssessments.filter(assessment => {
    return teacherClasses.some(cls => cls.id === assessment.classId);
  });

  return (
    <AppShell principal={principal}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Teacher Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Welcome, {principal.id}. Here&apos;s what you need to manage today.
          </p>
        </div>

        {/* Classes Section */}
        <Card>
          <CardHeader>
            <CardTitle>My Classes</CardTitle>
          </CardHeader>
          <CardContent>
            {teacherClasses.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {teacherClasses.map(cls => (
                  <Card key={cls.id}>
                    <CardContent className="pt-6">
                      <h3 className="font-semibold">{cls.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        Course ID: {cls.courseId}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Term: {cls.term}
                      </p>
                      <div className="mt-4 flex space-x-2">
                        <Link href={`/classes/${cls.id}/attendance`} passHref>
                          <Button variant="default">Take Attendance</Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No classes assigned to you.</p>
            )}
          </CardContent>
        </Card>

        {/* Assessments Section */}
        <Card>
          <CardHeader>
            <CardTitle>Assessments Needing Results</CardTitle>
          </CardHeader>
          <CardContent>
            {classAssessments.length > 0 ? (
              <div className="space-y-4">
                {classAssessments.map(assessment => {
                  // For simplicity, we'll assume all assessments need results
                  // In a real implementation, you would check if results already exist
                  return (
                    <div key={assessment.id} className="border rounded-lg p-4">
                      <h3 className="font-semibold">{assessment.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        Type: {assessment.kind}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Date: {new Date(assessment.date).toLocaleDateString()}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Max Score: {assessment.maxScore}
                      </p>
                      <div className="mt-2 flex space-x-2">
                        <Link href={`/assessments/${assessment.id}/results`} passHref>
                          <Button variant="default">Record Results</Button>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-muted-foreground">No assessments needing results.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}