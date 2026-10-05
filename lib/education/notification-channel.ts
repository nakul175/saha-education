import { createNotification, assertNotificationRecipient } from './notifications';
import type { Principal } from './types';

export async function deliverNotification(principal: Principal, input: {
  userId: string; channel: 'in_app' | 'email' | 'sms'; title: string; body: string;
}): Promise<void> {
  await assertNotificationRecipient(principal, input.userId);
  if (input.channel === 'in_app') await createNotification(principal, input);
  else throw new Error('This notification channel is not configured');
}
