// Shared synchronisation for the substituted-hook UI contract suites.
//
// These suites drive page callbacks against real route handlers and SQLite-backed D1 (session digests, drizzle, Response bodies).
// That work takes real milliseconds, so waiting a fixed number of event-loop turns races it: the same suite passes on a fast host
// and fails at a different assertion on a slower one. Wait for quiescence instead.
//
// Only synthetic server work in flight is counted (wrap the route/api call in `serverWork`). A request that a scenario deliberately
// holds inside its own intercept/before hook is outside that count, so a page's in-flight state stays observable while it is held.
import { setImmediate as turn } from 'node:timers/promises';

let active = 0;

/** Count one in-flight synthetic route/API operation until it settles (resolve or reject). */
export async function serverWork(operation) {
  active++;
  try {
    return await operation();
  } finally {
    active--;
  }
}

/**
 * Resolve once no counted server work has been in flight for `quietTurns` consecutive event-loop turns.
 * Throws if that does not happen within `limitMs`, so a stuck request fails loudly instead of hanging.
 */
export async function settleQuiet({ quietTurns = 60, limitMs = 30000 } = {}) {
  const started = performance.now();
  let quiet = 0;
  while (quiet < quietTurns) {
    if (performance.now() - started > limitMs)
      throw new Error('Synthetic page callbacks did not settle within ' + limitMs + 'ms');
    await turn();
    quiet = active === 0 ? quiet + 1 : 0;
  }
}
