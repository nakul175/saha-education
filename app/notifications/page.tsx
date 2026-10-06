'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { isExactStoredTimestamp } from '@/lib/education/stored-timestamp';
import type { Notification, Principal } from '@/lib/education/types';

type Notice = Omit<Notification, 'readAt'> & { readAt?: string | null };
type PendingRead = { actorKey: string; id: string; endpoint: string };
const scopeKey = (actor: Principal) => `${actor.id}:${actor.role}:${actor.schoolId ?? ''}`;
class ReadFailure extends Error { constructor(readonly status: number) { super('Inbox request unavailable'); } }
async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.text();
  if (!response.ok) throw new ReadFailure(response.status);
  return JSON.parse(body) as T;
}
async function read<T>(path: string, signal?: AbortSignal) { return responseJson<T>(await fetch(path, { cache: 'no-store', signal })); }
// Rows stay a plain array; paging facts arrive in headers so older callers keep working.
type InboxPage = { rows: Notice[]; next: string | null; total: number | null; unread: number | null };
function headerNumber(response: Response, name: string) { const value = response.headers.get(name); return value !== null && /^\d+$/.test(value) ? Number(value) : null; }
async function readInbox(path: string, signal?: AbortSignal): Promise<InboxPage> {
  const response = await fetch(path, { cache: 'no-store', signal });
  const rows = await responseJson<Notice[]>(response);
  const cursor = response.headers.get('x-next-cursor');
  let next: string | null = null;
  try { next = cursor ? decodeURIComponent(cursor) : null; } catch { next = null; }
  return { rows, next, total: headerNumber(response, 'x-total-count'), unread: headerNumber(response, 'x-unread-count') };
}
function isUnread(value: unknown) { return value === null || value === undefined; }
function StoredDate({ value }: { value: unknown }) { return isExactStoredTimestamp(value) ? <time dateTime={value}>{new Date(value).toLocaleString()}</time> : <span>Stored date requires review: {String(value ?? '')}</span>; }

export default function NotificationsPage() {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [notifications, setNotifications] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [pendingView, setPendingView] = useState<PendingRead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paging, setPaging] = useState<{ next: string | null; total: number | null; unread: number | null; newer: boolean }>({ next: null, total: null, unread: null, newer: false });
  const [hideRead, setHideRead] = useState(false);
  const view = useRef<{ cursor: string | null; previous: (string | null)[] }>({ cursor: null, previous: [] });
  const generation = useRef(0), controller = useRef<AbortController | null>(null), mounted = useRef(true);
  const inFlight = useRef(false), currentScope = useRef<string | null>(null), currentRows = useRef<Notice[]>([]);
  const pending = useRef<PendingRead | null>(null), message = useRef<HTMLDivElement>(null);
  const invalidate = useCallback(() => { generation.current++; controller.current?.abort(); }, []);
  const hidePrivate = useCallback(() => {
    currentScope.current = null; currentRows.current = [];
    setPrincipal(null); setNotifications([]); setReady(false); setPaging({ next: null, total: null, unread: null, newer: false });
  }, []);
  const reload = useCallback(async (requiredActor?: string): Promise<{ actor: Principal; rows: Notice[] } | null> => {
    if (!mounted.current) return null;
    const ticket = ++generation.current;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const current = () => mounted.current && ticket === generation.current && !abort.signal.aborted;
    hidePrivate(); setLoading(true); setError(null);
    try {
      const actor = await read<Principal>('/api/session', abort.signal);
      if (!current()) return null;
      if (!actor.id || requiredActor && scopeKey(actor) !== requiredActor) throw new ReadFailure(403);
      const inboxPage = await readInbox('/api/notifications' + (view.current.cursor ? '?' + new URLSearchParams({ cursor: view.current.cursor }) : ''), abort.signal);
      const rows = inboxPage.rows;
      if (!current()) return null;
      const verified = await read<Principal>('/api/session', abort.signal);
      if (!current()) return null;
      if (scopeKey(actor) !== scopeKey(verified) || !Array.isArray(rows) || rows.some(row => row.userId !== actor.id || typeof row.id !== 'string' || !row.id)) throw new Error('Unconfirmed inbox owner');
      currentScope.current = scopeKey(actor); currentRows.current = rows;
      setPrincipal(actor); setNotifications(rows); setReady(true);
      setPaging({ next: inboxPage.next, total: inboxPage.total, unread: inboxPage.unread, newer: view.current.previous.length > 0 });
      return { actor, rows };
    } catch (failure) {
      if (!current()) return null;
      hidePrivate();
      setError(failure instanceof ReadFailure && failure.status === 401 ? 'Sign in again, then reload your inbox.' : failure instanceof ReadFailure && [403, 404].includes(failure.status) ? 'Current inbox access is unavailable. Reload after access is restored.' : 'Your current inbox could not be verified. Reload before changing a read status.');
      return null;
    } finally { if (current()) setLoading(false); }
  }, [hidePrivate]);
  useEffect(() => {
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    return () => { mounted.current = false; invalidate(); };
  }, [reload, invalidate]);
  useEffect(() => { if (error || notice) message.current?.focus(); }, [error, notice]);

  async function execute(request: PendingRead, retry = false) {
    const actor = principal;
    if (!mounted.current || inFlight.current || loading || !ready || !actor || currentScope.current !== request.actorKey || scopeKey(actor) !== request.actorKey || !currentRows.current.some(row => row.id === request.id && row.userId === actor.id) || (pending.current && (!retry || pending.current !== request))) return;
    inFlight.current = true; setSaving(true); setError(null); setNotice(null);
    pending.current = request; let sent = false;
    try {
      const verified = await read<Principal>('/api/session');
      if (scopeKey(verified) !== request.actorKey) throw new ReadFailure(403);
      if (!mounted.current) { if (!retry) pending.current = null; return; }
      sent = true;
      const response = await fetch(request.endpoint, { method: 'PATCH' });
      const acknowledgement = await responseJson<{ success: boolean }>(response);
      if (response.status !== 200 || acknowledgement?.success !== true) throw new Error('Unconfirmed read acknowledgement');
      if (!mounted.current) return;
      // The existing API acknowledges the mutation without returning a timestamp.
      // Confirm its saved readAt through a fresh owned inbox; never invent a date.
      const saved = await reload(request.actorKey);
      if (!mounted.current) return;
      const record = saved?.rows.find(row => row.id === request.id && row.userId === actor.id);
      if (!saved || !record || !isExactStoredTimestamp(record.readAt)) throw new Error('Saved read status unavailable');
      pending.current = null; setPendingView(null); setNotice('Read status confirmed from your saved inbox.');
    } catch (failure) {
      if (!mounted.current) return;
      invalidate(); hidePrivate(); setLoading(false);
      if ((!sent && !retry) || failure instanceof ReadFailure && failure.status === 400) {
        pending.current = null; setPendingView(null);
        setError(!sent ? 'Current account access could not be verified. Reload your inbox before changing a read status.' : 'The read-status request was rejected. Reload your inbox before trying again.');
      } else {
        setPendingView(request);
        setError('The read status could not be confirmed. Reload with the original account, then retry the exact original notice. Your inbox is hidden until current access is verified.');
      }
    } finally { inFlight.current = false; if (mounted.current) setSaving(false); }
  }
  function markAsRead(id: string) {
    const actor = principal, row = currentRows.current.find(row => row.id === id && row.userId === actor?.id && isUnread(row.readAt));
    if (!actor || !row || pending.current) return;
    void execute({ actorKey: scopeKey(actor), id, endpoint: '/api/notifications?' + new URLSearchParams({ id }) });
  }
  const originalScope = !!pendingView && !!principal && ready && !loading && scopeKey(principal) === pendingView.actorKey;
  const originalNotice = originalScope ? notifications.find(row => row.id === pendingView?.id && row.userId === principal?.id) : null;
  const blocked = loading || saving || !ready || !!pendingView;
  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold tracking-tight">Notifications</h1><p className="text-muted-foreground">Notices saved for your current account.</p></div>
    {(error || notice) && <div ref={message} tabIndex={-1} role={error ? 'alert' : 'status'} className="rounded border p-3 break-words">{error || notice}</div>}
    <Button type="button" variant="outline" disabled={saving} onClick={() => { setNotice(null); void reload(); }}>Reload my inbox</Button>
    {loading && <p role="status">Loading your current inbox…</p>}
    {pendingView && <section aria-label="Unconfirmed notice read status" className="space-y-3 rounded border p-3">
      <p>The original notice read status is unconfirmed. Keep this tab open; a hard reload discards this in-page reminder. Nothing is retried automatically.</p>
      {originalNotice ? <><p className="break-words">Original notice: {originalNotice.title}. Retrying checks its saved read status and preserves the first saved read time.</p><Button type="button" variant="outline" disabled={saving} onClick={() => { if (pending.current) void execute(pending.current, true); }}>Retry original notice read status</Button></> : originalScope ? <><p>The original notice is no longer available in your current inbox. Its read status has not been confirmed.</p><Button type="button" variant="outline" disabled={saving} onClick={() => { if (!pending.current || currentScope.current !== pending.current.actorKey) return; pending.current = null; setPendingView(null); setNotice('The unavailable notice reminder was dismissed. No read status was changed or confirmed.'); }}>Dismiss unavailable notice reminder</Button></> : <p>Reload with the original account before inspecting or retrying its notice. <a href="/login" target="_blank" rel="noreferrer" className="underline">Sign in in another tab</a> if needed.</p>}
    </section>}
    {error && !pendingView && <p><a href="/login" target="_blank" rel="noreferrer" className="underline">Sign in in another tab</a>, then reload your inbox.</p>}
    {ready && principal && ['admin', 'teacher'].includes(principal.role) && <p className="text-sm"><a href="/notices" className="underline">Send a notice or see notices you sent</a></p>}
    {ready && <Card><CardHeader><CardTitle>Notification Inbox</CardTitle></CardHeader><CardContent>
      {paging.total !== null && <p className="mb-3 text-sm text-muted-foreground" role="status">{paging.total === 0 ? 'You have no notices yet.' : `${paging.unread ?? 0} unread of ${paging.total} notices.`}</p>}
      <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={hideRead} onChange={event => setHideRead(event.target.checked)} />Hide notices I have already read (on this page)</label>
      {notifications.length === 0 ? <p className="text-muted-foreground">No notifications found for your current account.</p> : hideRead && notifications.every(row => !isUnread(row.readAt)) ? <p className="text-muted-foreground">Every notice on this page has been read. Untick the box above to see them, or open older notices.</p> : <div className="space-y-4">{notifications.filter(row => !hideRead || isUnread(row.readAt)).map(row => <article key={row.id} data-notification-id={row.id} aria-labelledby={'notification-title-' + row.id} className={'rounded border p-4 ' + (isUnread(row.readAt) ? 'border-blue-200 bg-blue-50' : '')}><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1 break-words"><h2 id={'notification-title-' + row.id} className="font-medium">{row.title}</h2><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{row.body}</p><p className="mt-2 text-xs text-muted-foreground">Saved: <StoredDate value={row.createdAt} /></p>{!isUnread(row.readAt) && <p className="mt-1 text-xs text-muted-foreground">Saved read time: <StoredDate value={row.readAt} /></p>}</div>{isUnread(row.readAt) && <Badge variant="secondary">Unread</Badge>}</div>{isUnread(row.readAt) && <div className="mt-3"><Button type="button" size="sm" disabled={blocked} onClick={() => markAsRead(row.id)}>Mark as Read</Button></div>}</article>)}</div>}
      {(paging.next || paging.newer) && <nav aria-label="Notice pages" className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={blocked || !paging.newer} onClick={() => { const earlier = view.current.previous.pop(); view.current.cursor = earlier ?? null; setNotice(null); void reload(); }}>Newer notices</Button>
        <Button type="button" variant="outline" disabled={blocked || !paging.next} onClick={() => { if (!paging.next) return; view.current.previous.push(view.current.cursor); view.current.cursor = paging.next; setNotice(null); void reload(); }}>Older notices</Button>
      </nav>}
    </CardContent></Card>}
  </div>;
}
