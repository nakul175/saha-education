'use client';

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { isExactCalendarDate } from '@/lib/education/calendar-date';
import type { Assessment, Class } from '@/lib/education/types';
import { listClasses } from '@/lib/education/client-api';
import { listAssessments } from '@/lib/education/client-api';

export default function AssessmentsPage() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch assessments and classes
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        
        // Fetch all classes for the dropdown
        const fetchedClasses = await listClasses();
        setClasses(fetchedClasses as unknown as Class[]);
        
        // Fetch all assessments
        const fetchedAssessments = await listAssessments();
        setAssessments(fetchedAssessments as unknown as Assessment[]);
      } catch (err) {
        setError('Failed to fetch data');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Filter assessments by selected class
  const filteredAssessments = selectedClassId 
    ? assessments.filter(a => a.classId === selectedClassId)
    : assessments;

  if (isLoading) {
    return <div className="container py-6">Loading assessments...</div>;
  }

  if (error) {
    return (
      <div className="container py-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-500">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Assessments</h1>
          <p className="text-muted-foreground">Manage student assessments and test results</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assessment List</CardTitle>
          <CardDescription>
            Filter by class to view specific assessments
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Class filter dropdown */}
          <div className="mb-4">
            <Label htmlFor="class-filter">Filter by Class</Label>
            <select id="class-filter" value={selectedClassId} onChange={event => setSelectedClassId(event.target.value)}
              className="min-w-0 w-full rounded-md border bg-background px-3 py-2 sm:w-64">
              <option value="">All Classes</option>
              {classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
            </select>
          </div>

          {/* Assessment table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Max Score</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAssessments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center">
                      No assessments found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAssessments.map((assessment) => {
                    const className = classes.find(c => c.id === assessment.classId)?.name || 'Unknown Class';
                    return (
                      <TableRow key={assessment.id} data-assessment-list-item={assessment.id} className="hover:bg-muted/50">
                        <TableCell>
                          <a 
                            href={`/assessments/${assessment.id}`} 
                            className="font-medium text-primary hover:underline"
                          >
                            {assessment.title}
                          </a>
                        </TableCell>
                        <TableCell>{className}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {assessment.kind}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-64 whitespace-normal break-words">{typeof assessment.maxScore === 'number' && Number.isSafeInteger(assessment.maxScore) && assessment.maxScore >= 0
                          ? assessment.maxScore
                          : <span role="status">Stored maximum requires review.</span>}</TableCell>
                        <TableCell className="max-w-64 whitespace-normal break-words">{isExactCalendarDate(assessment.date)
                          ? <time dateTime={assessment.date}>{assessment.date}</time>
                          : <span role="status">Stored date requires review: {String(assessment.date ?? '')}</span>}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
