'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AttendanceCalendar } from '@/lib/education/attendance-calendar';

// Administrator control for the school's attendance calendar. The server still decides who may save.
export function AttendanceCalendarSettings() {
  const [current, setCurrent] = useState<AttendanceCalendar | null>(null);
  const [timezone, setTimezone] = useState('');
  const [future, setFuture] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [zones, setZones] = useState<string[]>([]);
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      await Promise.resolve();
      const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
      try {
        if (active) setZones(intl.supportedValuesOf?.('timeZone') ?? []);
      } catch {
        /* the field still accepts a typed name */
      }
      try {
        const response = await fetch('/api/attendance/calendar', { cache: 'no-store' });
        if (!response.ok) {
          await response.arrayBuffer();
          throw new Error('The school calendar could not be loaded.');
        }
        const value = (await response.json()) as AttendanceCalendar;
        if (!active) return;
        setCurrent(value);
        setTimezone(value.timezone);
        setFuture(value.futureDatesAllowed);
      } catch (failure) {
        if (active)
          setError(failure instanceof Error ? failure.message : 'The school calendar could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/attendance/calendar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: timezone.trim(), futureDatesAllowed: future }),
      });
      if (!response.ok) {
        await response.arrayBuffer();
        setError(
          response.status === 400
            ? 'Enter a recognised timezone name, for example Africa/Kigali or Asia/Kolkata.'
            : response.status === 401
              ? 'Your session has ended. Sign in again to change the school calendar.'
              : response.status === 403
                ? 'Only a school administrator can change the school calendar.'
                : 'The school calendar was not saved. Try again.',
        );
        return;
      }
      const value = (await response.json()) as AttendanceCalendar;
      setCurrent(value);
      setTimezone(value.timezone);
      setFuture(value.futureDatesAllowed);
      setNotice('School calendar saved. Today at the school is ' + value.schoolDate + '.');
    } catch {
      setError(
        'The save could not be confirmed. Reload this page and check the school calendar before trying again.',
      );
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="calendar-settings-title"
      className="min-w-0 space-y-3 rounded-lg border p-4"
      data-attendance-calendar-settings
    >
      <h2 id="calendar-settings-title" className="text-xl font-semibold">
        School attendance calendar
      </h2>
      <p className="text-sm text-muted-foreground">
        Teachers record attendance by the school&apos;s calendar date, not by the date on their own device.
        Choose the timezone the school keeps.
      </p>
      {loading && <p role="status">Loading the school calendar…</p>}
      {current && (
        <p className="text-sm">
          {current.configured
            ? 'Today at the school is ' + current.schoolDate + ' (' + current.timezone + ').'
            : 'No timezone has been set, so UTC dates are used. Today in UTC is ' + current.schoolDate + '.'}
        </p>
      )}
      {error && (
        <p role="alert" className="break-words">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="break-words">
          {notice}
        </p>
      )}
      <form onSubmit={(event) => void save(event)} className="space-y-3">
        <div className="min-w-0">
          <Label htmlFor="school-timezone">School timezone</Label>
          <Input
            id="school-timezone"
            list="school-timezone-options"
            value={timezone}
            onChange={(event) => {
              setTimezone(event.target.value);
              setNotice(null);
            }}
            disabled={loading || saving}
            autoComplete="off"
            spellCheck={false}
            className="max-w-full"
          />
          <datalist id="school-timezone-options">
            {zones.map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
        </div>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={future}
            disabled={loading || saving}
            onChange={(event) => {
              setFuture(event.target.checked);
              setNotice(null);
            }}
            className="mt-1"
          />
          <span>Allow attendance to be recorded for dates after today at the school</span>
        </label>
        <Button type="submit" disabled={loading || saving || !timezone.trim()}>
          {saving ? 'Saving…' : 'Save school calendar'}
        </Button>
      </form>
    </section>
  );
}
