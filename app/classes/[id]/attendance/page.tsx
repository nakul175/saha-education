'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AppShell } from '@/components/app-shell';
import type { Class, Student, Principal } from '@/lib/education/types';
import { getPrincipal } from '@/lib/education/client-api';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function TakeAttendancePage({ params }: { 
  params: Promise<{ id: string }> 
}) {
  const [classData, setClassData] = useState<Class | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [attendanceStatuses, setAttendanceStatuses] = useState<Record<string, 'present' | 'absent' | 'late' | 'excused'>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { id } = await params;
        const principalData = await getPrincipal();
        
        // Check if user is authorized to take attendance
        if (!principalData) {
          throw new Error('Authentication required');
        }
        setPrincipal(principalData);
        
        // Fetch class data
        const classResponse = await fetch(`/api/classes/${id}`);
        if (!classResponse.ok) {
          throw new Error('Failed to fetch class data');
        }
        const classInfo: Class = await classResponse.json();
        setClassData(classInfo);
        
        // Get students enrolled in this class (using existing functionality)
        if (classInfo.enrolledStudents && classInfo.enrolledStudents.length > 0) {
          setStudents(classInfo.enrolledStudents);
          
          // Initialize attendance statuses for all students
          const initialStatuses: Record<string, 'present' | 'absent' | 'late' | 'excused'> = {};
          classInfo.enrolledStudents.forEach(student => {
            initialStatuses[student.id] = 'present';
          });
          setAttendanceStatuses(initialStatuses);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [params]);

  const handleStatusChange = (studentId: string, status: 'present' | 'absent' | 'late' | 'excused') => {
    setAttendanceStatuses(prev => ({
      ...prev,
      [studentId]: status
    }));
  };

  const saveAttendance = async () => {
    if (!classData?.id) return;
    
    setIsSaving(true);
    
    try {
      // Prepare the entries for API call
      const entries = students.map(student => ({
        studentId: student.id,
        status: attendanceStatuses[student.id] || 'present',
        note: '' // For now, no notes in this basic form
      }));
      
      const response = await fetch('/api/attendance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classId: classData.id,
          date: format(selectedDate, 'yyyy-MM-dd'),
          entries
        }),
      });
      
      if (!response.ok) {
        if (response.status === 409) throw new Error('Class access or active enrolments changed. Reload the class before saving attendance again.');
        const errorData: { error?: string } = await response.json();
        throw new Error(errorData.error || 'Failed to save attendance');
      }
      
      toast.success('Attendance saved successfully');
    } catch (error) {
      console.error('Error saving attendance:', error);
      toast.error((error as Error).message || 'Failed to save attendance');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <AppShell principal={principal}>
        <div className="flex justify-center items-center h-64">
          <p>Loading class and student data...</p>
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
        <div>
          <h1 className="text-3xl font-bold">Take Attendance</h1>
          <p className="text-muted-foreground">
            Record attendance for {classData.name} on {format(selectedDate, 'MMMM d, yyyy')}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Class Information</CardTitle>
            <CardDescription>Attendance for {classData.name}</CardDescription>
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
              <h3 className="font-semibold">Schedule</h3>
              <p>{classData.schedule || 'Not specified'}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Student Roster</CardTitle>
            <CardDescription>
              Mark attendance for each student
            </CardDescription>
          </CardHeader>
          <CardContent>
            {students.length > 0 ? (
              <div className="space-y-4">
                {students.map(student => {
                  const currentStatus = attendanceStatuses[student.id] || 'present';
                  
                  return (
                    <div 
                      key={student.id} 
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="flex flex-col">
                          <span className="font-medium">{student.firstName} {student.lastName}</span>
                          <span className="text-sm text-muted-foreground">
                            {student.admissionNumber}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Select 
                          value={currentStatus} 
                          onValueChange={(value: 'present' | 'absent' | 'late' | 'excused') => 
                            handleStatusChange(student.id, value)
                          }
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="present">Present</SelectItem>
                            <SelectItem value="absent">Absent</SelectItem>
                            <SelectItem value="late">Late</SelectItem>
                            <SelectItem value="excused">Excused</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })}
                
                <div className="pt-4 flex justify-end">
                  <Button 
                    onClick={saveAttendance} 
                    disabled={isSaving}
                    className="w-32"
                  >
                    {isSaving ? 'Saving...' : 'Save Attendance'}
                  </Button>
                </div>
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
