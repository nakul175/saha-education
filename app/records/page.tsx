'use client';

import * as React from 'react';
import {
  RecordsFrame,
  Field,
  Notice,
  StatusBadge,
  selectClass,
  usePrincipal,
} from '@/components/records/bits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, failureText } from '@/lib/education/records-client';
import type { StudentDirectory } from '@/lib/education/student-records';
import type { Principal } from '@/lib/education/types';

const pageSize = 25;
type Filters = { q: string; grade: string; status: 'active' | 'inactive' | 'all' };

function Directory({ principal }: { principal: Principal }) {
  const [form, setForm] = React.useState<Filters>({ q: '', grade: '', status: 'active' });
  const [applied, setApplied] = React.useState<Filters>(form);
  const [offset, setOffset] = React.useState(0);
  const [outcome, setOutcome] = React.useState<{
    key: string;
    data: StudentDirectory | null;
    error: string;
  } | null>(null);
  const [grades, setGrades] = React.useState<string[]>([]);
  const [tick, setTick] = React.useState(0);
  const isAdmin = principal.role === 'admin';
  const key = JSON.stringify([applied, offset, tick]);
  const loading = outcome?.key !== key;
  const data = outcome?.key === key ? outcome.data : null;
  const error = outcome?.key === key ? outcome.error : '';

  React.useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      status: applied.status,
      limit: String(pageSize),
      offset: String(offset),
    });
    if (applied.q.trim()) params.set('q', applied.q.trim());
    if (applied.grade) params.set('grade', applied.grade);
    api<StudentDirectory>('GET', '/api/records/students?' + params.toString(), undefined, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!result.ok || !result.data) {
          setOutcome({ key, data: null, error: failureText(result) });
          return;
        }
        setOutcome({ key, data: result.data, error: '' });
        setGrades(result.data.grades);
      })
      .catch(() => {
        /* superseded */
      });
    return () => controller.abort();
  }, [applied, offset, tick, key]);

  function search(event: React.FormEvent) {
    event.preventDefault();
    setOffset(0);
    setApplied({ ...form });
  }
  const total = data?.total ?? 0;
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + pageSize, total);

  return (
    <div className="space-y-4">
      <form
        onSubmit={search}
        role="search"
        aria-label="Find students"
        className="grid gap-3 sm:grid-cols-[1fr_10rem_10rem_auto] sm:items-end"
      >
        <Field id="student-search" label="Search by name or admission number">
          <Input
            id="student-search"
            type="search"
            value={form.q}
            onChange={(event) => setForm({ ...form, q: event.target.value })}
            maxLength={100}
            autoComplete="off"
          />
        </Field>
        <Field id="student-grade" label="Grade">
          <select
            id="student-grade"
            className={selectClass}
            value={form.grade}
            onChange={(event) => setForm({ ...form, grade: event.target.value })}
          >
            <option value="">All grades</option>
            {grades.map((grade) => (
              <option key={grade} value={grade}>
                {grade}
              </option>
            ))}
          </select>
        </Field>
        <Field id="student-status" label="Status">
          <select
            id="student-status"
            className={selectClass}
            value={form.status}
            onChange={(event) => setForm({ ...form, status: event.target.value as Filters['status'] })}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        </Field>
        <Button type="submit">Search</Button>
      </form>
      {loading && <p role="status">Loading students…</p>}
      {error && (
        <div className="space-y-2">
          <Notice kind="error">{error}</Notice>
          <Button variant="outline" onClick={() => setTick((value) => value + 1)}>
            Try again
          </Button>
        </div>
      )}
      {!loading && data && data.items.length === 0 && (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          {applied.q || applied.grade || applied.status !== 'active'
            ? 'No students match these filters.'
            : 'There are no student records to show for your account yet.'}
        </p>
      )}
      {data && data.items.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground" role="status">
            Showing {first} to {last} of {total} {total === 1 ? 'student' : 'students'}.
          </p>
          <ul className="divide-y rounded-md border" aria-label="Students">
            {data.items.map((student) => (
              <li key={student.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="break-words font-medium">
                    {student.firstName} {student.lastName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Grade {student.gradeLevel} · Admission {student.admissionNumber}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge active={student.status === 'active'} />
                  <a
                    className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
                    href={
                      isAdmin
                        ? `/records/students/${encodeURIComponent(student.id)}`
                        : `/students/${encodeURIComponent(student.id)}`
                    }
                    aria-label={`${isAdmin ? 'Manage' : 'Open'} ${student.firstName} ${student.lastName}`}
                  >
                    {isAdmin ? 'Manage' : 'Open'}
                  </a>
                </div>
              </li>
            ))}
          </ul>
          <nav aria-label="Student pages" className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - pageSize))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={offset + pageSize >= total}
              onClick={() => setOffset(offset + pageSize)}
            >
              Next
            </Button>
          </nav>
        </>
      )}
    </div>
  );
}

export default function RecordsPage() {
  const gate = usePrincipal();
  return (
    <RecordsFrame
      current="students"
      title="Student records"
      intro="Find students in your school. You only see the students your account is allowed to see."
      gate={gate}
    >
      {(principal) => <Directory key={principal.id} principal={principal} />}
    </RecordsFrame>
  );
}
