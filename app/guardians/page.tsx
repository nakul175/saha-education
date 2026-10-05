'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Guardian, Principal } from '@/lib/education/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';


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

export default function GuardiansPage() {
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    relationship: '',
  });

  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [comparisonReady, setComparisonReady] = useState(false);
  const [compared, setCompared] = useState(false);
  const [pendingView, setPendingView] = useState<{ values: typeof formData; actorKey: string } | null>(null);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const createInFlight = useRef(false);
  const currentScope = useRef<string | null>(null);
  const draftScope = useRef<string | null>(null);
  const pendingCreate = useRef<{ values: typeof formData; actorKey: string } | null>(null);

  const fetchGuardians = useCallback(async () => {
    const requestGeneration = ++generation.current;
    controller.current?.abort();
    const nextController = new AbortController(); controller.current = nextController;
    const current = () => mounted.current && generation.current === requestGeneration;
    setLoading(true); setError(null); setPrincipal(null); setGuardians([]);
    currentScope.current = null; setComparisonReady(false); setCompared(false);
    try {
      const actor = await readRegistryResponse(await fetch('/api/session', { cache: 'no-store', signal: nextController.signal })) as Principal;
      if (!current()) return;
      const data = await readRegistryResponse(await fetch('/api/guardians', { cache: 'no-store', signal: nextController.signal })) as Guardian[];
      if (!current()) return;
      const verifiedActor = await readRegistryResponse(await fetch('/api/session', { cache: 'no-store', signal: nextController.signal })) as Principal;
      if (!current()) return;
      if (!actor.id || scopeKey(actor) !== scopeKey(verifiedActor) || !Array.isArray(data)) throw new Error('Account changed during reload');
      const key = scopeKey(actor);
      if (!pendingCreate.current && draftScope.current !== key) { setFormData({ name: '', phone: '', email: '', relationship: '' }); setCreateError(null); }
      draftScope.current = key; currentScope.current = key;
      setPrincipal(actor); setGuardians(data); setError(null);
      setComparisonReady(!!pendingCreate.current && pendingCreate.current.actorKey === key && actor.role === 'admin');
    } catch (cause) {
      if (!current() || nextController.signal.aborted) return;
      setGuardians([]); setPrincipal(null); currentScope.current = null;
      if (cause instanceof RegistryResponseError && cause.status === 401) {
        setError('Sign in to reload the current registry.');
        if (!pendingCreate.current) window.location.assign(new URL('/login', window.location.origin).href);
      } else if (cause instanceof RegistryResponseError && [403, 404].includes(cause.status)) {
        setError('Current registry access is unavailable. Reload after your access is restored.');
      } else setError('Could not reload the current guardians. Try reloading again.');
    } finally { if (current()) setLoading(false); }
  }, []);

  const cancelPendingLoad = useCallback(() => { generation.current++; controller.current?.abort(); }, []);

  useEffect(() => {
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchGuardians();
    return () => { mounted.current = false; cancelPendingLoad(); };
  }, [fetchGuardians, cancelPendingLoad]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (createInFlight.current || pendingCreate.current) return;
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createInFlight.current || pendingCreate.current) return;
    const actor = principal;
    if (!actor || actor.role !== 'admin' || !actor.schoolId || currentScope.current !== scopeKey(actor)) return;
    createInFlight.current = true; setIsCreating(true); setCreateError(null); setConfirmed(false);
    const originalKey = scopeKey(actor);
    pendingCreate.current = { values: { ...formData }, actorKey: originalKey };
    setPendingView({ values: { ...formData }, actorKey: originalKey });
    let createSent = false;
    try {
      const verifiedActor = await readRegistryResponse(await fetch('/api/session', { cache: 'no-store' })) as Principal;
      if (scopeKey(verifiedActor) !== originalKey) {
        pendingCreate.current = null; setPendingView(null); setPrincipal(null); setGuardians([]); currentScope.current = null;
        setCreateError('The account changed. Reload before creating a profile.'); return;
      }
      createSent = true;
      const response = await fetch('/api/guardians', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...formData, email: formData.email.trim() || undefined, phone: formData.phone.trim() || undefined }) });
      const record = await readRegistryResponse(response) as Guardian;
      if (response.status !== 201 || !record || typeof record.id !== 'string' || !record.id || record.schoolId !== actor.schoolId || !(record.name === formData.name && record.relationship === formData.relationship && (record.email ?? '') === formData.email.trim() && (record.phone ?? '') === formData.phone.trim())) throw new Error('Unconfirmed create acknowledgement');
      if (!mounted.current) return;
      pendingCreate.current = null; setPendingView(null); setUncertain(false); setConfirmed(true); setFormData({ name: '', phone: '', email: '', relationship: '' });
      await fetchGuardians();
    } catch (cause) {
      if (!mounted.current) return;
      if (!createSent) {
        pendingCreate.current = null; setPendingView(null); setCreateError('Could not verify create access. Reload before creating a profile.');
        controller.current?.abort(); generation.current++; currentScope.current = null;
        setPrincipal(null); setGuardians([]); setLoading(false);
      } else if (cause instanceof RegistryResponseError && cause.status === 400) {
        pendingCreate.current = null; setPendingView(null); setCreateError('The profile was rejected. Check the fields before submitting again.');
      } else {
        setUncertain(true); setComparisonReady(false); setCompared(false); setCreateError(unknownCreateMessage);
        controller.current?.abort(); generation.current++; currentScope.current = null;
        setPrincipal(null); setGuardians([]); setLoading(false);
      }
    } finally { createInFlight.current = false; if (mounted.current) setIsCreating(false); }
  };

  const startNewDraft = () => {
    if (!comparisonReady || !compared || !principal || pendingCreate.current?.actorKey !== scopeKey(principal)) return;
    pendingCreate.current = null; setPendingView(null); setUncertain(false); setComparisonReady(false); setCompared(false); setCreateError(null); setFormData({ name: '', phone: '', email: '', relationship: '' });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Guardians</h1>
        <p className="text-muted-foreground">Manage guardians and their information</p>
      </div>

      <p className="text-sm text-muted-foreground">New profiles start without a sign-in account. School administrators can link or unlink accounts through <a href="/admin/profile-links" className="underline">reviewed profile links</a>.</p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={() => void fetchGuardians()} disabled={isCreating}>Reload guardians</Button>
        {loading && <p role="status">Loading current guardians…</p>}
      </div>
      {error && <p role="alert" className="text-red-600">{error}</p>}
      {confirmed && <p role="status">Guardian profile was saved.{error ? ' The list refresh failed; reload to see current profiles.' : ''}</p>}
      {createError && <p role="alert" className="break-words text-red-600">{createError}</p>}
      {uncertain && <div className="space-y-3 rounded border p-3">
        <p>Your earlier create is unresolved. This screen will not send it again automatically. Submitted details stay private to the original account. A hard reload discards this in-page reminder.</p>
        {comparisonReady && <>
          <p className="break-words">Submitted guardian: {pendingView?.values.name}; email {pendingView?.values.email || 'none'}; phone {pendingView?.values.phone || 'none'}.</p>
          <label className="flex items-start gap-2"><input type="checkbox" checked={compared} onChange={event => setCompared(event.target.checked)} />I compared the reloaded list and understand a new create can duplicate a saved profile.</label>
          <Button type="button" variant="outline" className="h-auto whitespace-normal" disabled={!compared} onClick={startNewDraft}>Finish comparison and start a new draft</Button>
        </>}
        {!comparisonReady && <p>Reload the list with the original administrator account before comparison. <a href="/login" target="_blank" rel="noreferrer" className="underline">Sign in in another tab</a> if needed.</p>}
      </div>}

      {principal?.role === 'admin' && !uncertain && (!pendingView || pendingView.actorKey === scopeKey(principal)) && <Card>
        <CardHeader>
          <CardTitle>Add New Guardian</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <fieldset disabled={isCreating || uncertain} className="space-y-4">
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
              />
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
              />
            </div>

            <div>
              <Label htmlFor="relationship">Relationship *</Label>
              <Textarea
                id="relationship"
                name="relationship"
                value={formData.relationship}
                onChange={handleChange}
                required
              />
            </div>

            <Button type="submit" disabled={isCreating || uncertain}>{isCreating ? 'Creating…' : 'Create Guardian'}</Button>
            </fieldset>
          </form>
        </CardContent>
      </Card>}

      <Card>
        <CardHeader>
          <CardTitle>Guardians List</CardTitle>
        </CardHeader>
        <CardContent>
          {loading || error ? null : guardians.length === 0 ? (
            <p className="text-muted-foreground">No guardians found.</p>
          ) : (
            <div className="overflow-x-auto" data-registry-list tabIndex={0} role="region" aria-label="Guardian profiles">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Name</th>
                    <th className="text-left p-2">Phone</th>
                    <th className="text-left p-2">Email</th>
                    <th className="text-left p-2">Relationship</th>
                  </tr>
                </thead>
                <tbody>
                  {guardians.map((guardian) => (
                    <tr key={guardian.id} data-guardian-id={guardian.id} className="border-b">
                      <td className="p-2">{guardian.name}</td>
                      <td className="p-2">{guardian.phone || '-'}</td>
                      <td className="p-2">{guardian.email || '-'}</td>
                      <td className="p-2">{guardian.relationship}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
