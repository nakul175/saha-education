// Browser-side helpers shared by the notice pages and the audit page. They only read the
// API; the server decides who may see or send anything. Messages are plain language and
// never include request ids, SQL or raw response bodies.
export class ApiFailure extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const FALLBACK = 'The request could not be confirmed. Keep this page open and try again.';
export async function apiJson<T>(
  path: string,
  init: RequestInit | undefined,
  messages: Partial<Record<number, string>> = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, cache: 'no-store' });
  } catch (failure) {
    if (failure instanceof DOMException && failure.name === 'AbortError') throw failure;
    throw new ApiFailure(
      'The connection was lost, so the result could not be confirmed. Check your connection and try again.',
      0,
    );
  }
  if (response.status === 401) {
    window.location.assign(new URL('/login', window.location.origin).href);
    throw new ApiFailure('Please sign in to continue.', 401);
  }
  if (!response.ok) {
    await response.text().catch(() => '');
    const defaults: Record<number, string> = {
      400: 'Please check what you entered and try again.',
      403: 'Your permission to do this has changed. Reload the page; ask an administrator if it continues.',
      404: 'That item is no longer available to you. Reload the page.',
      409: 'This conflicts with something already saved. Reload the page and review it before trying again.',
    };
    throw new ApiFailure(messages[response.status] ?? defaults[response.status] ?? FALLBACK, response.status);
  }
  return (await response.json()) as T;
}

export function whenText(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    : 'Date unavailable';
}
export const roleLabel = (role: string) =>
  role === 'student'
    ? 'Student'
    : role === 'guardian'
      ? 'Guardian'
      : role === 'teacher'
        ? 'Teacher'
        : role === 'admin'
          ? 'Administrator'
          : role;
