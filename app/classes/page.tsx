'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import Link from 'next/link';
import type { Class, School, Course, User } from '@/lib/education/types';

// Define the schema for class form
const classFormSchema = z.object({
  schoolId: z.string().min(1, 'School is required'),
  courseId: z.string().min(1, 'Course is required'),
  teacherId: z.string().min(1, 'Teacher is required'),
  name: z.string().min(1, 'Class name is required'),
  term: z.string().min(1, 'Term is required'),
  schedule: z.string().optional(),
});

type ClassFormType = z.infer<typeof classFormSchema>;

export default function ClassesPage() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [schools, setSchools] = useState<School[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);

  const form = useForm<ClassFormType>({
    resolver: zodResolver(classFormSchema),
    defaultValues: {
      schoolId: '',
      courseId: '',
      teacherId: '',
      name: '',
      term: '',
      schedule: '',
    },
  });

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch classes
        const classesResponse = await fetch('/api/classes');
        if (!classesResponse.ok) throw new Error('Failed to fetch classes');
        const classesData: Class[] = await classesResponse.json();
        setClasses(classesData);

        // Fetch schools for form dropdown
        const schoolsResponse = await fetch('/api/schools');
        if (!schoolsResponse.ok) throw new Error('Failed to fetch schools');
        const schoolsData: School[] = await schoolsResponse.json();
        setSchools(schoolsData);

        // Fetch courses for form dropdown
        const coursesResponse = await fetch('/api/courses');
        if (!coursesResponse.ok) throw new Error('Failed to fetch courses');
        const coursesData: Course[] = await coursesResponse.json();
        setCourses(coursesData);

        // Fetch teachers for form dropdown (this would normally be filtered by school)
        const teachersResponse = await fetch('/api/users?role=teacher');
        if (!teachersResponse.ok) throw new Error('Failed to fetch teachers');
        const teachersData: User[] = await teachersResponse.json();
        setTeachers(teachersData);
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Error loading data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const onSubmit = async (data: ClassFormType) => {
    try {
      const response = await fetch('/api/classes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData: { error?: string } = await response.json();
        throw new Error(errorData.error || 'Failed to create class');
      }

      // Refresh the list
      const classesResponse = await fetch('/api/classes');
      if (classesResponse.ok) {
        const classesData: Class[] = await classesResponse.json();
        setClasses(classesData);
      }

      // Reset form
      form.reset();

      toast.success('Class created successfully');
    } catch (error) {
      console.error('Error creating class:', error);
      toast.error((error as Error).message || 'Failed to create class');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Classes</h1>
        <p className="text-muted-foreground">
          Manage school classes and their details
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Classes List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Class List</CardTitle>
            <CardDescription>
              All existing classes in the system
            </CardDescription>
          </CardHeader>
          <CardContent>
            {classes.length === 0 ? (
              <p className="text-muted-foreground">No classes found.</p>
            ) : (
              <div className="space-y-3">
                {classes.map((cls) => (
                  <div 
                    key={cls.id} 
                    className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                  >
                    <Link href={`/classes/${cls.id}`} className="font-medium hover:underline">
                      {cls.name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {cls.term} • {cls.schedule}
                    </p>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-xs bg-secondary text-secondary-foreground rounded-full px-2 py-1">
                        {cls.courseId}
                      </span>
                      <span className="text-xs bg-secondary text-secondary-foreground rounded-full px-2 py-1">
                        {cls.teacherId}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create Class Form */}
        <Card>
          <CardHeader>
            <CardTitle>Create New Class</CardTitle>
            <CardDescription>
              Add a new class to the system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <FormField
                    control={form.control}
                    name="schoolId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>School</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a school" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {schools.map((school) => (
                              <SelectItem key={school.id} value={school.id}>
                                {school.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="courseId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Course</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a course" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {courses.map((course) => (
                              <SelectItem key={course.id} value={course.id}>
                                {course.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="teacherId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Teacher</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a teacher" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {teachers.map((teacher) => (
                              <SelectItem key={teacher.id} value={teacher.id}>
                                {teacher.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Class Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter class name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="term"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Term</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter term" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="schedule"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Schedule (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter schedule details" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button type="submit" className="w-full">
                  Create Class
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}