'use client';

import { useState, useEffect } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { School } from '@/lib/education/types';

const schoolFormSchema = z.object({
  name: z.string().min(1, 'School name is required'),
  address: z.string().optional(),
});

type SchoolFormValues = z.infer<typeof schoolFormSchema>;

export default function SchoolsPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<SchoolFormValues>({
    resolver: zodResolver(schoolFormSchema),
    defaultValues: {
      name: '',
      address: '',
    },
  });

  useEffect(() => {
    const fetchSchools = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/schools');
        if (!response.ok) {
          throw new Error(`Failed to fetch schools: ${response.status}`);
        }
        const data: School[] = await response.json();
        setSchools(data);
      } catch (err) {
        console.error('Error fetching schools:', err);
        setError('Failed to load schools');
      } finally {
        setLoading(false);
      }
    };

    fetchSchools();
  }, []);

  const onSubmit = async (values: SchoolFormValues) => {
    try {
      setIsCreating(true);
      const response = await fetch('/api/schools', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error(`Failed to create school: ${response.status}`);
      }

      const newSchool: School = await response.json();
      
      // Update state with functional update
      setSchools(prev => [newSchool, ...prev]);
      
      // Reset form
      form.reset();
      
      // Close dialog after successful creation
      setIsCreating(false);
      
    } catch (err) {
      console.error('Error creating school:', err);
      setError('Failed to create school');
      setIsCreating(false);
    }
  };

  return (
    <AppShell principal={null}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Schools</h1>
          <p className="text-muted-foreground mt-2">
            Manage educational institutions
          </p>
        </div>

        {/* Create */}
        <div className="flex justify-end">
          <Dialog>
            <DialogTrigger asChild>
              <Button>Create School</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Create New School</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>School Name</FormLabel>
                        <FormControl>
                          <Input placeholder="School Name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Input placeholder="School Address" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {error && (
                    <div className="text-red-500 text-sm">{error}</div>
                  )}
                  
                  <Button type="submit" disabled={isCreating}>
                    {isCreating ? 'Creating...' : 'Create School'}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Schools Table */}
        <Card>
          <CardHeader>
            <CardTitle>Schools</CardTitle>
            <CardDescription>
              {schools.length} school{schools.length !== 1 ? 's' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center items-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : error ? (
              <div className="text-red-500 text-center py-4">{error}</div>
            ) : schools.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No schools found
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schools.map((school) => (
                    <TableRow key={school.id}>
                      <TableCell className="font-medium">
                        {school.name}
                      </TableCell>
                      <TableCell>{school.address || '-'}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm">View</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}