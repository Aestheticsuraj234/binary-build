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
  colors,
  cronToPreset,
  fontSize,
  fontWeight,
  presetToCron,
  radius,
  ROUTINE_MESSAGES,
  routineInputSchema,
  SCHEDULE_KIND_LABELS,
  spacing,
  validate,
  WEEKDAY_NAMES,
} from '@binary/shared';
import {useState} from 'react';
import {Pressable, StyleSheet, Switch, Text, View} from 'react-native';

import {Button} from '@/components/button';
import {TimeZoneNote} from '@/components/routine-parts';
import {TextField} from '@/components/text-field';
import {ApiError, apiJson} from '@/lib/api';

const KINDS = Object.keys(SCHEDULE_KIND_LABELS) as ScheduleKind[];
const MINUTES = [0, 15, 30, 45];

/** A row of pill buttons where exactly one is selected. */
function Pills<T extends string | number>({
  label,
  options,
  value,
  onChange,
  describe,
  error,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  describe: (value: T) => string;
  error?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View accessibilityRole="radiogroup" style={styles.pills}>
        {options.map(option => {
          const isSelected = option === value;
          return (
            <Pressable
              key={String(option)}
              accessibilityRole="radio"
              accessibilityState={{checked: isSelected}}
              onPress={() => onChange(option)}
              style={[styles.pill, isSelected && styles.pillSelected]}
            >
              <Text
                style={[styles.pillText, isSelected && styles.pillTextSelected]}
              >
                {describe(option)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggle}>
      <View style={styles.toggleText}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{true: colors.accent, false: colors.borderStrong}}
        thumbColor={colors.text}
      />
    </View>
  );
}

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
    time: 'time' in preset ? preset.time : '9:00',
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

/** Name, who runs it, what to do, when, and how it can be started. */
export function RoutineForm({
  mode,
  agents,
  routine,
  timeZone,
  schedulesEnabled,
  onSaved,
  onTimeZoneChanged,
}: {
  mode: 'create' | 'edit';
  agents: AgentSummary[];
  routine?: RoutineSummary;
  timeZone: string | null;
  schedulesEnabled: boolean;
  onSaved: (saved: RoutineSaved) => void;
  onTimeZoneChanged: () => void;
}) {
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

  function setScheduleField<K extends keyof ScheduleFields>(
    field: K,
    value: ScheduleFields[K],
  ) {
    setSchedule(current => ({...current, [field]: value}));
  }

  async function save() {
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
      setFormError(undefined);
      return;
    }
    setErrors({});
    setFormError(undefined);
    setIsSaving(true);
    try {
      onSaved(
        await apiJson<RoutineSaved>(
          mode === 'create' ? '/api/routines' : `/api/routines/${routine!.id}`,
          {method: mode === 'create' ? 'POST' : 'PATCH', body: result.data},
        ),
      );
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  }

  const agentById = new Map(agents.map(agent => [agent.id, agent]));
  const showsTime =
    schedule.kind === 'daily' ||
    schedule.kind === 'weekdays' ||
    schedule.kind === 'weekly';

  return (
    <View style={styles.form}>
      {formError ? <Text style={styles.alert}>{formError}</Text> : null}
      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="Morning plan"
        maxLength={60}
        error={errors.name}
      />
      <Pills
        label="Who runs it"
        options={agents.map(agent => agent.id)}
        value={agentId}
        onChange={setAgentId}
        describe={id => agentById.get(id)?.name ?? 'Someone'}
        error={errors.agentId}
      />
      <TextField
        label="What to do"
        value={instructions}
        onChangeText={setInstructions}
        placeholder="Plan my day in three bullet points."
        multiline
        style={[styles.multiline, errors.instructions && styles.invalid]}
        error={errors.instructions}
      />
      <Pills
        label="Schedule"
        options={KINDS}
        value={schedule.kind}
        onChange={kind => setScheduleField('kind', kind)}
        describe={kind => SCHEDULE_KIND_LABELS[kind]}
      />
      {schedule.kind === 'weekly' && (
        <Pills
          label="Day"
          options={[1, 2, 3, 4, 5, 6, 0]}
          value={schedule.weekday}
          onChange={day => setScheduleField('weekday', day)}
          describe={day => WEEKDAY_NAMES[day]!.slice(0, 3)}
        />
      )}
      {showsTime && (
        <TextField
          label="Time (24-hour)"
          value={schedule.time}
          onChangeText={time => setScheduleField('time', time)}
          placeholder="9:00"
          keyboardType="numbers-and-punctuation"
          error={errors.cron}
        />
      )}
      {schedule.kind === 'hourly' && (
        <Pills
          label="Minute"
          options={MINUTES}
          value={schedule.minute}
          onChange={minute => setScheduleField('minute', minute)}
          describe={minute => `:${String(minute).padStart(2, '0')}`}
        />
      )}
      {schedule.kind === 'custom' && (
        <TextField
          label="Cron expression"
          value={schedule.cron}
          onChangeText={cron => setScheduleField('cron', cron)}
          placeholder="0 9 * * 1-5"
          autoCapitalize="none"
          autoCorrect={false}
          error={errors.cron}
        />
      )}
      {schedule.kind !== 'none' && (
        <TimeZoneNote
          timeZone={timeZone}
          schedulesEnabled={schedulesEnabled}
          windowMinutes={routine?.scheduleWindowMinutes ?? null}
          onChanged={onTimeZoneChanged}
        />
      )}
      <Toggle
        label="Webhook"
        hint="Let other services start it, like GitHub or a form."
        value={webhook}
        onChange={setWebhook}
      />
      <Toggle
        label="Switched on"
        hint="When off, the schedule and webhook do nothing. Run now still works."
        value={enabled}
        onChange={setEnabled}
      />
      <Button
        label={mode === 'create' ? 'Create routine' : 'Save changes'}
        variant={mode === 'create' ? 'primary' : 'secondary'}
        isLoading={isSaving}
        onPress={() => void save()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {gap: spacing.lg},
  field: {gap: spacing.sm},
  label: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  hint: {color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20},
  pills: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  pill: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  pillSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceRaised,
  },
  pillText: {color: colors.textMuted, fontSize: fontSize.sm},
  pillTextSelected: {color: colors.text, fontWeight: fontWeight.medium},
  multiline: {
    height: 120,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: fontSize.md,
    paddingHorizontal: spacing.md,
  },
  invalid: {borderColor: colors.danger},
  toggle: {flexDirection: 'row', alignItems: 'center', gap: spacing.lg},
  toggleText: {flex: 1, gap: 2},
  error: {color: colors.danger, fontSize: fontSize.sm},
  alert: {
    color: colors.danger,
    fontSize: fontSize.sm,
    lineHeight: 20,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSurface,
    padding: spacing.md,
    overflow: 'hidden',
  },
});
