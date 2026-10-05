'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- full-page links preserve the established staff editor navigation. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Class, Principal } from '@/lib/education/types';
import type { ReadingReview, ReadingReviewObservation } from '@/lib/education/reading-review';
import type { CurriculumReference, CurriculumVersion, CurriculumSnapshot, CurriculumProvenance } from '@/lib/education/curriculum';
import type { ResourceType, TeachingResource } from '@/lib/education/resource-types';

type Choices = { classId: string; referenceId: string; versionId: string };
type Context = Choices & { actor: Principal; classes: Class[]; readings: ReadingReview; references: CurriculumReference[]; versions: CurriculumVersion[]; snapshot: CurriculumSnapshot | null };
type DraftReceipt = { resource: TeachingResource; provenance: CurriculumProvenance };
type Pending = Choices & { actorKey: string; actorId: string; schoolId: string; checkId: string; reading: ReadingReviewObservation; source: CurriculumSnapshot; type: ResourceType; focus: string; body: string; resourceId: string };
type Receipt = { action: Pending; saved: DraftReceipt };
const actorKey = (actor: Principal) => JSON.stringify([actor.id, actor.role, actor.schoolId]);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const timestamp = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const approved = (version: CurriculumVersion) => nonempty(version.approvedBy) && timestamp(version.approvedAt);
class RequestFailure extends Error { constructor(readonly status: number) { super('Practice request unavailable'); } }
async function json<T>(response: Response): Promise<T> {
  const value = await response.text();
  if (!response.ok) throw new RequestFailure(response.status);
  return JSON.parse(value) as T;
}
async function read<T>(path: string, signal?: AbortSignal) { return json<T>(await fetch(path, { cache: 'no-store', signal })); }
function staff(actor: Principal) {
  if (!actor || !nonempty(actor.id) || !nonempty(actor.schoolId) || !['teacher', 'admin'].includes(actor.role)) throw new RequestFailure(403);
  return actor;
}
function sourcePath(referenceId: string) { return '/api/curriculum/' + encodeURIComponent(referenceId); }
function validateSnapshot(value: CurriculumSnapshot, referenceId: string, versionId: string): CurriculumSnapshot {
  const content = value?.content, draft = value?.suggestedDraft;
  if (!content || value.referenceId !== referenceId || value.versionId !== versionId || content.referenceId !== referenceId || content.id !== versionId || value.version !== content.version || !Number.isInteger(content.version) || content.version < 1 || !approved(content) || !timestamp(content.createdAt) || !nonempty(content.createdBy) || !draft || draft.type !== 'lesson' || draft.teacherNotes !== '' || draft.answerKey !== '') throw new Error('Unconfirmed reviewed source');
  for (const key of ['title', 'curriculum', 'gradeLevel', 'subject', 'language', 'objectives', 'body', 'rightsStatement'] as const) if (!nonempty(content[key])) throw new Error('Incomplete reviewed source');
  for (const key of ['title', 'curriculum', 'gradeLevel', 'subject', 'language', 'objectives', 'body'] as const) if (draft[key] !== content[key]) throw new Error('Uncorrelated source preview');
  if (typeof content.sourceReference !== 'string' || (content.sourceUrl !== null && typeof content.sourceUrl !== 'string')) throw new Error('Incomplete source attribution');
  return value;
}
function validateReadings(value: ReadingReview, classId: string, schoolId: string): ReadingReview {
  if (!value || !Array.isArray(value.observations) || !Array.isArray(value.series)) throw new Error('Unconfirmed reading history');
  const ids = new Set<string>();
  for (const observation of value.observations) {
    const original = observation?.original, effective = observation?.effective;
    if (!original || original.classId !== classId || original.schoolId !== schoolId || !nonempty(original.id) || ids.has(original.id) || !nonempty(original.studentId) || original.provenance !== 'manual-reviewed-external' || original.sourceAppId !== 'oral-reading-fluency' || !nonempty(original.recordedBy) || !timestamp(original.createdAt) || !Number.isInteger(observation.revision) || observation.revision < 0 || !Array.isArray(observation.corrections)) throw new Error('Uncorrelated reading history');
    ids.add(original.id);
    for (const metrics of [original, effective]) if (!metrics || !nonempty(metrics.language) || !nonempty(metrics.passageReference) || !/^\d{4}-\d{2}-\d{2}$/.test(metrics.readingDate) || !Number.isFinite(metrics.durationMs) || metrics.durationMs < 1000 || metrics.durationMs > 3600000 || metrics.durationSeconds !== metrics.durationMs / 1000 || !Number.isInteger(metrics.wordsAttempted) || metrics.wordsAttempted < 1 || metrics.wordsAttempted > 500 || !Number.isInteger(metrics.wordsCorrect) || metrics.wordsCorrect < 0 || metrics.wordsCorrect > metrics.wordsAttempted || metrics.wcpm !== Math.round(metrics.wordsCorrect * 60000 / metrics.durationMs) || metrics.accuracy !== Math.round(metrics.wordsCorrect * 100 / metrics.wordsAttempted)) throw new Error('Unconfirmed reading values');
    const correction = observation.corrections.at(-1);
    if (observation.revision === 0 ? correction !== undefined : !correction || correction.readingCheckId !== original.id || correction.revision !== observation.revision) throw new Error('Unconfirmed reading revision');
    const latest = correction ?? original;
    for (const key of ['language', 'passageReference', 'readingDate', 'durationMs', 'wordsAttempted', 'wordsCorrect'] as const) if (effective[key] !== latest[key]) throw new Error('Uncorrelated effective reading');
  }
  return value;
}
function validateReceipt(value: DraftReceipt, action: Pending): DraftReceipt {
  const resource = value?.resource, version = resource?.latest, provenance = value?.provenance;
  if (!resource || resource.id !== action.resourceId || resource.authorId !== action.actorId || resource.schoolId !== action.schoolId || !timestamp(resource.createdAt) || !version || version.resourceId !== resource.id || !nonempty(version.id) || version.version !== 1 || version.type !== action.type || version.createdBy !== action.actorId || !timestamp(version.createdAt) || version.teacherNotes !== '' || version.answerKey !== '' || !((version.approvedAt === null && version.approvedBy === null) || (timestamp(version.approvedAt) && nonempty(version.approvedBy))) || !provenance || !nonempty(provenance.id) || provenance.resourceId !== resource.id || provenance.resourceVersionId !== version.id || provenance.referenceId !== action.referenceId || provenance.referenceVersionId !== action.versionId || provenance.selectedBy !== action.actorId || !timestamp(provenance.createdAt)) throw new Error('Unconfirmed draft receipt');
  for (const key of ['title', 'curriculum', 'gradeLevel', 'subject', 'language', 'objectives', 'body'] as const) if (version[key] !== action.source.content[key]) throw new Error('Uncorrelated copied content');
  return value;
}
const inputStyle = 'w-full min-w-0 rounded border bg-background p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
const buttonStyle = 'rounded border px-3 py-2 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

export default function ReadingPracticePage() {
  const [context, setContext] = useState<Context | null>(null);
  const [checkId, setCheckId] = useState('');
  const [focus, setFocus] = useState('');
  const [type, setType] = useState<ResourceType>('activity');
  const [reviewed, setReviewed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const [pendingView, setPendingView] = useState<Pending | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const currentContext = useRef<Context | null>(null), choices = useRef<Choices>({ classId: '', referenceId: '', versionId: '' });
  const selectedCheck = useRef(''), planningFocus = useRef(''), planningActor = useRef<string | null>(null), selectedType = useRef<ResourceType>('activity'), confirmed = useRef(false);
  const pending = useRef<Pending | null>(null), savedReceipt = useRef<Receipt | null>(null);
  const generation = useRef(0), controller = useRef<AbortController | null>(null), mounted = useRef(true), lock = useRef(false);
  const message = useRef<HTMLDivElement>(null);
  const invalidate = useCallback(() => { generation.current++; controller.current?.abort(); }, []);
  const hidePrivate = useCallback(() => {
    currentContext.current = null; confirmed.current = false;
    setContext(null); setReceipt(null); setFocus(''); setCheckId(''); setReviewed(false);
  }, []);
  const reload = useCallback(async (requested: Choices = choices.current) => {
    const ticket = ++generation.current;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const current = () => mounted.current && ticket === generation.current && !abort.signal.aborted;
    hidePrivate(); setLoading(true); setError('');
    try {
      const actor = staff(await read<Principal>('/api/session', abort.signal));
      if (!current()) return;
      const outcomes = await Promise.allSettled([read<Class[]>('/api/classes', abort.signal), read<CurriculumReference[]>('/api/curriculum', abort.signal)]);
      if (!current()) return;
      for (const outcome of outcomes) if (outcome.status === 'rejected') throw outcome.reason;
      const classes = (outcomes[0] as PromiseFulfilledResult<Class[]>).value, references = (outcomes[1] as PromiseFulfilledResult<CurriculumReference[]>).value;
      if (!Array.isArray(classes) || !Array.isArray(references) || classes.some(row => !nonempty(row.id) || row.schoolId !== actor.schoolId || !nonempty(row.name)) || references.some(row => !nonempty(row.id) || row.schoolId !== actor.schoolId || !row.latest || row.latest.referenceId !== row.id || !nonempty(row.latest.title))) throw new Error('Unconfirmed staff choices');
      const classId = classes.some(row => row.id === requested.classId) ? requested.classId : requested.classId ? '' : classes[0]?.id ?? '';
      const referenceId = references.some(row => row.id === requested.referenceId) ? requested.referenceId : '';
      if (requested.classId && !classId || requested.referenceId && !referenceId) throw new RequestFailure(404);
      const readings = classId ? validateReadings(await read<ReadingReview>('/api/reading-review?' + new URLSearchParams({ classId }), abort.signal), classId, actor.schoolId!) : { observations: [], series: [] };
      if (!current()) return;
      const versions = referenceId ? await read<CurriculumVersion[]>(sourcePath(referenceId) + '/versions', abort.signal) : [];
      if (!Array.isArray(versions) || versions.some(version => version.referenceId !== referenceId || !nonempty(version.id) || !Number.isInteger(version.version))) throw new Error('Unconfirmed source history');
      const reviewedVersions = versions.filter(approved);
      const versionId = reviewedVersions.some(version => version.id === requested.versionId) ? requested.versionId : requested.versionId ? '' : reviewedVersions.at(-1)?.id ?? '';
      const snapshot = versionId ? validateSnapshot(await read<CurriculumSnapshot>(sourcePath(referenceId) + '/snapshot?' + new URLSearchParams({ versionId }), abort.signal), referenceId, versionId) : null;
      if (!current()) return;
      const verified = staff(await read<Principal>('/api/session', abort.signal));
      if (!current()) return;
      if (actorKey(actor) !== actorKey(verified)) throw new RequestFailure(403);
      const next = { actor, classes, references, readings, versions: reviewedVersions, snapshot, classId, referenceId, versionId };
      choices.current = { classId, referenceId, versionId }; currentContext.current = next; setContext(next);
      const held = pending.current;
      const accessible = (original: Pending) => original.actorKey === actorKey(actor) && original.classId === classId && readings.observations.some(row => row.original.id === original.checkId) && reviewedVersions.some(version => version.id === original.versionId);
      const originalAccess = held && accessible(held);
      if (held && originalAccess) { selectedCheck.current = held.checkId; planningFocus.current = held.focus; selectedType.current = held.type; }
      else if (held || planningActor.current !== actorKey(actor)) { selectedCheck.current = ''; planningFocus.current = ''; }
      planningActor.current = actorKey(actor);
      if (!readings.observations.some(row => row.original.id === selectedCheck.current)) {
        selectedCheck.current = ''; planningFocus.current = '';
      }
      setCheckId(selectedCheck.current); setFocus(held && !originalAccess ? '' : planningFocus.current); setType(selectedType.current);
      if (savedReceipt.current && accessible(savedReceipt.current.action)) setReceipt(savedReceipt.current);
    } catch (failure) {
      if (!current()) return;
      hidePrivate();
      setError(failure instanceof RequestFailure && failure.status === 401 ? 'Sign in again in another tab, then reload this planner.' : failure instanceof RequestFailure && [403, 404].includes(failure.status) ? 'Current staff access is unavailable. Private planning details are hidden. Reload after access is restored.' : 'Current reading evidence and source choices could not be verified. Reload before continuing.');
    } finally { if (current()) setLoading(false); }
  }, [hidePrivate]);
  useEffect(() => {
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    return () => { mounted.current = false; invalidate(); };
  }, [reload, invalidate]);
  useEffect(() => { if (error || notice) message.current?.focus(); }, [error, notice]);
  function changeChoices(next: Choices, expected: Context) {
    if (lock.current || pending.current || currentContext.current !== expected) return;
    if (next.classId !== expected.classId) { selectedCheck.current = ''; planningFocus.current = ''; }
    confirmed.current = false;
    choices.current = next; setNotice(''); void reload(next);
  }
  function resetReview() { confirmed.current = false; setReviewed(false); }
  async function execute(action: Pending, recovery: boolean) {
    const loaded = currentContext.current;
    if (lock.current || !mounted.current || !loaded || actorKey(loaded.actor) !== action.actorKey || loaded.classId !== action.classId || loaded.snapshot?.versionId !== action.versionId || recovery !== Boolean(pending.current) || recovery && pending.current !== action) return;
    lock.current = true; setSaving(true); setError(''); setNotice('');
    const ticket = ++generation.current; controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const current = () => mounted.current && generation.current === ticket && !abort.signal.aborted;
    let sent = false;
    pending.current = action;
    try {
      const before = staff(await read<Principal>('/api/session', abort.signal));
      if (!current()) return;
      if (actorKey(before) !== action.actorKey) throw new RequestFailure(403);
      const outcomes = await Promise.allSettled([
        read<ReadingReview>('/api/reading-review?' + new URLSearchParams({ classId: action.classId }), abort.signal),
        read<CurriculumSnapshot>(sourcePath(action.referenceId) + '/snapshot?' + new URLSearchParams({ versionId: action.versionId }), abort.signal),
      ]);
      if (!current()) return;
      for (const outcome of outcomes) if (outcome.status === 'rejected') throw outcome.reason;
      const readings = validateReadings((outcomes[0] as PromiseFulfilledResult<ReadingReview>).value, action.classId, action.schoolId);
      const observation = readings.observations.find(row => row.original.id === action.checkId);
      const source = validateSnapshot((outcomes[1] as PromiseFulfilledResult<CurriculumSnapshot>).value, action.referenceId, action.versionId);
      if (!observation || !recovery && JSON.stringify(observation) !== JSON.stringify(action.reading) || JSON.stringify(source) !== JSON.stringify(action.source)) throw new Error('Planning evidence changed');
      const verified = staff(await read<Principal>('/api/session', abort.signal));
      if (!current()) return;
      if (actorKey(verified) !== action.actorKey) throw new RequestFailure(403);
      sent = true;
      const response = await fetch(sourcePath(action.referenceId) + '/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: action.body, signal: abort.signal });
      const saved = validateReceipt(await json<DraftReceipt>(response), action);
      if (response.status !== 201) throw new Error('Unconfirmed draft status');
      const after = staff(await read<Principal>('/api/session', abort.signal));
      if (!current()) return;
      if (actorKey(after) !== action.actorKey) throw new RequestFailure(403);
      pending.current = null; setHasPending(false); setPendingView(null); savedReceipt.current = { action, saved }; setReceipt(savedReceipt.current);
      resetReview(); setNotice('The original copied draft is confirmed. Open it to adapt and review a saved version before any class assignment. Later edits and approvals are shown in its editor.');
      // A committed exact retry returns version 1 even after later resource edits.
      // Keep this receipt separate from any current source/resource presentation.
      await reload(choices.current);
    } catch (failure) {
      if (!current()) return;
      invalidate(); hidePrivate(); setLoading(false);
      if (!recovery && (!sent || failure instanceof RequestFailure && [400, 409].includes(failure.status))) {
        pending.current = null; setHasPending(false); setPendingView(null);
        setError(!sent ? 'Current account, reading or exact reviewed source changed. Reload and review the planning choices again.' : 'The draft request was rejected or conflicts with saved content. Reload and review a new request separately.');
      } else {
        setHasPending(true); setPendingView(action);
        setError(recovery && failure instanceof RequestFailure && [400, 409].includes(failure.status) ? 'Original draft recovery was rejected or conflicts with saved content. The original request remains pending; check Teaching resources with the original account before making any separate copy. Reloading never changes its original request.' : 'Draft creation could not be confirmed. Private planning details are hidden. Keep this tab open, reload with the original staff account, then explicitly recover the exact original request.');
      }
    } finally { lock.current = false; if (mounted.current) setSaving(false); }
  }
  function create(expected: Context) {
    const loaded = currentContext.current, observation = loaded?.readings.observations.find(row => row.original.id === selectedCheck.current);
    if (lock.current || pending.current || loaded !== expected || !confirmed.current || !loaded?.snapshot || !observation || !planningFocus.current.trim()) return;
    const resourceId = crypto.randomUUID();
    const action: Pending = { ...choices.current, actorKey: actorKey(loaded.actor), actorId: loaded.actor.id, schoolId: loaded.actor.schoolId!, checkId: observation.original.id, reading: observation, source: loaded.snapshot, type: selectedType.current, focus: planningFocus.current.trim(), resourceId,
      body: JSON.stringify({ versionId: loaded.versionId, type: selectedType.current, clientResourceId: resourceId }) };
    void execute(action, false);
  }
  const observation = context?.readings.observations.find(row => row.original.id === checkId);
  const held = pendingView;
  const canRecover = !!held && !!context && actorKey(context.actor) === held.actorKey && context.classId === held.classId && context.snapshot?.versionId === held.versionId && context.readings.observations.some(row => row.original.id === held.checkId);
  const blocked = loading || saving || hasPending;
  return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
    <nav aria-label="Reading practice navigation" className="flex flex-wrap gap-4 text-sm"><a href="/" className="underline">← Dashboard</a><a href="/reading-review" className="underline">Reading history and corrections</a><a href="/curriculum" className="underline">Curriculum references</a><a href="/resources" className="underline">Teaching resources</a></nav>
    <header className="space-y-2"><h1 className="text-3xl font-bold">Reading practice planner</h1><p>Review an observation, choose a practice focus and copy a reviewed curriculum reference into a provisional teaching draft.</p><p className="text-sm text-muted-foreground">Teachers decide suitability, language and permission to reuse content. This manual planner provides no validated screening, scoring, diagnosis, adaptive placement or personalized learning. Reading counts describe the recorded activity only.</p></header>
    {(error || notice) && <div ref={message} tabIndex={-1} role={error ? 'alert' : 'status'} className="rounded border p-3 break-words">{error || notice}</div>}
    <button type="button" className={buttonStyle} disabled={saving} onClick={() => { if (!lock.current) { setNotice(''); void reload(pending.current ?? choices.current); } }}>Reload current planner</button>
    {loading && <p role="status">Verifying current staff evidence and sources…</p>}
    {hasPending && <section aria-label="Unconfirmed practice draft" className="space-y-3 rounded border p-4"><h2 className="text-xl font-semibold">Unconfirmed draft</h2><p>No request is retried automatically. Pending details exist only in this page; hard reload or navigation discards them.</p>{canRecover ? <><p>Original reviewed source: {held!.source.content.title}, version {held!.source.version}. The original resource type is {held!.type}. Newer readings or sources do not rewrite this request.</p><p className="text-sm">Recovery checks the current original account and authorized original source. It confirms the copied draft only; it does not confirm an intervention or assign content.</p><button type="button" className={buttonStyle} disabled={saving || loading} onClick={() => { const action = pending.current; if (action && canRecover) void execute(action, true); }}>Recover original draft</button></> : <p>Reload with the original staff account and restored access before viewing or recovering the submitted draft. <a href="/login" target="_blank" rel="noreferrer" className="underline">Sign in in another tab</a> if needed.</p>}</section>}
    {context && <>
      <section aria-labelledby="practice-observation-title" className="space-y-4 rounded border p-4"><h2 id="practice-observation-title" className="text-xl font-semibold">1. Review reading evidence</h2>
        <label className="block space-y-1" htmlFor="practice-class"><span>Class</span><select id="practice-class" className={inputStyle} disabled={blocked} value={context.classId} onChange={event => changeChoices({ classId: event.target.value, referenceId: '', versionId: '' }, context)}><option value="">Select a class</option>{context.classes.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label className="block space-y-1" htmlFor="practice-reading"><span>Reading observation</span><select id="practice-reading" className={inputStyle} disabled={blocked || !context.classId} value={checkId} onChange={event => { if (lock.current || pending.current || currentContext.current !== context) return; selectedCheck.current = event.target.value; setCheckId(event.target.value); planningFocus.current = ''; setFocus(''); resetReview(); }}><option value="">Select an observation</option>{context.readings.observations.map(row => <option key={row.original.id} value={row.original.id}>Learner {row.original.studentId} · {row.effective.readingDate} · {row.effective.language} · {row.effective.passageReference}</option>)}</select></label>
        {!context.readings.observations.length && <p>No authorized reading observations are available for this class. <a className="underline" href="/external-apps">Enter a reviewed reading observation</a>.</p>}
        {observation && <article aria-label="Selected effective reading" className="space-y-2 break-words"><p>Latest effective observation: {observation.effective.wordsCorrect} correct of {observation.effective.wordsAttempted} attempted words in {observation.effective.durationSeconds} seconds · {observation.effective.wcpm} correct words per minute · {observation.effective.accuracy}% accuracy.</p><p>Language {observation.effective.language} · Passage {observation.effective.passageReference} · {observation.revision ? 'Reviewed correction revision ' + observation.revision : 'Original observation, no correction'}.</p><p className="text-sm text-muted-foreground">Original source: manual-reviewed-external · recorded by {observation.original.recordedBy}. No external verification. Historical reading access does not establish current enrolment or eligibility for an individual assignment.</p></article>}
        <label className="block space-y-1" htmlFor="practice-focus"><span>Teacher-selected practice focus</span><textarea id="practice-focus" className={inputStyle} rows={3} maxLength={1000} disabled={blocked || !observation} value={focus} onChange={event => { if (lock.current || pending.current || currentContext.current !== context) return; planningFocus.current = event.target.value; setFocus(event.target.value); resetReview(); }} aria-describedby="practice-focus-help"/></label><p id="practice-focus-help" className="text-sm text-muted-foreground">Private planning context for this open page only. The planner never inserts this focus, learner identity or reading evidence into copied content. No audio, transcripts or full reading passages are needed.</p>
      </section>
      <section aria-labelledby="practice-source-title" className="space-y-4 rounded border p-4"><h2 id="practice-source-title" className="text-xl font-semibold">2. Choose and review a source</h2>
        <label className="block space-y-1" htmlFor="practice-reference"><span>Curriculum reference</span><select id="practice-reference" className={inputStyle} disabled={blocked || !observation} value={context.referenceId} onChange={event => changeChoices({ ...choices.current, referenceId: event.target.value, versionId: '' }, context)}><option value="">Select a reference</option>{context.references.map(row => <option key={row.id} value={row.id}>{row.latest.title} · {row.latest.language}</option>)}</select></label>
        {context.referenceId && !context.versions.length && <p>This reference has no reviewed version available to copy. Review it in the curriculum library first.</p>}
        {context.versions.length > 0 && <label className="block space-y-1" htmlFor="practice-version"><span>Exact reviewed version</span><select id="practice-version" className={inputStyle} disabled={blocked} value={context.versionId} onChange={event => changeChoices({ ...choices.current, versionId: event.target.value }, context)}><option value="">Select a reviewed version</option>{context.versions.map(version => <option key={version.id} value={version.id}>Version {version.version} · {version.title} · {version.language}</option>)}</select></label>}
        {context.snapshot && <article aria-label="Current selected reviewed source" className="space-y-3 rounded border p-3 break-words"><h3 className="font-semibold">{context.snapshot.content.title} · source version {context.snapshot.version}</h3><p>{context.snapshot.content.curriculum} · {context.snapshot.content.gradeLevel} · {context.snapshot.content.subject} · {context.snapshot.content.language}</p><p>Objectives: {context.snapshot.content.objectives}</p><p className="whitespace-pre-wrap">{context.snapshot.content.body}</p><p>Declared reuse permission: {context.snapshot.content.rightsStatement}</p><p className="text-sm">Source attribution: {context.snapshot.content.sourceReference || 'No additional reference supplied'}. Reviewed by {context.snapshot.content.approvedBy}.</p>{observation && observation.effective.language !== context.snapshot.content.language && <p role="note" className="rounded border p-3">The reading and source language tags differ. This planner does not establish cross-language equivalence. Review suitability before copying.</p>}<p className="text-sm text-muted-foreground">Recorded review and rights statements are declarations, not independent educational or licensing certification. Copying creates a separate provisional resource.</p></article>}
        <label className="block space-y-1" htmlFor="practice-type"><span>Draft format</span><select id="practice-type" className={inputStyle} disabled={blocked} value={type} onChange={event => { if (lock.current || pending.current || currentContext.current !== context || !['lesson', 'worksheet', 'quiz', 'activity'].includes(event.target.value)) return; selectedType.current = event.target.value as ResourceType; setType(selectedType.current); resetReview(); }}><option value="activity">Activity</option><option value="worksheet">Worksheet</option><option value="lesson">Lesson</option><option value="quiz">Quiz</option></select></label>
        <label className="flex items-start gap-2" htmlFor="practice-reviewed"><input id="practice-reviewed" className="mt-1" type="checkbox" checked={reviewed} disabled={blocked || !observation || !context.snapshot || !focus.trim()} onChange={event => { if (lock.current || pending.current || currentContext.current !== context) return; confirmed.current = event.target.checked; setReviewed(event.target.checked); }}/><span>I reviewed this observation, my practice focus, the exact source version, language suitability and permission to reuse it. I will adapt and review the new draft before class assignment.</span></label>
        <button type="button" className={buttonStyle} disabled={blocked || !reviewed || !observation || !context.snapshot || !focus.trim()} onClick={() => create(context)}>Create provisional practice draft</button>
      </section>
    </>}
    {receipt && <section aria-label="Original copied draft receipt" className="space-y-3 rounded border p-4 break-words"><h2 className="text-xl font-semibold">Original copied draft receipt</h2><p>{receipt.action.source.content.title} · original source version {receipt.action.source.version} · original copied resource version {receipt.saved.resource.latest.version} · {receipt.action.type}.</p><p>This receipt confirms the original copy and its exact source attribution. It does not represent later edits, current approval, an assignment or learner progress.</p><a className="underline" href={'/resources/' + encodeURIComponent(receipt.saved.resource.id)}>Open teaching draft to adapt and review</a><p className="text-sm text-muted-foreground">Use the existing editor for review, printing and authorized class assignment. This planner provides no individual or group assignment.</p></section>}
  </main>;
}
