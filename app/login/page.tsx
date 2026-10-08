'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** One plain sentence for each reason a demo entry can be refused. */
function demoFailure(status: number, text: string): string {
  let reason = '';
  try {
    const value = JSON.parse(text) as { error?: unknown };
    if (typeof value.error === 'string') reason = value.error;
  } catch {
    /* Fall back to the status. */
  }
  if (status === 429) return 'Please wait a few minutes before switching demo accounts again.';
  if (status === 403 && /demo account is unavailable/i.test(reason))
    return 'This demo account is switched off. Ask the demo administrator to enable it, or choose another role.';
  if (status === 403)
    return 'This page could not be verified as part of this site. Reload the page and try again.';
  if (status === 404) return 'The demo is switched off on this installation. Use school sign-in instead.';
  return 'The demo is unavailable. Please try again later.';
}

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demo, setDemo] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [notice, setNotice] = useState('');
  const [unconfigured, setUnconfigured] = useState(false);
  const actionInFlight = useRef(false);
  useEffect(() => {
    let active = true;
    // The callback redirects here with ?error=signin_failed; an ended session sends ?reason=expired.
    const query = new URLSearchParams(
      typeof window.location.search === 'string' ? window.location.search : '',
    );
    void Promise.resolve().then(() => {
      if (!active) return;
      if (query.get('error') === 'signin_failed')
        setError(
          'School sign-in could not be completed. Try again, or ask your school administrator whether your account is enabled and linked.',
        );
      else if (query.get('reason') === 'expired') setNotice('Your session ended. Sign in again to continue.');
    });
    // Reports only whether school sign-in is set up; the button stays available either way.
    const checkSchoolSignIn = () =>
      fetch('/api/auth/login', { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) {
            await response.text();
            return;
          }
          const result = (await response.json()) as { configured?: unknown };
          if (active) setUnconfigured(result.configured === false);
        })
        .catch(() => {
          /* The sign-in attempt itself reports an unavailable provider. */
        });
    fetch('/api/demo', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          await response.text();
          await checkSchoolSignIn();
          return;
        }
        const result = (await response.json()) as { available?: unknown };
        if (active) setDemo(result.available === true);
        if (result.available !== true) await checkSchoolSignIn();
      })
      .catch(() => {
        /* School sign-in remains the default when configuration is unavailable. */
      });
    return () => {
      active = false;
    };
  }, []);
  async function explore(role: 'admin' | 'teacher' | 'guardian' | 'student') {
    if (actionInFlight.current || !acknowledged) return;
    actionInFlight.current = true;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, syntheticAcknowledged: true }),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(demoFailure(response.status, text));
      const result = JSON.parse(text) as { destination?: unknown; synthetic?: unknown };
      if (result.destination !== '/' || result.synthetic !== true)
        throw new Error('The demo could not be opened.');
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
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const text = await response.text();
      if (!response.ok)
        throw new Error('School sign-in is not available. Please contact your administrator.');
      const result = JSON.parse(text) as { url?: unknown };
      if (typeof result.url !== 'string' || !result.url) throw new Error('Sign-in could not be started.');
      window.location.assign(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in could not be started.');
      setLoading(false);
      actionInFlight.current = false;
    }
  }
  return (
    <main aria-labelledby="login-title" className="saha-login">
      <aside className="saha-login-story">
        <p className="saha-wordmark">
          <span aria-hidden="true">s</span>saha.
        </p>
        <div>
          <h2>
            A little structure.
            <br />A lot of possibility.
          </h2>
          <p>One calm workspace for school life. More time to teach, learn and stay connected.</p>
        </div>
        <div className="saha-login-promises">
          <div>Attendance and class records, together.</div>
          <div>Teaching resources with a clear next step.</div>
          <div>Shared progress that keeps families informed.</div>
        </div>
      </aside>
      <div className="saha-login-content">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>
              <h1 id="login-title" className="text-2xl">
                {demo ? 'Explore Saha Education' : 'Sign in to Saha Education'}
              </h1>
            </CardTitle>
            <CardDescription>
              {demo
                ? 'A private demonstration with fictional school records.'
                : 'Use your school account to continue.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {demo ? (
              <>
                <p className="text-sm">
                  Choose a view to explore attendance, learning resources, results and family updates. Sample
                  changes stay in this demo.
                </p>
                <label
                  className="saha-login-ack flex items-start gap-3 text-sm"
                  htmlFor="demo-acknowledgement"
                >
                  <input
                    className="mt-1 size-4 shrink-0"
                    id="demo-acknowledgement"
                    type="checkbox"
                    checked={acknowledged}
                    disabled={loading}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                  />
                  <span>I’m exploring fictional records and won’t enter real student details.</span>
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Demo roles">
                  {(
                    [
                      [
                        'admin',
                        'Administrator',
                        'See school totals, share reports with families and link accounts to profiles.',
                      ],
                      [
                        'teacher',
                        'Teacher',
                        'Take attendance, enter results, record reading checks and share class resources.',
                      ],
                      [
                        'guardian',
                        'Guardian',
                        "See your children's attendance, shared reports and notices from the school.",
                      ],
                      [
                        'student',
                        'Student',
                        "Open class resources, write answers and read your teacher's feedback.",
                      ],
                    ] as const
                  ).map(([role, label, description]) => (
                    <div key={role} className="saha-demo-role min-w-0">
                      <Button
                        variant="outline"
                        disabled={loading || !acknowledged}
                        onClick={() => explore(role)}
                      >
                        Explore as {label.toLowerCase()}
                      </Button>
                      <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Switching roles signs you out of the role you are in now. School sign-in and reading apps
                  are not connected in this demo.
                </p>
                {loading && <p role="status">Opening your demo view…</p>}
              </>
            ) : (
              <Button onClick={signIn} disabled={loading}>
                {loading ? 'Opening sign-in…' : 'Continue with school sign-in'}
              </Button>
            )}
            {notice && (
              <p role="note" className="text-sm">
                {notice}
              </p>
            )}
            {!demo && unconfigured && (
              <p role="note" className="text-sm text-muted-foreground">
                School sign-in has not been set up on this installation yet. Your administrator needs to
                connect the school provider before anyone can sign in.
              </p>
            )}
            {error && <p role="alert">{error}</p>}
            {!demo && (
              <p className="text-sm text-muted-foreground">Your school administrator manages your access.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
