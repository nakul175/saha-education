'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- full-page navigation avoids the observed vinext beta transition failure. */
import { useEffect, useRef, useState } from 'react';
import type { Class, Student } from '@/lib/education/types';
import type { ReadingCorrection, ReadingCorrectionInput, ReadingMetrics, ReadingReview, ReadingReviewObservation } from '@/lib/education/reading-review';
import { ReadingTrendChart } from '@/components/reading-trend-chart';
import { formatReadingDate, summariseSeries } from '@/lib/education/reading-trends';

class ReviewRequestError extends Error {
  constructor(readonly status: number) { super('Reading review request failed'); }
}
async function readJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: 'no-store' });
  if (response.status === 401) window.location.assign(new URL('/login', window.location.origin).href);
  if (!response.ok) throw new ReviewRequestError(response.status);
  return response.json() as Promise<T>;
}
function failureMessage(error: unknown): string {
  if (error instanceof ReviewRequestError && error.status === 401) return 'Your session has ended. Please sign in again.';
  if (error instanceof ReviewRequestError && error.status === 403) return 'You no longer have permission to review these readings.';
  if (error instanceof ReviewRequestError && error.status === 404) return 'This class or reading is no longer available to your account.';
  return 'Could not load reading history. Please refresh to try again.';
}
function formatStamp(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value);
  return match ? formatReadingDate(match[1]) + ', ' + match[2] + ' UTC' : value;
}
async function loadView(classId: string, studentId: string, signal: AbortSignal) {
  const query = new URLSearchParams({ classId });
  const all = readJson<ReadingReview>('/api/reading-review?' + query, { signal });
  if (studentId) query.set('studentId', studentId);
  const filtered = studentId ? readJson<ReadingReview>('/api/reading-review?' + query, { signal }) : all;
  const [allResult, filteredResult, rosterResult] = await Promise.allSettled([
    all, filtered, readJson<Class>('/api/classes/' + encodeURIComponent(classId), { signal }),
  ]);
  if (allResult.status === 'rejected') throw allResult.reason;
  if (filteredResult.status === 'rejected') throw filteredResult.reason;
  // A stale active-roster request must never suppress authorized historical IDs.
  if (rosterResult.status === 'rejected' && rosterResult.reason instanceof ReviewRequestError &&
    (rosterResult.reason.status === 401 || rosterResult.reason.status === 403)) throw rosterResult.reason;
  return { all: allResult.value, filtered: filteredResult.value,
    students: rosterResult.status === 'fulfilled' ? rosterResult.value.enrolledStudents ?? [] : [],
    rosterWarning: rosterResult.status === 'rejected' ? 'Current roster names could not be loaded. Historical learners remain available.' : '' };
}
const inputStyle = 'w-full min-w-0 rounded border bg-background p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
const buttonStyle = 'rounded border px-3 py-2 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
function Metrics({ value }: { value: ReadingMetrics }) {
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
    <div><dt className="text-muted-foreground">Reading date</dt><dd>{value.readingDate}</dd></div>
    <div><dt className="text-muted-foreground">Language</dt><dd>{value.language}</dd></div>
    <div><dt className="text-muted-foreground">Duration</dt><dd>{value.durationSeconds} seconds</dd></div>
    <div><dt className="text-muted-foreground">Words correct / attempted</dt><dd>{value.wordsCorrect} / {value.wordsAttempted}</dd></div>
    <div><dt className="text-muted-foreground">Correct words per minute</dt><dd>{value.wcpm}</dd></div>
    <div><dt className="text-muted-foreground">Accuracy</dt><dd>{value.accuracy}%</dd></div>
    <div className="col-span-2 sm:col-span-3"><dt className="text-muted-foreground">Passage reference</dt><dd className="break-words">{value.passageReference}</dd></div>
  </dl>;
}
type CorrectionFields = {
  language: string; passageReference: string; readingDate: string;
  durationSeconds: string; wordsAttempted: string; wordsCorrect: string; reason: string;
};
function correctionValues(observation: ReadingReviewObservation): CorrectionFields {
  const value = observation.effective;
  return { language: value.language, passageReference: value.passageReference, readingDate: value.readingDate,
    durationSeconds: String(value.durationSeconds), wordsAttempted: String(value.wordsAttempted), wordsCorrect: String(value.wordsCorrect), reason: '' };
}
function validCorrection(value: CorrectionFields): boolean {
  const attempted = Number(value.wordsAttempted), correct = Number(value.wordsCorrect), seconds = Number(value.durationSeconds);
  const date = new Date(value.readingDate + 'T00:00:00.000Z');
  return /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value.language.trim()) && value.language.trim().length <= 35 &&
    value.passageReference.trim().length >= 1 && value.passageReference.trim().length <= 200 && !/[\u0000-\u001f\u007f<>]/u.test(value.passageReference) &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.readingDate) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value.readingDate && value.readingDate <= new Date().toISOString().slice(0, 10) &&
    value.durationSeconds.trim() !== '' && Number.isFinite(seconds) && seconds >= 1 && seconds <= 3600 &&
    value.wordsAttempted.trim() !== '' && Number.isInteger(attempted) && attempted >= 1 && attempted <= 500 &&
    value.wordsCorrect.trim() !== '' && Number.isInteger(correct) && correct >= 0 && correct <= attempted &&
    value.reason.trim().length >= 1 && value.reason.trim().length <= 1000 && !/[\u0000-\u001f\u007f<>]/u.test(value.reason);
}
function CorrectionEditor({ observation, onSaved, onAccessLost, onSaving }: {
  observation: ReadingReviewObservation; onSaved: (correction: ReadingCorrection) => void;
  onAccessLost: (error: unknown) => void; onSaving: (saving: boolean) => void;
}) {
  const [values, setValues] = useState<CorrectionFields>(() => correctionValues(observation));
  const [reviewed, setReviewed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState('');
  const savingRef = useRef(false);
  const mounted = useRef(true);
  const retry = useRef<{ payload: string; id: string } | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  function update(field: keyof CorrectionFields, value: string) {
    setValues(previous => ({ ...previous, [field]: value }));
    setReviewed(false);
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current || conflict || !reviewed || !validCorrection(values)) return;
    savingRef.current = true; setSaving(true); onSaving(true); setMessage('Saving correction…');
    const input = { expectedRevision: observation.revision, confirmReviewed: true as const, reason: values.reason.trim(),
      language: values.language.trim(), passageReference: values.passageReference.trim(), readingDate: values.readingDate,
      durationSeconds: Number(values.durationSeconds), wordsAttempted: Number(values.wordsAttempted), wordsCorrect: Number(values.wordsCorrect) };
    const payload = JSON.stringify({ readingCheckId: observation.original.id, ...input });
    const id = retry.current?.payload === payload ? retry.current.id : crypto.randomUUID();
    retry.current = { payload, id };
    const body: ReadingCorrectionInput = { ...input, clientCorrectionId: id };
    try {
      const saved = await readJson<ReadingCorrection>('/api/reading-checks/' + encodeURIComponent(observation.original.id) + '/corrections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      retry.current = null;
      if (mounted.current) onSaved(saved);
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ReviewRequestError && error.status === 409) {
        setConflict(true); setMessage('This reading has changed, or the retry conflicts with an existing correction. Refresh history before reviewing it again.');
      } else if (error instanceof ReviewRequestError && [401, 403, 404].includes(error.status)) {
        onAccessLost(error);
      } else if (error instanceof ReviewRequestError && error.status === 400) {
        setMessage('The correction was rejected. Check the date, language, counts and reason, then try again.');
      } else {
        setMessage('Saving could not be confirmed. Retry the same values to check the outcome; the same correction ID will be reused.');
      }
    } finally {
      savingRef.current = false;
      if (mounted.current) { setSaving(false); onSaving(false); }
    }
  }
  const valid = validCorrection(values);
  return <form onSubmit={save} className="space-y-4 rounded border bg-muted/20 p-4" aria-labelledby="correction-heading">
    <h2 id="correction-heading" className="text-xl font-semibold">Append a reviewed correction</h2>
    <p className="text-sm">Current revision {observation.revision}. Reading date {formatReadingDate(observation.original.readingDate)}.</p>
    <p className="text-sm">The original reading and earlier corrections are retained. Review all replacement values before confirming.</p>
    <fieldset disabled={saving || conflict} className="grid gap-4 sm:grid-cols-2">
      <legend className="sr-only">Replacement reading values</legend>
      <label className="block">Language code<input className={inputStyle} value={values.language} onChange={event => update('language', event.target.value)} required maxLength={35} pattern="[a-z]{2,3}(-[A-Za-z0-9]{2,8})*" aria-describedby="reading-language-help"/></label>
      <label className="block">Reading date<input className={inputStyle} type="date" value={values.readingDate} onChange={event => update('readingDate', event.target.value)} required max={new Date().toISOString().slice(0, 10)}/></label>
      <p id="reading-language-help" className="text-sm text-muted-foreground sm:col-span-2">Use the recorded language code, for example en-IN or hi-IN. Different languages remain in separate comparison tables.</p>
      <label className="block sm:col-span-2">Passage reference<input className={inputStyle} value={values.passageReference} onChange={event => update('passageReference', event.target.value)} required maxLength={200}/></label>
      <label className="block">Reading time in seconds<input className={inputStyle} type="number" min={1} max={3600} step="0.001" value={values.durationSeconds} onChange={event => update('durationSeconds', event.target.value)} required/></label>
      <label className="block">Words attempted<input className={inputStyle} type="number" min={1} max={500} step={1} value={values.wordsAttempted} onChange={event => update('wordsAttempted', event.target.value)} required/></label>
      <label className="block">Words correct<input className={inputStyle} type="number" min={0} max={Math.min(Number(values.wordsAttempted) || 0, 500)} step={1} value={values.wordsCorrect} onChange={event => update('wordsCorrect', event.target.value)} required aria-describedby="reading-counts-help"/></label>
      <p id="reading-counts-help" className="self-center text-sm text-muted-foreground">Correct words cannot exceed attempted words. Counts must be whole numbers, with at most 500 attempted words.</p>
      <label className="block sm:col-span-2">Reason for correction<input className={inputStyle} value={values.reason} onChange={event => update('reason', event.target.value)} required maxLength={1000} aria-describedby="reading-reason-help"/></label>
      <p id="reading-reason-help" className="text-sm text-muted-foreground sm:col-span-2">Enter a short plain-text reason. Leave out audio, transcripts and full passage text.</p>
      <label className="flex items-start gap-2 sm:col-span-2"><input type="checkbox" className="mt-1" checked={reviewed} onChange={event => setReviewed(event.target.checked)} required/><span>I reviewed the replacement counts, duration, date, language and passage reference.</span></label>
    </fieldset>
    {!valid && <p className="text-sm">Complete a valid reason and check the replacement values to enable saving.</p>}
    {message && <p role="status" aria-live="polite">{message}</p>}
    <button type="submit" disabled={saving || conflict || !reviewed || !valid} className={buttonStyle}>{saving ? 'Saving…' : 'Save reviewed correction'}</button>
  </form>;
}

export default function ReadingReviewPage() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [classId, setClassId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [allReview, setAllReview] = useState<ReadingReview | null>(null);
  const [data, setData] = useState<ReadingReview | null>(null);
  const [selectedCheckId, setSelectedCheckId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [classesRefresh, setClassesRefresh] = useState(0);
  const [error, setError] = useState('');
  const [rosterWarning, setRosterWarning] = useState('');
  const [saved, setSaved] = useState<ReadingCorrection | null>(null);
  const savedRef = useRef<ReadingCorrection | null>(null);
  const savingRef = useRef(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void readJson<Class[]>('/api/classes', { signal: controller.signal }).then(result => {
      if (active) { setClasses(result); setLoadingClasses(false); setError(''); }
    }).catch(error => { if (active) { setError(failureMessage(error)); setLoadingClasses(false); } });
    return () => { active = false; controller.abort(); };
  }, [classesRefresh]);
  useEffect(() => {
    if (!classId) return;
    let active = true;
    const controller = new AbortController();
    void loadView(classId, studentId, controller.signal).then(view => {
      if (!active) return;
      setAllReview(view.all); setData(view.filtered); setStudents(view.students);
      setRosterWarning(view.rosterWarning); setError(''); setLoading(false);
    }).catch(error => {
      if (!active) return;
      setData(null); setAllReview(null); setStudents([]); setLoading(false);
      setError(savedRef.current ? 'Correction was saved, but its history could not be refreshed. Refresh history before making another correction. ' + failureMessage(error) : failureMessage(error));
    });
    return () => { active = false; controller.abort(); };
  }, [classId, studentId, refresh]);
  function startReload() {
    if (savingRef.current) return;
    setSelectedCheckId(''); setData(null); setLoading(true); setError(''); setRefresh(previous => previous + 1);
  }
  function chooseClass(value: string) {
    if (savingRef.current) return;
    setClassId(value); setStudentId(''); setSelectedCheckId(''); setData(null); setAllReview(null); setStudents([]);
    setError(''); setRosterWarning(''); setSaved(null); savedRef.current = null; setLoading(Boolean(value));
  }
  function chooseStudent(value: string) {
    if (savingRef.current) return;
    setStudentId(value); setSelectedCheckId(''); setData(null); setError(''); setSaved(null); savedRef.current = null; setLoading(true);
  }
  function correctionSaved(value: ReadingCorrection) {
    savedRef.current = value; setSaved(value); setSelectedCheckId(''); setData(null); setLoading(true); setError('');
    savingRef.current = false; setSaving(false); setRefresh(previous => previous + 1);
  }
  function accessLost(error: unknown) {
    setData(null); setAllReview(null); setStudents([]); setSelectedCheckId('');
    savingRef.current = false; setSaving(false); setError(failureMessage(error));
  }
  const names = { students: { ...(data?.names.students ?? {}), ...(allReview?.names.students ?? {}) }, staff: { ...(data?.names.staff ?? {}), ...(allReview?.names.staff ?? {}) } };
  const studentNames = new Map([...Object.entries(names.students), ...students.map(student => [student.id, [student.firstName, student.lastName].join(' ')] as const)]);
  const currentIds = new Set(students.map(student => student.id));
  const studentIds = [...new Set([...students.map(student => student.id), ...(allReview?.observations.map(observation => observation.original.studentId) ?? [])])];
  studentIds.sort((a, b) => (studentNames.get(a) ?? a).localeCompare(studentNames.get(b) ?? b));
  const studentLabel = (id: string) => {
    const name = studentNames.get(id);
    if (!name) return 'Learner (name unavailable)';
    return currentIds.has(id) || rosterWarning ? name : name + ' (not currently enrolled; retained reading history)';
  };
  const staffLabel = (id: string) => names.staff[id] ?? 'Staff member (name unavailable)';
  const overview = studentIds.map(id => {
    const own = (allReview?.observations ?? []).filter(observation => observation.original.studentId === id);
    const own_series = (allReview?.series ?? []).filter(series => series.studentId === id);
    return { id, readings: own.length, latest: own.reduce((latest, observation) => observation.effective.readingDate > latest ? observation.effective.readingDate : latest, ''),
      tasks: own_series.length, repeated: own_series.filter(series => series.points.length >= 2).length };
  });
  const selected = data?.observations.find(observation => observation.original.id === selectedCheckId);
  return <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
    <nav aria-label="Reading review navigation" className="flex flex-wrap gap-4 text-sm"><a className="underline" href="/">← Dashboard</a><a className="underline" href="/external-apps">Reading apps and new checks</a></nav>
    <header className="space-y-2"><h1 className="text-3xl font-bold">Reading review and history</h1>
      <p>Review manually entered reading observations and append attributable corrections. Original evidence is retained.</p>
      <p className="text-sm text-muted-foreground">Current assigned staff can review a class&apos;s historical readings after a learner withdraws, while the class and learner remain in this school. These observations are private to staff.</p>
    </header>
    {error && <div role="alert" className="space-y-2 rounded border p-4"><p>{error}</p>
      {!classId && <button className={buttonStyle} disabled={loadingClasses} onClick={() => { setLoadingClasses(true); setError(''); setClassesRefresh(previous => previous + 1); }}>Reload classes</button>}
    </div>}
    <section className="grid gap-4 rounded border p-4 sm:grid-cols-2" aria-label="Reading history filters">
      <label className="block">Class<select className={inputStyle} value={classId} disabled={loadingClasses || saving} onChange={event => chooseClass(event.target.value)}><option value="">{loadingClasses ? 'Loading classes…' : 'Select a class'}</option>{classes.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
      <label className="block">Student<select className={inputStyle} value={studentId} disabled={!classId || loading || saving} onChange={event => chooseStudent(event.target.value)}><option value="">All students with authorized readings</option>{studentIds.map(id => <option key={id} value={id}>{studentLabel(id)}</option>)}</select></label>
      <p className="text-sm text-muted-foreground sm:col-span-2">Learners who have left this class stay in the list so their earlier readings can still be reviewed.</p>
      {classId && <button type="button" className={buttonStyle + ' justify-self-start'} disabled={loading || saving} onClick={startReload}>Refresh history</button>}
    </section>
    {loading && <p role="status" aria-live="polite">Loading reading history…</p>}
    {rosterWarning && <p role="status">{rosterWarning}</p>}
    {saved && <section className="space-y-3 rounded border border-green-700 p-4" aria-labelledby="reading-saved-heading">
      <h2 id="reading-saved-heading" className="font-semibold" role="status">Correction saved · revision {saved.revision}</h2>
      <p className="break-words text-sm">Reviewer {staffLabel(saved.correctedBy)} · <time dateTime={saved.correctedAt}>{formatStamp(saved.correctedAt)}</time></p><p className="break-words">{saved.reason}</p><Metrics value={saved}/>
    </section>}
    {!classId && !loadingClasses && <p>{classes.length ? 'Select a class to review its reading observations.' : 'No authorized classes are available to your account.'}</p>}
    {data && !loading && <>
      <section className="space-y-3" aria-labelledby="reading-overview-heading"><h2 id="reading-overview-heading" className="text-2xl font-semibold">Reading overview by learner</h2>
        <p className="text-sm text-muted-foreground">Counts of recorded readings only. Learners are listed by name, not by score; no class average or ranking is calculated.</p>
        <div className="relative max-w-full overflow-x-auto rounded border" tabIndex={0} role="region" aria-label="Reading overview table; scroll horizontally on small screens">
          <table className="w-full text-left text-sm"><caption className="sr-only">Number of recorded readings, latest reading date and comparable tasks for each learner.</caption>
            <thead className="bg-muted"><tr><th scope="col" className="p-3">Learner</th><th scope="col" className="p-3">Readings</th><th scope="col" className="p-3">Latest reading</th><th scope="col" className="p-3">Exact tasks</th><th scope="col" className="p-3">Tasks with 2 or more readings</th><th scope="col" className="p-3"><span className="sr-only">Action</span></th></tr></thead>
            <tbody>{overview.map(row => <tr key={row.id} className="border-t" aria-current={studentId === row.id ? 'true' : undefined}>
              <th scope="row" className="p-3 font-normal break-words">{studentLabel(row.id)}</th>
              <td className="p-3">{row.readings}</td><td className="p-3 whitespace-nowrap">{row.latest ? formatReadingDate(row.latest) : 'No readings yet'}</td><td className="p-3">{row.tasks}</td><td className="p-3">{row.repeated}</td>
              <td className="p-3">{row.readings > 0 && <button type="button" className={buttonStyle} disabled={loading || saving || studentId === row.id} onClick={() => chooseStudent(row.id)}>{studentId === row.id ? 'Showing' : 'Show readings'}<span className="sr-only"> for {studentLabel(row.id)}</span></button>}</td></tr>)}</tbody>
          </table>
        </div>
        {overview.some(row => row.readings === 0) && <p className="text-sm" data-reading-gaps>{overview.every(row => row.readings === 0)
          ? (overview.length === 1 ? 'This learner has no recorded reading yet.' : 'None of the ' + overview.length + ' learners has a recorded reading yet.')
          : overview.filter(row => row.readings === 0).length + ' of ' + overview.length + ' learners ' + (overview.filter(row => row.readings === 0).length === 1 ? 'has' : 'have') + ' no recorded readings yet.'}</p>}
      </section>
      <section className="space-y-4" aria-labelledby="reading-series-heading"><h2 id="reading-series-heading" className="text-2xl font-semibold">Reading trends for exact tasks</h2>
        <p>Each chart and table keeps the same learner, class, language, passage reference and recorded duration. Points use the latest reviewed correction, if present. Passage references alone do not establish equivalent difficulty or scoring reliability.</p>
        <p className="text-sm text-muted-foreground">Rates describe these observations; they do not assign grades, diagnose learning difficulties, compare learners or demonstrate a product&apos;s effectiveness. No average, ranking, benchmark or target is calculated. Dates are the calendar dates staff entered (UTC); your school has not yet set a school-date policy.</p>
        {!data.series.length && <p>No comparable reading observations are available for these filters.</p>}
        {data.series.map(series => { const summary = summariseSeries(series.points); return <section key={JSON.stringify([series.studentId, series.classId, series.language, series.passageReference, series.durationMs])} className="space-y-3 rounded border p-4" data-series-kind={summary.kind}>
          <h3 className="font-semibold break-words">{studentLabel(series.studentId)} · {series.language} · {series.durationMs / 1000} seconds</h3><p className="break-words">Passage reference: {series.passageReference}</p>
          <p className="text-sm" data-series-statement>{summary.statement}</p>
          <div className="grid gap-4 md:grid-cols-2"><ReadingTrendChart points={series.points} metric="wcpm"/><ReadingTrendChart points={series.points} metric="accuracy"/></div>
          <div className="relative max-w-full overflow-x-auto rounded border" tabIndex={0} role="region" aria-label="Comparable observations table; scroll horizontally on small screens">
            <table className="w-full text-left text-sm"><caption className="p-3 text-left text-muted-foreground">All values for the charts above, in date order, for class {classes.find(value => value.id === series.classId)?.name ?? 'name unavailable'}.</caption>
              <thead className="bg-muted"><tr><th scope="col" className="p-3">Reading date</th><th scope="col" className="p-3">Words correct / attempted</th><th scope="col" className="p-3">Correct words per minute</th><th scope="col" className="p-3">Accuracy</th><th scope="col" className="p-3">Revision</th></tr></thead>
              <tbody>{series.points.map(point => <tr key={point.checkId} className="border-t"><th scope="row" className="p-3 font-normal whitespace-nowrap">{point.readingDate}</th><td className="p-3">{point.wordsCorrect} / {point.wordsAttempted}</td><td className="p-3">{point.wcpm}</td><td className="p-3">{point.accuracy}%</td><td className="p-3">{point.revision || 'Original'}</td></tr>)}</tbody>
            </table>
          </div>
        </section>; })}
      </section>
      <section className="space-y-4" aria-labelledby="reading-observations-heading">
        <h2 id="reading-observations-heading" className="text-2xl font-semibold">Original observations and effective readings</h2>
        {!data.observations.length && <p>No reading observations match these filters. New reviewed checks can be entered from <a href="/external-apps" className="underline">Reading apps</a>.</p>}
        {data.observations.map(observation => <article key={observation.original.id} className="space-y-4 rounded border p-4">
          <h3 className="font-semibold break-words">{studentLabel(observation.original.studentId)} · {formatReadingDate(observation.effective.readingDate)}</h3>
          <p className="text-xs text-muted-foreground break-all">Observation ID {observation.original.id} (quote this if you contact support)</p>
          <div className="grid gap-6 lg:grid-cols-2"><section className="space-y-2" aria-label="Original manually recorded evidence"><h4 className="font-semibold">Original observation</h4><Metrics value={observation.original}/>
            <p className="break-words text-sm text-muted-foreground">Recorded by {staffLabel(observation.original.recordedBy)} · <time dateTime={observation.original.createdAt}>{formatStamp(observation.original.createdAt)}</time></p>
            <p className="text-sm text-muted-foreground">Source: counts entered by staff from the oral reading fluency app after adult review. The app did not send or verify them.</p>
          </section><section className="space-y-2" aria-label="Effective reviewed reading"><h4 className="font-semibold">Effective reading · {observation.revision ? 'correction revision ' + observation.revision : 'original, no corrections'}</h4><Metrics value={observation.effective}/></section></div>
          <details className="rounded border p-3"><summary className="cursor-pointer font-medium">Correction history ({observation.corrections.length})</summary>
            {!observation.corrections.length ? <p className="pt-3">No corrections have been added.</p> : <ol className="space-y-4 pt-3">{observation.corrections.map(correction => <li key={correction.id} className="space-y-2 border-t pt-3">
              <h5 className="font-semibold">Revision {correction.revision}</h5><p className="text-sm break-words">Reviewer {staffLabel(correction.correctedBy)} · <time dateTime={correction.correctedAt}>{formatStamp(correction.correctedAt)}</time></p><p className="break-words">Reason: {correction.reason}</p><Metrics value={correction}/>
            </li>)}</ol>}
          </details>
          <button type="button" className={buttonStyle} disabled={saving} onClick={() => { if (!savingRef.current) setSelectedCheckId(previous => previous === observation.original.id ? '' : observation.original.id); }} aria-expanded={selectedCheckId === observation.original.id}>{selectedCheckId === observation.original.id ? 'Close correction editor' : 'Review a correction'}</button>
          {selected?.original.id === observation.original.id && <CorrectionEditor key={observation.original.id + ':' + observation.revision} observation={observation} onSaved={correctionSaved} onAccessLost={accessLost} onSaving={value => { savingRef.current = value; setSaving(value); }}/>}</article>)}
      </section>
    </>}
  </main>;
}
