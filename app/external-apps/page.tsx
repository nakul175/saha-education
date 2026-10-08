'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- Native return navigation avoids the reproduced vinext RSC prefetch/backlink failure. */

import { useEffect, useRef, useState } from 'react';
import { requestJson, getPrincipal, listClasses } from '@/lib/education/client-api';
import type { Class, Student } from '@/lib/education/types';

type Check = {
  id: string;
  studentId: string;
  readingDate: string;
  passageReference: string;
  language: string;
  wcpm: number;
  accuracy: number;
};
export default function ReadingAppsPage() {
  const [staff, setStaff] = useState(false);
  const [family, setFamily] = useState(false);
  const [appsLoaded, setAppsLoaded] = useState(false);
  const [available, setAvailable] = useState(false);
  const [url, setUrl] = useState('');
  const [classes, setClasses] = useState<Class[]>([]);
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [message, setMessage] = useState('Loading…');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const launchingRef = useRef(false);
  const [launching, setLaunching] = useState(false);
  const [retry, setRetry] = useState<{ payload: string; id: string } | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const principal = await getPrincipal();
        if (!active) return;
        if (!['admin', 'teacher'].includes(principal.role)) {
          setMessage('Reading checks are available to school staff.');
          setFamily(true);
          return;
        }
        setStaff(true);
        const [apps, roster] = await Promise.all([
          requestJson<{ available: boolean }[]>('/api/external-apps'),
          listClasses(),
        ]);
        if (!active) return;
        setAvailable(apps[0]?.available ?? false);
        setAppsLoaded(true);
        setClasses(roster);
        setMessage('');
      } catch {
        if (active) setMessage('Could not load reading apps. Please try again.');
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!classId) return;
    let active = true;
    void Promise.all([
      requestJson<{ enrolledStudents: Student[] }>('/api/classes/' + encodeURIComponent(classId)),
      requestJson<Check[]>('/api/reading-checks?classId=' + encodeURIComponent(classId)),
    ])
      .then(([roster, history]) => {
        if (active) {
          setStudents(roster.enrolledStudents);
          setChecks(history);
          setMessage('');
        }
      })
      .catch(() => {
        if (active) setMessage('Could not load the class. Please try again.');
      });
    return () => {
      active = false;
    };
  }, [classId]);
  async function launch() {
    if (launchingRef.current) return;
    launchingRef.current = true;
    setLaunching(true);
    setUrl('');
    setMessage('');
    try {
      const result = await requestJson<{ url: string }>('/api/external-apps/oral-reading-fluency/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      setUrl(result.url);
    } catch {
      setMessage('The reading app is unavailable. Ask your administrator to check its connection.');
    } finally {
      launchingRef.current = false;
      setLaunching(false);
    }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    const form = event.currentTarget;
    const data = new FormData(form);
    const input = {
      classId,
      studentId: String(data.get('studentId')),
      language: String(data.get('language')),
      passageReference: String(data.get('passageReference')),
      readingDate: String(data.get('readingDate')),
      durationSeconds: Number(data.get('durationSeconds')),
      wordsAttempted: Number(data.get('wordsAttempted')),
      wordsCorrect: Number(data.get('wordsCorrect')),
    };
    const payload = JSON.stringify(input);
    const id = retry?.payload === payload ? retry.id : crypto.randomUUID();
    setRetry({ payload, id });
    setSaving(true);
    setMessage('');
    try {
      const saved = await requestJson<Check>('/api/reading-checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, clientCheckId: id }),
      });
      setChecks((previous) => [saved, ...previous.filter((check) => check.id !== saved.id)]);
      setRetry(null);
      form.reset();
      try {
        setChecks(await requestJson<Check[]>('/api/reading-checks?classId=' + encodeURIComponent(classId)));
        setMessage('Reviewed reading check saved.');
      } catch {
        setMessage('Reviewed reading check saved. Reload this class to refresh its history.');
      }
    } catch {
      setMessage('Could not save. Check the counts and date, then retry.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  const inputStyle = 'border rounded p-2 w-full';
  const names = new Map(students.map((s) => [s.id, s.firstName + ' ' + s.lastName]));
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <a className="underline" href="/">
        ← Dashboard
      </a>
      <h1 className="text-2xl font-bold">Reading apps and reviewed checks</h1>
      <p role="status">{message}</p>
      {family && (
        <section className="border rounded p-4 space-y-2" aria-labelledby="family-reading-heading">
          <h2 id="family-reading-heading" className="text-xl font-semibold">
            Reading checks are private to school staff
          </h2>
          <p>
            Reading check results are not shown to students or families yet. Your school has not published any
            reading results, so nothing is available on this page. Reports your school publishes appear under
            Reports.
          </p>
          <p>
            <a className="underline" href="/report-cards">
              View published reports
            </a>
          </p>
        </section>
      )}
      {staff && (
        <>
          <section className="border rounded p-4 space-y-3" aria-labelledby="orf-heading">
            <h2 id="orf-heading" className="text-xl font-semibold">
              Oral reading fluency app
            </h2>
            {!appsLoaded ? (
              <p>Checking whether the reading app is connected…</p>
            ) : available ? (
              <>
                <p data-orf-state="ready">
                  <strong>Connected.</strong> Prepare the link, then open the app in a new tab. The app asks
                  you to sign in with its own account.
                </p>
                <button
                  className="border rounded p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  onClick={launch}
                  disabled={launching}
                >
                  {launching ? 'Preparing…' : 'Prepare reading app'}
                </button>
              </>
            ) : (
              <p data-orf-state="not-configured">
                <strong>Not connected.</strong> Your school has not connected an oral reading fluency app yet,
                so there is nothing to open and no information has been sent anywhere. You can still enter
                counts from an adult-reviewed reading below. Ask your school administrator to connect the app.
              </p>
            )}
            {url && (
              <p>
                <a
                  className="underline"
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                >
                  Open reading app ↗
                </a>
              </p>
            )}
            <div
              className="rounded border bg-muted/30 p-3 space-y-2 text-sm"
              aria-labelledby="orf-boundary-heading"
              role="group"
            >
              <h3 id="orf-boundary-heading" className="font-semibold">
                What opening the app does
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  It opens the school&apos;s fixed reading app address in a separate tab, without telling the
                  app which page you came from.
                </li>
                <li>
                  Saha sends no student names, student numbers, class details or Saha sign-in to the app.
                </li>
                <li>
                  The app is a separate service with its own sign-in. Signing in to Saha does not sign you in
                  there.
                </li>
                <li>
                  Results do not come back automatically. They appear in Saha only after an adult reviews them
                  and records or imports them.
                </li>
              </ul>
            </div>
            <div
              className="rounded border bg-muted/30 p-3 space-y-2 text-sm"
              role="group"
              aria-labelledby="orf-return-heading"
            >
              <h3 id="orf-return-heading" className="font-semibold">
                How reviewed results come back to Saha
              </h3>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Review the reading with a trusted adult in the app.</li>
                <li>
                  Either enter the reviewed counts below, or prepare a results file and stage it in{' '}
                  <a className="underline" href="/reading-imports">
                    Reading imports
                  </a>
                  , where every row is checked before it is confirmed.
                </li>
                <li>
                  Look at saved readings and trends in{' '}
                  <a className="underline" href="/reading-review">
                    Reading review
                  </a>
                  , where corrections keep the original record.
                </li>
              </ol>
            </div>
          </section>
          <label className="block">
            Class
            <select
              className={inputStyle}
              value={classId}
              disabled={saving}
              onChange={(e) => {
                if (savingRef.current) return;
                setStudents([]);
                setChecks([]);
                setRetry(null);
                setMessage(e.target.value ? 'Loading class…' : '');
                setClassId(e.target.value);
              }}
            >
              <option value="">Select class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {classId && (
            <form key={classId} onSubmit={save} className="border rounded p-4 space-y-3">
              <fieldset disabled={saving} className="space-y-3">
                <h2 className="text-xl font-semibold">Record a reviewed check</h2>
                <p>
                  Enter counts from an adult-reviewed reading session. These records do not assign a grade or
                  identify a learning difficulty.
                </p>
                <label className="block">
                  Student
                  <select name="studentId" required className={inputStyle}>
                    <option value="">Select student</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.firstName} {s.lastName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  Language code
                  <input
                    name="language"
                    defaultValue="en-IN"
                    required
                    maxLength={35}
                    className={inputStyle}
                  />
                </label>
                <label className="block">
                  Passage reference
                  <input name="passageReference" required maxLength={200} className={inputStyle} />
                </label>
                <label className="block">
                  Reading date
                  <input
                    name="readingDate"
                    type="date"
                    required
                    max={new Date().toISOString().slice(0, 10)}
                    className={inputStyle}
                  />
                </label>
                <label className="block">
                  Reading time in seconds
                  <input
                    name="durationSeconds"
                    type="number"
                    min="1"
                    max="3600"
                    step="0.001"
                    required
                    className={inputStyle}
                  />
                </label>
                <label className="block">
                  Words attempted
                  <input
                    name="wordsAttempted"
                    type="number"
                    min="1"
                    max="500"
                    required
                    className={inputStyle}
                  />
                </label>
                <label className="block">
                  Words correct
                  <input
                    name="wordsCorrect"
                    type="number"
                    min="0"
                    max="500"
                    required
                    className={inputStyle}
                  />
                </label>
                <button disabled={saving || !students.length} className="border rounded p-2">
                  {saving ? 'Saving…' : 'Save reviewed check'}
                </button>
              </fieldset>
            </form>
          )}
          <section>
            <h2 className="text-xl font-semibold">Reviewed checks</h2>
            <p>
              Entered by staff from an adult-reviewed reading. The reading app has not verified these results.
            </p>
            {!classId && <p>Select a class to see its reviewed checks.</p>}
            {classId && !checks.length && <p>No checks to display.</p>}
            <ul className="space-y-3">
              {checks.map((c) => (
                <li key={c.id} className="border rounded p-3">
                  {names.get(c.studentId) ?? 'Student not currently enrolled'} · {c.readingDate} ·{' '}
                  {c.language}
                  <br />
                  {c.passageReference}: {c.wcpm} correct words/minute · {c.accuracy}% accuracy
                </li>
              ))}
            </ul>
            {classId && (
              <p className="pt-2">
                <a className="underline" href="/reading-review">
                  Review history, corrections and trends
                </a>
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
