'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- Use full-page navigation while vinext beta Link transitions are unreliable. */
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiFailure, apiJson, roleLabel, whenText } from '@/lib/education/notices-client';
import type { NoticeDetail, NoticeSendResult } from '@/lib/education/notices';

const inputStyle = 'w-full rounded border bg-background p-2';
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const CORRECTION_MESSAGES = {
  400: 'Check the title, message, reason (at least 10 characters) and the confirmation. Plain text only, so “<” tags are not allowed.',
  404: 'This notice is no longer available to you. Go back to your sent notices.',
  409: 'An earlier correction with the same reference was saved with different content. Reload the page and review it before sending again.',
};

export default function NoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detail, setDetail] = useState<NoticeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const busy = useRef(false);
  const retry = useRef<{ payload: string; id: string } | null>(null);
  const status = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setDetail(await apiJson<NoticeDetail>('/api/notices/' + encodeURIComponent(id), undefined, { 404: 'This notice was not found among the notices you can see.' }));
  }, [id]);
  useEffect(() => {
    let active = true;
    void (async () => {
      try { await load(); }
      catch (failure) { if (active) setError(failure instanceof ApiFailure ? failure.message : 'This notice could not be loaded. Reload the page.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [load]);
  useEffect(() => { if (error || message) status.current?.focus(); }, [error, message]);

  async function correct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !confirmed) return;
    busy.current = true; setSaving(true); setError(''); setMessage('');
    const input = { title: title.trim(), body, reason: reason.trim(), reviewConfirmed: true as const };
    const payload = JSON.stringify(input);
    const requestId = retry.current?.payload === payload ? retry.current.id : crypto.randomUUID();
    retry.current = { payload, id: requestId };
    try {
      const saved = await apiJson<NoticeSendResult>('/api/notices/' + encodeURIComponent(id) + '/corrections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, clientRequestId: requestId }),
      }, CORRECTION_MESSAGES);
      retry.current = null;
      setTitle(''); setBody(''); setReason(''); setConfirmed(false);
      setMessage(`Correction sent to ${plural(saved.notice.recipientCount, 'person', 'people')}. The original notice is unchanged and stays on record.`);
      try { await load(); } catch { setMessage(previous => previous + ' Reload the page to refresh the lists.'); }
    } catch (failure) {
      const known = failure instanceof ApiFailure ? failure : null;
      if (known?.status === 409) retry.current = null;
      setError(known ? known.message + (known.status === 0 || known.status >= 500 ? ' Your form is kept. Pressing Send again will not send the correction twice.' : '') : 'The correction could not be confirmed. Keep this page open and press Send again.');
    } finally { busy.current = false; setSaving(false); }
  }

  const readCount = detail ? detail.readCount : 0;
  return <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
    <a href="/notices" className="underline">← Sent notices</a>
    <div ref={status} tabIndex={-1} role={error ? 'alert' : 'status'} aria-live="polite" aria-atomic="true" className={error || message ? 'rounded border p-3 break-words' : undefined}>{loading ? 'Loading this notice…' : error || message}</div>
    {detail && <>
      <article aria-labelledby="notice-title" className="space-y-3 rounded border p-4">
        <h1 id="notice-title" className="break-words text-2xl font-bold">{detail.title}</h1>
        {detail.audienceKind === 'correction' && <p className="rounded border p-3 text-sm">This is a correction{detail.corrects ? <> to <a className="underline" href={'/notices/' + encodeURIComponent(detail.corrects.id)}>{detail.corrects.title}</a></> : ''}.{detail.correctionReason ? <> Reason: <span className="break-words">{detail.correctionReason}</span></> : null}</p>}
        <p className="whitespace-pre-wrap break-words">{detail.body}</p>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="font-medium">Sent to</dt><dd className="break-words">{detail.audienceLabel}</dd></div>
          <div><dt className="font-medium">Sent by</dt><dd className="break-words">{detail.senderLabel}</dd></div>
          <div><dt className="font-medium">Sent</dt><dd>{whenText(detail.createdAt)}</dd></div>
          <div><dt className="font-medium">Read so far</dt><dd>{readCount} of {plural(detail.recipientCount, 'person', 'people')}</dd></div>
        </dl>
      </article>
      <section aria-labelledby="readers-title" className="space-y-2">
        <h2 id="readers-title" className="text-xl font-semibold">Who has read it</h2>
        {detail.recipients.length === 0 ? <p>No one received this notice.</p> : <ul className="grid gap-2 sm:grid-cols-2">{detail.recipients.map(person => <li key={person.userId} className="min-w-0 rounded border p-3">
          <p className="break-words font-medium">{person.name} <span className="font-normal text-muted-foreground">· {roleLabel(person.role)}</span></p>
          <p className="text-sm">{person.readAt ? `Read ${whenText(person.readAt)}` : 'Not read yet'}</p>
        </li>)}</ul>}
        {detail.recipientsTruncated && <p className="text-sm text-muted-foreground">Only the first 500 people are listed here.</p>}
      </section>
      <section aria-labelledby="corrections-title" className="space-y-2">
        <h2 id="corrections-title" className="text-xl font-semibold">Corrections</h2>
        {detail.corrections.length === 0 ? <p>No corrections have been sent for this notice.</p> : <ul className="space-y-2">{detail.corrections.map(item => <li key={item.id} className="min-w-0 space-y-1 rounded border p-3">
          <h3 className="break-words font-medium"><a className="underline" href={'/notices/' + encodeURIComponent(item.id)}>{item.title}</a></h3>
          <p className="break-words text-sm">Reason: {item.correctionReason}</p>
          <p className="text-sm text-muted-foreground">Sent {whenText(item.createdAt)} · {item.readCount} of {plural(item.recipientCount, 'person', 'people')} have read it</p>
        </li>)}</ul>}
      </section>
      {detail.audienceKind !== 'correction' && <section aria-labelledby="correct-title" className="space-y-4 rounded border p-4">
        <h2 id="correct-title" className="text-xl font-semibold">Send a correction</h2>
        <p>Sent notices cannot be edited. If something was wrong, send a correction. It goes to the same people, shows your reason, and the original stays on record.</p>
        <form onSubmit={correct} className="space-y-4">
          <fieldset disabled={saving} className="space-y-4">
            <label className="block space-y-1"><span>Correction title</span>
              <input className={inputStyle} required maxLength={120} value={title} onChange={event => { setTitle(event.target.value); setConfirmed(false); }} /></label>
            <label className="block space-y-1"><span>Corrected message</span>
              <textarea className={inputStyle} rows={5} required maxLength={2000} aria-label="Corrected message" value={body} onChange={event => { setBody(event.target.value); setConfirmed(false); }} /></label>
            <label className="block space-y-1"><span>Why is this correction needed?</span>
              <textarea className={inputStyle} rows={2} required minLength={10} maxLength={500} aria-label="Why is this correction needed?" aria-describedby="reason-help" value={reason} onChange={event => { setReason(event.target.value); setConfirmed(false); }} /></label>
            <p id="reason-help" className="text-sm text-muted-foreground">Use 10–500 characters on one line. Readers will see this reason.</p>
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
              <span>I have checked the correction and that it should go to the {plural(detail.recipientCount, 'person', 'people')} who received the original.</span></label>
            <Button type="submit" disabled={saving || !confirmed || !title.trim() || !body.trim() || reason.trim().length < 10}>{saving ? 'Sending…' : 'Send correction'}</Button>
          </fieldset>
        </form>
      </section>}
    </>}
    {!loading && !detail && <p><a className="underline" href="/notices">Go to your sent notices</a></p>}
  </div>;
}
