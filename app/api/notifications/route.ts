import { authenticated, body, query } from '@/lib/education/http';
import { listNotificationPage, createNotification, markNotificationRead, assertNotificationWriter, notificationPageSchema } from '@/lib/education/notifications';
import { notificationSchema } from '@/lib/education/validation';
import { z } from 'zod';

// The response stays a plain Notification[]; paging facts travel in headers so
// existing callers keep working. `userId` is ignored: an inbox is always the caller's own.
export async function GET(request: Request) {
  return authenticated(request, false, async principal => {
    const params = new URL(request.url).searchParams;
    const filter = Object.fromEntries(['limit', 'cursor', 'unread'].filter(key => params.has(key)).map(key => [key, params.getAll(key).length === 1 ? params.get(key) : '!']));
    const page = await listNotificationPage(principal, notificationPageSchema.parse(filter));
    const headers: Record<string, string> = { 'X-Total-Count': String(page.total), 'X-Unread-Count': String(page.unread) };
    if (page.nextCursor) headers['X-Next-Cursor'] = encodeURIComponent(page.nextCursor);
    return Response.json(page.items, { headers });
  });
}
export async function POST(request: Request) {
  return authenticated(request, true, async principal => {
    assertNotificationWriter(principal);
    return Response.json(await createNotification(principal, await body(request, notificationSchema)), { status: 201 });
  });
}
export async function PATCH(request: Request) {
  return authenticated(request, true, async principal => {
    const id = z.string().min(1).parse(query(request, 'id'));
    await markNotificationRead(principal, id);
    return Response.json({ success: true });
  });
}
