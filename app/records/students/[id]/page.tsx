'use client';

import * as React from 'react';
import { RecordsFrame, Field, Notice, StatusBadge, areaClass, selectClass, useAttempt, usePrincipal } from '@/components/records/bits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, dateTime, failureText, isStale, shortDate } from '@/lib/education/records-client';
import type { GuardianLinkInventory, GuardianLinkView } from '@/lib/education/guardian-links';
import type { StudentRecord, StudentRecordDetail } from '@/lib/education/student-records';
import type { Principal } from '@/lib/education/types';

type Draft = { firstName: string; lastName: string; dateOfBirth: string; admissionNumber: string; gradeLevel: string };
type Msg = { kind: 'error' | 'success' | 'warning' | 'info'; text: string } | null;
const labels: Record<string, string> = { firstName: 'first name', lastName: 'last name', dateOfBirth: 'date of birth', admissionNumber: 'admission number', gradeLevel: 'grade',
  reason: 'reason (10 to 500 characters)', relationship: 'relationship', guardianId: 'guardian', expectedUpdatedAt: 'record version', expectedVersion: 'record version' };
const draftOf = (student: StudentRecord): Draft => ({ firstName: student.firstName, lastName: student.lastName, dateOfBirth: student.dateOfBirth, admissionNumber: student.admissionNumber, gradeLevel: student.gradeLevel });
const base = (id: string) => `/api/records/students/${encodeURIComponent(id)}`;

function Reason({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field id={id} label="Reason" hint={`Recorded in the history. 10 to 500 characters (${Array.from(value.trim()).length} so far).`}>
      <textarea id={id} className={areaClass} value={value} onChange={event => onChange(event.target.value)} maxLength={500} aria-describedby={id + '-hint'} />
    </Field>
  );
}

function DetailsForm({ detail, setDetail, reload }: { detail: StudentRecordDetail; setDetail: (value: StudentRecordDetail) => void; reload: () => Promise<StudentRecordDetail | null> }) {
  const [draft, setDraft] = React.useState<Draft>(draftOf(detail.student));
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<Msg>(null);
  const [conflict, setConflict] = React.useState(false);
  const student = detail.student;
  const set = (key: keyof Draft) => (event: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [key]: event.target.value });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage(null);
    const result = await api<{ student: StudentRecord }>('PATCH', base(student.id), { ...draft, expectedUpdatedAt: student.updatedAt });
    setBusy(false);
    if (result.ok && result.data) { setDetail({ ...detail, student: result.data.student }); setDraft(draftOf(result.data.student)); setConflict(false); setMessage({ kind: 'success', text: 'Student details saved.' }); return; }
    if (isStale(result)) setConflict(true);
    setMessage({ kind: 'error', text: failureText(result, labels) });
  }
  async function keepMine() {
    const latest = await reload();
    if (!latest) { setMessage({ kind: 'error', text: 'The latest record could not be loaded. Reload the page.' }); return; }
    // Fields you did not touch take the latest saved value; fields you changed keep your edit.
    const before = draftOf(student), now = draftOf(latest.student), keys = Object.keys(now) as (keyof Draft)[];
    const mine = (key: keyof Draft) => draft[key] !== before[key];
    const changed = keys.filter(key => now[key] !== before[key]).map(key => `${labels[key]} is now "${now[key]}"${mine(key) ? ' (your edit is kept)' : ''}`);
    setDraft(Object.fromEntries(keys.map(key => [key, mine(key) ? draft[key] : now[key]])) as Draft);
    setConflict(false);
    setMessage({ kind: 'warning', text: 'The latest record is loaded and your edits are kept. ' + (changed.length ? 'Changed by someone else: ' + changed.join('; ') + '. ' : '') + 'Review, then save again.' });
  }
  async function discard() { const latest = await reload(); if (latest) { setDraft(draftOf(latest.student)); setConflict(false); setMessage(null); } }

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Student details</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4" aria-label="Student details form" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="student-first" label="First name"><Input id="student-first" value={draft.firstName} onChange={set('firstName')} maxLength={80} required autoComplete="off" /></Field>
            <Field id="student-last" label="Last name"><Input id="student-last" value={draft.lastName} onChange={set('lastName')} maxLength={80} required autoComplete="off" /></Field>
            <Field id="student-dob" label="Date of birth"><Input id="student-dob" type="date" value={draft.dateOfBirth} onChange={set('dateOfBirth')} required /></Field>
            <Field id="student-admission" label="Admission number"><Input id="student-admission" value={draft.admissionNumber} onChange={set('admissionNumber')} maxLength={40} required autoComplete="off" /></Field>
            <Field id="student-grade-level" label="Grade"><Input id="student-grade-level" value={draft.gradeLevel} onChange={set('gradeLevel')} maxLength={20} required autoComplete="off" /></Field>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save student details'}</Button>
            <span className="text-xs text-muted-foreground">Last saved {shortDate(student.updatedAt)}.</span>
          </div>
        </form>
        {message && <div className="mt-4"><Notice kind={message.kind}>{message.text}</Notice></div>}
        {conflict && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void keepMine()}>Load latest and keep my edits</Button>
            <Button type="button" variant="outline" onClick={() => void discard()}>Discard my edits</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusPanel({ detail, setDetail, reload }: { detail: StudentRecordDetail; setDetail: (value: StudentRecordDetail) => void; reload: () => Promise<StudentRecordDetail | null> }) {
  const student = detail.student;
  const active = student.status === 'active';
  const action = active ? 'deactivate' : 'reactivate';
  const [reason, setReason] = React.useState('');
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<Msg>(null);
  const [stale, setStale] = React.useState(false);
  const attempt = useAttempt();

  async function submit() {
    if (busy) return;
    setBusy(true); setMessage(null);
    const payload = { action, reason, expectedVersion: student.statusVersion };
    const result = await api<{ detail: StudentRecordDetail; replayed: boolean }>('POST', base(student.id) + '/status', { ...payload, clientRequestId: attempt.idFor(payload) });
    setBusy(false);
    if (result.ok && result.data) {
      attempt.clear(); setDetail(result.data.detail); setReason(''); setConfirming(false); setStale(false);
      setMessage({ kind: 'success', text: active ? 'Student deactivated. No records were deleted.' : 'Student reactivated.' }); return;
    }
    if (!result.unreachable) attempt.clear();
    if (isStale(result)) setStale(true);
    setConfirming(false);
    setMessage({ kind: 'error', text: failureText(result, labels) });
  }
  async function refresh() { const latest = await reload(); setStale(false); setMessage({ kind: latest ? 'info' : 'error', text: latest ? 'The latest status is loaded. Review it, then try again.' : 'The latest record could not be loaded. Reload the page.' }); }
  const long = Array.from(reason.trim()).length >= 10;

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Record status</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="flex flex-wrap items-center gap-2 text-sm">Current status: <StatusBadge active={active} /> {student.statusChangedAt && <span className="text-muted-foreground">since {shortDate(student.statusChangedAt)}</span>}</p>
        <p className="text-sm text-muted-foreground">
          {active ? `Deactivating hides the student from the default list and withdraws ${detail.activeEnrolments} active ${detail.activeEnrolments === 1 ? 'enrolment' : 'enrolments'}. Nothing is deleted. It does not change sign-in or what families can already see.`
            : 'Reactivating shows the student in the default list again. Earlier withdrawn enrolments are not restored automatically.'}
        </p>
        <Reason id="status-reason" value={reason} onChange={value => { setReason(value); setConfirming(false); }} />
        {!confirming && <Button type="button" variant={active ? 'destructive' : 'default'} disabled={!long || busy} onClick={() => setConfirming(true)}>{active ? 'Deactivate student' : 'Reactivate student'}</Button>}
        {confirming && (
          <div className="space-y-2 rounded-md border border-amber-500/50 bg-amber-50 p-3 text-amber-950" role="group" aria-label="Confirm status change">
            <p className="text-sm font-medium">{active ? `Deactivate ${student.firstName} ${student.lastName} and withdraw ${detail.activeEnrolments} active ${detail.activeEnrolments === 1 ? 'enrolment' : 'enrolments'}?` : `Reactivate ${student.firstName} ${student.lastName}?`}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant={active ? 'destructive' : 'default'} disabled={busy} onClick={() => void submit()}>{busy ? 'Saving…' : active ? 'Yes, deactivate' : 'Yes, reactivate'}</Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button>
            </div>
          </div>
        )}
        {message && <Notice kind={message.kind}>{message.text}</Notice>}
        {stale && <Button type="button" variant="outline" onClick={() => void refresh()}>Load latest status</Button>}
      </CardContent>
    </Card>
  );
}

type LinkForm = { guardianId: string; relationship: string; isPrimary: boolean; reason: string };
const emptyLink: LinkForm = { guardianId: '', relationship: '', isPrimary: false, reason: '' };

function GuardianLinks({ studentId, inventory, setInventory, reload }: { studentId: string; inventory: GuardianLinkInventory; setInventory: (value: GuardianLinkInventory) => void; reload: () => Promise<unknown> }) {
  const [form, setForm] = React.useState<LinkForm>(emptyLink);
  const [editing, setEditing] = React.useState<{ guardianId: string; mode: 'update' | 'unlink'; relationship: string; isPrimary: boolean; reason: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<Msg>(null);
  const [stale, setStale] = React.useState(false);
  const attempt = useAttempt();
  const candidate = inventory.candidates.find(item => item.id === form.guardianId);

  async function post(payload: Record<string, unknown>, success: string, reset: () => void) {
    if (busy) return;
    setBusy(true); setMessage(null);
    const result = await api<{ inventory: GuardianLinkInventory; replayed: boolean }>('POST', base(studentId) + '/guardian-links', { ...payload, clientRequestId: attempt.idFor(payload) });
    setBusy(false);
    if (result.ok && result.data) { attempt.clear(); setInventory(result.data.inventory); setStale(false); reset(); setMessage({ kind: 'success', text: success }); return; }
    if (!result.unreachable) attempt.clear();
    if (isStale(result)) setStale(true);
    setMessage({ kind: 'error', text: failureText(result, labels) });
  }
  function link(event: React.FormEvent) {
    event.preventDefault();
    if (!candidate) { setMessage({ kind: 'error', text: 'Choose a guardian to link.' }); return; }
    void post({ action: 'link', guardianId: candidate.id, relationship: form.relationship, isPrimary: form.isPrimary, reason: form.reason, expectedVersion: candidate.version }, `${candidate.name} is now linked.`, () => setForm(emptyLink));
  }
  function change(event: React.FormEvent, row: GuardianLinkView) {
    event.preventDefault();
    if (!editing) return;
    if (editing.mode === 'unlink') void post({ action: 'unlink', guardianId: row.guardianId, reason: editing.reason, expectedVersion: row.version }, `${row.name} is no longer linked. The history is kept.`, () => setEditing(null));
    else void post({ action: 'update', guardianId: row.guardianId, relationship: editing.relationship, isPrimary: editing.isPrimary, reason: editing.reason, expectedVersion: row.version }, `Link to ${row.name} updated.`, () => setEditing(null));
  }
  async function refresh() { await reload(); setStale(false); setMessage({ kind: 'info', text: 'The latest links are loaded. Review them, then try again.' }); }

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Guardians</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {inventory.links.length === 0 ? <p className="text-sm text-muted-foreground">No guardians are linked to this student yet.</p> : (
          <ul className="divide-y rounded-md border" aria-label="Linked guardians">
            {inventory.links.map(row => (
              <li key={row.guardianId} className="space-y-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-medium">{row.name}{row.isPrimary && <span className="ml-2 rounded-full border border-blue-600/40 bg-blue-50 px-2 py-0.5 text-xs text-blue-900">Primary contact</span>}</p>
                    <p className="text-sm text-muted-foreground">{row.relationship}{row.hasLogin ? ' · Has a sign-in' : ''}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" aria-label={`Edit link to ${row.name}`} onClick={() => setEditing(editing?.guardianId === row.guardianId && editing.mode === 'update' ? null : { guardianId: row.guardianId, mode: 'update', relationship: row.relationship, isPrimary: row.isPrimary, reason: '' })}>Edit</Button>
                    <Button type="button" variant="outline" size="sm" aria-label={`Unlink ${row.name}`} onClick={() => setEditing(editing?.guardianId === row.guardianId && editing.mode === 'unlink' ? null : { guardianId: row.guardianId, mode: 'unlink', relationship: row.relationship, isPrimary: row.isPrimary, reason: '' })}>Unlink</Button>
                  </div>
                </div>
                {editing?.guardianId === row.guardianId && (
                  <form onSubmit={event => change(event, row)} className="space-y-3 rounded-md bg-muted/40 p-3" aria-label={editing.mode === 'unlink' ? `Unlink ${row.name}` : `Edit link to ${row.name}`} noValidate>
                    {editing.mode === 'update' && (
                      <>
                        <Field id={'edit-rel-' + row.guardianId} label="Relationship to the student"><Input id={'edit-rel-' + row.guardianId} value={editing.relationship} onChange={event => setEditing({ ...editing, relationship: event.target.value })} maxLength={60} required autoComplete="off" /></Field>
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.isPrimary} onChange={event => setEditing({ ...editing, isPrimary: event.target.checked })} /> Primary contact for this student</label>
                      </>
                    )}
                    {editing.mode === 'unlink' && <p className="text-sm">The guardian will lose access to this student straight away. The link history is kept.</p>}
                    <Reason id={'edit-reason-' + row.guardianId} value={editing.reason} onChange={value => setEditing({ ...editing, reason: value })} />
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" variant={editing.mode === 'unlink' ? 'destructive' : 'default'} disabled={busy}>{busy ? 'Saving…' : editing.mode === 'unlink' ? 'Unlink guardian' : 'Save link'}</Button>
                      <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                    </div>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {message && <Notice kind={message.kind}>{message.text}</Notice>}
        {stale && <Button type="button" variant="outline" onClick={() => void refresh()}>Load latest links</Button>}
        <form onSubmit={link} className="space-y-3 rounded-md border p-3" aria-label="Link a guardian" noValidate>
          <h3 className="font-medium">Link a guardian</h3>
          {inventory.candidates.length === 0 ? <p className="text-sm text-muted-foreground">Every guardian in this school is already linked to this student.</p> : (
            <>
              <Field id="link-guardian" label="Guardian">
                <select id="link-guardian" className={selectClass} value={form.guardianId} onChange={event => { const next = inventory.candidates.find(item => item.id === event.target.value); setForm({ ...form, guardianId: event.target.value, relationship: form.relationship || next?.relationship || '' }); }}>
                  <option value="">Choose a guardian</option>
                  {inventory.candidates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </Field>
              <Field id="link-relationship" label="Relationship to the student"><Input id="link-relationship" value={form.relationship} onChange={event => setForm({ ...form, relationship: event.target.value })} maxLength={60} required autoComplete="off" /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isPrimary} onChange={event => setForm({ ...form, isPrimary: event.target.checked })} /> Primary contact for this student</label>
              <Reason id="link-reason" value={form.reason} onChange={value => setForm({ ...form, reason: value })} />
              <Button type="submit" disabled={busy}>{busy ? 'Linking…' : 'Link guardian'}</Button>
            </>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function History({ detail, inventory }: { detail: StudentRecordDetail; inventory: GuardianLinkInventory }) {
  const rows = [
    ...detail.history.map(item => ({ key: 's' + item.id, at: item.createdAt, text: `${item.actorName ?? 'An administrator'} ${item.action === 'deactivate' ? `deactivated the student (${item.withdrawnEnrolments} ${item.withdrawnEnrolments === 1 ? 'enrolment' : 'enrolments'} withdrawn)` : 'reactivated the student'}`, reason: item.reason })),
    ...inventory.history.map(item => ({ key: 'g' + item.id, at: item.createdAt, text: `${item.actorName ?? 'An administrator'} ${item.action === 'link' ? 'linked' : item.action === 'unlink' ? 'unlinked' : 'changed the link to'} ${item.guardianName}${item.action !== 'unlink' && item.relationshipAfter ? ` as ${item.relationshipAfter}` : ''}${item.primaryAfter ? ' (primary contact)' : ''}`, reason: item.reason })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">History</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">No status or guardian link changes have been recorded yet.</p> : (
          <ol className="space-y-3" aria-label="Record history">
            {rows.map(row => <li key={row.key} className="text-sm"><p className="font-medium">{row.text}</p><p className="text-muted-foreground">{dateTime(row.at)} · Reason: {row.reason}</p></li>)}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function Manage({ principal, id }: { principal: Principal; id: string }) {
  const [detail, setDetail] = React.useState<StudentRecordDetail | null>(null);
  const [inventory, setInventory] = React.useState<GuardianLinkInventory | null>(null);
  const [outcome, setOutcome] = React.useState<{ version: number; error: string } | null>(null);
  const [version, setVersion] = React.useState(0);
  const loading = principal.role === 'admin' && outcome?.version !== version;
  const error = outcome?.version === version ? outcome.error : '';

  const loadDetail = React.useCallback(async () => {
    const result = await api<StudentRecordDetail>('GET', base(id));
    if (result.ok && result.data) { setDetail(result.data); return result.data; }
    return null;
  }, [id]);
  const loadInventory = React.useCallback(async () => {
    const result = await api<GuardianLinkInventory>('GET', base(id) + '/guardian-links');
    if (result.ok && result.data) { setInventory(result.data); return result.data; }
    return null;
  }, [id]);
  React.useEffect(() => {
    if (principal.role !== 'admin') return;
    let live = true;
    Promise.all([api<StudentRecordDetail>('GET', base(id)), api<GuardianLinkInventory>('GET', base(id) + '/guardian-links')]).then(([one, two]) => {
      if (!live) return;
      if (!one.ok || !one.data) { setOutcome({ version, error: failureText(one) }); return; }
      if (!two.ok || !two.data) { setOutcome({ version, error: failureText(two) }); return; }
      setDetail(one.data); setInventory(two.data); setOutcome({ version, error: '' });
    });
    return () => { live = false; };
  }, [id, principal.role, version]);

  if (principal.role !== 'admin') return <Notice kind="warning">Only administrators can manage student records. <a className="font-medium underline underline-offset-4" href="/records">Back to the student list</a></Notice>;
  if (loading) return <p role="status">Loading the student record…</p>;
  if (error || !detail || !inventory) return <div className="space-y-2"><Notice kind="error">{error || 'This student record could not be loaded.'}</Notice><div className="flex gap-2"><Button variant="outline" onClick={() => setVersion(value => value + 1)}>Try again</Button><a className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent" href="/records">Back to the student list</a></div></div>;
  const student = detail.student;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-xl font-semibold">{student.firstName} {student.lastName}</h3><StatusBadge active={student.status === 'active'} />
        <a className="text-sm font-medium underline underline-offset-4" href="/records">All students</a>
        <a className="text-sm font-medium underline underline-offset-4" href={`/students/${encodeURIComponent(student.id)}`}>Open profile</a>
      </div>
      <DetailsForm key={student.id} detail={detail} setDetail={setDetail} reload={loadDetail} />
      <StatusPanel detail={detail} setDetail={setDetail} reload={loadDetail} />
      <GuardianLinks studentId={student.id} inventory={inventory} setInventory={setInventory} reload={loadInventory} />
      <History detail={detail} inventory={inventory} />
    </div>
  );
}

export default function ManageStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const gate = usePrincipal();
  return (
    <RecordsFrame current="students" title="Manage student record" intro="Edit details, change status and manage guardian links. Every change is recorded." gate={gate}>
      {principal => <Manage key={principal.id + id} principal={principal} id={id} />}
    </RecordsFrame>
  );
}
