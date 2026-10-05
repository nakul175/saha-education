'use client';

import { useState, useEffect } from 'react';
import { listStudents } from '@/lib/education/client-api';
import { listReportCards, createReportCard, publishReportCard } from '@/lib/education/client-api';
import type { ReportCard } from '@/lib/education/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export default function ReportCardsPage() {
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draftForm, setDraftForm] = useState({
    term: '',
    summary: '',
    overallGrade: ''
  });

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const studentList = await listStudents();
        setStudents(studentList.map(s => ({
          id: s.id,
          name: `${s.firstName} ${s.lastName}`
        })));
      } catch (error) {
        console.error('Failed to fetch students:', error);
      }
    };

    fetchStudents();
  }, []);

  useEffect(() => {
    if (!selectedStudentId) return;

    const fetchReportCards = async () => {
      setLoading(true);
      try {
        const cards = await listReportCards(selectedStudentId);
        setReportCards(cards);
      } catch (error) {
        console.error('Failed to fetch report cards:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchReportCards();
  }, [selectedStudentId]);

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId) return;

    setCreating(true);
    try {
      const newCard = await createReportCard({
        studentId: selectedStudentId,
        term: draftForm.term,
        summary: draftForm.summary,
        overallGrade: draftForm.overallGrade
      });
      
      // Add the new card to the list using type assertion
      setReportCards(prev => [...prev, newCard as ReportCard]);
      setDraftForm({ term: '', summary: '', overallGrade: '' });
    } catch (error) {
      console.error('Failed to create report card:', error);
    } finally {
      setCreating(false);
    }
  };

  const handlePublish = async (id: string) => {
    try {
      const updatedCard = await publishReportCard(id);
      
      // Update the card in the list using type assertion
      setReportCards(prev => 
        prev.map(card => card.id === id ? (updatedCard as ReportCard) : card)
      );
    } catch (error) {
      console.error('Failed to publish report card:', error);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Report Cards</h1>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Select Student</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedStudentId || ''} onValueChange={setSelectedStudentId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a student" />
            </SelectTrigger>
            <SelectContent>
              {students.map(student => (
                <SelectItem key={student.id} value={student.id}>
                  {student.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedStudentId && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Create Draft Report Card</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateDraft} className="space-y-4">
                <div>
                  <Label htmlFor="term">Term</Label>
                  <Input
                    id="term"
                    value={draftForm.term}
                    onChange={(e) => setDraftForm({...draftForm, term: e.target.value})}
                    placeholder="Enter term (e.g., 'First Term', 'Semester 1')"
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="overallGrade">Overall Grade</Label>
                  <Input
                    id="overallGrade"
                    value={draftForm.overallGrade}
                    onChange={(e) => setDraftForm({...draftForm, overallGrade: e.target.value})}
                    placeholder="Enter overall grade (e.g., 'A', 'B+', etc.)"
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="summary">Summary</Label>
                  <Textarea
                    id="summary"
                    value={draftForm.summary}
                    onChange={(e) => setDraftForm({...draftForm, summary: e.target.value})}
                    placeholder="Enter summary of the student's performance"
                    rows={4}
                    required
                  />
                </div>
                
                <Button type="submit" disabled={creating}>
                  {creating ? 'Creating...' : 'Create Draft'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Report Cards</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p>Loading report cards...</p>
              ) : reportCards.length === 0 ? (
                <p>No report cards found for this student.</p>
              ) : (
                <div className="space-y-4">
                  {reportCards.map(card => (
                    <Card key={card.id} className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold">{card.term}</h3>
                          <p className="text-sm text-muted-foreground">Grade: {card.overallGrade}</p>
                          <p className="mt-2">{card.summary}</p>
                          {card.publishedAt && (
                            <p className="mt-2 text-green-600">Published on: {new Date(card.publishedAt).toLocaleDateString()}</p>
                          )}
                        </div>
                        {!card.publishedAt && (
                          <Button 
                            onClick={() => handlePublish(card.id)} 
                            variant="outline"
                            size="sm"
                          >
                            Publish
                          </Button>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}