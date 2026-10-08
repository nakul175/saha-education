'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- Full-page links avoid the known vinext client navigation failure. */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Principal } from '@/lib/education/types';
import type {
  ProfileLinkProfile,
  ProfileLinkAccount,
  ProfileLinkEvent,
  ProfileLinkInventory,
  ProfileLinkResult,
  ProfileType,
} from '@/lib/education/profile-links';

type Review = {
  profile: ProfileLinkProfile;
  action: 'link' | 'unlink';
  userId: string;
  reason: string;
  confirmed: boolean;
};
type Pending = { payload: string; id: string };
class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: 'no-store' });
  if (response.status === 401) {
    window.location.assign(new URL('/login', window.location.origin).href);
    throw new RequestError('Please sign in again.', 401);
  }
  if (response.status === 403)
    throw new RequestError('School administrator access is required. Your permission may have changed.', 403);
  if (response.status === 404)
    throw new RequestError('This profile is no longer available in your school. Reload the list.', 404);
  if (response.status === 409)
    throw new RequestError(
      'The profile, account or saved review has changed. Reload and open a new review.',
      409,
    );
  if (response.status === 400)
    throw new RequestError(
      'Check the selected profile, account, review confirmation and single-line reason.',
      400,
    );
  if (!response.ok)
    throw new RequestError(
      'The save or load could not be confirmed. Keep this page open to retry the same review.',
      response.status,
    );
  return response.json() as Promise<T>;
}
function historyPath(profile: ProfileLinkProfile | null): string {
  return (
    '/api/admin/profile-links/history' +
    (profile
      ? '?' + new URLSearchParams({ profileType: profile.profileType, profileId: profile.profileId })
      : '')
  );
}
function time(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
}

export default function ProfileLinksPage() {
  const [authorized, setAuthorized] = useState(false);
  const [profiles, setProfiles] = useState<ProfileLinkProfile[]>([]);
  const [accounts, setAccounts] = useState<ProfileLinkAccount[]>([]);
  const [events, setEvents] = useState<ProfileLinkEvent[]>([]);
  const [kind, setKind] = useState<ProfileType>('student');
  const [status, setStatus] = useState('all');
  const [review, setReview] = useState<Review | null>(null);
  const [historyProfile, setHistoryProfile] = useState<ProfileLinkProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const busy = useRef(false);
  const pending = useRef<Pending | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const inputStyle = 'w-full rounded border bg-background p-2';
  function loseAccess(caught: unknown) {
    if (caught instanceof RequestError && [401, 403].includes(caught.status)) {
      setAuthorized(false);
      setProfiles([]);
      setAccounts([]);
      setEvents([]);
      setReview(null);
    }
  }
  function fail(caught: unknown, fallback: string) {
    loseAccess(caught);
    setError(caught instanceof RequestError ? caught.message : fallback);
  }
  function apply(value: ProfileLinkInventory, history: ProfileLinkEvent[]) {
    setProfiles(value.profiles);
    setAccounts(value.accounts);
    setEvents(history);
  }
  async function readInventory(target: ProfileLinkProfile | null) {
    const [value, history] = await Promise.all([
      json<ProfileLinkInventory>('/api/admin/profile-links'),
      json<ProfileLinkEvent[]>(historyPath(target)),
    ]);
    return { value, history };
  }
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const actor = await json<Principal>('/api/session');
        if (actor.role !== 'admin')
          throw new RequestError('This workspace is available to school administrators.', 403);
        const data = await readInventory(null);
        if (active) {
          apply(data.value, data.history);
          setAuthorized(true);
        }
      } catch (caught) {
        if (active) fail(caught, 'Could not load reviewed profile links.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // The initial read runs once; later refreshes use the currently selected history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const selectedId = review ? review.profile.profileType + ':' + review.profile.profileId : null;
  useEffect(() => {
    if (selectedId) {
      heading.current?.focus();
      heading.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedId]);
  async function reload(target = historyProfile) {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const data = await readInventory(target);
      apply(data.value, data.history);
      setAuthorized(true);
      setHistoryProfile(target);
      setMessage(
        review
          ? 'Lists refreshed. Close this review and select the profile again to use its current version.'
          : 'Profile links and recent reviews refreshed.',
      );
    } catch (caught) {
      fail(caught, 'Could not reload profile links.');
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !review) return;
    busy.current = true;
    setSaving(true);
    setError('');
    setMessage('');
    const input = {
      profileType: review.profile.profileType,
      profileId: review.profile.profileId,
      userId: review.action === 'unlink' ? null : review.userId,
      expectedVersion: review.profile.version,
      reviewConfirmed: review.confirmed,
      reason: review.reason.trim(),
    };
    const payload = JSON.stringify(input);
    const id = pending.current?.payload === payload ? pending.current.id : crypto.randomUUID();
    pending.current = { payload, id };
    try {
      const saved = await json<ProfileLinkResult>('/api/admin/profile-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, clientRequestId: id }),
      });
      setProfiles((previous) =>
        previous.map((profile) =>
          profile.profileType === saved.profile.profileType && profile.profileId === saved.profile.profileId
            ? saved.profile
            : profile,
        ),
      );
      if (
        !historyProfile ||
        (historyProfile.profileType === saved.event.profileType &&
          historyProfile.profileId === saved.event.profileId)
      )
        setEvents((previous) =>
          [saved.event, ...previous.filter((item) => item.id !== saved.event.id)]
            .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt) || b.id.localeCompare(a.id))
            .slice(0, 200),
        );
      pending.current = null;
      setReview(null);
      const confirmed = `Reviewed decision ${saved.event.resultingVersion} saved. ${saved.profile.name} is currently ${saved.profile.userId ? 'linked to account ' + saved.profile.userId : 'unlinked'}. Other affected accounts must sign in again after an ownership change; your administrator session is protected.`;
      setMessage(confirmed);
      try {
        const data = await readInventory(historyProfile);
        apply(data.value, data.history);
      } catch (caught) {
        loseAccess(caught);
        setMessage(confirmed + ' The lists could not be refreshed; reload when access is available.');
      }
    } catch (caught) {
      if (caught instanceof RequestError && caught.status === 409)
        setError(
          'The profile version changed, the account is already linked or no longer eligible, or this request conflicts with an earlier review. Reload, close this review and select the profile again. Your review text has been kept.',
        );
      else
        fail(
          caught,
          'The save could not be confirmed. Keep this page open and retry without changing the selected profile, account or reason.',
        );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  const visible = profiles.filter(
    (profile) =>
      profile.profileType === kind &&
      (status === 'all' || (status === 'linked' ? profile.userId !== null : profile.userId === null)),
  );
  const eligible = review ? accounts.filter((account) => account.role === review.profile.profileType) : [];
  const changed =
    review &&
    (review.action === 'unlink'
      ? review.profile.userId !== null
      : Boolean(review.userId) && review.userId !== review.profile.userId);
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <a href="/" className="underline">
        ← Dashboard
      </a>
      <h1 className="text-2xl font-bold">Reviewed profile links</h1>
      <p>
        Connect a student or guardian profile to the exact school sign-in account after reviewing ownership.
        Profile records and family relationships are preserved.
      </p>
      <p className="text-sm text-muted-foreground">
        Account role, provider identity and school are fixed here.{' '}
        <a href="/admin/users" className="underline">
          Provision accounts separately
        </a>
        . This review does not activate a sign-in provider.
      </p>
      <div role="status" aria-live="polite" aria-atomic="true">
        {loading ? 'Loading profiles and reviews…' : message}
      </div>
      {error && (
        <p role="alert" className="rounded border border-destructive p-3">
          {error}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={loading || saving}
        onClick={() => {
          void reload();
        }}
      >
        Reload profile links
      </Button>
      {authorized && (
        <>
          <section className="space-y-4" aria-labelledby="profile-list-title" aria-busy={loading}>
            <h2 id="profile-list-title" className="text-xl font-semibold">
              School profiles
            </h2>
            <p className="text-sm text-muted-foreground">
              Displaying up to 500 student profiles, 500 guardian profiles and 500 eligible accounts. Filters
              apply to this bounded list; these counts are not whole-school totals.
            </p>
            <fieldset disabled={loading || saving} className="grid gap-3 sm:grid-cols-2">
              <legend className="sr-only">Filter displayed profiles</legend>
              <label className="block">
                <span>Profile type</span>
                <select
                  className={inputStyle}
                  value={kind}
                  onChange={(event) => setKind(event.target.value as ProfileType)}
                >
                  <option value="student">Student</option>
                  <option value="guardian">Guardian</option>
                </select>
              </label>
              <label className="block">
                <span>Account link</span>
                <select
                  className={inputStyle}
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="all">All displayed profiles</option>
                  <option value="linked">Linked</option>
                  <option value="unlinked">Unlinked</option>
                </select>
              </label>
            </fieldset>
            {!loading && visible.length === 0 && <p>No displayed profiles match these filters.</p>}
            <ul className="grid gap-3 md:grid-cols-2">
              {visible.map((profile) => (
                <li
                  key={profile.profileType + ':' + profile.profileId}
                  className="min-w-0 space-y-2 rounded border p-4"
                >
                  <h3 className="break-words font-semibold">{profile.name}</h3>
                  <p className="break-all text-sm">Profile ID: {profile.profileId}</p>
                  <p className="break-all">
                    {profile.userId ? 'Linked account ID: ' + profile.userId : 'No account linked'} · Review
                    version {profile.version}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto min-w-0 max-w-full whitespace-normal break-words text-left"
                      disabled={loading || saving}
                      onClick={() => {
                        setReview({ profile, action: 'link', userId: '', reason: '', confirmed: false });
                        setError('');
                        setMessage('Review the exact profile and account below.');
                      }}
                    >
                      Review account link for {profile.name}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto min-w-0 max-w-full whitespace-normal break-words text-left"
                      disabled={loading || saving}
                      onClick={() => {
                        void reload(profile);
                      }}
                    >
                      View history for {profile.name}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          {review && (
            <section className="space-y-4 rounded border p-4" aria-labelledby="link-review-title">
              <h2 id="link-review-title" ref={heading} tabIndex={-1} className="text-xl font-semibold">
                Review profile ownership
              </h2>
              <p className="break-all">
                {review.profile.name} · {review.profile.profileType} profile {review.profile.profileId} ·
                Version {review.profile.version}
              </p>
              <p className="break-all">Current account: {review.profile.userId ?? 'None'}</p>
              <p>
                Linking, replacing or unlinking revokes current sessions for other affected accounts. Those
                users must sign in again; your administrator session stays active. Existing education records
                and student–guardian relationships stay with their profiles.
              </p>
              <form onSubmit={save} className="space-y-4">
                <fieldset disabled={loading || saving} className="space-y-4">
                  <legend className="sr-only">Reviewed account ownership change</legend>
                  <label className="block">
                    <span>Reviewed change</span>
                    <select
                      className={inputStyle}
                      value={review.action}
                      onChange={(event) =>
                        setReview((previous) =>
                          previous
                            ? {
                                ...previous,
                                action: event.target.value as Review['action'],
                                confirmed: false,
                              }
                            : null,
                        )
                      }
                    >
                      <option value="link">Link or replace the account</option>
                      <option value="unlink" disabled={review.profile.userId === null}>
                        Unlink the current account
                      </option>
                    </select>
                  </label>
                  {review.action === 'link' && (
                    <label className="block">
                      <span>Exact {review.profile.profileType} account</span>
                      <select
                        className={inputStyle}
                        required
                        value={review.userId}
                        onChange={(event) =>
                          setReview((previous) =>
                            previous ? { ...previous, userId: event.target.value, confirmed: false } : null,
                          )
                        }
                      >
                        <option value="">Select an enabled mapped account</option>
                        {eligible.map((account) => {
                          const occupied = profiles.some(
                            (profile) =>
                              profile.profileType === review.profile.profileType &&
                              profile.userId === account.id &&
                              profile.profileId !== review.profile.profileId,
                          );
                          return (
                            <option key={account.id} value={account.id} disabled={occupied}>
                              {account.name} · {account.email} · {account.id}
                              {occupied ? ' (linked to another profile)' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  )}
                  {review.action === 'link' && eligible.length === 0 && (
                    <p>
                      No eligible accounts are displayed. Provision and review a matching school account
                      first; reload this page afterward.
                    </p>
                  )}
                  <label className="block">
                    <span>Reason for this profile link decision</span>
                    <input
                      className={inputStyle}
                      required
                      minLength={10}
                      maxLength={500}
                      value={review.reason}
                      onChange={(event) =>
                        setReview((previous) =>
                          previous ? { ...previous, reason: event.target.value, confirmed: false } : null,
                        )
                      }
                    />
                  </label>
                  <p className="text-sm text-muted-foreground">
                    Use 10–500 characters on one line. Record ownership evidence without passwords, access
                    codes or unnecessary personal details.
                  </p>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      required
                      checked={review.confirmed}
                      onChange={(event) =>
                        setReview((previous) =>
                          previous ? { ...previous, confirmed: event.target.checked } : null,
                        )
                      }
                    />
                    <span>
                      I checked this profile and the exact account, and confirm this ownership change.
                    </span>
                  </label>
                  {!changed && (
                    <p className="text-sm text-muted-foreground">
                      Select a different account or explicitly unlink the current account. An unchanged
                      binding does not create a review.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3">
                    <Button type="submit" disabled={!review.confirmed || !changed}>
                      {saving ? 'Saving review…' : 'Save reviewed profile link'}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setReview(null)}>
                      Close review
                    </Button>
                  </div>
                </fieldset>
              </form>
            </section>
          )}
          <section className="space-y-3" aria-labelledby="link-history-title">
            <h2 id="link-history-title" className="text-xl font-semibold break-words">
              {historyProfile ? 'Review history for ' + historyProfile.name : 'Recent profile link reviews'}
            </h2>
            <p className="text-sm text-muted-foreground">
              Up to 200 latest reviews{historyProfile ? ' for the selected exact profile' : ' in your school'}
              . This display is not a complete audit archive.
            </p>
            {historyProfile && (
              <Button
                type="button"
                variant="outline"
                disabled={loading || saving}
                onClick={() => {
                  void reload(null);
                }}
              >
                Show recent school reviews
              </Button>
            )}
            {!loading && events.length === 0 && (
              <p>
                No reviewed account-link decisions are available here. Existing version-zero links have no
                invented review history.
              </p>
            )}
            <ol className="space-y-3">
              {events.map((event) => (
                <li key={event.id} className="min-w-0 space-y-1 rounded border p-3 text-sm">
                  <p className="break-all font-medium">
                    {event.profileType} profile {event.profileId} · Review {event.resultingVersion}
                  </p>
                  <p className="break-all">
                    Account {event.previousUserId ?? 'none'} → {event.nextUserId ?? 'none'}
                  </p>
                  <p className="break-words">Reason: {event.reason}</p>
                  <p className="break-all">
                    Reviewed by {event.actorId} · {time(event.reviewedAt)} · Decision ID {event.id}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
