'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Enrolment, Student, Class, Principal } from '@/lib/education/types';

type PendingAction = {
  actorKey: string;
  classId: string;
  studentId: string;
  studentName: string;
  className: string;
  body: string;
  kind: 'enrol' | 'status';
  status: Enrolment['status'];
  id?: string;
};
const scopeKey = (actor: Principal) => `${actor.id}:${actor.role}:${actor.schoolId ?? ''}`;
class ReadFailure extends Error {
  constructor(readonly status: number) {
    super('Academic request unavailable');
  }
}
async function responseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) throw new ReadFailure(response.status);
  return JSON.parse(text) as T;
}
async function read<T>(path: string, signal?: AbortSignal) {
  return responseJson<T>(await fetch(path, { cache: 'no-store', signal }));
}

export default function EnrolmentsPage() {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [enrolments, setEnrolments] = useState<Enrolment[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [pendingView, setPendingView] = useState<PendingAction | null>(null);
  const [compared, setCompared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const generation = useRef(0),
    controller = useRef<AbortController | null>(null),
    mounted = useRef(true);
  const inFlight = useRef(false),
    currentScope = useRef<string | null>(null),
    selectedClass = useRef('');
  const pending = useRef<PendingAction | null>(null),
    roster = useRef<Enrolment[]>([]);
  const message = useRef<HTMLDivElement>(null);
  const isAdmin = principal?.role === 'admin';

  const invalidate = useCallback(() => {
    generation.current++;
    controller.current?.abort();
  }, []);
  const hidePrivate = useCallback(() => {
    currentScope.current = null;
    roster.current = [];
    setPrincipal(null);
    setStudents([]);
    setClasses([]);
    setEnrolments([]);
    setSelectedStudentId('');
    setReady(false);
    setCompared(false);
  }, []);
  const reload = useCallback(
    async (requestedClass = selectedClass.current) => {
      const ticket = ++generation.current;
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      const current = () => mounted.current && ticket === generation.current && !abort.signal.aborted;
      hidePrivate();
      setLoading(true);
      setError(null);
      setCompared(false);
      try {
        const account = await read<Principal>('/api/session', abort.signal);
        if (!current()) return;
        const outcomes = await Promise.allSettled([
          read<Student[]>('/api/students', abort.signal),
          read<Class[]>('/api/classes', abort.signal),
        ]);
        if (!current()) return;
        for (const outcome of outcomes) if (outcome.status === 'rejected') throw outcome.reason;
        const studentRows = (outcomes[0] as PromiseFulfilledResult<Student[]>).value;
        const classRows = (outcomes[1] as PromiseFulfilledResult<Class[]>).value;
        if (!account.id || !Array.isArray(studentRows) || !Array.isArray(classRows))
          throw new Error('Unconfirmed academic choices');
        const id = classRows.some((row) => row.id === requestedClass)
          ? requestedClass
          : requestedClass
            ? ''
            : (classRows[0]?.id ?? '');
        const rows = id
          ? await read<Enrolment[]>('/api/enrolments?' + new URLSearchParams({ classId: id }), abort.signal)
          : [];
        if (!current()) return;
        const verified = await read<Principal>('/api/session', abort.signal);
        if (!current()) return;
        if (
          scopeKey(account) !== scopeKey(verified) ||
          !Array.isArray(rows) ||
          rows.some((row) => row.classId !== id)
        )
          throw new Error('Account or class changed during reload');
        selectedClass.current = id;
        roster.current = rows;
        currentScope.current = scopeKey(account);
        setSelectedClassId(id);
        setPrincipal(account);
        setStudents(studentRows);
        setClasses(classRows);
        setEnrolments(rows);
        setReady(true);
      } catch (failure) {
        if (!current()) return;
        hidePrivate();
        setError(
          failure instanceof ReadFailure && failure.status === 401
            ? 'Sign in again, then reload current enrolments.'
            : failure instanceof ReadFailure && [403, 404].includes(failure.status)
              ? 'Current academic access is unavailable. Reload after access is restored.'
              : 'Current students, classes and enrolments could not be verified. Reload before continuing.',
        );
      } finally {
        if (current()) setLoading(false);
      }
    },
    [hidePrivate],
  );
  useEffect(() => {
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    return () => {
      mounted.current = false;
      invalidate();
    };
  }, [reload, invalidate]);
  useEffect(() => {
    if (error || notice) message.current?.focus();
  }, [error, notice]);

  function selectClass(value: string) {
    if (inFlight.current || pending.current) return;
    selectedClass.current = value;
    setSelectedClassId(value);
    setSelectedStudentId('');
    setNotice(null);
    void reload(value);
  }
  async function execute(action: PendingAction) {
    const actor = principal;
    if (
      inFlight.current ||
      pending.current ||
      !ready ||
      loading ||
      !actor ||
      actor.role !== 'admin' ||
      currentScope.current !== action.actorKey ||
      scopeKey(actor) !== action.actorKey ||
      selectedClass.current !== action.classId
    )
      return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    setNotice(null);
    pending.current = action;
    let sent = false;
    try {
      const verified = await read<Principal>('/api/session');
      if (scopeKey(verified) !== action.actorKey) throw new ReadFailure(403);
      if (!mounted.current) {
        pending.current = null;
        return;
      }
      sent = true;
      const response = await fetch('/api/enrolments', {
        method: action.kind === 'enrol' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: action.body,
      });
      const record = await responseJson<Enrolment>(response);
      if (
        response.status !== (action.kind === 'enrol' ? 201 : 200) ||
        !record ||
        typeof record.id !== 'string' ||
        !record.id ||
        record.classId !== action.classId ||
        record.studentId !== action.studentId ||
        record.status !== action.status ||
        (action.id && record.id !== action.id) ||
        typeof record.updatedAt !== 'string' ||
        !Number.isFinite(Date.parse(record.updatedAt))
      )
        throw new Error('Unconfirmed enrolment response');
      pending.current = null;
      if (!mounted.current) return;
      setPendingView(null);
      setSelectedStudentId('');
      setNotice(
        action.kind === 'enrol'
          ? 'Enrolment saved. Current records are being reloaded.'
          : 'Enrolment status saved. Current records are being reloaded.',
      );
      await reload(action.classId);
    } catch (failure) {
      if (!mounted.current) return;
      invalidate();
      hidePrivate();
      setLoading(false);
      if (!sent || (failure instanceof ReadFailure && [400, 409].includes(failure.status))) {
        pending.current = null;
        setPendingView(null);
        setError(
          !sent
            ? 'Current administrator access could not be verified. Reload before making a change.'
            : failure instanceof ReadFailure && failure.status === 409
              ? 'The enrolment or access changed. Reload and check current records before reviewing another change.'
              : 'The enrolment change was rejected. Reload and check the selected records before trying again.',
        );
      } else {
        setPendingView(action);
        setError(
          'The enrolment change could not be confirmed. Reload with the original administrator account and compare the saved records. This screen will not retry it automatically.',
        );
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  function enrolStudent() {
    const actor = principal,
      student = students.find((row) => row.id === selectedStudentId),
      cls = classes.find((row) => row.id === selectedClass.current);
    if (
      !actor ||
      !student ||
      !cls ||
      selectedClassId !== selectedClass.current ||
      roster.current.some((row) => row.studentId === student.id)
    )
      return;
    void execute({
      actorKey: scopeKey(actor),
      classId: cls.id,
      className: cls.name,
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`,
      body: JSON.stringify({ studentId: student.id, classId: cls.id }),
      kind: 'enrol',
      status: 'active',
    });
  }
  function updateStatus(id: string, status: 'withdrawn' | 'completed') {
    const actor = principal,
      row = roster.current.find(
        (record) =>
          record.id === id && record.classId === selectedClass.current && record.status === 'active',
      );
    const student = row && students.find((student) => student.id === row.studentId),
      cls = classes.find((cls) => cls.id === selectedClass.current);
    if (!actor || !row || !student || !cls) return;
    void execute({
      actorKey: scopeKey(actor),
      classId: cls.id,
      className: cls.name,
      studentId: row.studentId,
      studentName: `${student.firstName} ${student.lastName}`,
      body: JSON.stringify({ id, status }),
      kind: 'status',
      status,
      id,
    });
  }
  const originalScope =
    !!pendingView &&
    !!principal &&
    ready &&
    !loading &&
    scopeKey(principal) === pendingView.actorKey &&
    selectedClassId === pendingView.classId;
  const blocked = saving || loading || !ready || !!pendingView;
  return (
    <div className="container mx-auto space-y-6 py-8">
      <h1 className="text-2xl font-bold">Student Enrolments</h1>
      <Card>
        <CardHeader>
          <CardTitle>Current enrolment records</CardTitle>
          <CardDescription>
            {isAdmin
              ? 'Enrol students in classes and manage recorded enrolment status.'
              : 'View enrolments available to your account.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {(error || notice) && (
            <div
              ref={message}
              tabIndex={-1}
              role={error ? 'alert' : 'status'}
              className="rounded border p-3 break-words"
            >
              {error || notice}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => {
              setNotice(null);
              void reload(pending.current?.classId ?? selectedClass.current);
            }}
          >
            Reload current enrolments
          </Button>
          {loading && <p role="status">Loading current enrolments…</p>}
          {pendingView && (
            <section aria-label="Unconfirmed enrolment change" className="space-y-3 rounded border p-3">
              <p>
                The previous change is unconfirmed. Keep this tab open; a hard reload discards its in-page
                reminder. No request is retried automatically.
              </p>
              {originalScope ? (
                <>
                  <p className="break-words">
                    Submitted change: {pendingView.studentName}, class {pendingView.className}, status{' '}
                    {pendingView.status}. Compare this with the current saved records before starting another
                    change.
                  </p>
                  <Label className="flex items-start gap-2" htmlFor="enrolment-compared">
                    <input
                      id="enrolment-compared"
                      type="checkbox"
                      checked={compared}
                      onChange={(event) => setCompared(event.target.checked)}
                    />
                    <span>I checked the current saved records and will review a new change separately.</span>
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!compared || saving}
                    onClick={() => {
                      if (
                        !compared ||
                        !originalScope ||
                        !pending.current ||
                        currentScope.current !== pending.current.actorKey
                      )
                        return;
                      pending.current = null;
                      setPendingView(null);
                      setCompared(false);
                      setNotice('Current records compared. Select and review any new change separately.');
                    }}
                  >
                    Finish comparing saved enrolments
                  </Button>
                </>
              ) : (
                <p>
                  Reload with the original administrator account before viewing or comparing the submitted
                  change.{' '}
                  <a href="/login" target="_blank" rel="noreferrer" className="underline">
                    Sign in in another tab
                  </a>{' '}
                  if needed.
                </p>
              )}
            </section>
          )}
          {ready && (
            <>
              <div className="space-y-2">
                <Label htmlFor="class-select">Select Class</Label>
                <select
                  id="class-select"
                  className="w-full min-w-0 max-w-sm rounded border bg-background p-2"
                  value={selectedClassId}
                  onChange={(event) => selectClass(event.target.value)}
                  disabled={saving || !!pendingView}
                >
                  <option value="">Choose a class</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
                {classes.length === 0 && <p>No classes are available for your current account.</p>}
              </div>
              {isAdmin && selectedClassId && (
                <Card>
                  <CardHeader>
                    <CardTitle>Enrol New Student</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Label htmlFor="student-select">Select Student</Label>
                    <select
                      id="student-select"
                      className="w-full min-w-0 rounded border bg-background p-2"
                      value={selectedStudentId}
                      onChange={(event) => setSelectedStudentId(event.target.value)}
                      disabled={blocked}
                    >
                      <option value="">Choose a student</option>
                      {students
                        .filter((student) => !enrolments.some((row) => row.studentId === student.id))
                        .map((student) => (
                          <option key={student.id} value={student.id}>
                            {student.firstName} {student.lastName}
                          </option>
                        ))}
                    </select>
                    <p className="text-sm text-muted-foreground">
                      Existing enrolments retain their recorded status. This action creates a new
                      student–class pair.
                    </p>
                    <Button type="button" onClick={enrolStudent} disabled={blocked || !selectedStudentId}>
                      Enrol Student
                    </Button>
                  </CardContent>
                </Card>
              )}
              {selectedClassId && (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      Enrolments for {classes.find((cls) => cls.id === selectedClassId)?.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {enrolments.length === 0 ? (
                      <p>No enrolments found for this class.</p>
                    ) : (
                      <div className="space-y-4">
                        {enrolments.map((row) => {
                          const student = students.find((student) => student.id === row.studentId);
                          return (
                            <div
                              key={row.id}
                              data-enrolment-id={row.id}
                              className="flex min-w-0 flex-col justify-between gap-4 rounded border p-4 sm:flex-row sm:items-center"
                            >
                              <div className="min-w-0 break-words">
                                <h2 className="font-medium">
                                  {student
                                    ? `${student.firstName} ${student.lastName}`
                                    : 'Student details are unavailable in the current view'}
                                </h2>
                                <p>
                                  Status:{' '}
                                  <Badge
                                    variant={
                                      row.status === 'active'
                                        ? 'default'
                                        : row.status === 'completed'
                                          ? 'secondary'
                                          : 'destructive'
                                    }
                                  >
                                    {row.status}
                                  </Badge>
                                </p>
                              </div>
                              {isAdmin && row.status === 'active' && student && (
                                <div className="flex min-w-0 flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => updateStatus(row.id, 'withdrawn')}
                                    disabled={blocked}
                                  >
                                    Withdraw
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => updateStatus(row.id, 'completed')}
                                    disabled={blocked}
                                  >
                                    Complete
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
