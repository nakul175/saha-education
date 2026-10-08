import { AccessError } from './access';
import type { ConflictCode } from './lifecycle-messages';

export class LifecycleConflict extends AccessError {
  readonly code: ConflictCode;
  constructor(code: ConflictCode) {
    super('Lifecycle conflict: ' + code, 409);
    this.name = 'LifecycleConflict';
    this.code = code;
  }
}

/** Run a route action; a LifecycleConflict becomes 409 with its allowlisted code, everything else propagates unchanged. */
export async function withConflictCode(action: () => Promise<Response>): Promise<Response> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof LifecycleConflict)
      return Response.json({ error: 'Conflict', code: error.code }, { status: 409 });
    throw error;
  }
}

export function errorChainIncludes(error: unknown, ...markers: string[]): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current instanceof Error; depth++) {
    const hit = markers.find((marker) => current instanceof Error && current.message.includes(marker));
    if (hit) return hit;
    current = current.cause;
  }
  return null;
}
