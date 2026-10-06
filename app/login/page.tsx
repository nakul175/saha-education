'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demo, setDemo] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const actionInFlight = useRef(false);
  useEffect(() => {
    let active = true;
    fetch('/api/demo', { cache: 'no-store' }).then(async response => {
      if (!response.ok) { await response.text(); return; }
      const result = await response.json() as { available?: unknown };
      if (active) setDemo(result.available === true);
    }).catch(() => { /* School sign-in remains the default when configuration is unavailable. */ });
    return () => { active = false; };
  }, []);
  async function explore(role: 'admin' | 'teacher' | 'guardian' | 'student') {
    if (actionInFlight.current || !acknowledged) return;
    actionInFlight.current = true;
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, syntheticAcknowledged: true }) });
      const text = await response.text();
      if (!response.ok) throw new Error(response.status === 429
        ? 'Please wait a few minutes before switching demo accounts again.'
        : 'The demo is unavailable. Please try again later.');
      const result = JSON.parse(text) as { destination?: unknown; synthetic?: unknown };
      if (result.destination !== '/' || result.synthetic !== true) throw new Error('The demo could not be opened.');
      window.location.assign(new URL('/', window.location.origin).href);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The demo could not be opened.');
      setLoading(false);
      actionInFlight.current = false;
    }
  }
  async function signIn() {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/auth/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
      const text = await response.text();
      if (!response.ok) throw new Error('School sign-in is not available. Please contact your administrator.');
      const result = JSON.parse(text) as {url?: unknown};
      if (typeof result.url !== 'string' || !result.url) throw new Error('Sign-in could not be started.');
      window.location.assign(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in could not be started.');
      setLoading(false);
      actionInFlight.current = false;
    }
  }
  return <main aria-labelledby="login-title" className="min-h-screen flex items-center justify-center bg-background p-4">
    <Card className="w-full max-w-lg"><CardHeader><CardTitle><h1 id="login-title" className="text-2xl">{demo ? 'Explore Saha Education' : 'Sign in to Saha Education'}</h1></CardTitle>
      <CardDescription>{demo ? 'A private demonstration with fictional school records.' : 'Use your school account to continue.'}</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        {demo ? <>
          <p className="text-sm">Choose a view to explore attendance, learning resources, results and family updates. Sample changes stay in this demo.</p>
          <label className="flex items-start gap-3 text-sm" htmlFor="demo-acknowledgement">
            <input className="mt-1 size-4 shrink-0" id="demo-acknowledgement" type="checkbox" checked={acknowledged}
              disabled={loading} onChange={event => setAcknowledged(event.target.checked)} />
            <span>I’m exploring fictional records and won’t enter real student details.</span>
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Demo roles">
            {([
              ['admin', 'Administrator', 'See school totals, share reports with families and link accounts to profiles.'],
              ['teacher', 'Teacher', 'Take attendance, enter results, record reading checks and share class resources.'],
              ['guardian', 'Guardian', 'See your children\'s attendance, shared reports and notices from the school.'],
              ['student', 'Student', 'Open class resources, write answers and read your teacher\'s feedback.'],
            ] as const).map(([role, label, description]) => <div key={role} className="flex min-w-0 flex-col gap-1">
              <Button variant="outline" disabled={loading || !acknowledged} onClick={() => explore(role)}>Explore as {label.toLowerCase()}</Button>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>)}
          </div>
          <p className="text-xs text-muted-foreground">Switching roles signs you out of the role you are in now. School sign-in and reading apps are not connected in this demo.</p>
          {loading && <p role="status">Opening your demo view…</p>}
        </> : <Button onClick={signIn} disabled={loading}>{loading ? 'Opening sign-in…' : 'Continue with school sign-in'}</Button>}
        {error && <p role="alert">{error}</p>}
        {!demo && <p className="text-sm text-muted-foreground">Your school administrator manages your access.</p>}
      </CardContent></Card>
  </main>;
}
