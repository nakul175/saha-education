'use client';

import * as React from 'react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { loadPrincipal } from '@/lib/education/records-client';
import type { Principal } from '@/lib/education/types';

export const selectClass = 'h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';
export const areaClass = 'min-h-20 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** Loads the verified current account once and reports plain-language failure states. */
export function usePrincipal() {
  const [state, setState] = React.useState<{ principal: Principal | null; signedOut: boolean; failed: boolean; loading: boolean }>({ principal: null, signedOut: false, failed: false, loading: true });
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const controller = new AbortController();
    loadPrincipal(controller.signal).then(result => { if (!controller.signal.aborted) setState({ ...result, loading: false }); }).catch(() => { /* aborted */ });
    return () => controller.abort();
  }, [tick]);
  return { ...state, reload: () => { setState(current => ({ ...current, loading: true })); setTick(value => value + 1); } };
}

export function Notice({ kind, children }: { kind: 'error' | 'info' | 'success' | 'warning'; children: React.ReactNode }) {
  const tone = { error: 'border-destructive/50 bg-destructive/10 text-destructive', info: 'border-border bg-muted/50', success: 'border-green-600/40 bg-green-50 text-green-950', warning: 'border-amber-500/50 bg-amber-50 text-amber-950' }[kind];
  return <div role={kind === 'error' || kind === 'warning' ? 'alert' : 'status'} className={'rounded-md border px-3 py-2 text-sm ' + tone}>{children}</div>;
}

export function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return <div className="min-w-0 space-y-1.5"><Label htmlFor={id}>{label}</Label>{children}{hint && <p id={id + '-hint'} className="text-xs text-muted-foreground">{hint}</p>}</div>;
}

export function StatusBadge({ active }: { active: boolean }) {
  return <span className={'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ' + (active ? 'border-green-600/40 bg-green-50 text-green-900' : 'border-amber-500/50 bg-amber-50 text-amber-900')}>{active ? 'Active' : 'Inactive'}</span>;
}

const sections = [
  { id: 'students', label: 'Student records', href: '/records' },
  { id: 'guardians', label: 'Guardian records', href: '/records/guardians' },
  { id: 'setup', label: 'School setup', href: '/schools/setup' },
];

/** Page frame: shell, account loading/sign-in states and the small local section links. */
export function RecordsFrame({ current, title, intro, children, gate }: {
  current: 'students' | 'guardians' | 'setup'; title: string; intro?: string; children: (principal: Principal) => React.ReactNode;
  gate: ReturnType<typeof usePrincipal>;
}) {
  const { principal, loading, signedOut, failed, reload } = gate;
  return (
    <AppShell principal={principal}>
      <div className="mx-auto w-full max-w-5xl space-y-5 px-4">
        <nav aria-label="Record sections" className="flex flex-wrap gap-2">
          {sections.map(item => (
            <a key={item.id} href={item.href} aria-current={item.id === current ? 'page' : undefined}
              className={'rounded-md border px-3 py-1.5 text-sm font-medium ' + (item.id === current ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}>{item.label}</a>
          ))}
        </nav>
        <header className="space-y-1"><h2 className="text-2xl font-semibold tracking-tight">{title}</h2>{intro && <p className="text-sm text-muted-foreground">{intro}</p>}</header>
        {loading && <p role="status">Loading your account…</p>}
        {!loading && signedOut && <Notice kind="warning">Your sign-in has ended. <a className="font-medium underline underline-offset-4" href="/login">Sign in again</a> to continue.</Notice>}
        {!loading && failed && <div className="space-y-2"><Notice kind="error">Your account could not be verified, so no records are shown.</Notice><Button variant="outline" onClick={reload}>Try again</Button></div>}
        {!loading && principal && children(principal)}
      </div>
    </AppShell>
  );
}

/** One client request id per distinct payload; kept while an outcome is unknown so a retry is an exact replay. */
export function useAttempt() {
  const ref = React.useRef<{ key: string; id: string } | null>(null);
  return {
    idFor(payload: unknown): string {
      const key = JSON.stringify(payload);
      if (ref.current?.key !== key) ref.current = { key, id: crypto.randomUUID() };
      return ref.current.id;
    },
    clear() { ref.current = null; },
  };
}
