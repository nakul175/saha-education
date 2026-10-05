/* eslint-disable @next/next/no-html-link-for-pages -- full-page navigation follows the tested vinext workspace behavior. */
import { redirect } from 'next/navigation';
import { getServerPrincipal } from '@/lib/education/auth';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { listSchools } from '@/lib/education/schools';
import { listStudents } from '@/lib/education/students';
import { listCourses } from '@/lib/education/courses';
import { getDb } from '@/db';
import { users } from '@/db/schema';
import { and, eq, isNull, count } from 'drizzle-orm';

export default async function AdminDashboard() {
  const principal = await getServerPrincipal();
  
  // Require admin role
  if (!principal || principal.role !== 'admin') {
    // Redirect to login page if not authenticated or not an admin
    redirect("/");
  }
  
  // Fetch counts
  const schools = await listSchools(principal);
  const students = await listStudents(principal);
  const courses = await listCourses(principal);
  
  // Count teachers (users with teacher role)
  const [teacherCount] = await getDb().select({ total: count() }).from(users).where(and(
    eq(users.schoolId, principal.schoolId!), eq(users.role, 'teacher'), isNull(users.disabledAt)
  ));
  const teachersCount = teacherCount.total;
  
  return (
    <AppShell principal={principal}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">Welcome to the admin dashboard</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Schools</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{schools.length}</div>
            <p className="text-xs text-muted-foreground">Total schools</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Students</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{students.length}</div>
            <p className="text-xs text-muted-foreground">Total students</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Teachers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teachersCount}</div>
            <p className="text-xs text-muted-foreground">Total teachers</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Courses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{courses.length}</div>
            <p className="text-xs text-muted-foreground">Total courses</p>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Quick Links</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              <li><a href="/admin/users" className="text-blue-600 hover:underline">Manage Accounts</a></li>
              <li><a href="/curriculum" className="text-blue-600 hover:underline">Curriculum Library</a></li>
              <li><a href="/reading-review" className="text-blue-600 hover:underline">Review Reading History</a></li>
              <li><a href="/schools" className="text-blue-600 hover:underline">Manage Schools</a></li>
              <li><a href="/students" className="text-blue-600 hover:underline">Manage Students</a></li>
              <li><a href="/courses" className="text-blue-600 hover:underline">Manage Courses</a></li>
              <li><a href="/classes" className="text-blue-600 hover:underline">Manage Classes</a></li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
