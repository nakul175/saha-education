'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { RegistryCreationReceipt, RegistryCreationResult } from '@/lib/education/registry-create';
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
type PendingGuardianCreation = { id: string; endpoint: string; body: string; values: { name: string; phone: string; email: string; relationship: string }; actorKey: string; reason: string };

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
  const [receipt, setReceipt] = useState<{ value: RegistryCreationReceipt; actorKey: string } | null>(null);
  const [pendingView, setPendingView] = useState<PendingGuardianCreation | null>(null);
  const [reason, setReason] = useState('');
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [conflict, setConflict] = useState(false);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const createInFlight = useRef(false);
  const currentScope = useRef<string | null>(null);
  const draftScope = useRef<string | null>(null);
  const pendingCreate = useRef<PendingGuardianCreation | null>(null);

  const fetchGuardians = useCallback(async () => {
    const requestGeneration = ++generation.current;
    controller.current?.abort();
    const nextController = new AbortController(); controller.current = nextController;
    const current = () => mounted.current && generation.current === requestGeneration;
    setLoading(true); setError(null); setPrincipal(null); setGuardians([]); currentScope.current = null;
    try {
      const actor = await readRegistryResponse(await fetch('/api/session', { cache: 'no-store', signal: nextController.signal })) as Principal;
      if (!current()) return;
      const data = await readRegistryResponse(await fetch('/api/guardians', { cache: 'no-store', signal: nextController.signal })) as Guardian[];
      if (!current()) return;
      const verifiedActor = await readRegistryResponse(await fetch('/api/session', { cache: 'no-store', signal: nextController.signal })) as Principal;
      if (!current()) return;
      if (!actor.id || scopeKey(actor) !== scopeKey(verifiedActor) || !Array.isArray(data)) throw new Error('Account changed during reload');
      const key = scopeKey(actor);
      if (!pendingCreate.current && draftScope.current !== key) { setFormData({ name: '', phone: '', email: '', relationship: '' }); setReason(''); setReviewConfirmed(false); setCreateError(null); }
      draftScope.current = key; currentScope.current = key;
      setPrincipal(actor); setGuardians(data); setError(null); setConflict(false);
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
  const hidePrivateView = () => {
    cancelPendingLoad(); currentScope.current = null;
    setPrincipal(null); setGuardians([]); setLoading(false);
  };
  useEffect(() => {
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchGuardians();
    return () => { mounted.current = false; cancelPendingLoad(); };
  }, [fetchGuardians, cancelPendingLoad]);
  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (createInFlight.current || pendingCreate.current) return;
    const { name, value } = event.target;
    setFormData(previous => ({ ...previous, [name]: value })); setReviewConfirmed(false);
  };
  const executeCreation = async (request: PendingGuardianCreation, firstSend: boolean) => {
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
      if (![200, 201].includes(response.status) || result.replayed !== (response.status === 200) || !saved || saved.kind !== 'guardian'
        || saved.id !== request.id || saved.createdBy !== actor.id || saved.schoolId !== actor.schoolId || saved.reason !== request.reason
        || !saved.profile || typeof saved.profile.id !== 'string' || !saved.profile.id || saved.profile.schoolId !== actor.schoolId || saved.profile.userId !== null
        || saved.profile.name !== original.name || saved.profile.relationship !== original.relationship
        || (saved.profile.email ?? '') !== original.email.trim() || (saved.profile.phone ?? '') !== original.phone.trim()
        || typeof saved.createdAt !== 'string' || !Number.isFinite(Date.parse(saved.createdAt)) || saved.profile.createdAt !== saved.createdAt || saved.profile.updatedAt !== saved.createdAt) throw new Error('Unconfirmed creation receipt');
      if (!mounted.current) return;
      pendingCreate.current = null; setPendingView(null); setReceipt({ value: saved, actorKey: request.actorKey }); setConfirmed(true);
      setFormData({ name: '', phone: '', email: '', relationship: '' }); setReason(''); setReviewConfirmed(false); setConflict(false);
      await fetchGuardians();
    } catch (cause) {
      if (!mounted.current) return;
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
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (createInFlight.current || pendingCreate.current || conflict) return;
    const actor = principal, reviewedReason = reason.trim();
    if (!actor || actor.role !== 'admin' || !actor.schoolId || currentScope.current !== scopeKey(actor)) return;
    if (!reviewConfirmed || Array.from(reviewedReason).length < 10 || Array.from(reviewedReason).length > 500 || reviewedReason.includes('\0')) {
      setCreateError('Review the profile and give a reason of 10 to 500 characters before creating it.'); return;
    }
    const id = crypto.randomUUID();
    const request: PendingGuardianCreation = { id, endpoint: '/api/registry/guardians', actorKey: scopeKey(actor), values: { ...formData }, reason: reviewedReason,
      body: JSON.stringify({ clientRequestId: id, reviewConfirmed: true, reason: reviewedReason,
        profile: { ...formData, email: formData.email.trim() || undefined, phone: formData.phone.trim() || undefined } }) };
    pendingCreate.current = request; setPendingView(request); setConfirmed(false); setReceipt(null);
    await executeCreation(request, true);
  };
  const retryAvailable = !!pendingView && !!principal && principal.role === 'admin' && !loading && !error
    && scopeKey(principal) === pendingView.actorKey;
  const receiptAvailable = !!receipt && !!principal && !loading && !error && scopeKey(principal) === receipt.actorKey;


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
      {confirmed && <p role="status">Guardian profile was saved. The original receipt is separate from the current registry.{error ? ' The list refresh failed; reload to see current profiles.' : ''}</p>}
      {receiptAvailable && receipt?.value.kind === 'guardian' && <section aria-label="Original guardian creation receipt" className="space-y-1 rounded border p-3 break-words">
        <h2 className="font-semibold">Original guardian creation receipt</h2>
        <p>{receipt.value.profile.name}; relationship {receipt.value.profile.relationship}.</p>
        <p>Request {receipt.value.id}. Created {receipt.value.createdAt}. Original profile started without a sign-in account.</p>
        <p>Reason: {receipt.value.reason}</p>
      </section>}
      {createError && <p role="alert" className="break-words text-red-600">{createError}</p>}
      {pendingView && <div className="space-y-3 rounded border p-3">
        <p>Your reviewed creation is pending. Its original request stays unchanged. This screen never retries it automatically. A hard reload currently discards the in-page pending request.</p>
        {retryAvailable ? <>
          <p className="break-words">Submitted guardian: {pendingView.values.name}; email {pendingView.values.email || 'none'}; phone {pendingView.values.phone || 'none'}. Request {pendingView.id}.</p>
          <Button type="button" variant="outline" className="h-auto whitespace-normal" disabled={isCreating} onClick={() => { if (pendingCreate.current) void executeCreation(pendingCreate.current, false); }}>Retry pending guardian creation</Button>
        </> : <p>Reload with the original administrator account before retrying. <a href="/login" target="_blank" rel="noreferrer" className="underline">Sign in in another tab</a> if needed.</p>}
      </div>}

      {principal?.role === 'admin' && !pendingView && !conflict && <Card>
        <CardHeader>
          <CardTitle>Add New Guardian</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <fieldset disabled={isCreating || !!pendingView || conflict} className="space-y-4">
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

            <div className="space-y-2">
              <Label htmlFor="guardian-create-reason">Reason for creating this profile</Label>
              <Textarea id="guardian-create-reason" value={reason} onChange={event => { setReason(event.target.value); setReviewConfirmed(false); }} aria-describedby="guardian-create-reason-help" />
              <p id="guardian-create-reason-help" className="text-sm text-muted-foreground">10 to 500 characters. {Array.from(reason.trim()).length} entered.</p>
              <label className="flex items-start gap-2"><input type="checkbox" checked={reviewConfirmed} onChange={event => setReviewConfirmed(event.target.checked)} />I reviewed these details and confirm creating an unlinked guardian profile.</label>
            </div>
            <Button type="submit" disabled={isCreating || !!pendingView || conflict}>{isCreating ? 'Creating…' : 'Create Guardian'}</Button>
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
