'use client';

import { useState, useEffect } from 'react';
import { Guardian } from '@/lib/education/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function GuardiansPage() {
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    relationship: '',
  });

  const fetchGuardians = async () => {
    try {
      const response = await fetch('/api/guardians');
      if (!response.ok) {
        throw new Error('Failed to fetch guardians');
      }
      const data: Guardian[] = await response.json();
      setGuardians(data);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchGuardians();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const response = await fetch('/api/guardians', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Failed to create guardian');
      }

      // Reset form
      setFormData({
        name: '',
        phone: '',
        email: '',
        relationship: '',
      });

      // Refresh the list
      fetchGuardians();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading guardians...</div>;
  }

  if (error) {
    return <div className="text-red-500 p-4">Error: {error}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Guardians</h1>
        <p className="text-muted-foreground">Manage guardians and their information</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add New Guardian</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
              />
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
              />
            </div>

            <div>
              <Label htmlFor="relationship">Relationship *</Label>
              <Textarea
                id="relationship"
                name="relationship"
                value={formData.relationship}
                onChange={handleChange}
                required
              />
            </div>

            <Button type="submit">Create Guardian</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Guardians List</CardTitle>
        </CardHeader>
        <CardContent>
          {guardians.length === 0 ? (
            <p className="text-muted-foreground">No guardians found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Name</th>
                    <th className="text-left p-2">Phone</th>
                    <th className="text-left p-2">Email</th>
                    <th className="text-left p-2">Relationship</th>
                  </tr>
                </thead>
                <tbody>
                  {guardians.map((guardian) => (
                    <tr key={guardian.id} className="border-b">
                      <td className="p-2">{guardian.name}</td>
                      <td className="p-2">{guardian.phone || '-'}</td>
                      <td className="p-2">{guardian.email || '-'}</td>
                      <td className="p-2">{guardian.relationship}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}