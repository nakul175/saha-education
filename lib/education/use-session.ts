'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { lifecycleRequest, LifecycleRequestError } from './lifecycle-client';
import type { Principal } from './types';

export type SessionState = { principal: Principal | null; status: 'loading' | 'ready' | 'denied' | 'error' };

/** Reads the current server session. The server still decides every action; the role here only chooses what to show. */
export function useSession(): SessionState & { reload: () => void } {
  const [state, setState] = useState<SessionState>({ principal: null, status: 'loading' });
  const mounted = useRef(true);
  const load = useCallback(async () => {
    setState({ principal: null, status: 'loading' });
    try {
      const { body } = await lifecycleRequest<Principal>('/api/session');
      if (!mounted.current) return;
      if (!body || typeof body.id !== 'string' || !body.id || !body.schoolId) { setState({ principal: null, status: 'denied' }); return; }
      setState({ principal: body, status: 'ready' });
    } catch (error) {
      if (!mounted.current) return;
      setState({ principal: null, status: error instanceof LifecycleRequestError && [401, 403, 404].includes(error.status) ? 'denied' : 'error' });
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => { mounted.current = false; };
  }, [load]);
  return { ...state, reload: () => { void load(); } };
}
