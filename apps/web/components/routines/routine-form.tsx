'use client';

import type {
  AgentSummary,
  FieldErrors,
  RoutineInput,
  RoutineSaved,
  RoutineSummary,
  ScheduleKind,
  SchedulePreset,
} from '@binary/shared';
import {
  cronToPreset,
  parseTime,
  presetToCron,
  ROUTINE_MESSAGES,
  routineInputSchema,
  SCHEDULE_KIND_LABELS,
  validate,
  WEEKDAY_NAMES,
} from '@binary/shared';
import {cn} from 'cn';
import {ChevronDownIcon} from 'lucide-react';
import type {FormEvent, ReactNode} from 'react';
import {useState} from 'react';

import {TimeZoneNote} from '@/components/routines/time-zone-note';
import {Alert} from '@/components/ui/alert';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Spinner} from '@/components/ui/spinner';
import {Textarea} from '@/components/ui/textarea';
import {ApiError, callApi} from '@/lib/client-api';

const SELECT_CLASS =
  'h-11 w-full appearance-none rounded-md border border-input bg-card px-3 pr-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive';

const KINDS = Object.keys(SCHEDULE_KIND_LABELS) as ScheduleKind[];

function Field({
  id,
  label,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function Select({
  id,
  value,
  onChange,
  children,
  invalid,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  invalid?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <select
        id={id}
        value={value}
        onChange={event => onChange(event.target.value)}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        className={SELECT_CLASS}
      >
        {children}
      </select>
      <ChevronDownIcon
        aria-hidden
        className="pointer-events-none absolute top-3.5 right-3 size-4 text-muted-foreground"
      />
    </div>
  );
}

function Checkbox({
  id,
  checked,
  onChange,
  label,
  hint,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        aria-describedby={`${id}-hint`}
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <div>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      </div>
    </div>
  );
}

/** "9:00" → "09:00", the value a time input wants. */
function toInputTime(time: string): string {
  const parsed = parseTime(time);
  return parsed
    ? `${String(parsed[0]).padStart(2, '0')}:${String(parsed[1]).padStart(2, '0')}`
    : '09:00';
}

/** The schedule controls, split out of the preset so each can be edited. */
interface ScheduleFields {
  kind: ScheduleKind;
  time: string;
  weekday: number;
  minute: number;
  cron: string;
}

function scheduleFieldsOf(cron: string | null): ScheduleFields {
  const preset = cronToPreset(cron);
  return {
    kind: preset.kind,
    time: 'time' in preset ? toInputTime(preset.time) : '09:00',
    weekday: preset.kind === 'weekly' ? preset.weekday : 1,
    minute: preset.kind === 'hourly' ? preset.minute : 0,
    cron: preset.kind === 'custom' ? preset.cron : '0 9 * * 1-5',
  };
}

function presetOf(fields: ScheduleFields): SchedulePreset {
  switch (fields.kind) {
    case 'none':
      return {kind: 'none'};
    case 'hourly':
      return {kind: 'hourly', minute: fields.minute};
    case 'daily':
    case 'weekdays':
      return {kind: fields.kind, time: fields.time};
    case 'weekly':
      return {kind: 'weekly', weekday: fields.weekday, time: fields.time};
    case 'custom':
      return {kind: 'custom', cron: fields.cron};
  }
}

interface RoutineFormProps {
  mode: 'create' | 'edit';
  agents: AgentSummary[];
  /** The routine being edited. */
  routine?: RoutineSummary;
  timeZone: string | null;
  schedulesEnabled: boolean;
  /** Called with what the API saved, including a new secret (shown once). */
  onSaved: (saved: RoutineSaved) => void;
}

/** Name, who runs it, what to do, when, and how it can be started. */
export function RoutineForm({
  mode,
  agents,
  routine,
  timeZone,
  schedulesEnabled,
  onSaved,
}: RoutineFormProps) {
  const [name, setName] = useState(routine?.name ?? '');
  const [agentId, setAgentId] = useState(
    routine?.agentId ?? agents[0]?.id ?? '',
  );
  const [instructions, setInstructions] = useState(routine?.instructions ?? '');
  const [schedule, setSchedule] = useState(() =>
    scheduleFieldsOf(routine ? routine.cron : '0 9 * * 1-5'),
  );
  const [webhook, setWebhook] = useState(routine?.webhook ?? false);
  const [enabled, setEnabled] = useState(routine?.enabled ?? true);
  const [errors, setErrors] = useState<FieldErrors<RoutineInput>>({});
  const [formError, setFormError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const [savedNote, setSavedNote] = useState(false);

  function setScheduleField<K extends keyof ScheduleFields>(
    field: K,
    value: ScheduleFields[K],
  ) {
    setSchedule(current => ({...current, [field]: value}));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavedNote(false);
    let cron: string | null;
    try {
      cron = presetToCron(presetOf(schedule));
    } catch {
      setErrors({cron: ROUTINE_MESSAGES.timeInvalid});
      return;
    }
    const result = validate(routineInputSchema, {
      name,
      agentId,
      instructions,
      cron,
      webhook,
      enabled,
    });
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setFormError(undefined);
    setIsSaving(true);
    try {
      const saved = await callApi<RoutineSaved>(
        mode === 'create' ? '/api/routines' : `/api/routines/${routine!.id}`,
        {method: mode === 'create' ? 'POST' : 'PATCH', body: result.data},
      );
      onSaved(saved);
      setSavedNote(mode === 'edit');
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
      } else {
        setFormError('Something went wrong.');
      }
    } finally {
      setIsSaving(false);
    }
  }

  const describedBy = (field: keyof RoutineInput) =>
    errors[field] ? `routine-${field}-error` : undefined;
  const showsTime =
    schedule.kind === 'daily' ||
    schedule.kind === 'weekdays' ||
    schedule.kind === 'weekly';

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-6 rounded-xl border bg-card p-6"
    >
      {formError && (
        <Alert
          variant="destructive"
          className="border-destructive/40 bg-danger-surface"
        >
          {formError}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Field id="routine-name" label="Name" error={errors.name}>
          <Input
            id="routine-name"
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="Morning plan"
            maxLength={60}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={describedBy('name')}
            className="h-11 bg-background"
          />
        </Field>
        <Field id="routine-agentId" label="Who runs it" error={errors.agentId}>
          <Select
            id="routine-agentId"
            value={agentId}
            onChange={setAgentId}
            invalid={Boolean(errors.agentId)}
          >
            {agents.map(agent => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        id="routine-instructions"
        label="What to do"
        error={errors.instructions}
      >
        <Textarea
          id="routine-instructions"
          value={instructions}
          onChange={event => setInstructions(event.target.value)}
          placeholder="Plan my day in three bullet points."
          rows={4}
          aria-invalid={errors.instructions ? true : undefined}
          aria-describedby={describedBy('instructions')}
        />
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">Schedule</legend>
        <div className="flex flex-wrap gap-3">
          <Select
            id="routine-schedule"
            value={schedule.kind}
            onChange={value => setScheduleField('kind', value as ScheduleKind)}
            className="w-full sm:w-52"
          >
            {KINDS.map(kind => (
              <option key={kind} value={kind}>
                {SCHEDULE_KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
          {schedule.kind === 'weekly' && (
            <Select
              id="routine-weekday"
              value={String(schedule.weekday)}
              onChange={value => setScheduleField('weekday', Number(value))}
              className="w-full sm:w-40"
            >
              {WEEKDAY_NAMES.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </Select>
          )}
          {showsTime && (
            <Input
              id="routine-time"
              type="time"
              aria-label="Time"
              value={schedule.time}
              onChange={event => setScheduleField('time', event.target.value)}
              className="h-11 w-full bg-background sm:w-36"
            />
          )}
          {schedule.kind === 'hourly' && (
            <Select
              id="routine-minute"
              value={String(schedule.minute)}
              onChange={value => setScheduleField('minute', Number(value))}
              className="w-full sm:w-44"
            >
              {Array.from({length: 12}, (_, i) => i * 5).map(minute => (
                <option key={minute} value={minute}>
                  At :{String(minute).padStart(2, '0')}
                </option>
              ))}
            </Select>
          )}
          {schedule.kind === 'custom' && (
            <Input
              id="routine-cron"
              aria-label="Cron expression"
              value={schedule.cron}
              onChange={event => setScheduleField('cron', event.target.value)}
              placeholder="0 9 * * 1-5"
              spellCheck={false}
              aria-invalid={errors.cron ? true : undefined}
              aria-describedby={describedBy('cron')}
              className="h-11 w-full bg-background font-mono sm:w-52"
            />
          )}
        </div>
        {errors.cron && (
          <p id="routine-cron-error" className="text-sm text-destructive">
            {errors.cron}
          </p>
        )}
        {schedule.kind !== 'none' && (
          <TimeZoneNote
            timeZone={timeZone}
            schedulesEnabled={schedulesEnabled}
            windowMinutes={routine?.scheduleWindowMinutes ?? null}
          />
        )}
      </fieldset>

      <div className="flex flex-col gap-4">
        <Checkbox
          id="routine-webhook"
          checked={webhook}
          onChange={setWebhook}
          label="Webhook"
          hint="Let other services start it, like GitHub or a form."
        />
        <Checkbox
          id="routine-enabled"
          checked={enabled}
          onChange={setEnabled}
          label="Switched on"
          hint="When off, the schedule and webhook do nothing. Run now still works."
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant={mode === 'create' ? 'default' : 'secondary'}
          size="lg"
          disabled={isSaving}
          className="h-11 px-5"
        >
          {isSaving && <Spinner />}
          {mode === 'create' ? 'Create routine' : 'Save changes'}
        </Button>
        {savedNote && (
          <p role="status" className="text-sm text-muted-foreground">
            Saved.
          </p>
        )}
      </div>
    </form>
  );
}
