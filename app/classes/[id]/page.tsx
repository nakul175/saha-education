'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AppShell } from '@/components/app-shell';
import type { Class, Student, Enrolment, Principal } from '@/lib/education/types';
import { getPrincipal } from '@/lib/education/client-api';

export default function ClassDetailPage({ params }: { 
  params: Promise<{ id: string }> 
}) {
  const [classData, setClassData] = useState<Class | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [enrolments, setEnrolments] = useState<Enrolment[]>([]);
  const [loading, setLoading] = useState(true);
  const [principal, setPrincipal] = useState<Principal | null>(null);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        const { id } = await params;
        const principalData = await getPrincipal();
        setPrincipal(principalData);
        
        // Fetch class data
        const classResponse = await fetch(`/api/classes/${id}`);
        if (!classResponse.ok) {
          throw new Error('Failed to fetch class data');
        }
        const classInfo: Class = await classResponse.json();
        setClassData(classInfo);
        
        // Fetch students and enrolments for this class
        const enrolmentsResponse = await fetch(`/api/enrolments?classId=${id}`);
        if (!enrolmentsResponse.ok) {
          throw new Error('Failed to fetch enrolments');
        }
        const enrolmentsData: Enrolment[] = await enrolmentsResponse.json();
        setEnrolments(enrolmentsData);
        
        // Get all student IDs from enrolments
        const studentIds = enrolmentsData.map(e => e.studentId);
        if (studentIds.length > 0) {
          const studentPromises = studentIds.map(id => 
            fetch(`/api/students/${id}`).then(res => res.json())
          );
          const studentsData = await Promise.all(studentPromises);
          setStudents(studentsData as Student[]);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [params]);
  
  if (loading) {
    return (
      <AppShell principal={principal}>
        <div className="flex justify-center items-center h-64">
          <p>Loading class details...</p>
        </div>
      </AppShell>
    );
  }
  
  if (!classData) {
    return (
      <AppShell principal={principal}>
        <div className="flex justify-center items-center h-64">
          <p>Class not found</p>
        </div>
      </AppShell>
    );
  }
  
  return (
    <AppShell principal={principal}>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">{classData.name}</h1>
            <p className="text-muted-foreground">Class Details</p>
          </div>
          <Button 
            variant="outline" 
            onClick={() => window.location.href = `/classes/${classData.id}/attendance`}
          >
            View Attendance
          </Button>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Class Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold">Term</h3>
              <p>{classData.term}</p>
            </div>
            <div>
              <h3 className="font-semibold">Course ID</h3>
              <p>{classData.courseId}</p>
            </div>
            <div>
              <h3 className="font-semibold">Teacher ID</h3>
              <p>{classData.teacherId}</p>
            </div>
            <div>
              <h3 className="font-semibold">Schedule</h3>
              <p>{classData.schedule || 'Not specified'}</p>
            </div>
            <div>
              <h3 className="font-semibold">Created At</h3>
              <p>{new Date(classData.createdAt).toLocaleDateString()}</p>
            </div>
            <div>
              <h3 className="font-semibold">Updated At</h3>
              <p>{new Date(classData.updatedAt).toLocaleDateString()}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Students in Class ({students.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {students.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Name</th>
                      <th className="text-left p-2">Admission Number</th>
                      <th className="text-left p-2">Grade Level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map(student => (
                      <tr key={student.id} className="border-b">
                        <td className="p-2">{student.firstName} {student.lastName}</td>
                        <td className="p-2">{student.admissionNumber}</td>
                        <td className="p-2">
                          <Badge variant="secondary">{student.gradeLevel}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No students enrolled in this class.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}