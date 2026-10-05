'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function signIn() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/auth/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
      if (!response.ok) throw new Error('School sign-in is not available. Please contact your administrator.');
      const result = await response.json() as {url: string};
      window.location.assign(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in could not be started.');
      setLoading(false);
    }
  }
  return <div className="min-h-screen flex items-center justify-center bg-background">
    <Card className="w-full max-w-md"><CardHeader><CardTitle>Sign in to Saha Education</CardTitle>
      <CardDescription>Use your school account to continue.</CardDescription></CardHeader>
      <CardContent className="space-y-4"><Button onClick={signIn} disabled={loading}>{loading ? 'Opening sign-in…' : 'Continue with school sign-in'}</Button>
        {error && <p role="alert">{error}</p>}
        <p className="text-sm text-muted-foreground">Your school administrator manages your access.</p>
      </CardContent></Card>
  </div>;
}
