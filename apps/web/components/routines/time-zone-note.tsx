'use client';

import {detectTimeZone} from '@binary/shared';
import {useRouter} from 'next/navigation';
import {useEffect, useMemo, useRef, useState} from 'react';

import {Button} from '@/components/ui/button';
import {ApiError, callApi} from '@/lib/client-api';

/** Every IANA zone the browser knows, for the picker. */
function allTimeZones(current: string): string[] {
  try {
    const zones = Intl.supportedValuesOf('timeZone');
    return zones.includes(current) ? zones : [current, ...zones];
  } catch {
    return [current];
  }
}

/**
 * Saves the browser's time zone the first time someone opens Routines, so
 * "9:00" means 9:00 where they are. Renders nothing.
 */
export function DetectTimeZone({timeZone}: {timeZone: string | null}) {
  const router = useRouter();
  const sent = useRef(false);
  useEffect(() => {
    if (timeZone !== null || sent.current) {
      return;
    }
    sent.current = true;
    void callApi('/api/settings', {
      method: 'PUT',
      body: {timeZone: detectTimeZone()},
    })
      .then(() => router.refresh())
      .catch(() => {});
  }, [timeZone, router]);
  return null;
}

/**
 * "Times use Asia/Calcutta. Change", plus what to expect: schedules that
 * don't fire without Trigger.dev, or a Free-plan window.
 */
export function TimeZoneNote({
  timeZone,
  schedulesEnabled,
  windowMinutes,
}: {
  timeZone: string | null;
  schedulesEnabled: boolean;
  windowMinutes: number | null;
}) {
  const router = useRouter();
  const shown = timeZone ?? detectTimeZone();
  const [isEditing, setIsEditing] = useState(false);
  const [choice, setChoice] = useState(shown);
  const [error, setError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const zones = useMemo(
    () => (isEditing ? allTimeZones(shown) : []),
    [isEditing, shown],
  );

  async function save() {
    setIsSaving(true);
    setError(undefined);
    try {
      await callApi('/api/settings', {method: 'PUT', body: {timeZone: choice}});
      setIsEditing(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 text-xs text-muted-foreground">
      {isEditing ? (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="time-zone" className="sr-only">
            Time zone
          </label>
          <select
            id="time-zone"
            value={choice}
            onChange={event => setChoice(event.target.value)}
            className="h-9 max-w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
          >
            {zones.map(zone => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void save()}
            disabled={isSaving}
          >
            Use this time zone
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <p>
          Times use {shown}.{' '}
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="underline underline-offset-2 hover:text-foreground"
          >
            Change
          </button>
        </p>
      )}
      {error && <p className="text-destructive">{error}</p>}
      {!schedulesEnabled && (
        <p>Saved, but schedules only fire when Trigger.dev is connected.</p>
      )}
      {schedulesEnabled && windowMinutes !== null && (
        <p>
          Your Trigger.dev plan starts scheduled runs within {windowMinutes}{' '}
          minutes after the time, not exactly on it.
        </p>
      )}
    </div>
  );
}
