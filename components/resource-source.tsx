'use client';

import { useEffect, useState } from 'react';
import { formatDay } from '@/lib/education/display';
import type { ResourceSource } from '@/lib/education/curriculum';

// Shows which reviewed curriculum reference a teaching draft was copied from. It never adds
// or changes approval: the draft is reviewed and assigned separately.
export function ResourceSourcePanel({ resourceId }: { resourceId: string }) {
  const [loaded, setLoaded] = useState<{ id: string; sources: ResourceSource[] | null } | null>(null);
  const sources = loaded?.id === resourceId ? loaded.sources : undefined,
    failed = loaded?.id === resourceId && loaded.sources === null;
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/resources/${encodeURIComponent(resourceId)}/source`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('source');
        const body: { resourceId: string; sources: ResourceSource[] } = await response.json();
        if (body.resourceId !== resourceId || !Array.isArray(body.sources)) throw new Error('source');
        if (!controller.signal.aborted) setLoaded({ id: resourceId, sources: body.sources });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ id: resourceId, sources: null });
      });
    return () => controller.abort();
  }, [resourceId]);
  if (failed)
    return (
      <p className="text-sm">
        The curriculum source for this draft could not be loaded. Reload the page to try again.
      </p>
    );
  if (!sources || sources.length === 0) return null;
  return (
    <section className="border rounded p-4 space-y-3" aria-labelledby="resource-source-title">
      <h2 id="resource-source-title" className="text-xl font-semibold">
        Curriculum source
      </h2>
      <p className="text-sm">
        This draft was copied from a reviewed curriculum reference. The copy has its own review and
        assignment; the source review does not approve it.
      </p>
      <ul className="space-y-3">
        {sources.map((source) => (
          <li key={source.referenceVersionId} className="border rounded p-3 space-y-1 break-words">
            <p className="font-medium">
              {source.title} · reference version {source.referenceVersion}
            </p>
            <p className="text-sm">
              {source.curriculum} · {source.language} · copied {formatDay(source.copiedAt)} by{' '}
              {source.copiedByName}
              {source.reviewedByName
                ? ` · source version reviewed by ${source.reviewedByName}${source.reviewedAt ? ' on ' + formatDay(source.reviewedAt) : ''}`
                : ''}
            </p>
            <p className="text-sm">
              Rights as declared when the source was written (not independently verified):{' '}
              {source.rightsStatement}
            </p>
            {source.sourceReference && <p className="text-sm">Source reference: {source.sourceReference}</p>}
            {source.lifecycle === 'retired' && (
              <p className="text-sm" role="note">
                This reference has since been retired
                {source.retiredAt ? ` (${formatDay(source.retiredAt)})` : ''}
                {source.retiredReason ? `. Reason: ${source.retiredReason}` : ''} This draft is unchanged.
                Check that the material is still suitable before using or assigning it.
              </p>
            )}
            {source.latestReferenceVersion !== null &&
              source.latestReferenceVersion > source.referenceVersion && (
                <p className="text-sm">
                  A newer version ({source.latestReferenceVersion}) of the reference exists. This draft still
                  reflects version {source.referenceVersion}.
                </p>
              )}
            {source.referenceAvailable ? (
              <a className="underline text-sm" href={`/curriculum/${encodeURIComponent(source.referenceId)}`}>
                Open the reference
              </a>
            ) : (
              <p className="text-sm">The reference is no longer available to your account.</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
