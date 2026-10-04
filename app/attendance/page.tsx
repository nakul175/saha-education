'use client';

import { useState, useEffect } from 'react';
import { listClasses } from '@/lib/education/classes';
import { listAttendance } from '@/lib/education/attendance';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@/components/ui/table';

export default function AttendancePage() {
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [attendanceData, setAttendanceData] = useState<Record<string, { studentId: string; date: string; status: string }[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load classes on component mount
  useEffect(() => {
    const loadClasses = async () => {
      try {
        const classList = await listClasses();
        setClasses(classList);
        
        if (classList.length > 0) {
          setSelectedClassId(classList[0].id);
        }
      } catch (err) {
        setError('Failed to load classes');
        console.error(err);
      }
    };

    loadClasses();
  }, []);

  // Load attendance data when class changes
  useEffect(() => {
    const loadAttendanceData = async () => {
      if (!selectedClassId) return;
      
      setLoading(true);
      setError(null);
      
      try {
        // Get all students in this class
        const attendanceRecords = await listAttendance({ classId: selectedClassId });
        
        // Group records by student ID
        const groupedData: Record<string, { studentId: string; date: string; status: string }[]> = {};
        attendanceRecords.forEach(record => {
          if (!groupedData[record.studentId]) {
            groupedData[record.studentId] = [];
          }
          groupedData[record.studentId].push(record);
        });
        
        setAttendanceData(groupedData);
      } catch (err) {
        setError('Failed to load attendance data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadAttendanceData();
  }, [selectedClassId]);

  // Calculate attendance percentage for a student
  const calculateAttendancePercentage = (records: { studentId: string; date: string; status: string }[]): number => {
    if (records.length === 0) return 0;
    
    const attended = records.filter(record => 
      record.status === 'present' || record.status === 'late'
    ).length;
    
    return Math.round((attended / records.length) * 100);
  };

  // Format date for display
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle>Attendance Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-6 flex items-center gap-4">
            <div className="w-full">
              <label className="block text-sm font-medium mb-2">Select Class</label>
              <Select value={selectedClassId || ''} onValueChange={setSelectedClassId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map(cls => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => setSelectedClassId(null)} variant="outline">
              Refresh
            </Button>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-md">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-8">Loading attendance data...</div>
          ) : selectedClassId && attendanceData ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Student</TableCell>
                  <TableCell>Attendance %</TableCell>
                  <TableCell>Days Recorded</TableCell>
                  <TableCell>Last Attendance</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(attendanceData).map(([studentId, records]) => {
                  const attendancePercentage = calculateAttendancePercentage(records);
                  const latestRecord = records.sort((a, b) => 
                    new Date(b.date).getTime() - new Date(a.date).getTime()
                  )[0];
                  
                  return (
                    <TableRow key={studentId}>
                      <TableCell className="font-medium">
                        {/* In a real app, you would fetch student details here */}
                        Student {studentId.substring(0, 6)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{attendancePercentage}%</span>
                          <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${
                                attendancePercentage >= 80 ? 'bg-green-500' : 
                                attendancePercentage >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${attendancePercentage}%` }}
                            ></div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{records.length}</TableCell>
                      <TableCell>
                        {latestRecord ? formatDate(latestRecord.date) : 'N/A'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">Select a class to view attendance data</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}