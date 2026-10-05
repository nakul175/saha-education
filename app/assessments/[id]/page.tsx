'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AppShell } from '@/components/app-shell';
import type { SelectAssessment, SelectStudent } from '@/db/schema';
import { assessmentEditorChanges, buildAssessmentEditor } from '@/lib/education/assessment-editor';
import type { AssessmentEditorStudent, SavedAssessmentResult } from '@/lib/education/assessment-editor';

export default function AssessmentResultsPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const [assessment, setAssessment] = useState<SelectAssessment | null>(null);
  const [students, setStudents] = useState<AssessmentEditorStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const resolved = await params;
        const assessmentResponse = await fetch(`/api/assessments/${resolved.id}`);
        if (!assessmentResponse.ok) {
          throw new Error('Failed to fetch assessment');
        }
        const assessmentData: SelectAssessment = await assessmentResponse.json();
        const [classResponse, resultsResponse] = await Promise.all([
          fetch(`/api/classes/${assessmentData.classId}`), fetch(`/api/assessments/${assessmentData.id}/results`),
        ]);
        if (!classResponse.ok) {
          throw new Error('Failed to fetch class');
        }
        const classData: { enrolledStudents: SelectStudent[] } = await classResponse.json();
        if (!resultsResponse.ok) throw new Error('Saved results could not be loaded. Reload before entering results.');
        const savedResults: SavedAssessmentResult[] = await resultsResponse.json();
        const editor = buildAssessmentEditor(classData.enrolledStudents, savedResults);
        if (active) { setAssessment(assessmentData); setStudents(editor); }
        
      } catch (err) {
        if (active) setLoadError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [params]);

  if (loading) {
    return (
      <AppShell principal={null}>
        <div className="flex justify-center items-center h-64">
          <p>Loading assessment details...</p>
        </div>
      </AppShell>
    );
  }

  if (loadError) {
    return (
      <AppShell principal={null}>
        <div className="flex justify-center items-center h-64">
          <p className="text-red-500" role="alert">Error: {loadError}</p>
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
    if (saving || reloadRequired) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const results = assessmentEditorChanges(students, assessment.maxScore);
      if (!results.length) return;
      
      const response = await fetch(`/api/assessments/${assessment.id}/results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results })
      });
      
      if (!response.ok) {
        if (response.status === 409) {
          setReloadRequired(true);
          throw new Error('Records or access changed, or saved results need review. Your edits are retained here. Reload saved results before trying again.');
        }
        throw new Error('Failed to save results');
      }
      
      setStudents(current => current.map(student => ({ ...student, dirty: false })));
      setStatus('Edited results saved successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while saving');
    } finally { setSaving(false); }
  };

  const handleScoreChange = (studentId: string, score: number | null) => {
    setStudents(prevStudents => 
      prevStudents.map(student => 
        student.id === studentId 
          ? { ...student, result: { ...student.result, score }, dirty: true }
          : student
      )
    );
  };

  const handleFeedbackChange = (studentId: string, feedback: string) => {
    setStudents(prevStudents => 
      prevStudents.map(student => 
        student.id === studentId 
          ? { ...student, result: { ...student.result, feedback }, dirty: true }
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
            {error && <p role="alert" className="mb-4 text-red-700">{error}</p>}
            {status && <p role="status" className="mb-4 text-green-700">{status}</p>}
            {reloadRequired && <p className="mb-4"><a className="underline" href={`/assessments/${encodeURIComponent(assessment.id)}`}>Reload saved results</a> (unsaved edits will be discarded).</p>}
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
                        <label htmlFor={`score-${student.id}`} className="block text-sm font-medium mb-1">Score for {student.firstName} {student.lastName}</label>
                        <Input
                          id={`score-${student.id}`}
                          disabled={saving}
                          type="number"
                          min="0"
                          max={assessment.maxScore}
                          value={student.result.score ?? ''}
                          onChange={(e) => handleScoreChange(student.id, e.target.value === '' ? null : Number(e.target.value))}
                          className="w-32"
                        />
                      </div>
                      
                      <div>
                        <label htmlFor={`feedback-${student.id}`} className="block text-sm font-medium mb-1">Feedback for {student.firstName} {student.lastName}</label>
                        <Textarea
                          id={`feedback-${student.id}`}
                          disabled={saving}
                          value={student.result.feedback ?? ''}
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
                disabled={saving || reloadRequired || !students.some(student => student.dirty)}
                className="px-6 py-2"
              >
                {saving ? 'Saving…' : 'Save Edited Results'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
