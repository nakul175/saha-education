'use client';

import { useEffect, useRef, useState } from 'react';
import { getPrincipal, listStudents, listReportCards, createReportCard, publishReportCard } from '@/lib/education/client-api';
import type { Principal, ReportCard } from '@/lib/education/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const emptyDraft = { term: '', summary: '', overallGrade: '' };

export default function ReportCardsPage() {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const creationInFlight = useRef(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [draftForm, setDraftForm] = useState(emptyDraft);
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const [uncertainDraft, setUncertainDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const isAdmin = principal?.role === 'admin';
  const busy = loading || creating || publishing !== null;

  useEffect(() => {
    let current = true;
    async function initialise() {
      try {
        const [account, rows] = await Promise.all([getPrincipal(), listStudents()]);
        if (!current) return;
        setPrincipal(account);
        setStudents(rows.map(student => ({ id: student.id, name: `${student.firstName} ${student.lastName}` })));
        setReady(true);
      } catch {
        if (current) setError('Student choices could not be loaded. Reload this page before continuing.');
      }
    }
    void initialise();
    return () => { current = false; };
  }, []);

  useEffect(() => {
    if (!selectedStudentId) return;
    let current = true;
    async function loadReports() {
      setLoading(true);
      try {
        const cards = await listReportCards(selectedStudentId);
        if (!current) return;
        setReportCards(cards);
        setReviewed({});
        setUncertainDraft(false);
        setError(null);
      } catch {
        if (current) {
          setReportCards([]);
          setError('Reports could not be loaded. Reload reports before creating or publishing.');
        }
      } finally {
        if (current) setLoading(false);
      }
    }
    void loadReports();
    return () => { current = false; };
  }, [selectedStudentId, refresh]);

  function selectStudent(value: string) {
    setSelectedStudentId(value);
    setReportCards([]);
    setReviewed({});
    setDraftForm(emptyDraft);
    setUncertainDraft(false);
    setError(null);
    setNotice(null);
  }

  async function createDraft(event: React.FormEvent) {
    event.preventDefault();
    if (creationInFlight.current || !isAdmin || !selectedStudentId || busy || uncertainDraft || error) return;
    creationInFlight.current = true;
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const card = await createReportCard({ studentId: selectedStudentId, ...draftForm });
      setReportCards(previous => [...previous, card]);
      setDraftForm(emptyDraft);
      setNotice('Draft saved. Review its stored details before publishing it to linked families.');
    } catch {
      setUncertainDraft(true);
      setError('The draft save could not be confirmed. Reload reports and check whether this draft was saved before creating another. Your entered text is retained.');
    } finally { creationInFlight.current = false; setCreating(false); }
  }

  async function publish(id: string) {
    if (!isAdmin || busy || !reviewed[id] || error) return;
    setPublishing(id);
    setError(null);
    setNotice(null);
    try {
      const card = await publishReportCard(id);
      setReportCards(previous => previous.map(row => row.id === id ? card : row));
      setReviewed(previous => ({ ...previous, [id]: false }));
      setNotice('Report published. Eligible linked guardian accounts receive an in-app notice.');
    } catch {
      setError('Publication could not be confirmed. Reload reports to check the saved status, then review again. Publishing the same report again does not send duplicate notices.');
    } finally { setPublishing(null); }
  }

  const selectedName = students.find(student => student.id === selectedStudentId)?.name;
  return <div className="container mx-auto space-y-6 p-4">
    <div><h1 className="text-2xl font-bold">Report Cards</h1>
      <p className="text-muted-foreground">{isAdmin ? 'Create a draft, review the saved details and publish to linked families.' : 'View reports available for your linked or assigned students.'}</p>
    </div>
    {error && <p role="alert" className="break-words text-destructive">{error}</p>}
    {notice && <p role="status" className="break-words">{notice}</p>}
    <Card><CardHeader><CardTitle>Select Student</CardTitle></CardHeader><CardContent className="space-y-3">
      <Label htmlFor="report-student">Student</Label>
      <select id="report-student" className="w-full min-w-0 rounded-md border bg-background p-2" value={selectedStudentId} disabled={!ready || creating || publishing !== null} onChange={event => selectStudent(event.target.value)}>
        <option value="">Select a student</option>
        {students.map(student => <option key={student.id} value={student.id}>{student.name}</option>)}
      </select>
      {ready && students.length === 0 && <p>No student records are available for your account.</p>}
      {selectedStudentId && <Button variant="outline" disabled={busy} onClick={() => { setNotice(null); setRefresh(value => value + 1); }}>Reload reports</Button>}
    </CardContent></Card>
    {selectedStudentId && <>
      {isAdmin && <Card><CardHeader><CardTitle>Create Draft Report Card</CardTitle></CardHeader><CardContent>
        <p className="mb-4 break-words">Student: {selectedName}. Grades and summaries are entered by your school; they are not calculated here.</p>
        <form onSubmit={createDraft} className="space-y-4">
          <div><Label htmlFor="term">Term</Label><Input id="term" value={draftForm.term} onChange={event => setDraftForm(previous => ({ ...previous, term: event.target.value }))} required disabled={creating}/></div>
          <div><Label htmlFor="overallGrade">Overall Grade</Label><Input id="overallGrade" value={draftForm.overallGrade} onChange={event => setDraftForm(previous => ({ ...previous, overallGrade: event.target.value }))} required disabled={creating}/></div>
          <div><Label htmlFor="summary">Summary</Label><Textarea id="summary" value={draftForm.summary} onChange={event => setDraftForm(previous => ({ ...previous, summary: event.target.value }))} rows={4} disabled={creating}/></div>
          <Button type="submit" disabled={busy || uncertainDraft || error !== null}>{creating ? 'Saving draft…' : 'Create Draft'}</Button>
        </form>
      </CardContent></Card>}
      <Card><CardHeader><CardTitle>Reports for {selectedName}</CardTitle></CardHeader><CardContent>
        {loading ? <p role="status">Loading report cards…</p> : reportCards.length === 0 ? <p>No report cards available for this student.</p> : <div className="space-y-4">
          {reportCards.map(card => <Card key={card.id} className="min-w-0 p-4" aria-label={'Report ' + card.term}>
            <div className="min-w-0 space-y-3 break-words">
              <h3 className="font-semibold">{card.term}</h3><p>Grade: {card.overallGrade}</p><p className="whitespace-pre-wrap">{card.summary || 'No summary supplied.'}</p>
              <p>{card.publishedAt ? 'Published on: ' + new Date(card.publishedAt).toLocaleString() : 'Unpublished draft'}</p>
              <a className="inline-block underline" href={'/report-cards/' + encodeURIComponent(card.id)}>Open report</a>
              {isAdmin && !card.publishedAt && <div className="space-y-3">
                <Label className="flex items-start gap-2" htmlFor={'review-' + card.id}>
                  <input id={'review-' + card.id} type="checkbox" className="mt-1" checked={reviewed[card.id] === true} disabled={busy} onChange={event => setReviewed(previous => ({ ...previous, [card.id]: event.target.checked }))}/>
                  <span className="min-w-0">I reviewed this saved report for {selectedName} and intend to make it available to linked families.</span>
                </Label>
                <Button onClick={() => publish(card.id)} variant="outline" disabled={busy || !reviewed[card.id] || error !== null}>{publishing === card.id ? 'Publishing…' : 'Publish'}</Button>
              </div>}
            </div>
          </Card>)}
        </div>}
      </CardContent></Card>
    </>}
  </div>;
}
