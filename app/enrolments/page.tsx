'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Enrolment, Student, Class } from '@/lib/education/types';

export default function EnrolmentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [enrolments, setEnrolments] = useState<Enrolment[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load data
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch students
        const studentsResponse = await fetch('/api/students');
        if (!studentsResponse.ok) throw new Error('Failed to fetch students');
        const studentsData: Student[] = await studentsResponse.json();
        setStudents(studentsData);

        // Fetch classes  
        const classesResponse = await fetch('/api/classes');
        if (!classesResponse.ok) throw new Error('Failed to fetch classes');
        const classesData: Class[] = await classesResponse.json();
        setClasses(classesData);
        
        // Set first class as default
        if (classesData.length > 0) {
          setSelectedClassId(classesData[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    };

    fetchData();
  }, []);

  // Load enrolments when class changes
  useEffect(() => {
    const fetchEnrolments = async () => {
      if (!selectedClassId) return;
      
      try {
        const response = await fetch(`/api/enrolments?classId=${selectedClassId}`);
        if (!response.ok) throw new Error('Failed to fetch enrolments');
        const enrolmentsData: Enrolment[] = await response.json();
        setEnrolments(enrolmentsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    };

    fetchEnrolments();
  }, [selectedClassId]);

  const handleEnrolStudent = async (studentId: string) => {
    if (!selectedClassId) return;
    
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/enrolments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          studentId,
          classId: selectedClassId,
        }),
      });

      if (!response.ok) {
        const errorData: { message?: string } = await response.json();
        throw new Error(errorData.message || 'Failed to enrol student');
      }

      // Refresh enrolments list
      const enrolmentsResponse = await fetch(`/api/enrolments?classId=${selectedClassId}`);
      if (enrolmentsResponse.ok) {
        const enrolmentsData: Enrolment[] = await enrolmentsResponse.json();
        setEnrolments(enrolmentsData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (enrolmentId: string, status: 'withdrawn' | 'completed') => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/enrolments/${enrolmentId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        const errorData: { message?: string } = await response.json();
        throw new Error(errorData.message || 'Failed to update enrolment');
      }

      // Refresh enrolments list
      const enrolmentsResponse = await fetch(`/api/enrolments?classId=${selectedClassId}`);
      if (enrolmentsResponse.ok) {
        const enrolmentsData: Enrolment[] = await enrolmentsResponse.json();
        setEnrolments(enrolmentsData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle>Student Enrolments</CardTitle>
          <CardDescription>Enrol students in classes and manage their enrolments</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-4 bg-red-100 text-red-700 rounded">
              {error}
            </div>
          )}

          {/* Class Selector */}
          <div className="mb-8">
            <Label htmlFor="class-select">Select Class</Label>
            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
              <SelectTrigger id="class-select" className="w-[300px]">
                <SelectValue placeholder="Choose a class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Enrol New Student */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Enrol New Student</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="student-select">Select Student</Label>
                  <Select disabled={isSubmitting}>
                    <SelectTrigger id="student-select" className="w-full">
                      <SelectValue placeholder="Choose a student" />
                    </SelectTrigger>
                    <SelectContent>
                      {students
                        .filter(student => {
                          // Filter out students already enrolled in this class
                          return !enrolments.some(e => e.studentId === student.id && e.classId === selectedClassId);
                        })
                        .map((student) => (
                          <SelectItem key={student.id} value={student.id}>
                            {student.firstName} {student.lastName}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button 
                    onClick={() => {
                      const select = document.getElementById('student-select') as HTMLInputElement;
                      if (select && select.value) {
                        handleEnrolStudent(select.value);
                      }
                    }} 
                    disabled={isSubmitting || !selectedClassId}
                  >
                    Enrol Student
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Enrolments List */}
          <Card>
            <CardHeader>
              <CardTitle>Enrolments</CardTitle>
            </CardHeader>
            <CardContent>
              {enrolments.length === 0 ? (
                <p className="text-gray-500">No enrolments found for this class.</p>
              ) : (
                <div className="space-y-4">
                  {enrolments.map((enrolment) => {
                    const student = students.find(s => s.id === enrolment.studentId);
                    return (
                      <div key={enrolment.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <h3 className="font-medium">
                            {student ? `${student.firstName} ${student.lastName}` : 'Unknown Student'}
                          </h3>
                          <p className="text-sm text-gray-500">
                            Status: 
                            <Badge className="ml-2" variant={enrolment.status === 'active' ? 'default' : enrolment.status === 'completed' ? 'secondary' : 'destructive'}>
                              {enrolment.status}
                            </Badge>
                          </p>
                        </div>
                        <div className="flex space-x-2">
                          {enrolment.status === 'active' && (
                            <>
                              <Button
                                variant="outline"
                                onClick={() => handleUpdateStatus(enrolment.id, 'withdrawn')}
                                disabled={isSubmitting}
                              >
                                Withdraw
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => handleUpdateStatus(enrolment.id, 'completed')}
                                disabled={isSubmitting}
                              >
                                Complete
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}