'use client';

import { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { Student, Principal } from '@/lib/education/types';
import Link from 'next/link';

const studentFormSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  admissionNumber: z.string().min(1, 'Admission number is required'),
  gradeLevel: z.string().min(1, 'Grade level is required'),
});

type StudentFormValues = z.infer<typeof studentFormSchema>;

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [principal, setPrincipal] = useState<Principal | null>(null);

  const form = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      admissionNumber: '',
      gradeLevel: '',
    },
  });

  const fetchStudents = useCallback(async () => {
    try {
      setLoading(true);
      const actorResponse = await fetch('/api/session', { cache: 'no-store' });
      if (actorResponse.status === 401) { window.location.assign(new URL('/login', window.location.origin).href); return; }
      if (!actorResponse.ok) throw new Error('Could not verify school access');
      const actor: Principal = await actorResponse.json();
      setPrincipal(actor);
      const params = new URLSearchParams();
      if (searchTerm) {
        params.append('search', searchTerm);
      }
      
      const response = await fetch(`/api/students?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch students: ${response.status}`);
      }
      const data: Student[] = await response.json();
      setStudents(data);
    } catch (err) {
      console.error('Error fetching students:', err);
      setError('Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    // Run fetchStudents only when component mounts or searchTerm changes, 
    // but not on every render
    const timer = setTimeout(() => {
      fetchStudents();
    }, 300); // Added delay for debouncing search

    return () => clearTimeout(timer);
  }, [fetchStudents]);

  const onSubmit = async (values: StudentFormValues) => {
    try {
      if (principal?.role !== 'admin' || !principal.schoolId) throw new Error('School administrator access is required');
      setIsCreating(true);
      const response = await fetch('/api/students', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...values, schoolId: principal.schoolId }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create student: ${response.status}`);
      }

      const newStudent: Student = await response.json();
      
      // Update state with functional update
      setStudents(prev => [newStudent, ...prev]);
      
      // Reset form
      form.reset();
      
      // Close dialog after successful creation
      setIsCreating(false);
      
      // Show success message (we could also show a toast notification)
    } catch (err) {
      console.error('Error creating student:', err);
      setError('Failed to create student');
      setIsCreating(false);
    }
  };

  return (
    <AppShell principal={principal}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Student Registry</h1>
          <p className="text-muted-foreground mt-2">
            Manage student records and enrollments
          </p>
        </div>

      <p className="text-sm text-muted-foreground">New profiles start without a sign-in account. School administrators can link or unlink accounts through <a href="/admin/profile-links" className="underline">reviewed profile links</a>.</p>

        {/* Search and Create */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div className="flex-1 max-w-sm">
            <Input
              placeholder="Search students..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>
          
          {principal?.role === 'admin' && <Dialog>
            <DialogTrigger asChild>
              <Button>Create Student</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Create New Student</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dateOfBirth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date of Birth</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="admissionNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Admission Number</FormLabel>
                        <FormControl>
                          <Input placeholder="12345" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="gradeLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Grade Level</FormLabel>
                        <FormControl>
                          <Input placeholder="10" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {error && (
                    <div className="text-red-500 text-sm">{error}</div>
                  )}
                  
                  <Button type="submit" disabled={isCreating}>
                    {isCreating ? 'Creating...' : 'Create Student'}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>}
        </div>

        {/* Students Table */}
        <Card>
          <CardHeader>
            <CardTitle>Students</CardTitle>
            <CardDescription>
              {students.length} student{students.length !== 1 ? 's' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center items-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : error ? (
              <div className="text-red-500 text-center py-4">{error}</div>
            ) : students.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No students found
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Admission Number</TableHead>
                    <TableHead>Grade Level</TableHead>
                    <TableHead>Date of Birth</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">
                        {student.firstName} {student.lastName}
                      </TableCell>
                      <TableCell>{student.admissionNumber}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{student.gradeLevel}</Badge>
                      </TableCell>
                      <TableCell>{new Date(student.dateOfBirth).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <Link href={`/students/${student.id}`}>
                          <Button variant="outline" size="sm">View</Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
