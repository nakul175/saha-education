'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { Student, Principal } from '@/lib/education/types';

const studentFormSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  admissionNumber: z.string().min(1, 'Admission number is required'),
  gradeLevel: z.string().min(1, 'Grade level is required'),
});

type StudentFormValues = z.infer<typeof studentFormSchema>;


const scopeKey = (actor: Principal) => `${actor.id}:${actor.role}:${actor.schoolId ?? ''}`;
class RegistryResponseError extends Error {
  constructor(readonly status: number) { super('Registry request unavailable'); }
}
async function readRegistryResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) throw new RegistryResponseError(response.status);
  return JSON.parse(text);
}
const unknownCreateMessage = 'The create outcome could not be confirmed. This API has no safe automatic retry. Reload the current list and compare before deciding whether to create again.';

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const form = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      admissionNumber: '',
      gradeLevel: '',
    },
  });

  const [createError, setCreateError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [comparisonReady, setComparisonReady] = useState(false);
  const [compared, setCompared] = useState(false);
  const [pendingView, setPendingView] = useState<{ values: StudentFormValues; actorKey: string } | null>(null);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const createInFlight = useRef(false);
  const currentScope = useRef<string | null>(null);
  const draftScope = useRef<string | null>(null);
  const pendingCreate = useRef<{ values: StudentFormValues; actorKey: string } | null>(null);

  const fetchStudents = useCallback(async () => {
    const requestGeneration = ++generation.current;
    controller.current?.abort();
    const nextController = new AbortController(); controller.current = nextController;
    const current = () => mounted.current && generation.current === requestGeneration;
    setSearchTerm('');
    setLoading(true); setError(null); setPrincipal(null); setStudents([]);
    currentScope.current = null; setComparisonReady(false); setCompared(false);
    try {
      const actor = await readRegistryResponse(await fetch('/api/session', { cache: 'no-store', signal: nextController.signal })) as Principal;
      if (!current()) return;
      const data = await readRegistryResponse(await fetch('/api/students', { cache: 'no-store', signal: nextController.signal })) as Student[];
      if (!current()) return;
      const verifiedActor = await readRegistryResponse(await fetch('/api/session', { cache: 'no-store', signal: nextController.signal })) as Principal;
      if (!current()) return;
      if (!actor.id || scopeKey(actor) !== scopeKey(verifiedActor) || !Array.isArray(data)) throw new Error('Account changed during reload');
      const key = scopeKey(actor);
      if (!pendingCreate.current && draftScope.current !== key) { form.reset(); setCreateError(null); }
      draftScope.current = key; currentScope.current = key;
      setPrincipal(actor); setStudents(data); setError(null);
      setComparisonReady(!!pendingCreate.current && pendingCreate.current.actorKey === key && actor.role === 'admin');
    } catch (cause) {
      if (!current() || nextController.signal.aborted) return;
      setStudents([]); setPrincipal(null); currentScope.current = null;
      if (cause instanceof RegistryResponseError && cause.status === 401) {
        setError('Sign in to reload the current registry.');
        if (!pendingCreate.current) window.location.assign(new URL('/login', window.location.origin).href);
      } else if (cause instanceof RegistryResponseError && [403, 404].includes(cause.status)) {
        setError('Current registry access is unavailable. Reload after your access is restored.');
      } else setError('Could not reload the current students. Try reloading again.');
    } finally { if (current()) setLoading(false); }
  }, [form]);

  const cancelPendingLoad = useCallback(() => { generation.current++; controller.current?.abort(); }, []);

  useEffect(() => {
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchStudents();
    return () => { mounted.current = false; cancelPendingLoad(); };
  }, [fetchStudents, cancelPendingLoad]);

  const onSubmit = async (values: StudentFormValues) => {
    if (createInFlight.current || pendingCreate.current) return;
    const actor = principal;
    if (!actor || actor.role !== 'admin' || !actor.schoolId || currentScope.current !== scopeKey(actor)) return;
    createInFlight.current = true; setIsCreating(true); setCreateError(null); setConfirmed(false);
    const originalKey = scopeKey(actor);
    pendingCreate.current = { values: { ...values }, actorKey: originalKey };
    setPendingView({ values: { ...values }, actorKey: originalKey });
    let createSent = false;
    try {
      const verifiedActor = await readRegistryResponse(await fetch('/api/session', { cache: 'no-store' })) as Principal;
      if (scopeKey(verifiedActor) !== originalKey) {
        pendingCreate.current = null; setPendingView(null); setPrincipal(null); setStudents([]); currentScope.current = null;
        setCreateError('The account changed. Reload before creating a profile.'); return;
      }
      createSent = true;
      const response = await fetch('/api/students', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, schoolId: actor.schoolId }) });
      const record = await readRegistryResponse(response) as Student;
      if (response.status !== 201 || !record || typeof record.id !== 'string' || !record.id || record.schoolId !== actor.schoolId || !(record.admissionNumber === values.admissionNumber && record.firstName === values.firstName && record.lastName === values.lastName && record.dateOfBirth === values.dateOfBirth && record.gradeLevel === values.gradeLevel)) throw new Error('Unconfirmed create acknowledgement');
      if (!mounted.current) return;
      pendingCreate.current = null; setPendingView(null); setUncertain(false); setConfirmed(true); setDialogOpen(false); form.reset();
      await fetchStudents();
    } catch (cause) {
      if (!mounted.current) return;
      if (!createSent) {
        pendingCreate.current = null; setPendingView(null); setCreateError('Could not verify create access. Reload before creating a profile.');
        controller.current?.abort(); generation.current++; currentScope.current = null;
        setPrincipal(null); setStudents([]); setLoading(false);
      } else if (cause instanceof RegistryResponseError && cause.status === 400) {
        pendingCreate.current = null; setPendingView(null); setDialogOpen(false); setCreateError('The profile was rejected. Check the fields before submitting again.');
      } else {
        setDialogOpen(false); setUncertain(true); setComparisonReady(false); setCompared(false); setCreateError(unknownCreateMessage);
        controller.current?.abort(); generation.current++; currentScope.current = null;
        setPrincipal(null); setStudents([]); setLoading(false);
      }
    } finally { createInFlight.current = false; if (mounted.current) setIsCreating(false); }
  };

  const startNewDraft = () => {
    if (!comparisonReady || !compared || !principal || pendingCreate.current?.actorKey !== scopeKey(principal)) return;
    pendingCreate.current = null; setPendingView(null); setUncertain(false); setComparisonReady(false); setCompared(false); setCreateError(null); form.reset();
  };

  const normalizedSearch = searchTerm.trim().toLocaleLowerCase();
  const matches = students.filter(student => `${student.firstName} ${student.lastName} ${student.admissionNumber}`.toLocaleLowerCase().includes(normalizedSearch));
  const visibleStudents = matches.slice(0, 200);

  return (
    <AppShell principal={principal}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Student Registry</h1>
          <p className="text-muted-foreground mt-2">
            Manage student records and enrollments
          </p>
        </div>

      <p className="text-sm text-muted-foreground">New profiles start without a sign-in account. School administrators can link or unlink accounts through <a href="/admin/profile-links" className="underline">reviewed profile links</a>.</p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={() => void fetchStudents()} disabled={isCreating}>Reload students</Button>
        {loading && <p role="status">Loading current students…</p>}
      </div>
      {error && <p role="alert" className="text-red-600">{error}</p>}
      {confirmed && <p role="status">Student profile was saved.{error ? ' The list refresh failed; reload to see current profiles.' : ''}</p>}
      {createError && <p role="alert" className="break-words text-red-600">{createError}</p>}
      {uncertain && <div className="space-y-3 rounded border p-3">
        <p>Your earlier create is unresolved. This screen will not send it again automatically. Submitted details stay private to the original account. A hard reload discards this in-page reminder.</p>
        {comparisonReady && <>
          <p className="break-words">Submitted student: {pendingView?.values.firstName} {pendingView?.values.lastName}; admission number {pendingView?.values.admissionNumber}.</p>
          <label className="flex items-start gap-2"><input type="checkbox" checked={compared} onChange={event => setCompared(event.target.checked)} />I compared the reloaded list and understand a new create can duplicate a saved profile.</label>
          <Button type="button" variant="outline" className="h-auto whitespace-normal" disabled={!compared} onClick={startNewDraft}>Finish comparison and start a new draft</Button>
        </>}
        {!comparisonReady && <p>Reload the list with the original administrator account before comparison. <a href="/login" target="_blank" rel="noreferrer" className="underline">Sign in in another tab</a> if needed.</p>}
      </div>}

        {/* Search and Create */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div className="flex-1 max-w-sm">
            <Input
              id="registry-student-search"
              aria-label="Search students by name or admission number"
              maxLength={200}
              placeholder="Search name or admission number"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value.slice(0, 200))}
              className="w-full"
            />
          </div>
          
          {principal?.role === 'admin' && !uncertain && (!pendingView || pendingView.actorKey === scopeKey(principal)) && <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>Create Student</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Create New Student</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={event => { void form.handleSubmit(onSubmit)(event); }} className="space-y-4">
                  <fieldset disabled={isCreating || uncertain} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dateOfBirth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date of Birth</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="admissionNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Admission Number</FormLabel>
                        <FormControl>
                          <Input placeholder="12345" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="gradeLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Grade Level</FormLabel>
                        <FormControl>
                          <Input placeholder="10" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  

                  
                  <Button type="submit" disabled={isCreating || uncertain}>
                    {isCreating ? 'Creating...' : 'Create Student'}
                  </Button>
                  </fieldset>
                </form>
              </Form>
            </DialogContent>
          </Dialog>}
        </div>

        <p className="text-sm text-muted-foreground">Search covers names and admission numbers in the current authorized list. Showing up to 200 matching profiles.</p>

        {/* Students Table */}
        <Card>
          <CardHeader>
            <CardTitle>Students</CardTitle>
            <CardDescription>
              {visibleStudents.length} shown · {matches.length} matching · {students.length} loaded authorized profiles
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center items-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : error ? (
              <div className="text-red-500 text-center py-4">{error}</div>
            ) : visibleStudents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No students found
              </div>
            ) : (
              <div className="overflow-x-auto" data-registry-list><Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Admission Number</TableHead>
                    <TableHead>Grade Level</TableHead>
                    <TableHead>Date of Birth</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleStudents.map((student) => (
                    <TableRow key={student.id} data-student-id={student.id}>
                      <TableCell className="font-medium">
                        {student.firstName} {student.lastName}
                      </TableCell>
                      <TableCell>{student.admissionNumber}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{student.gradeLevel}</Badge>
                      </TableCell>
                      <TableCell>{new Date(student.dateOfBirth).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <a href={`/students/${student.id}`}>
                          <Button variant="outline" size="sm">View</Button>
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table></div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
