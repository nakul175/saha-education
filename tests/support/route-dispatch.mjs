// Minimal in-process router for the real route handlers under app/api. It mirrors the parts of the Next.js route-handler
// contract that matter for authorization tests: dynamic segments become `params`, an unexported method answers 405 with an
// Allow header, HEAD falls back to GET and OPTIONS is answered by the framework (never by application code). No network.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { load, root } from './security-db.mjs';

export const origin = 'https://education.example.invalid';

function walk(directory, prefix = []) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(entry => {
    if (entry.isDirectory()) return walk(join(directory, entry.name), [...prefix, entry.name]);
    return entry.name === 'route.ts' ? [{ file: join(directory, entry.name), segments: prefix }] : [];
  });
}

/** Every route file under app/api with its URL pattern, sorted for stable reports. */
export function discoverRoutes() {
  return walk('app/api').map(({ file, segments }) => ({
    file: file.split('\\').join('/'),
    pattern: '/api/' + segments.join('/'),
    segments,
  })).sort((a, b) => a.pattern.localeCompare(b.pattern));
}

const routeList = discoverRoutes();
const modules = new Map();
async function moduleFor(route) {
  if (!modules.has(route.file)) modules.set(route.file, await load(route.file));
  return modules.get(route.file);
}

/** The exported HTTP method names of a route file, in source order of the module namespace. */
export async function exportedMethods(route) {
  const loaded = await moduleFor(route);
  return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].filter(method => typeof loaded[method] === 'function');
}

// Static segments win over dynamic ones, as in the framework router (/admin/users/events before /admin/users/[id]).
const bySpecificity = [...routeList].sort((a, b) => a.segments.filter(s => /^\[.+\]$/.test(s)).length - b.segments.filter(s => /^\[.+\]$/.test(s)).length);
export function matchRoute(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  for (const route of bySpecificity) {
    if (route.segments.length + 1 !== parts.length || parts[0] !== 'api') continue;
    const params = {};
    let matched = true;
    route.segments.forEach((segment, index) => {
      const part = parts[index + 1];
      if (/^\[.+\]$/.test(segment)) params[segment.slice(1, -1)] = decodeURIComponent(part);
      else if (segment !== part) matched = false;
    });
    if (matched) return { route, params };
  }
  return null;
}

/** Dispatch a Request exactly as the framework would for a route handler. Unknown path => 404. */
export async function dispatch(request) {
  const url = new URL(request.url);
  const match = matchRoute(url.pathname);
  if (!match) return new Response('Not found', { status: 404 });
  const loaded = await moduleFor(match.route);
  const methods = await exportedMethods(match.route);
  const method = request.method.toUpperCase();
  const allow = [...new Set([...methods, ...(methods.includes('GET') ? ['HEAD'] : []), 'OPTIONS'])].join(', ');
  if (method === 'OPTIONS' && !methods.includes('OPTIONS')) return new Response(null, { status: 204, headers: { Allow: allow } });
  const handler = loaded[method] ?? (method === 'HEAD' ? loaded.GET : undefined);
  if (typeof handler !== 'function') return new Response(null, { status: 405, headers: { Allow: allow } });
  return handler(request, { params: Promise.resolve(match.params) });
}
