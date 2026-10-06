import { authenticated, body, query } from '@/lib/education/http';
import { listNotifications, createNotification, markNotificationRead, assertNotificationWriter } from '@/lib/education/notifications';
import { notificationSchema } from '@/lib/education/validation';
import { z } from 'zod';

export async function GET(request: Request) {
  return authenticated(request, false, async principal => {
    return Response.json(await listNotifications(principal, principal.id));
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
