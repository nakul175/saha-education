'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- full-page links avoid the observed vinext beta transition failure. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isExactStoredTimestamp } from '@/lib/education/stored-timestamp';
import type { Course, Principal, School } from '@/lib/education/types';

const blank = { code: '', title: '', description: '', gradeLevel: '' };
type CourseFields = typeof blank;
type ListedCourse = Omit<Course, 'description'> & { description?: string | null };
type Creation = { actorKey: string; endpoint: string; body: string; fields: CourseFields; schoolId: string };
const scopeKey = (actor: Principal) => `${actor.id}:${actor.role}:${actor.schoolId ?? ''}`;
const isPrincipal = (value: unknown): value is Principal => !!value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' && !!value.id
  && 'role' in value && ['admin', 'teacher', 'guardian', 'student'].includes(String(value.role)) && 'schoolId' in value && typeof value.schoolId === 'string' && !!value.schoolId;
function isCourse(value: unknown): value is ListedCourse {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return ['id', 'schoolId', 'code', 'title', 'gradeLevel', 'createdAt', 'updatedAt'].every(key => typeof row[key] === 'string') && !!row.id
    && (row.description == null || typeof row.description === 'string');
}
class CourseResponseError extends Error { constructor(readonly status: number) { super('Course response unavailable'); } }
class CourseDataError extends Error {}
async function read(response: Response): Promise<unknown> {
  const content = await response.text();
  if (!response.ok) throw new CourseResponseError(response.status);
  return JSON.parse(content);
}
const isAcknowledgement = (value: unknown, request: Creation): value is ListedCourse => isCourse(value) && value.schoolId === request.schoolId
  && value.code === request.fields.code && value.title === request.fields.title && value.gradeLevel === request.fields.gradeLevel && value.description === request.fields.description
  && isExactStoredTimestamp(value.createdAt) && value.updatedAt === value.createdAt;

export default function CoursesPage() {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [courses, setCourses] = useState<ListedCourse[]>([]);
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingView, setPendingView] = useState<Creation | null>(null);
  const [acknowledged, setAcknowledged] = useState<{ actorKey: string; course: ListedCourse } | null>(null);
  const [compared, setCompared] = useState(false);
  const draft = useRef<{ actorKey: string; fields: CourseFields } | null>(null);
  const pending = useRef<Creation | null>(null);
  const inFlight = useRef(false), currentScope = useRef<string | null>(null), draftVersion = useRef(0), comparisonChecked = useRef(false), knownCreation = useRef(false);
  const generation = useRef(0), controller = useRef<AbortController | null>(null), mounted = useRef(true);
  const message = useRef<HTMLDivElement>(null);
  const hidePrivate = useCallback(() => { currentScope.current = null; setPrincipal(null); setSchool(null); setCourses([]); }, []);
  const invalidate = useCallback(() => { generation.current++; controller.current?.abort(); }, []);
  const reload = useCallback(async () => {
    const version = ++generation.current;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const current = () => mounted.current && generation.current === version;
    hidePrivate(); setLoading(true); setError(null); comparisonChecked.current = false; setCompared(false); setNotice(null);
    try {
      const actor = await read(await fetch('/api/session', { cache: 'no-store', signal: abort.signal }));
      if (!current()) return false;
      if (!isPrincipal(actor)) throw new CourseDataError('The current account could not be verified. Reload courses.');
      const rows = await read(await fetch('/api/courses', { cache: 'no-store', signal: abort.signal }));
      if (!current()) return false;
      let currentSchool: School | null = null;
      if (actor.role === 'admin') {
        const schools = await read(await fetch('/api/schools', { cache: 'no-store', signal: abort.signal }));
        if (!current()) return false;
        if (!Array.isArray(schools) || schools.some(row => !row || typeof row.id !== 'string' || typeof row.name !== 'string') || new Set(schools.map(row => row.id)).size !== schools.length) throw new CourseDataError('The returned school list contains duplicated or incomplete rows. Reload before creating a course.');
        currentSchool = schools.find(row => row.id === actor.schoolId) ?? null;
        if (!currentSchool) throw new CourseDataError('Your school could not be verified. Reload before creating a course.');
      }
      const verified = await read(await fetch('/api/session', { cache: 'no-store', signal: abort.signal }));
      if (!current()) return false;
      if (!isPrincipal(verified) || scopeKey(actor) !== scopeKey(verified)) throw new CourseResponseError(403);
      if (!Array.isArray(rows) || rows.some(row => !isCourse(row) || row.schoolId !== actor.schoolId) || new Set(rows.map(row => row.id)).size !== rows.length) throw new CourseDataError('The returned course list contains duplicated or incomplete rows. Reload and ask a school administrator to review it if the problem persists.');
      const key = scopeKey(actor);
      currentScope.current = key; setPrincipal(actor); setSchool(currentSchool); setCourses(rows);
      if (actor.role === 'admin') {
        if (!draft.current) draft.current = { actorKey: key, fields: blank };
        setForm(draft.current.actorKey === key ? draft.current.fields : blank);
      }
      return true;
    } catch (cause) {
      if (!current() || abort.signal.aborted) return false;
      hidePrivate();
      if (cause instanceof CourseResponseError && cause.status === 401) {
        setError('Sign in to reload current courses.');
        if (!pending.current && !knownCreation.current) window.location.assign(new URL('/login', window.location.origin).href);
      } else if (cause instanceof CourseResponseError && [403, 404].includes(cause.status)) setError('Courses are unavailable to your current account. Reload after access is restored.');
      else if (cause instanceof CourseDataError) setError(cause.message);
      else setError('Could not reload current courses. Try reloading again.');
      return false;
    } finally { if (current()) setLoading(false); }
  }, [hidePrivate]);
  useEffect(() => {
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    return () => { mounted.current = false; invalidate(); };
  }, [reload, invalidate]);
  useEffect(() => { if (error || saveError || notice) message.current?.focus(); }, [error, saveError, notice]);

  const viewVersion = generation.current, fieldVersion = draftVersion.current;
  const update = (field: keyof CourseFields, value: string) => {
    if (!mounted.current || generation.current !== viewVersion || draftVersion.current !== fieldVersion || !principal || principal.role !== 'admin' || currentScope.current !== scopeKey(principal) || loading || inFlight.current || pending.current) return;
    const fields = { ...form, [field]: value };
    draftVersion.current++; draft.current = { actorKey: scopeKey(principal), fields }; setForm(fields);
  };
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!mounted.current || generation.current !== viewVersion || draftVersion.current !== fieldVersion || inFlight.current || pending.current || loading || !principal || principal.role !== 'admin' || !school || currentScope.current !== scopeKey(principal)) return;
    const request: Creation = { actorKey: scopeKey(principal), schoolId: school.id, fields: { ...form }, endpoint: '/api/courses', body: JSON.stringify({ ...form, schoolId: school.id }) };
    pending.current = request; inFlight.current = true; knownCreation.current = false; setSaving(true); setSaveError(null); setNotice(null); setAcknowledged(null);
    let sent = false;
    try {
      const actor = await read(await fetch('/api/session', { cache: 'no-store' }));
      if (!mounted.current) return;
      if (generation.current !== viewVersion || draftVersion.current !== fieldVersion || !isPrincipal(actor) || scopeKey(actor) !== request.actorKey || currentScope.current !== request.actorKey) throw new CourseResponseError(403);
      sent = true;
      const response = await fetch(request.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: request.body });
      const saved = await read(response);
      if (response.status !== 201 || !isAcknowledgement(saved, request)) throw new CourseDataError('Course acknowledgement unavailable');
      if (!mounted.current) return;
      pending.current = null; setPendingView(null); comparisonChecked.current = false; setCompared(false); knownCreation.current = true; setAcknowledged({ actorKey: request.actorKey, course: saved });
      draftVersion.current++; draft.current = { actorKey: request.actorKey, fields: blank }; setForm(blank);
      const refreshed = await reload();
      if (mounted.current) setNotice(refreshed ? 'Course created. Current courses were reloaded.' : 'Course created, but the list could not be refreshed. Reload courses before creating another.');
    } catch (cause) {
      if (!mounted.current) return;
      if (!sent) {
        pending.current = null; setPendingView(null); hidePrivate();
        setSaveError('Current administrator access could not be verified. No course-creation request was sent. Reload before creating a course.');
      } else if (cause instanceof CourseResponseError && [400, 409].includes(cause.status)) {
        pending.current = null; setPendingView(null);
        setSaveError(cause.status === 400 ? 'Course was not saved. Reload courses to check your retained entries before trying again.' : 'The course request conflicted with current access or records. Reload before creating a course. Your entries are retained for the original account.');
        hidePrivate();
      } else {
        setPendingView(request); comparisonChecked.current = false; setCompared(false); hidePrivate();
        setSaveError('The course save could not be confirmed. Reload courses with the original administrator account and compare the saved list. This request will not be resent.');
      }
    } finally { inFlight.current = false; if (mounted.current) setSaving(false); }
  }
  const available = !!principal && !loading && !error;
  const comparisonReady = available && principal.role === 'admin' && pendingView?.actorKey === scopeKey(principal);
  const acknowledgementVisible = available && acknowledged?.actorKey === scopeKey(principal);
  const finishComparison = () => {
    if (!mounted.current || generation.current !== viewVersion || inFlight.current || !comparisonChecked.current || !compared || !comparisonReady || !principal || currentScope.current !== scopeKey(principal) || pending.current !== pendingView) return;
    pending.current = null; setPendingView(null); comparisonChecked.current = false; setCompared(false); draftVersion.current++; draft.current = { actorKey: scopeKey(principal), fields: blank }; setForm(blank); setSaveError(null);
    setNotice('Comparison completed. Enter a new draft only if you intend to create another course. No course request was sent.');
  };
  return <AppShell principal={principal}><div className="mx-auto max-w-6xl min-w-0 space-y-6 p-4">
    <div><a href="/" className="text-sm underline">Dashboard</a><h1 className="text-2xl font-bold">Course catalog</h1><p className="text-muted-foreground">View the current course catalog available to your school account.</p></div>
    {(error || saveError || notice) && <div ref={message} tabIndex={-1} className="space-y-2 rounded border p-3 break-words">{error && <p role="alert">{error}</p>}{saveError && <p role="alert">{saveError}</p>}{notice && <p role="status">{notice}</p>}</div>}
    {loading && <p role="status">Loading current courses…</p>}
    <Button type="button" variant="outline" onClick={() => { if (!inFlight.current) return reload(); }} disabled={saving}>Reload courses and check saved records</Button>
    {acknowledged && <p role="status">The school system acknowledged the original course creation.{error ? ' The current list is unavailable; reload to see saved courses.' : ''}</p>}
    {acknowledgementVisible && acknowledged && <section aria-label="Acknowledged course creation" className="rounded border p-3 break-words"><p>{acknowledged.course.title} — {acknowledged.course.code}</p><p>Original saved reference: {acknowledged.course.id}</p><p>This is the original acknowledgement. The catalog below shows current saved records.</p></section>}
    {pendingView && <section aria-label="Uncertain course creation" className="space-y-3 rounded border p-3">
      <p>A course creation is awaiting comparison. It is never retried automatically. Keep this tab open; leaving or hard reloading discards the in-page saved request details.</p>
      {comparisonReady ? <><p>Compare these originally submitted details with the current saved list. A matching title does not prove which request created a record. Course codes are globally unique; a repeated request does not return an original receipt.</p>
        <dl className="space-y-1 break-words"><div><dt>Original course code</dt><dd>{pendingView.fields.code}</dd></div><div><dt>Original course title</dt><dd>{pendingView.fields.title}</dd></div><div><dt>Original grade level</dt><dd>{pendingView.fields.gradeLevel}</dd></div><div><dt>Original description</dt><dd className="whitespace-pre-wrap">{pendingView.fields.description || '(empty)'}</dd></div></dl>
        <div className="flex items-start gap-2"><input id="course-comparison" type="checkbox" checked={compared} onChange={event => { if (mounted.current && generation.current === viewVersion && comparisonReady && principal && currentScope.current === scopeKey(principal) && pending.current === pendingView) { comparisonChecked.current = event.target.checked; setCompared(event.target.checked); } }} /><Label htmlFor="course-comparison">I checked the saved list against the original details and will start a new draft deliberately.</Label></div>
        <Button type="button" variant="outline" disabled={!compared || saving} onClick={finishComparison}>Finish comparison and start a new draft</Button>
      </> : <p>Reload with the original administrator account before comparing. <a href="/login" target="_blank" rel="noreferrer" className="underline">Sign in in another tab</a> if needed.</p>}
    </section>}
    {available && <div className="grid min-w-0 gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Course list</CardTitle></CardHeader><CardContent><p className="mb-3" role="status">{courses.length} courses in the current authorised catalog.</p>
        {courses.length === 0 ? <p>No courses found in the current authorised catalog.</p> : <ul className="space-y-3">{courses.map(row => <li key={row.id} data-course-id={row.id} className="rounded border p-3 break-words"><h2 className="font-medium">{row.title}</h2><p>Code: {row.code}</p><p>Grade level: {row.gradeLevel}</p>{row.description && <p className="whitespace-pre-wrap">{row.description}</p>}</li>)}</ul>}
      </CardContent></Card>
      {principal.role === 'admin' && !pendingView && school && <Card><CardHeader><CardTitle>Create course</CardTitle></CardHeader><CardContent>
        <p className="mb-4 break-words">School: {school.name}</p>
        <form onSubmit={create} className="space-y-4"><fieldset disabled={saving} className="min-w-0 space-y-4">
          <div><Label htmlFor="course-code">Course code</Label><Input id="course-code" value={form.code} required onChange={event => update('code', event.target.value)} /></div>
          <div><Label htmlFor="course-title">Course title</Label><Input id="course-title" value={form.title} required onChange={event => update('title', event.target.value)} /></div>
          <div><Label htmlFor="course-description">Description (optional)</Label><Textarea id="course-description" value={form.description} onChange={event => update('description', event.target.value)} /></div>
          <div><Label htmlFor="course-grade">Grade level</Label><Input id="course-grade" value={form.gradeLevel} required onChange={event => update('gradeLevel', event.target.value)} /></div>
          <Button type="submit">{saving ? 'Saving…' : 'Create course'}</Button>
        </fieldset></form>
      </CardContent></Card>}
    </div>}
  </div></AppShell>;
}
