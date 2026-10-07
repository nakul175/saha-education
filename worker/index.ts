// Slice 10a: the Worker entry. It delegates every HTTP request to the application exactly as `vinext/server/fetch-handler`
// does (the entry vite.config.ts used before) and adds the `scheduled` handler that a Cloudflare Cron Trigger calls.
// `triggers.crons` is set only in the hosted configuration (scripts/cloudflare-staging.mjs); where no trigger is
// configured this handler is never called and the Worker behaves as before.
import handler from 'vinext/server/fetch-handler';
import { withSecurityHeaders } from '../lib/education/security-headers';

export default {
  // Every response, including framework-generated 404/500 pages, passes through the browser security headers (NFR-01).
  fetch: async (request: Request, env: unknown, ctx: ExecutionContext) => withSecurityHeaders(request, await handler.fetch(request, env, ctx)),
};
