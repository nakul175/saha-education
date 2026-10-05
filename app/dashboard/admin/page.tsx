import { getPrincipal } from '@/lib/education/auth';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { listSchools } from '@/lib/education/schools';
import { listStudents } from '@/lib/education/students';
import { listCourses } from '@/lib/education/courses';
import { type Principal } from '@/lib/education/types';
import Link from 'next/link';

export default async function AdminDashboard() {
  const principal = getPrincipal();
  
  // Require admin role
  if (!principal || principal.role !== 'admin') {
    // Redirect to login page if not authenticated or not an admin
    return <RedirectToLogin />;
  }
  
  // Fetch counts
  const schools = await listSchools();
  const students = await listStudents();
  const courses = await listCourses();
  
  // Count teachers (users with teacher role)
  const teachersCount = 0; // We'll need to query this properly - for now we'll just leave it
  
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
              <li><Link href="/schools" className="text-blue-600 hover:underline">Manage Schools</Link></li>
              <li><Link href="/students" className="text-blue-600 hover:underline">Manage Students</Link></li>
              <li><Link href="/courses" className="text-blue-600 hover:underline">Manage Courses</Link></li>
              <li><Link href="/teachers" className="text-blue-600 hover:underline">Manage Teachers</Link></li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function RedirectToLogin() {
  // This is a placeholder - in practice, you'd redirect to the login page
  return (
    <div className="flex items-center justify-center min-h-screen">
      <p>Redirecting to login...</p>
    </div>
  );
}