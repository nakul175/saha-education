'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type Student = {
  id: string;
  schoolId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  admissionNumber: string;
  gradeLevel: string;
};

type Guardian = {
  id: string;
  name: string;
  relationship: string;
};

export default function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const [student, setStudent] = useState<Student | null>(null);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [availableGuardians, setAvailableGuardians] = useState<Guardian[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGuardianId, setSelectedGuardianId] = useState('');
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get the ID from params
        const { id } = await params;
        
        // Fetch student details
        const studentRes = await fetch(`/api/students/${id}`);
        if (!studentRes.ok) {
          throw new Error('Failed to fetch student');
        }
        const studentData = (await studentRes.json()) as Student;
        setStudent(studentData);

        // Fetch guardians for this student
        const guardiansRes = await fetch(`/api/students/${id}/guardians`);
        if (!guardiansRes.ok) {
          throw new Error('Failed to fetch guardians');
        }
        const guardiansData = (await guardiansRes.json()) as Guardian[];
        setGuardians(guardiansData);

        // Fetch all available guardians (to populate the select dropdown)
        const allGuardiansRes = await fetch('/api/guardians');
        if (!allGuardiansRes.ok) {
          throw new Error('Failed to fetch guardians list');
        }
        const allGuardiansData = (await allGuardiansRes.json()) as Guardian[];
        setAvailableGuardians(allGuardiansData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [params]);

  const handleLinkGuardian = async () => {
    if (!selectedGuardianId) return;
    
    try {
      const { id } = await params;
      
      const response = await fetch(`/api/students/${id}/guardians`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          guardianId: selectedGuardianId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to link guardian');
      }

      // Refresh the guardians list
      const guardiansRes = await fetch(`/api/students/${id}/guardians`);
      if (guardiansRes.ok) {
        const guardiansData = (await guardiansRes.json()) as Guardian[];
        setGuardians(guardiansData);
      }
      
      setSelectedGuardianId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  if (loading) {
    return <div className="container py-6">Loading...</div>;
  }

  if (error) {
    return (
      <div className="container py-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-500">Error: {error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="container py-6">
        <Card>
          <CardContent className="pt-6">
            <p>Student not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Student Profile</h1>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Student Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground">Name</Label>
              <p>{student.firstName} {student.lastName}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Admission Number</Label>
              <p>{student.admissionNumber}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Date of Birth</Label>
              <p>{new Date(student.dateOfBirth).toLocaleDateString()}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Grade Level</Label>
              <p>{student.gradeLevel}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">School</Label>
              <p>{student.schoolId}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Guardians</CardTitle>
        </CardHeader>
        <CardContent>
          {guardians.length === 0 ? (
            <p>No guardians linked to this student.</p>
          ) : (
            <div className="space-y-3">
              {guardians.map((guardian) => (
                <div key={guardian.id} className="flex items-center justify-between p-3 border rounded-md">
                  <div>
                    <p className="font-medium">{guardian.name}</p>
                    <p className="text-sm text-muted-foreground">Relationship: {guardian.relationship}</p>
                  </div>
                  <Badge variant="secondary">Linked</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Link Guardian</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={selectedGuardianId} onValueChange={setSelectedGuardianId}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Select a guardian" />
              </SelectTrigger>
              <SelectContent>
                {availableGuardians.map((guardian) => (
                  <SelectItem key={guardian.id} value={guardian.id}>
                    {guardian.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              onClick={handleLinkGuardian} 
              disabled={!selectedGuardianId}
              className="w-full sm:w-auto"
            >
              Link Guardian
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}