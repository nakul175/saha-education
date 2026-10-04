'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AppShell } from '@/components/app-shell';
import type { SelectAssessment, SelectStudent } from '@/db/schema';

// Define a type that includes student results
type StudentWithResults = SelectStudent & {
  results?: {
    score: number;
    feedback: string | null;
  };
};

export default function AssessmentResultsPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const [assessment, setAssessment] = useState<SelectAssessment | null>(null);
  const [students, setStudents] = useState<StudentWithResults[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    // Resolving the params promise here 
    params.then(async (resolved) => {
      try {
        const assessmentResponse = await fetch(`/api/assessments/${resolved.id}`);
        if (!assessmentResponse.ok) {
          throw new Error('Failed to fetch assessment');
        }
        const assessmentData: SelectAssessment = await assessmentResponse.json();
        setAssessment(assessmentData);
        
        // Fetch class details which includes enrolled students
        const classResponse = await fetch(`/api/classes/${assessmentData.classId}`);
        if (!classResponse.ok) {
          throw new Error('Failed to fetch class');
        }
        const classData: { enrolledStudents: SelectStudent[] } = await classResponse.json();
        
        // Set student data with default results
        const studentDataWithResults = classData.enrolledStudents.map((student: SelectStudent) => ({
          ...student,
          results: {
            score: 0,
            feedback: ''
          }
        }));
        setStudents(studentDataWithResults);
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    });
  }, []);

  if (loading) {
    return (
      <AppShell principal={null}>
        <div className="flex justify-center items-center h-64">
          <p>Loading assessment details...</p>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell principal={null}>
        <div className="flex justify-center items-center h-64">
          <p className="text-red-500">Error: {error}</p>
        </div>
      </AppShell>
    );
  }

  if (!assessment) {
    return (
      <AppShell principal={null}>
        <div className="flex justify-center items-center h-64">
          <p>Assessment not found</p>
        </div>
      </AppShell>
    );
  }

  const handleSave = async () => {
    try {
      const results = students.map(student => ({
        studentId: student.id,
        score: student.results?.score || 0,
        feedback: student.results?.feedback || ''
      }));
      
      const response = await fetch(`/api/assessments/${assessment.id}/results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results })
      });
      
      if (!response.ok) {
        throw new Error('Failed to save results');
      }
      
      alert('Results saved successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while saving');
    }
  };

  const handleScoreChange = (studentId: string, score: number) => {
    setStudents(prevStudents => 
      prevStudents.map(student => 
        student.id === studentId 
          ? { ...student, results: { ...student.results!, score } } 
          : student
      )
    );
  };

  const handleFeedbackChange = (studentId: string, feedback: string) => {
    setStudents(prevStudents => 
      prevStudents.map(student => 
        student.id === studentId 
          ? { ...student, results: { ...student.results!, feedback } } 
          : student
      )
    );
  };

  return (
    <AppShell principal={null}>
      <div className="max-w-6xl mx-auto">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{assessment.title}</CardTitle>
            <CardDescription>
              Assessment info: {assessment.kind}, date: {new Date(assessment.date).toLocaleDateString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="font-medium">Max Score</p>
                <p>{assessment.maxScore}</p>
              </div>
              <div>
                <p className="font-medium">Students Enrolled</p>
                <p>{students.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Student Results</CardTitle>
            <CardDescription>
              Enter scores and feedback for each student
            </CardDescription>
          </CardHeader>
          <CardContent>
            {students.length === 0 ? (
              <p>No students found in this class.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {students.map((student) => (
                  <Card key={student.id} className="p-4">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="font-medium">{student.firstName} {student.lastName}</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Score</label>
                        <Input
                          type="number"
                          min="0"
                          max={assessment.maxScore}
                          value={student.results?.score || 0}
                          onChange={(e) => handleScoreChange(student.id, Number(e.target.value))}
                          className="w-32"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium mb-1">Feedback</label>
                        <Textarea
                          value={student.results?.feedback || ''}
                          onChange={(e) => handleFeedbackChange(student.id, e.target.value)}
                          placeholder="Optional feedback for student"
                          rows={2}
                        />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
            
            <div className="mt-6 flex justify-end">
              <Button 
                onClick={handleSave} 
                className="px-6 py-2"
              >
                Save All Results
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}