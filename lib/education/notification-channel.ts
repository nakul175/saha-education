import { createNotification } from './notifications';
import type { Principal } from './types';

export async function deliverNotification({
  userId,
  channel,
  title,
  body
}: {
  userId: string;
  channel: 'in_app' | 'email' | 'sms';
  title: string;
  body: string;
}): Promise<void> {
  if (channel === 'in_app') {
    // For in-app notifications, create the notification in the database
    await createNotification({
      userId,
      channel,
      title,
      body
    });
  } else {
    // For email and sms, only log a safe stub message when no provider is configured
    // No network calls are made
    console.log(`[Notification Stub] Would send ${channel} notification to user ${userId}: "${title}" - ${body}`);
  }
}