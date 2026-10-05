'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { requestJson, getPrincipal, listClasses } from '@/lib/education/client-api';
import type { Class, Student } from '@/lib/education/types';

type Check = { id: string; studentId: string; readingDate: string; passageReference: string; language: string; wcpm: number; accuracy: number };
export default function ReadingAppsPage() {
  const [staff, setStaff] = useState(false);
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
  useEffect(() => { let active = true; void (async () => {
    try {
      const principal = await getPrincipal();
      if (!active) return;
      if (!['admin', 'teacher'].includes(principal.role)) { setMessage('Reading checks are available to school staff.'); return; }
      setStaff(true);
      const [apps, roster] = await Promise.all([requestJson<{available: boolean}[]>('/api/external-apps'), listClasses()]);
      if (!active) return;
      setAvailable(apps[0]?.available ?? false); setClasses(roster); setMessage('');
    } catch { if (active) setMessage('Could not load reading apps. Please try again.'); }
  })(); return () => { active = false; }; }, []);
  useEffect(() => {
    if (!classId) return;
    let active = true;
    void Promise.all([requestJson<{enrolledStudents: Student[]}>('/api/classes/' + encodeURIComponent(classId)), requestJson<Check[]>('/api/reading-checks?classId=' + encodeURIComponent(classId))])
      .then(([roster, history]) => { if (active) { setStudents(roster.enrolledStudents); setChecks(history); setMessage(''); } })
      .catch(() => { if (active) setMessage('Could not load the class. Please try again.'); });
    return () => { active = false; };
  }, [classId]);
  async function launch() {
    if (launchingRef.current) return;
    launchingRef.current = true; setLaunching(true); setUrl(''); setMessage('');
    try { const result = await requestJson<{url: string}>('/api/external-apps/oral-reading-fluency/launch', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'}); setUrl(result.url); }
    catch { setMessage('The reading app is unavailable. Ask your administrator to check its connection.'); }
    finally { launchingRef.current = false; setLaunching(false); }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    const form = event.currentTarget; const data = new FormData(form);
    const input = {classId, studentId: String(data.get('studentId')), language: String(data.get('language')), passageReference: String(data.get('passageReference')), readingDate: String(data.get('readingDate')), durationSeconds: Number(data.get('durationSeconds')), wordsAttempted: Number(data.get('wordsAttempted')), wordsCorrect: Number(data.get('wordsCorrect'))};
    const payload = JSON.stringify(input); const id = retry?.payload === payload ? retry.id : crypto.randomUUID();
    setRetry({payload, id}); setSaving(true); setMessage('');
    try {
      const saved = await requestJson<Check>('/api/reading-checks', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...input, clientCheckId: id})});
      setChecks(previous => [saved, ...previous.filter(check => check.id !== saved.id)]);
      setRetry(null); form.reset();
      try {
        setChecks(await requestJson<Check[]>('/api/reading-checks?classId=' + encodeURIComponent(classId)));
        setMessage('Reviewed reading check saved.');
      } catch { setMessage('Reviewed reading check saved. Reload this class to refresh its history.'); }
    } catch { setMessage('Could not save. Check the counts and date, then retry.'); } finally { savingRef.current = false; setSaving(false); }
  }
  const inputStyle = 'border rounded p-2 w-full';
  return <main className="max-w-3xl mx-auto p-6 space-y-6">
    <Link href="/">← Dashboard</Link><h1 className="text-2xl font-bold">Reading apps and reviewed checks</h1>
    <p role="status">{message}</p>
    {staff && <>
      <section className="border rounded p-4 space-y-3"><h2 className="text-xl font-semibold">Oral reading fluency</h2>
        <p>The external app opens separately and may require its own sign-in. Student details are not sent when opening it. Results are recorded below after staff review.</p>
        {available ? <button className="border rounded p-2" onClick={launch} disabled={launching}>{launching ? 'Preparing…' : 'Prepare reading app'}</button> : <p>Your administrator needs to connect the reading app.</p>}
        {url && <p><a className="underline" href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open reading app ↗</a></p>}
      </section>
      <label className="block">Class<select className={inputStyle} value={classId} disabled={saving} onChange={e => { if (savingRef.current) return; setStudents([]); setChecks([]); setRetry(null); setMessage(e.target.value ? 'Loading class…' : ''); setClassId(e.target.value); }}><option value="">Select class</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      {classId && <form key={classId} onSubmit={save} className="border rounded p-4 space-y-3"><fieldset disabled={saving} className="space-y-3"><h2 className="text-xl font-semibold">Record a reviewed check</h2>
        <p>Enter counts from an adult-reviewed reading session. These records do not assign a grade or identify a learning difficulty.</p>
        <label className="block">Student<select name="studentId" required className={inputStyle}><option value="">Select student</option>{students.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}</select></label>
        <label className="block">Language code<input name="language" defaultValue="en-IN" required maxLength={35} className={inputStyle}/></label>
        <label className="block">Passage reference<input name="passageReference" required maxLength={200} className={inputStyle}/></label>
        <label className="block">Reading date<input name="readingDate" type="date" required max={new Date().toISOString().slice(0,10)} className={inputStyle}/></label>
        <label className="block">Reading time in seconds<input name="durationSeconds" type="number" min="1" max="3600" step="0.001" required className={inputStyle}/></label>
        <label className="block">Words attempted<input name="wordsAttempted" type="number" min="1" max="500" required className={inputStyle}/></label>
        <label className="block">Words correct<input name="wordsCorrect" type="number" min="0" max="500" required className={inputStyle}/></label>
        <button disabled={saving || !students.length} className="border rounded p-2">{saving ? 'Saving…' : 'Save reviewed check'}</button>
      </fieldset></form>}
      <section><h2 className="text-xl font-semibold">Reviewed checks</h2><p>Manually entered from the external app. These results have not been automatically verified by it.</p>
        {!checks.length && <p>No checks to display.</p>}
        <ul className="space-y-3">{checks.map(c => <li key={c.id} className="border rounded p-3">{students.find(s => s.id === c.studentId)?.firstName ?? 'Student'} · {c.readingDate} · {c.language}<br/>{c.passageReference}: {c.wcpm} correct words/minute · {c.accuracy}% accuracy</li>)}</ul>
      </section>
    </>}
  </main>;
}
