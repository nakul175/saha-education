'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { checkReceipt, newRequestId, sendChangeRequest } from '@/lib/education/academic-lifecycle-client';
import type { ChangeInput, ChangeResult } from '@/lib/education/academic-lifecycle-types';

type Pending = { clientRequestId: string; reason?: string; changes: ChangeInput[]; summary: string };
type Notice = { kind: 'error' | 'status'; text: string };

/**
 * One reviewed request at a time. The request id is created once and kept until the request is saved, refused
 * or deliberately discarded, so an uncertain outcome (lost reply, timeout) can be retried exactly: the server applies
 * the request at most once and replays the original receipt. The server alone decides every outcome.
 */
export function useChangeSubmission(onSaved: (result: ChangeResult) => void | Promise<void>) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const inFlight = useRef(false),
    mounted = useRef(true),
    saved = useRef(onSaved);
  useEffect(() => {
    saved.current = onSaved;
  }, [onSaved]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (request: Pending): Promise<'saved' | 'refused' | 'unconfirmed' | 'busy'> => {
    if (inFlight.current) return 'busy';
    inFlight.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const outcome = await sendChangeRequest({
        clientRequestId: request.clientRequestId,
        ...(request.reason ? { reason: request.reason } : {}),
        changes: request.changes,
      });
      if (!mounted.current)
        return outcome.state === 'saved' ? 'saved' : outcome.state === 'refused' ? 'refused' : 'unconfirmed';
      if (outcome.state === 'saved') {
        setPending(null);
        setUncertain(false);
        setNotice({
          kind: 'status',
          text: outcome.result.replayed
            ? `${request.summary} was already saved; the original record is shown.`
            : `${request.summary} saved.`,
        });
        await saved.current(outcome.result);
        return 'saved';
      }
      if (outcome.state === 'refused') {
        setPending(null);
        setUncertain(false);
        setNotice({ kind: 'error', text: outcome.message });
        return 'refused';
      }
      setPending(request);
      setUncertain(true);
      setNotice({
        kind: 'error',
        text: `The result of "${request.summary}" could not be confirmed. It may or may not have been saved. Check whether it was saved, or try the same request again: it is applied at most once.`,
      });
      return 'unconfirmed';
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);

  const submit = useCallback(
    (summary: string, changes: ChangeInput[], reason?: string) => {
      if (inFlight.current || pending) return Promise.resolve('busy' as const);
      return run({ clientRequestId: newRequestId(), changes, summary, ...(reason ? { reason } : {}) });
    },
    [pending, run],
  );
  const retry = useCallback(
    () => (pending ? run(pending) : Promise.resolve('busy' as const)),
    [pending, run],
  );
  const check = useCallback(async () => {
    if (!pending || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const state = await checkReceipt(pending.clientRequestId);
      if (!mounted.current) return;
      if (state === 'saved') {
        const summary = pending.summary;
        setPending(null);
        setUncertain(false);
        setNotice({ kind: 'status', text: `${summary} was saved. The page was reloaded.` });
        inFlight.current = false;
        await run({ ...pending, summary }).catch(() => undefined);
      } else if (state === 'not-recorded')
        setNotice({
          kind: 'error',
          text: 'That request was not recorded. You can try it again or discard it.',
        });
      else
        setNotice({
          kind: 'error',
          text: 'Whether the request was saved still could not be confirmed. Try again in a moment.',
        });
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [pending, run]);
  const discard = useCallback(() => {
    if (inFlight.current) return;
    setPending(null);
    setUncertain(false);
    setNotice({
      kind: 'status',
      text: 'The request was discarded. Reload the page to see the current records.',
    });
  }, []);
  const clear = useCallback(() => setNotice(null), []);
  return { submit, retry, check, discard, clear, pending, uncertain, busy, notice };
}

export type Submission = ReturnType<typeof useChangeSubmission>;

/** Result message plus the recovery controls for an uncertain outcome. */
export function SubmissionNotice({ submission }: { submission: Submission }) {
  const ref = useRef<HTMLDivElement>(null);
  const { notice, uncertain, busy } = submission;
  useEffect(() => {
    if (notice) ref.current?.focus();
  }, [notice]);
  if (!notice) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="space-y-2 rounded border p-3 break-words"
      role={notice.kind === 'error' ? 'alert' : 'status'}
    >
      <p>{notice.text}</p>
      {uncertain && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void submission.check()} disabled={busy}>
            Check whether it was saved
          </Button>
          <Button type="button" variant="outline" onClick={() => void submission.retry()} disabled={busy}>
            Try the same request again
          </Button>
          <Button type="button" variant="outline" onClick={submission.discard} disabled={busy}>
            Discard this request
          </Button>
        </div>
      )}
    </div>
  );
}
