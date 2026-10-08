'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- native navigation avoids the observed client transition failure. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isExactCalendarDate } from '@/lib/education/calendar-date';
import type { Principal } from '@/lib/education/types';

type Profile = { id: string; schoolId: string; firstName: string; lastName: string; dateOfBirth: unknown; admissionNumber: string; gradeLevel: string };
type Guardian = { id: string; name: string; relationship: string };
type LinkRequest = { studentId: string; guardianId: string; studentName: string; guardianName: string; actorKey: string; endpoint: string; body: string };
const scopeKey = (actor: Principal) => `${actor.id}:${actor.role}:${actor.schoolId ?? ''}`;
const isPrincipal = (value: unknown): value is Principal => !!value && typeof value === 'object' && 'id' in value && typeof value.id === 'string'
  && !!value.id && 'role' in value && ['admin', 'teacher', 'guardian', 'student'].includes(String(value.role))
  && 'schoolId' in value && typeof value.schoolId === 'string' && !!value.schoolId;
class ProfileResponseError extends Error { constructor(readonly status: number) { super('Profile request unavailable'); } }
class ProfileDataError extends Error {}
async function read(response: Response): Promise<unknown> {
  const body = await response.text();
  if (!response.ok) throw new ProfileResponseError(response.status);
  return JSON.parse(body);
}
function guardianRows(value: unknown): Guardian[] {
  if (!Array.isArray(value) || value.some(row => !row || typeof row.id !== 'string' || !row.id || typeof row.name !== 'string' || typeof row.relationship !== 'string')
    || new Set(value.map(row => row.id)).size !== value.length) throw new ProfileDataError('The returned guardian list contains duplicated or incomplete rows. Reload and ask a school administrator to review it if the problem persists.');
  return value;
}

export default function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [student, setStudent] = useState<Profile | null>(null);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [availableGuardians, setAvailableGuardians] = useState<Guardian[]>([]);
  const [profileId, setProfileId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [selectedGuardianId, setSelectedGuardianId] = useState('');
  const [pendingView, setPendingView] = useState<LinkRequest | null>(null);
  const [acknowledged, setAcknowledged] = useState<LinkRequest | null>(null);
  const generation = useRef(0), controller = useRef<AbortController | null>(null), mounted = useRef(true);
  const currentScope = useRef<string | null>(null), currentProfile = useRef('');
  const pending = useRef<LinkRequest | null>(null), inFlight = useRef(false);
  const invalidate = useCallback(() => { generation.current++; controller.current?.abort(); }, []);
  const hidePrivateView = useCallback(() => {
    invalidate(); currentScope.current = null;
    setPrincipal(null); setStudent(null); setGuardians([]); setAvailableGuardians([]); setSelectedGuardianId(''); setLoading(false);
  }, [invalidate]);
  const reload = useCallback(async (id: string) => {
    if (!mounted.current || currentProfile.current !== id) return;
    const version = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const current = () => mounted.current && generation.current === version && currentProfile.current === id;
    currentScope.current = null; setLoading(true); setError(null); setPrincipal(null); setStudent(null);
    setGuardians([]); setAvailableGuardians([]); setSelectedGuardianId('');
    try {
      const actor = await read(await fetch('/api/session', { cache: 'no-store', signal: abort.signal }));
      if (!current()) return;
      if (!isPrincipal(actor)) throw new Error('Current account unavailable');
      const profile = await read(await fetch('/api/students/' + encodeURIComponent(id), { cache: 'no-store', signal: abort.signal })) as Profile;
      if (!current()) return;
      if (!profile || profile.id !== id || profile.schoolId !== actor.schoolId || ['firstName', 'lastName', 'admissionNumber', 'gradeLevel'].some(field => typeof profile[field as keyof Profile] !== 'string')) throw new ProfileDataError('The returned student profile is incomplete or does not match the selected student. Reload before using it.');
      const linked = guardianRows(await read(await fetch('/api/students/' + encodeURIComponent(id) + '/guardians', { cache: 'no-store', signal: abort.signal })));
      if (!current()) return;
      const choices = actor.role === 'admin' ? guardianRows(await read(await fetch('/api/guardians', { cache: 'no-store', signal: abort.signal }))) : [];
      if (!current()) return;
      const verified = await read(await fetch('/api/session', { cache: 'no-store', signal: abort.signal }));
      if (!current()) return;
      if (!isPrincipal(verified) || scopeKey(actor) !== scopeKey(verified)) throw new ProfileResponseError(403);
      currentScope.current = scopeKey(actor);
      setPrincipal(actor); setStudent(profile); setGuardians(linked); setAvailableGuardians(choices); setError(null);
    } catch (cause) {
      if (!current() || abort.signal.aborted) return;
      currentScope.current = null; setPrincipal(null); setStudent(null); setGuardians([]); setAvailableGuardians([]);
      if (cause instanceof ProfileResponseError && cause.status === 401) {
        setError('Sign in to reload this student profile.');
        if (!pending.current) window.location.assign(new URL('/login', window.location.origin).href);
      } else if (cause instanceof ProfileResponseError && [403, 404].includes(cause.status)) setError('This student profile is unavailable to your current account. Reload after access is restored.');
      else if (cause instanceof ProfileDataError) setError(cause.message);
      else setError('Could not reload this student profile. Try reloading again.');
    } finally { if (current()) setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    mounted.current = true;
    void Promise.resolve().then(() => {
      if (active) { hidePrivateView(); setLoading(true); setProfileId(''); }
      return params;
    }).then(({ id }) => { if (active) { currentProfile.current = id; setProfileId(id); void reload(id); } });
    return () => { active = false; mounted.current = false; invalidate(); };
  }, [params, reload, invalidate, hidePrivateView]);

  const executeLink = async (request: LinkRequest, firstSend: boolean) => {
    if (inFlight.current || currentProfile.current !== request.studentId || currentScope.current !== request.actorKey
      || principal?.role !== 'admin' || scopeKey(principal) !== request.actorKey || pending.current !== request) return;
    inFlight.current = true; setSaving(true); setLinkError(null);
    let sent = false;
    try {
      const actor = await read(await fetch('/api/session', { cache: 'no-store' }));
      if (!isPrincipal(actor) || scopeKey(actor) !== request.actorKey || currentScope.current !== request.actorKey || currentProfile.current !== request.studentId) throw new ProfileResponseError(403);
      sent = true;
      const response = await fetch(request.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: request.body });
      const receipt = await read(response) as { message?: unknown };
      if (response.status !== 200 || receipt?.message !== 'Guardian linked successfully') throw new Error('Link acknowledgement unavailable');
      if (!mounted.current) return;
      pending.current = null; setPendingView(null); setAcknowledged(request); setSelectedGuardianId('');
      await reload(request.studentId);
    } catch (cause) {
      if (!mounted.current) return;
      if (firstSend && !sent) {
        pending.current = null; setPendingView(null);
        setLinkError('Current administrator access could not be verified. No guardian-link request was sent. Reload before linking.');
      } else if (cause instanceof ProfileResponseError && [400, 409].includes(cause.status)) {
        pending.current = null; setPendingView(null);
        setLinkError('The guardian link was rejected or conflicted with current records. Reload and choose the intended guardian again.');
      } else setLinkError('The guardian-link outcome could not be confirmed. Reload with the original administrator account, then retry the exact pending student–guardian pair.');
      hidePrivateView();
    } finally { inFlight.current = false; if (mounted.current) setSaving(false); }
  };
  const linkGuardian = () => {
    if (inFlight.current || pending.current || !student || currentProfile.current !== student.id || principal?.role !== 'admin' || currentScope.current !== scopeKey(principal)) return;
    const choice = availableGuardians.find(row => row.id === selectedGuardianId && !guardians.some(linked => linked.id === row.id));
    if (!choice) return;
    const request: LinkRequest = { studentId: student.id, guardianId: choice.id, studentName: `${student.firstName} ${student.lastName}`, guardianName: choice.name,
      actorKey: scopeKey(principal), endpoint: '/api/students/' + encodeURIComponent(student.id) + '/guardians', body: JSON.stringify({ guardianId: choice.id }) };
    pending.current = request; setPendingView(request); setAcknowledged(null);
    return executeLink(request, true);
  };
  const available = availableGuardians.filter(row => !guardians.some(linked => linked.id === row.id));
  const originalActor = !!principal && principal.role === 'admin' && !loading && !error;
  const retryAvailable = originalActor && pendingView?.actorKey === scopeKey(principal) && pendingView.studentId === profileId;
  const acknowledgementVisible = originalActor && acknowledged?.actorKey === scopeKey(principal) && acknowledged.studentId === profileId;

  return <AppShell principal={principal}><div className="mx-auto max-w-4xl min-w-0 space-y-6 p-4">
    <p className="saha-eyebrow">Student Profile</p><div className="saha-profile-heading"><span className="saha-person-avatar" aria-hidden="true">{student ? (student.firstName.charAt(0) + student.lastName.charAt(0)).toUpperCase() : 'S'}</span><div><h1>{student ? `${student.firstName} ${student.lastName}` : 'Student Profile'}</h1><p>{student ? `Grade ${student.gradeLevel} · Admission ${student.admissionNumber}` : 'A clear view of this student’s school life.'}</p></div></div>
    <div className="saha-profile-links"><a href="/" className="underline">Return to dashboard</a>{principal && <><a href="/students" className="underline">Students</a>{student && <a href={'/attendance/learners/' + encodeURIComponent(student.id)}>Attendance</a>}{student && ['admin', 'teacher'].includes(principal.role) && <a href={'/reading-review?studentId=' + encodeURIComponent(student.id)}>Reading history</a>}<a href="/report-cards" className="underline">{principal.role === 'guardian' || principal.role === 'student' ? 'Published report cards' : 'Report cards'}</a></>}</div>
    <Button type="button" variant="outline" disabled={saving || !profileId} onClick={() => void reload(profileId)}>Reload student profile</Button>
    {loading && <p role="status">Loading current student profile…</p>}
    {error && <p role="alert" className="break-words text-red-600">{error}</p>}
    {linkError && <p role="alert" className="break-words text-red-600">{linkError}</p>}
    {acknowledged && <p role="status">Guardian link was acknowledged by the school system.{error ? ' The profile refresh failed; reload to see current relationships.' : ' Current relationships are shown after reload.'}</p>}
    {acknowledgementVisible && acknowledged && <section aria-label="Acknowledged guardian link" className="rounded border p-3 break-words"><p>{acknowledged.guardianName} was linked to {acknowledged.studentName}.</p><p>This confirms the submitted pair; the list below shows current relationships.</p></section>}
    {pendingView && <section aria-label="Pending guardian link" className="space-y-3 rounded border p-3">
      <p>A guardian link is pending confirmation. It is never retried automatically. Keep this tab open; leaving or hard reloading discards the in-page pending pair.</p>
      {retryAvailable ? <><p className="break-words">Original pair: {pendingView.studentName} and {pendingView.guardianName}.</p><Button type="button" variant="outline" disabled={saving} onClick={() => { if (pending.current) return executeLink(pending.current, false); }}>Retry pending guardian link</Button></>
        : <p>Reload with the original administrator account before retrying. <a href="/login" target="_blank" rel="noreferrer" className="underline">Sign in in another tab</a> if needed.</p>}
    </section>}
    {!loading && !error && student && <>
      <Card><CardHeader><CardTitle>Student Details</CardTitle></CardHeader><CardContent><dl className="grid min-w-0 grid-cols-1 gap-4 break-words sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Name</dt><dd>{student.firstName} {student.lastName}</dd></div>
        <div><dt className="text-muted-foreground">Admission Number</dt><dd>{student.admissionNumber}</dd></div>
        <div><dt className="text-muted-foreground">Date of Birth</dt><dd>{isExactCalendarDate(student.dateOfBirth) ? <time dateTime={student.dateOfBirth}>{student.dateOfBirth}</time> : <span role="status">Stored date requires review: {String(student.dateOfBirth ?? '')}</span>}</dd></div>
        <div><dt className="text-muted-foreground">Grade Level</dt><dd>{student.gradeLevel}</dd></div>

      </dl></CardContent></Card>
      <Card><CardHeader><CardTitle>Guardians</CardTitle></CardHeader><CardContent className="space-y-3"><p>Linked guardians visible to your current account.</p>
        {guardians.length === 0 ? <p>No linked guardians are available in this view.</p> : guardians.map(guardian => <div key={guardian.id} data-linked-guardian-id={guardian.id} className="rounded border p-3 break-words"><p className="font-medium">{guardian.name}</p><p>Relationship: {guardian.relationship}</p><p>Linked</p></div>)}
      </CardContent></Card>
      {principal?.role === 'admin' && <Card><CardHeader><CardTitle>Link Guardian</CardTitle></CardHeader><CardContent className="space-y-3">
        <p>Associate an existing same-school guardian profile with this student. Sign-in account ownership is managed separately through <a className="underline" href="/admin/profile-links">reviewed profile links</a>.</p>
        <Label htmlFor="guardian-choice">Guardian to link</Label><select id="guardian-choice" className="w-full min-w-0 rounded border bg-background p-2" value={selectedGuardianId} disabled={saving || !!pendingView || available.length === 0} onChange={event => { if (!inFlight.current && !pending.current) setSelectedGuardianId(event.target.value); }}>
          <option value="">Select an unlinked guardian</option>{available.map(guardian => <option key={guardian.id} value={guardian.id}>{guardian.name} — {guardian.relationship}</option>)}
        </select>
        {available.length === 0 && <p>No unlinked guardian profiles are available in the current list.</p>}
        <Button type="button" disabled={saving || !!pendingView || !selectedGuardianId} onClick={linkGuardian}>{saving ? 'Linking guardian…' : 'Link Guardian'}</Button>
      </CardContent></Card>}
    </>}
  </div></AppShell>;
}
