'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiFailure, apiJson, roleLabel, whenText } from '@/lib/education/notices-client';
import type {
  NoticeAudiencePreview,
  NoticePickerPerson,
  NoticeSendResult,
  SentNotice,
} from '@/lib/education/notices';
import type { Principal } from '@/lib/education/types';

type ClassOption = { id: string; name: string; term: string };
type Roles = 'guardians' | 'learners' | 'both';
type NoticeList = { items: SentNotice[]; total: number; nextCursor: string | null };
const inputStyle = 'w-full rounded border bg-background p-2';
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const rolesText: Record<Roles, string> = {
  guardians: 'Guardians of students in the class',
  learners: 'Students in the class',
  both: 'Guardians and students in the class',
};
const SEND_MESSAGES = {
  400: 'Check the title, message, who it is for and the confirmation. Titles and messages are plain text, so “<” tags are not allowed.',
  404: 'That class or one of the people is no longer available to you. Reload the page and choose again.',
  409: 'An earlier notice with the same reference was saved with different content. Reload the page, review your sent notices, then send again.',
};

export default function NoticesPage() {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [list, setList] = useState<NoticeList | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'class' | 'recipients'>('class');
  const [classId, setClassId] = useState('');
  const [roles, setRoles] = useState<Roles>('guardians');
  const [previewResult, setPreviewResult] = useState<{
    key: string;
    preview: NoticeAudiencePreview | null;
  } | null>(null);
  const [search, setSearch] = useState('');
  const [peopleResult, setPeopleResult] = useState<{ key: string; rows: NoticePickerPerson[] | null } | null>(
    null,
  );
  const [chosen, setChosen] = useState<NoticePickerPerson[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const busy = useRef(false);
  const retry = useRef<{ payload: string; id: string } | null>(null);
  const status = useRef<HTMLDivElement>(null);

  // Results are keyed by the question they answer, so a stale answer is never shown for a new choice.
  const previewKey = mode === 'class' && classId ? classId + '|' + roles : '';
  const peopleKey = mode === 'recipients' ? search.trim() : null;
  const previewCurrent = previewKey && previewResult?.key === previewKey ? previewResult : null;
  const preview = previewCurrent?.preview ?? null;
  const previewState: 'idle' | 'loading' | 'error' = !previewKey
    ? 'idle'
    : !previewCurrent
      ? 'loading'
      : previewCurrent.preview
        ? 'idle'
        : 'error';
  const peopleCurrent = peopleKey !== null && peopleResult?.key === peopleKey ? peopleResult : null;
  const people = peopleCurrent?.rows ?? [];
  const peopleState: 'idle' | 'loading' | 'error' =
    peopleKey === null ? 'idle' : !peopleCurrent ? 'loading' : peopleCurrent.rows ? 'idle' : 'error';
  const audience =
    mode === 'class'
      ? { kind: 'class' as const, classId, roles }
      : { kind: 'recipients' as const, userIds: chosen.map((person) => person.userId) };
  const audienceCount = mode === 'class' ? (preview?.count ?? 0) : chosen.length;
  const ready =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    confirmed &&
    audienceCount > 0 &&
    (mode === 'class' ? classId !== '' && previewState === 'idle' : chosen.length <= 50);

  const loadList = useCallback(async () => {
    const page = await apiJson<NoticeList>('/api/notices?limit=10', undefined, {});
    setList(page);
  }, []);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const actor = await apiJson<Principal>('/api/session', undefined);
        if (!active) return;
        if (actor.role !== 'admin' && actor.role !== 'teacher') {
          setError('Sending notices is available to teachers and school administrators.');
          return;
        }
        const [classRows, page] = await Promise.all([
          apiJson<ClassOption[]>('/api/classes', undefined),
          apiJson<NoticeList>('/api/notices?limit=10', undefined),
        ]);
        if (!active) return;
        setPrincipal(actor);
        setClasses(
          classRows
            .map((row) => ({ id: row.id, name: row.name, term: row.term }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
        setList(page);
      } catch (failure) {
        if (active)
          setError(
            failure instanceof ApiFailure ? failure.message : 'Could not load your notices. Reload the page.',
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (error || message) status.current?.focus();
  }, [error, message]);

  // Count and sample who a class notice will reach, so the sender checks before sending.
  useEffect(() => {
    if (!previewKey || !principal) return;
    const abort = new AbortController();
    const [forClass, forRoles] = previewKey.split('|') as [string, Roles];
    void (async () => {
      try {
        const result = await apiJson<NoticeAudiencePreview>(
          '/api/notices/audience?' + new URLSearchParams({ classId: forClass, roles: forRoles }),
          { signal: abort.signal },
        );
        if (!abort.signal.aborted) setPreviewResult({ key: previewKey, preview: result });
      } catch (failure) {
        if (abort.signal.aborted || (failure instanceof DOMException && failure.name === 'AbortError'))
          return;
        setPreviewResult({ key: previewKey, preview: null });
      }
    })();
    return () => abort.abort();
  }, [previewKey, principal]);
  // Search for people one short pause after typing stops.
  useEffect(() => {
    if (peopleKey === null || !principal) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const rows = await apiJson<NoticePickerPerson[]>(
            '/api/notices/recipients?' + new URLSearchParams({ q: peopleKey, limit: '30' }),
            { signal: abort.signal },
          );
          if (!abort.signal.aborted) setPeopleResult({ key: peopleKey, rows });
        } catch (failure) {
          if (abort.signal.aborted || (failure instanceof DOMException && failure.name === 'AbortError'))
            return;
          setPeopleResult({ key: peopleKey, rows: null });
        }
      })();
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [peopleKey, principal]);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !ready) return;
    busy.current = true;
    setSaving(true);
    setError('');
    setMessage('');
    const input = { title: title.trim(), body, audience, reviewConfirmed: true as const };
    const payload = JSON.stringify(input);
    const id = retry.current?.payload === payload ? retry.current.id : crypto.randomUUID();
    retry.current = { payload, id };
    try {
      const saved = await apiJson<NoticeSendResult>(
        '/api/notices',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...input, clientRequestId: id }),
        },
        SEND_MESSAGES,
      );
      retry.current = null;
      setTitle('');
      setBody('');
      setConfirmed(false);
      setChosen([]);
      setMessage(
        `Notice “${saved.notice.title}” was ${saved.replayed ? 'already sent, so nothing was sent twice, to' : 'sent to'} ${plural(saved.notice.recipientCount, 'person', 'people')}.`,
      );
      try {
        await loadList();
      } catch {
        setMessage((previous) => previous + ' Reload the page to refresh your sent notices.');
      }
    } catch (failure) {
      const known = failure instanceof ApiFailure ? failure : null;
      if (known?.status === 409) retry.current = null;
      setError(
        known
          ? known.message +
              (known.status === 0 || known.status >= 500
                ? ' Your form is kept. Pressing Send again will not send the notice twice.'
                : '')
          : 'The notice could not be confirmed. Keep this page open and press Send again; it will not be sent twice.',
      );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  async function older() {
    if (busy.current || !list?.nextCursor) return;
    busy.current = true;
    setLoadingMore(true);
    setError('');
    try {
      const page = await apiJson<NoticeList>(
        '/api/notices?' + new URLSearchParams({ limit: '10', cursor: list.nextCursor }),
        undefined,
      );
      setList((previous) =>
        previous
          ? {
              items: [
                ...previous.items,
                ...page.items.filter((item) => !previous.items.some((known) => known.id === item.id)),
              ],
              total: page.total,
              nextCursor: page.nextCursor,
            }
          : page,
      );
    } catch (failure) {
      setError(failure instanceof ApiFailure ? failure.message : 'Older notices could not be loaded.');
    } finally {
      busy.current = false;
      setLoadingMore(false);
    }
  }
  function toggle(person: NoticePickerPerson) {
    setConfirmed(false);
    setChosen((previous) =>
      previous.some((known) => known.userId === person.userId)
        ? previous.filter((known) => known.userId !== person.userId)
        : previous.length >= 50
          ? previous
          : [...previous, person],
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <a href="/notifications" className="underline">
        ← Notifications
      </a>
      <h1 className="text-2xl font-bold">Send a notice</h1>
      <p>
        Write a short notice for a class or for chosen people. It appears in their in-app notifications only.
        It is not sent by email or text message.
      </p>
      <div
        ref={status}
        tabIndex={-1}
        role={error ? 'alert' : 'status'}
        aria-live="polite"
        aria-atomic="true"
        className={error || message ? 'rounded border p-3 break-words' : undefined}
      >
        {loading ? 'Loading your classes and sent notices…' : error || message}
      </div>
      {principal && (
        <>
          <section aria-labelledby="send-title" className="space-y-4 rounded border p-4">
            <h2 id="send-title" className="text-xl font-semibold">
              New notice
            </h2>
            <form onSubmit={send} className="space-y-4">
              <fieldset disabled={saving} className="space-y-4">
                <fieldset className="space-y-2">
                  <legend className="font-medium">Who is it for?</legend>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="audience-mode"
                      checked={mode === 'class'}
                      onChange={() => {
                        setMode('class');
                        setConfirmed(false);
                      }}
                    />
                    A whole class
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="audience-mode"
                      checked={mode === 'recipients'}
                      onChange={() => {
                        setMode('recipients');
                        setConfirmed(false);
                      }}
                    />
                    Chosen people
                  </label>
                </fieldset>
                {mode === 'class' ? (
                  <div className="space-y-3">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block space-y-1">
                        <span>Class</span>
                        <select
                          className={inputStyle}
                          aria-label="Class"
                          value={classId}
                          onChange={(event) => {
                            setClassId(event.target.value);
                            setConfirmed(false);
                          }}
                        >
                          <option value="">Choose a class</option>
                          {classes.map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.name} ({row.term})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block space-y-1">
                        <span>Send to</span>
                        <select
                          className={inputStyle}
                          aria-label="Send to"
                          value={roles}
                          onChange={(event) => {
                            setRoles(event.target.value as Roles);
                            setConfirmed(false);
                          }}
                        >
                          {(Object.keys(rolesText) as Roles[]).map((key) => (
                            <option key={key} value={key}>
                              {rolesText[key]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {classes.length === 0 && !loading && (
                      <p className="text-sm text-muted-foreground">
                        You have no classes to send to yet. You can still send to chosen people.
                      </p>
                    )}
                    <div role="status" aria-live="polite" className="text-sm">
                      {previewState === 'loading' && 'Checking who will receive this…'}
                      {previewState === 'error' &&
                        'Who will receive this could not be checked. Choose the class again or reload the page.'}
                      {previewState === 'idle' &&
                        preview &&
                        (preview.count === 0 ? (
                          'No one in this class matches yet, so there is nobody to send to.'
                        ) : (
                          <>
                            This will reach <strong>{plural(preview.count, 'person', 'people')}</strong>:{' '}
                            {preview.sample
                              .map((person) => `${person.name} (${roleLabel(person.role)})`)
                              .join(', ')}
                            {preview.count > preview.sample.length
                              ? `, and ${preview.count - preview.sample.length} more`
                              : ''}
                            .
                          </>
                        ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <label className="block space-y-1">
                      <span>Search by name</span>
                      <input
                        className={inputStyle}
                        type="search"
                        value={search}
                        maxLength={60}
                        autoComplete="off"
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </label>
                    <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
                      {peopleState === 'loading' && 'Searching…'}
                      {peopleState === 'error' &&
                        'People could not be loaded. Change the search or reload the page.'}
                      {peopleState === 'idle' && people.length === 0 && 'No matching people in your classes.'}
                    </div>
                    {people.length > 0 && (
                      <ul
                        className="max-h-72 space-y-1 overflow-y-auto rounded border p-2"
                        aria-label="People you can send to"
                      >
                        {people.map((person) => (
                          <li key={person.userId}>
                            <label className="flex items-start gap-2 break-words">
                              <input
                                type="checkbox"
                                className="mt-1"
                                checked={chosen.some((known) => known.userId === person.userId)}
                                onChange={() => toggle(person)}
                              />
                              <span>
                                <span className="font-medium">{person.name}</span> · {roleLabel(person.role)}
                                {person.context ? (
                                  <span className="text-sm text-muted-foreground"> · {person.context}</span>
                                ) : null}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div aria-live="polite">
                      <p className="font-medium">
                        {chosen.length === 0
                          ? 'No one chosen yet.'
                          : `${plural(chosen.length, 'person', 'people')} chosen (up to 50).`}
                      </p>
                      {chosen.length > 0 && (
                        <ul className="mt-1 flex flex-wrap gap-2">
                          {chosen.map((person) => (
                            <li
                              key={person.userId}
                              className="flex items-center gap-1 rounded border px-2 py-1 text-sm"
                            >
                              {person.name}
                              <button
                                type="button"
                                className="underline"
                                aria-label={`Remove ${person.name}`}
                                onClick={() => toggle(person)}
                              >
                                Remove
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
                <label className="block space-y-1">
                  <span>Title</span>
                  <input
                    className={inputStyle}
                    required
                    maxLength={120}
                    value={title}
                    onChange={(event) => {
                      setTitle(event.target.value);
                      setConfirmed(false);
                    }}
                  />
                </label>
                <label className="block space-y-1">
                  <span>Message</span>
                  <textarea
                    className={inputStyle}
                    rows={6}
                    required
                    maxLength={2000}
                    value={body}
                    aria-label="Message"
                    aria-describedby="message-help"
                    onChange={(event) => {
                      setBody(event.target.value);
                      setConfirmed(false);
                    }}
                  />
                </label>
                <p id="message-help" className="text-sm text-muted-foreground">
                  Plain text only, up to 2,000 characters ({body.length} used). Write in short, clear
                  sentences. Do not include passwords or private details that only some readers should see.
                </p>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    required
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  <span>
                    I have checked who will receive this notice
                    {audienceCount > 0 ? ` (${plural(audienceCount, 'person', 'people')})` : ''} and what it
                    says.
                  </span>
                </label>
                <div className="flex flex-wrap gap-3">
                  <Button type="submit" disabled={!ready}>
                    {saving ? 'Sending…' : 'Send notice'}
                  </Button>
                </div>
              </fieldset>
            </form>
          </section>
          <section aria-labelledby="sent-title" className="space-y-3" aria-busy={loading}>
            <h2 id="sent-title" className="text-xl font-semibold">
              {principal.role === 'admin' ? 'Notices sent in your school' : 'Notices you sent'}
            </h2>
            {!loading && list && list.items.length === 0 && <p>No notices have been sent yet.</p>}
            {list && list.items.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Showing {list.items.length} of {list.total}, newest first.
              </p>
            )}
            <ul className="space-y-3">
              {(list?.items ?? []).map((item) => (
                <li key={item.id} className="min-w-0 space-y-1 rounded border p-4">
                  <h3 className="break-words font-semibold">
                    <a className="underline" href={'/notices/' + encodeURIComponent(item.id)}>
                      {item.title}
                    </a>
                    {item.audienceKind === 'correction' && (
                      <span className="ml-2 rounded border px-2 py-0.5 text-xs font-normal">Correction</span>
                    )}
                  </h3>
                  <p className="break-words text-sm">To: {item.audienceLabel}</p>
                  <p className="text-sm text-muted-foreground">
                    Sent {whenText(item.createdAt)} · {item.readCount} of{' '}
                    {plural(item.recipientCount, 'person', 'people')} have read it
                    {item.correctionCount > 0 ? ` · ${plural(item.correctionCount, 'correction')}` : ''}
                  </p>
                </li>
              ))}
            </ul>
            {list?.nextCursor && (
              <Button
                type="button"
                variant="outline"
                disabled={loadingMore || saving}
                onClick={() => {
                  void older();
                }}
              >
                {loadingMore ? 'Loading…' : 'Show older notices'}
              </Button>
            )}
          </section>
        </>
      )}
    </div>
  );
}
