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
import type { RegistryCreationReceipt, RegistryCreationResult } from '@/lib/education/registry-create';
import { Textarea } from '@/components/ui/textarea';
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
type PendingStudentCreation = { id: string; endpoint: string; body: string; values: StudentFormValues; actorKey: string; reason: string };

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
  const [receipt, setReceipt] = useState<{ value: RegistryCreationReceipt; actorKey: string } | null>(null);
  const [pendingView, setPendingView] = useState<PendingStudentCreation | null>(null);
  const [reason, setReason] = useState('');
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [conflict, setConflict] = useState(false);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const createInFlight = useRef(false);
  const currentScope = useRef<string | null>(null);
  const draftScope = useRef<string | null>(null);
  const pendingCreate = useRef<PendingStudentCreation | null>(null);

  const fetchStudents = useCallback(async () => {
    const requestGeneration = ++generation.current;
    controller.current?.abort();
    const nextController = new AbortController(); controller.current = nextController;
    const current = () => mounted.current && generation.current === requestGeneration;
    setSearchTerm(''); setLoading(true); setError(null); setPrincipal(null); setStudents([]);
    currentScope.current = null;
    try {
      const actor = await readRegistryResponse(await fetch('/api/session', { cache: 'no-store', signal: nextController.signal })) as Principal;
      if (!current()) return;
      const data = await readRegistryResponse(await fetch('/api/students', { cache: 'no-store', signal: nextController.signal })) as Student[];
      if (!current()) return;
      const verifiedActor = await readRegistryResponse(await fetch('/api/session', { cache: 'no-store', signal: nextController.signal })) as Principal;
      if (!current()) return;
      if (!actor.id || scopeKey(actor) !== scopeKey(verifiedActor) || !Array.isArray(data)) throw new Error('Account changed during reload');
      const key = scopeKey(actor);
      if (!pendingCreate.current && draftScope.current !== key) { form.reset(); setReason(''); setReviewConfirmed(false); setCreateError(null); }
      draftScope.current = key; currentScope.current = key;
      setPrincipal(actor); setStudents(data); setError(null); setConflict(false);
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
  const hidePrivateView = () => {
    cancelPendingLoad(); currentScope.current = null;
    setPrincipal(null); setStudents([]); setLoading(false); setDialogOpen(false);
  };
  useEffect(() => {
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchStudents();
    return () => { mounted.current = false; cancelPendingLoad(); };
  }, [fetchStudents, cancelPendingLoad]);

  const executeCreation = async (request: PendingStudentCreation, firstSend: boolean) => {
    if (createInFlight.current) return;
    const actor = principal;
    if (!actor || actor.role !== 'admin' || currentScope.current !== request.actorKey || scopeKey(actor) !== request.actorKey) return;
    createInFlight.current = true; setIsCreating(true); setCreateError(null);
    let sent = false;
    try {
      const verifiedActor = await readRegistryResponse(await fetch('/api/session', { cache: 'no-store' })) as Principal;
      if (scopeKey(verifiedActor) !== request.actorKey) throw new RegistryResponseError(403);
      sent = true;
      const response = await fetch(request.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: request.body });
      const result = await readRegistryResponse(response) as RegistryCreationResult;
      const saved = result?.receipt, original = request.values;
      if (![200, 201].includes(response.status) || result.replayed !== (response.status === 200) || !saved || saved.kind !== 'student'
        || saved.id !== request.id || saved.createdBy !== actor.id || saved.schoolId !== actor.schoolId || saved.reason !== request.reason
        || !saved.profile || typeof saved.profile.id !== 'string' || !saved.profile.id || saved.profile.schoolId !== actor.schoolId || saved.profile.userId !== null
        || saved.profile.firstName !== original.firstName || saved.profile.lastName !== original.lastName || saved.profile.dateOfBirth !== original.dateOfBirth
        || saved.profile.admissionNumber !== original.admissionNumber || saved.profile.gradeLevel !== original.gradeLevel
        || typeof saved.createdAt !== 'string' || !Number.isFinite(Date.parse(saved.createdAt)) || saved.profile.createdAt !== saved.createdAt || saved.profile.updatedAt !== saved.createdAt) throw new Error('Unconfirmed creation receipt');
      if (!mounted.current) return;
      pendingCreate.current = null; setPendingView(null); setReceipt({ value: saved, actorKey: request.actorKey });
      setConfirmed(true); setDialogOpen(false); form.reset(); setReason(''); setReviewConfirmed(false); setConflict(false);
      await fetchStudents();
    } catch (cause) {
      if (!mounted.current) return;
      setDialogOpen(false);
      if (firstSend && !sent) {
        pendingCreate.current = null; setPendingView(null); setReviewConfirmed(false);
        setCreateError('Could not verify create access. Reload before creating a profile.'); hidePrivateView();
      } else if (cause instanceof RegistryResponseError && [400, 409].includes(cause.status)) {
        pendingCreate.current = null; setPendingView(null); setReviewConfirmed(false);
        if (cause.status === 409) {
          setConflict(true); setCreateError('The reviewed creation conflicted with current records or access. Reload and review the retained fields before submitting a new request.'); hidePrivateView();
        } else setCreateError('The profile was rejected. Check the retained fields and review again before submitting.');
      } else {
        setCreateError('The create outcome could not be confirmed. Reload with the original administrator account, then retry the exact pending request.'); hidePrivateView();
      }
    } finally { createInFlight.current = false; if (mounted.current) setIsCreating(false); }
  };

  const onSubmit = async (values: StudentFormValues) => {
    if (createInFlight.current || pendingCreate.current || conflict) return;
    const actor = principal, reviewedReason = reason.trim();
    if (!actor || actor.role !== 'admin' || !actor.schoolId || currentScope.current !== scopeKey(actor)) return;
    if (!reviewConfirmed || Array.from(reviewedReason).length < 10 || Array.from(reviewedReason).length > 500 || reviewedReason.includes('\0')) {
      setCreateError('Review the profile and give a reason of 10 to 500 characters before creating it.'); return;
    }
    const id = crypto.randomUUID();
    const request: PendingStudentCreation = { id, endpoint: '/api/registry/students', actorKey: scopeKey(actor), values: { ...values }, reason: reviewedReason,
      body: JSON.stringify({ clientRequestId: id, reviewConfirmed: true, reason: reviewedReason, profile: { ...values } }) };
    pendingCreate.current = request; setPendingView(request); setConfirmed(false); setReceipt(null);
    await executeCreation(request, true);
  };
  const retryAvailable = !!pendingView && !!principal && principal.role === 'admin' && !loading && !error
    && scopeKey(principal) === pendingView.actorKey;
  const receiptAvailable = !!receipt && !!principal && !loading && !error && scopeKey(principal) === receipt.actorKey;

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
      {confirmed && <p role="status">Student profile was saved. The original receipt is separate from the current registry.{error ? ' The list refresh failed; reload to see current profiles.' : ''}</p>}
      {receiptAvailable && receipt?.value.kind === 'student' && <section aria-label="Original student creation receipt" className="space-y-1 rounded border p-3 break-words">
        <h2 className="font-semibold">Original student creation receipt</h2>
        <p>{receipt.value.profile.firstName} {receipt.value.profile.lastName}; admission number {receipt.value.profile.admissionNumber}.</p>
        <p>Request {receipt.value.id}. Created {receipt.value.createdAt}. Original profile started without a sign-in account.</p>
        <p>Reason: {receipt.value.reason}</p>
      </section>}
      {createError && <p role="alert" className="break-words text-red-600">{createError}</p>}
      {pendingView && <div className="space-y-3 rounded border p-3">
        <p>Your reviewed creation is pending. Its original request stays unchanged. This screen never retries it automatically. A hard reload currently discards the in-page pending request.</p>
        {retryAvailable ? <>
          <p className="break-words">Submitted student: {pendingView.values.firstName} {pendingView.values.lastName}; admission number {pendingView.values.admissionNumber}. Request {pendingView.id}.</p>
          <Button type="button" variant="outline" className="h-auto whitespace-normal" disabled={isCreating} onClick={() => { if (pendingCreate.current) void executeCreation(pendingCreate.current, false); }}>Retry pending student creation</Button>
        </> : <p>Reload with the original administrator account before retrying. <a href="/login" target="_blank" rel="noreferrer" className="underline">Sign in in another tab</a> if needed.</p>}
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
          
          {principal?.role === 'admin' && !pendingView && !conflict && <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>Create Student</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Student</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={event => { void form.handleSubmit(onSubmit)(event); }} onChange={event => { if (!(event.target instanceof HTMLInputElement) || event.target.type !== 'checkbox') setReviewConfirmed(false); }} className="space-y-4">
                  <fieldset disabled={isCreating || !!pendingView || conflict} className="space-y-4">
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
                  

                  
                  <div className="space-y-2">
                    <label htmlFor="student-create-reason" className="font-medium">Reason for creating this profile</label>
                    <Textarea id="student-create-reason" value={reason} onChange={event => setReason(event.target.value)} aria-describedby="student-create-reason-help" />
                    <p id="student-create-reason-help" className="text-sm text-muted-foreground">10 to 500 characters. {Array.from(reason.trim()).length} entered.</p>
                    <label className="flex items-start gap-2"><input type="checkbox" checked={reviewConfirmed} onChange={event => setReviewConfirmed(event.target.checked)} />I reviewed these details and confirm creating an unlinked student profile.</label>
                  </div>
                  {createError && <p role="alert" className="break-words text-red-600">{createError}</p>}
                  <Button type="submit" disabled={isCreating || !!pendingView || conflict}>
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
