'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- native navigation avoids the observed vinext beta transition failure. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isExactStoredTimestamp } from '@/lib/education/stored-timestamp';
import type { Principal } from '@/lib/education/types';

type SavedSchool = { id: string; name: string; address: string | null; createdAt: string; updatedAt: string };
type Fields = { name: string; address: string };
type Draft = {
  actorKey: string;
  schoolId: string;
  fields: Fields;
  dirty: { name: boolean; address: boolean };
};
type View = { actor: Principal; school: SavedSchool };
type Submission = {
  actorKey: string;
  schoolId: string;
  endpoint: string;
  body: string;
  payload: { name: string; address?: string };
  fields: Fields;
};
const blank = { name: '', address: '' };
const actorKey = (actor: Principal) => JSON.stringify([actor.id, actor.role, actor.schoolId]);
const schoolKey = (school: SavedSchool) =>
  JSON.stringify([school.id, school.name, school.address, school.createdAt, school.updatedAt]);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
function isPrincipal(value: unknown): value is Principal {
  if (!value || typeof value !== 'object') return false;
  const actor = value as Partial<Principal>;
  return (
    nonempty(actor.id) &&
    nonempty(actor.schoolId) &&
    ['admin', 'teacher', 'guardian', 'student'].includes(actor.role ?? '')
  );
}
function isSchool(value: unknown): value is SavedSchool {
  if (!value || typeof value !== 'object') return false;
  const school = value as Partial<SavedSchool>;
  return (
    nonempty(school.id) &&
    nonempty(school.name) &&
    (school.address === null || typeof school.address === 'string') &&
    nonempty(school.createdAt) &&
    nonempty(school.updatedAt)
  );
}
class SchoolResponseError extends Error {
  constructor(public status: number) {
    super('School response unavailable');
  }
}
class SchoolDataError extends Error {}
async function consume(response: Response): Promise<unknown> {
  const body = await response.text();
  if (!response.ok) throw new SchoolResponseError(response.status);
  if (response.status !== 200)
    throw new SchoolDataError(
      'The school response could not be verified. Reload to check the current details.',
    );
  return JSON.parse(body) as unknown;
}
async function snapshot(signal: AbortSignal, current: () => boolean): Promise<View> {
  const before = await consume(await fetch('/api/session', { cache: 'no-store', signal }));
  if (!current()) throw new Error('Obsolete school read');
  if (!isPrincipal(before))
    throw new SchoolDataError('Your current account and school could not be verified.');
  const rows = await consume(await fetch('/api/schools', { cache: 'no-store', signal }));
  if (!current()) throw new Error('Obsolete school read');
  if (!Array.isArray(rows) || rows.length !== 1 || !isSchool(rows[0]) || rows[0].id !== before.schoolId) {
    throw new SchoolDataError(
      'The saved school is missing, duplicated, incomplete, or outside your current school. Reload to verify it.',
    );
  }
  const after = await consume(await fetch('/api/session', { cache: 'no-store', signal }));
  if (!current()) throw new Error('Obsolete school read');
  if (!isPrincipal(after) || actorKey(before) !== actorKey(after))
    throw new SchoolDataError(
      'Your account changed while school details were loading. Reload to verify the current account.',
    );
  return { actor: after, school: rows[0] };
}

export default function SchoolsPage() {
  const [view, setView] = useState<View | null>(null);
  const [fields, setFields] = useState<Fields>(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingView, setPendingView] = useState<Submission | null>(null);
  const [acknowledged, setAcknowledged] = useState<Submission | null>(null);
  const currentView = useRef<View | null>(null);
  const draft = useRef<Draft | null>(null);
  const pending = useRef<Submission | null>(null);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const lock = useRef(false);
  const message = useRef<HTMLDivElement>(null);
  const invalidate = useCallback(() => {
    generation.current++;
    controller.current?.abort();
  }, []);
  const hide = useCallback(() => {
    invalidate();
    currentView.current = null;
    setView(null);
    setFields(blank);
    setLoading(false);
  }, [invalidate]);
  const reload = useCallback(async (): Promise<View | null> => {
    if (!mounted.current) return null;
    invalidate();
    const request = generation.current;
    const abort = new AbortController();
    controller.current = abort;
    const current = () => mounted.current && request === generation.current && !abort.signal.aborted;
    currentView.current = null;
    setView(null);
    setFields(blank);
    setLoading(true);
    setError(null);
    try {
      const fresh = await snapshot(abort.signal, current);
      if (!current()) return null;
      const key = actorKey(fresh.actor),
        held = pending.current,
        previous = draft.current;
      const matchingDraft =
        previous?.actorKey === key && previous.schoolId === fresh.school.id ? previous : null;
      let next = { name: fresh.school.name, address: fresh.school.address ?? '' };
      let dirty = { name: false, address: false };
      if (held?.actorKey === key && held.schoolId === fresh.school.id) {
        next = { ...held.fields };
        dirty = { name: true, address: Object.hasOwn(held.payload, 'address') };
      } else if (matchingDraft) {
        next = {
          name: matchingDraft.dirty.name ? matchingDraft.fields.name : next.name,
          address: matchingDraft.dirty.address ? matchingDraft.fields.address : next.address,
        };
        dirty = { ...matchingDraft.dirty };
      }
      draft.current = { actorKey: key, schoolId: fresh.school.id, fields: next, dirty };
      currentView.current = fresh;
      setView(fresh);
      setFields(next);
      return fresh;
    } catch (failure) {
      if (!current()) return null;
      currentView.current = null;
      setView(null);
      setFields(blank);
      setError(
        failure instanceof SchoolDataError
          ? failure.message
          : failure instanceof SchoolResponseError && failure.status === 401
            ? 'Please sign in again, then reload to verify school details.'
            : failure instanceof SchoolResponseError && [403, 404].includes(failure.status)
              ? 'School details are unavailable to the current account. Reload to verify access.'
              : 'School details could not be verified. Reload and try again.',
      );
      return null;
    } finally {
      if (current()) setLoading(false);
    }
  }, [invalidate]);
  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => {
      mounted.current = false;
      invalidate();
    };
  }, [invalidate, reload]);
  useEffect(() => {
    if (error || notice) message.current?.focus();
  }, [error, notice]);
  async function update(event: React.FormEvent) {
    event.preventDefault();
    const captured = view,
      intent = draft.current;
    if (
      !mounted.current ||
      lock.current ||
      pending.current ||
      !captured ||
      currentView.current !== captured ||
      captured.actor.role !== 'admin' ||
      !intent ||
      intent.actorKey !== actorKey(captured.actor) ||
      intent.schoolId !== captured.school.id
    )
      return;
    const frozenIntent = { ...intent, fields: { ...intent.fields }, dirty: { ...intent.dirty } };
    lock.current = true;
    setSaving(true);
    setError(null);
    setNotice(null);
    setAcknowledged(null);
    invalidate();
    const request = generation.current,
      abort = new AbortController();
    controller.current = abort;
    const current = () => mounted.current && request === generation.current && !abort.signal.aborted;
    currentView.current = null;
    setView(null);
    setFields(blank);
    setLoading(false);
    let sent = false;
    try {
      const fresh = await snapshot(abort.signal, current);
      if (!current()) return;
      if (
        fresh.actor.role !== 'admin' ||
        actorKey(fresh.actor) !== frozenIntent.actorKey ||
        fresh.school.id !== frozenIntent.schoolId
      )
        throw new SchoolDataError(
          'Your account or school changed before saving. No update was sent. Reload to verify access.',
        );
      const next = {
        name: frozenIntent.dirty.name ? frozenIntent.fields.name : fresh.school.name,
        address: frozenIntent.dirty.address ? frozenIntent.fields.address : fresh.school.address,
      };
      const payload = { name: next.name, ...(next.address === null ? {} : { address: next.address }) };
      const submission: Submission = {
        actorKey: frozenIntent.actorKey,
        schoolId: fresh.school.id,
        endpoint: '/api/schools/' + encodeURIComponent(fresh.school.id),
        body: JSON.stringify(payload),
        payload,
        fields: { name: next.name, address: next.address ?? '' },
      };
      pending.current = submission;
      setPendingView(submission);
      sent = true;
      // A started PATCH is not cancelled or replayed: it can persist after navigation.
      const response = await fetch(submission.endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: submission.body,
      });
      const saved = await consume(response);
      if (
        response.status !== 200 ||
        !isSchool(saved) ||
        saved.id !== submission.schoolId ||
        saved.name !== payload.name ||
        saved.createdAt !== fresh.school.createdAt ||
        !isExactStoredTimestamp(saved.updatedAt) ||
        (Object.hasOwn(payload, 'address') && saved.address !== payload.address)
      )
        throw new Error('Unconfirmed school update');
      if (!mounted.current) return;
      pending.current = null;
      setPendingView(null);
      setAcknowledged(submission);
      draft.current = null;
      setNotice(
        'School details saved. The submitted update was acknowledged; reload verifies the current saved details.',
      );
      await reload();
    } catch (failure) {
      if (!mounted.current) return;
      if (!sent)
        setError(
          failure instanceof SchoolDataError
            ? failure.message
            : 'Your current account and school could not be verified. No update was sent. Reload before saving.',
        );
      else if (failure instanceof SchoolResponseError && [400, 401, 403, 404, 409].includes(failure.status)) {
        pending.current = null;
        setPendingView(null);
        setError(
          failure.status === 409
            ? 'School access changed and this update was rejected. Reload and review your entries before another save.'
            : 'This update was rejected. Reload and check your entries before another save.',
        );
      } else
        setError(
          'The school save could not be confirmed. Reload as the original administrator and compare the saved details before another update.',
        );
      hide();
    } finally {
      lock.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  async function compare() {
    const held = pending.current,
      captured = view;
    if (
      !mounted.current ||
      lock.current ||
      !held ||
      !captured ||
      currentView.current !== captured ||
      captured.actor.role !== 'admin' ||
      actorKey(captured.actor) !== held.actorKey ||
      captured.school.id !== held.schoolId
    )
      return;
    lock.current = true;
    setSaving(true);
    setNotice(null);
    const reviewed = schoolKey(captured.school);
    try {
      const fresh = await reload();
      if (!mounted.current || pending.current !== held || !fresh) return;
      if (
        fresh.actor.role !== 'admin' ||
        actorKey(fresh.actor) !== held.actorKey ||
        fresh.school.id !== held.schoolId
      ) {
        hide();
        setError('Return as the original administrator and reload before comparing this update.');
        return;
      }
      if (schoolKey(fresh.school) !== reviewed) {
        setNotice(
          'Saved school details changed during comparison. Review the current saved details and compare again.',
        );
        return;
      }
      pending.current = null;
      setPendingView(null);
      const next = { name: fresh.school.name, address: fresh.school.address ?? '' };
      draft.current = {
        actorKey: held.actorKey,
        schoolId: held.schoolId,
        fields: next,
        dirty: { name: false, address: false },
      };
      setFields(next);
      setNotice(
        'Comparison completed. This does not confirm whether the earlier request was saved. Further changes require a new explicit save.',
      );
    } finally {
      lock.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  function edit(field: keyof Fields, value: string) {
    const held = draft.current;
    if (
      !mounted.current ||
      lock.current ||
      pending.current ||
      !view ||
      currentView.current !== view ||
      view.actor.role !== 'admin' ||
      !held ||
      held.actorKey !== actorKey(view.actor) ||
      held.schoolId !== view.school.id
    )
      return;
    const next = { ...held.fields, [field]: value };
    draft.current = { ...held, fields: next, dirty: { ...held.dirty, [field]: true } };
    setFields(next);
  }
  const authorized = view && !loading && !error;
  const originalActor = authorized && view.actor.role === 'admin';
  const comparisonAvailable =
    originalActor &&
    pendingView &&
    pendingView.actorKey === actorKey(view.actor) &&
    pendingView.schoolId === view.school.id;
  const ackVisible =
    originalActor &&
    acknowledged &&
    acknowledged.actorKey === actorKey(view.actor) &&
    acknowledged.schoolId === view.school.id;
  return (
    <AppShell principal={authorized ? view.actor : null}>
      <div className="mx-auto min-w-0 max-w-5xl space-y-6 p-4">
        <div>
          <a href="/" className="text-sm underline">
            Dashboard
          </a>
          <h1>School</h1>
          <p className="text-muted-foreground">Your existing school details.</p>
        </div>
        {(error || notice) && (
          <div ref={message} tabIndex={-1} className="rounded border p-3 break-words">
            {error && <p role="alert">{error}</p>}
            {notice && <p role="status">{notice}</p>}
          </div>
        )}
        {loading && <p role="status">Loading school details…</p>}
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (!lock.current) void reload();
          }}
          disabled={saving}
        >
          Reload saved school details
        </Button>
        {ackVisible && (
          <section
            aria-label="Acknowledged school update"
            className="space-y-2 rounded border p-3 break-words"
          >
            <p>The submitted update was acknowledged. This is separate from the current saved details.</p>
            <p>Submitted school name: {acknowledged.payload.name}</p>
            <p>
              {Object.hasOwn(acknowledged.payload, 'address')
                ? 'Submitted address: ' + (acknowledged.payload.address || '(empty)')
                : 'The request left the saved address unchanged.'}
            </p>
          </section>
        )}
        {pendingView && (
          <section aria-label="Pending school update" className="space-y-2 rounded border p-3 break-words">
            <p>
              An update needs comparison with the current saved details. It is never resubmitted
              automatically. A started request may still be saved after you leave. Pending details exist only
              in this page; navigation or a hard reload discards them.
            </p>
            {comparisonAvailable ? (
              <>
                <p>Original submitted school name: {pendingView.payload.name}</p>
                <p>
                  {Object.hasOwn(pendingView.payload, 'address')
                    ? 'Original submitted address: ' + (pendingView.payload.address || '(empty)')
                    : 'The request left the saved address unchanged.'}
                </p>
                <p>
                  Compare these submitted values with the current saved details below. Completing comparison
                  resets the form to those saved details; it does not confirm the earlier request.
                </p>
                <Button type="button" onClick={() => void compare()} disabled={saving || loading}>
                  I compared the saved details
                </Button>
              </>
            ) : (
              <p>
                Return as the original administrator and reload to view the pending details.{' '}
                <a href="/login" target="_blank" rel="noopener noreferrer" className="underline">
                  Sign in in another tab
                </a>
                .
              </p>
            )}
          </section>
        )}
        {authorized && (
          <div className="grid min-w-0 gap-6 md:grid-cols-2">
            <Card role="region" aria-label="Saved school details" data-school-details={view.school.id}>
              <CardHeader>
                <CardTitle>Saved school details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 break-words">
                <p className="font-semibold">{view.school.name}</p>
                <p>{view.school.address || 'No address supplied.'}</p>
              </CardContent>
            </Card>
            {view.actor.role === 'admin' && (
              <Card>
                <CardHeader>
                  <CardTitle>Edit school</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-sm">
                    Reload refreshes untouched fields and retains fields you deliberately edited. Review the
                    saved details before saving; a later update can overwrite another administrator’s changes.
                  </p>
                  <form onSubmit={update} className="space-y-4">
                    <fieldset disabled={saving || Boolean(pendingView)} className="min-w-0 space-y-4">
                      <div>
                        <Label htmlFor="school-name">School name</Label>
                        <Input
                          id="school-name"
                          value={fields.name}
                          required
                          onChange={(event) => edit('name', event.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="school-address">Address (optional)</Label>
                        <Input
                          id="school-address"
                          value={fields.address}
                          onChange={(event) => edit('address', event.target.value)}
                        />
                      </div>
                      <Button type="submit">{saving ? 'Saving…' : 'Save school details'}</Button>
                    </fieldset>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
