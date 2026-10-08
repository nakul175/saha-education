'use client';

import * as React from 'react';
import { RecordsFrame, Field, Notice, usePrincipal } from '@/components/records/bits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, failureText } from '@/lib/education/records-client';
import type { GuardianDirectory } from '@/lib/education/guardian-records';

const pageSize = 25;

function Directory() {
  const [q, setQ] = React.useState('');
  const [applied, setApplied] = React.useState('');
  const [offset, setOffset] = React.useState(0);
  const [outcome, setOutcome] = React.useState<{
    key: string;
    data: GuardianDirectory | null;
    error: string;
  } | null>(null);
  const [tick, setTick] = React.useState(0);
  const key = JSON.stringify([applied, offset, tick]);
  const loading = outcome?.key !== key;
  const data = outcome?.key === key ? outcome.data : null;
  const error = outcome?.key === key ? outcome.error : '';

  React.useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
    if (applied.trim()) params.set('q', applied.trim());
    api<GuardianDirectory>('GET', '/api/records/guardians?' + params.toString(), undefined, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!result.ok || !result.data) {
          setOutcome({ key, data: null, error: failureText(result) });
          return;
        }
        setOutcome({ key, data: result.data, error: '' });
      })
      .catch(() => {
        /* superseded */
      });
    return () => controller.abort();
  }, [applied, offset, tick, key]);

  const total = data?.total ?? 0;
  return (
    <div className="space-y-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setOffset(0);
          setApplied(q);
        }}
        role="search"
        aria-label="Find guardians"
        className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
      >
        <Field id="guardian-search" label="Search by name, email or phone">
          <Input
            id="guardian-search"
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            maxLength={100}
            autoComplete="off"
          />
        </Field>
        <Button type="submit">Search</Button>
      </form>
      {loading && <p role="status">Loading guardians…</p>}
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
          {applied
            ? 'No guardians match this search.'
            : 'There are no guardian records to show for your account yet.'}
        </p>
      )}
      {data && data.items.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground" role="status">
            Showing {offset + 1} to {Math.min(offset + pageSize, total)} of {total}{' '}
            {total === 1 ? 'guardian' : 'guardians'}.
          </p>
          <ul className="divide-y rounded-md border" aria-label="Guardians">
            {data.items.map((guardian) => (
              <li key={guardian.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="break-words font-medium">{guardian.name}</p>
                  <p className="break-words text-sm text-muted-foreground">
                    {guardian.relationship} · {guardian.linkedStudents} linked{' '}
                    {guardian.linkedStudents === 1 ? 'child' : 'children'} ·{' '}
                    {guardian.hasLogin ? 'Has a sign-in' : 'No sign-in yet'}
                  </p>
                </div>
                <a
                  className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
                  href={`/records/guardians/${encodeURIComponent(guardian.id)}`}
                  aria-label={`Open ${guardian.name}`}
                >
                  Open
                </a>
              </li>
            ))}
          </ul>
          <nav aria-label="Guardian pages" className="flex items-center justify-between gap-2">
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

export default function GuardianRecordsPage() {
  const gate = usePrincipal();
  return (
    <RecordsFrame
      current="guardians"
      title="Guardian records"
      intro="Guardians in your school. You only see the guardians your account is allowed to see."
      gate={gate}
    >
      {(principal) => <Directory key={principal.id} />}
    </RecordsFrame>
  );
}
