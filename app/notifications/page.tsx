'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Notification } from '@/lib/education/types';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [marking, setMarking] = useState<string | null>(null);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const response = await fetch('/api/notifications', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('Failed to fetch notifications');
        }
        const data: Notification[] = await response.json();
        setNotifications(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
  }, []);

  const handleMarkAsRead = async (id: string) => {
    if (marking) return;
    setMarking(id);
    setReadError(null);
    try {
      const response = await fetch(`/api/notifications?id=${id}`, {
        method: 'PATCH',
      });
      
      if (!response.ok) {
        throw new Error('Failed to mark notification as read');
      }
      
      // Update local state
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === id ? { ...notif, readAt: new Date().toISOString() } : notif
        )
      );
    } catch {
      setReadError('The read status could not be confirmed. Your inbox is retained; retry Mark as Read for the same notice to recover its saved status.');
    } finally {
      setMarking(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-64">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <p role="alert" className="text-red-500">Error: {error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
        <p className="text-muted-foreground">
          Your recent notifications
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Notification Inbox</CardTitle>
        </CardHeader>
        <CardContent>
          {readError && <p role="alert" className="mb-4 break-words text-destructive">{readError}</p>}
          {notifications.length === 0 ? (
            <p className="text-muted-foreground">No notifications found.</p>
          ) : (
            <div className="space-y-4">
              {notifications.map((notification) => (
                <article
                  key={notification.id} 
                  data-notification-id={notification.id}
                  aria-labelledby={'notification-title-' + notification.id}
                  className={`border rounded-lg p-4 transition-colors ${
                    !notification.readAt ? 'bg-blue-50 border-blue-200' : ''
                  }`}
                >
                  <div className="flex flex-wrap justify-between items-start gap-3">
                    <div className="min-w-0 flex-1 break-words">
                      <h3 id={'notification-title-' + notification.id} className="font-medium">{notification.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{notification.body}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {format(new Date(notification.createdAt), 'MMM d, yyyy h:mm a')}
                      </p>
                    </div>
                    {!notification.readAt && (
                      <Badge variant="secondary">Unread</Badge>
                    )}
                  </div>
                  {!notification.readAt && (
                    <div className="mt-3">
                      <Button 
                        size="sm" 
                        disabled={marking !== null}
                        onClick={() => handleMarkAsRead(notification.id)}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {marking === notification.id ? 'Saving…' : 'Mark as Read'}
                      </Button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
