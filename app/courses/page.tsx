'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Course data type
interface Course {
  id: string;
  schoolId: string;
  code: string;
  title: string;
  description?: string;
  gradeLevel: string;
  createdAt: string;
  updatedAt: string;
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    schoolId: '',
    code: '',
    title: '',
    description: '',
    gradeLevel: '',
  });
  const [isCreating, setIsCreating] = useState(false);

  // Fetch courses
  useEffect(() => {
    const fetchCourses = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/courses');
        if (!response.ok) {
          throw new Error(`Failed to fetch courses: ${response.status}`);
        }
        const data = await response.json();
        setCourses(data as Course[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, []);

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/courses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error(`Failed to create course: ${response.status}`);
      }

      // Reset form
      setFormData({
        schoolId: '',
        code: '',
        title: '',
        description: '',
        gradeLevel: '',
      });
      
      // Refresh courses list
      const refreshedResponse = await fetch('/api/courses');
      if (refreshedResponse.ok) {
        const data = await refreshedResponse.json();
        setCourses(data as Course[]);
        setIsCreating(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    }
  };

  // Loading state
  if (loading) {
    return <div className="p-4">Loading courses...</div>;
  }

  // Error state
  if (error) {
    return (
      <div className="p-4">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Course Catalog</h1>
      
      {/* Courses List */}
      <div className="grid gap-4 mb-8">
        <h2 className="text-xl font-semibold">Available Courses</h2>
        {courses.length === 0 ? (
          <p>No courses available.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map(course => (
              <Card key={course.id}>
                <CardHeader>
                  <CardTitle>{course.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">Code: {course.code}</p>
                  <p className="text-sm text-gray-600">Grade Level: {course.gradeLevel}</p>
                  <p className="text-sm mt-2">{course.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Course Form */}
      <div className="mb-8">
        <Button 
          onClick={() => setIsCreating(!isCreating)}
          variant={isCreating ? "secondary" : "default"}
          className="mb-4"
        >
          {isCreating ? 'Cancel' : 'Create New Course'}
        </Button>

        {isCreating && (
          <Card>
            <CardHeader>
              <CardTitle>Create New Course</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="schoolId">School ID</Label>
                  <Input
                    id="schoolId"
                    name="schoolId"
                    value={formData.schoolId}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="code">Course Code</Label>
                  <Input
                    id="code"
                    name="code"
                    value={formData.code}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="title">Course Title</Label>
                  <Input
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                  />
                </div>

                <div>
                  <Label htmlFor="gradeLevel">Grade Level</Label>
                  <Input
                    id="gradeLevel"
                    name="gradeLevel"
                    value={formData.gradeLevel}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <Button type="submit">Create Course</Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}