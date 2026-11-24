import type {
  AgentInput,
  AgentSummary,
  ComputerKind,
  FieldErrors,
  Mood,
  ProviderId,
} from '@binary/shared';
import {
  agentInputSchema,
  APPROVAL_MODE_INFO,
  APPROVAL_MODES,
  CAST,
  BROWSER_SETUP_HINT,
  COMPUTER_INFO,
  COMPUTER_KINDS,
  SANDBOX_SETUP_HINT,
  characterOf,
  colors,
  fontSize,
  fontWeight,
  getProvider,
  radius,
  spacing,
  validate,
} from '@binary/shared';
import {useRouter} from 'expo-router';
import {useRef, useState} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {Button} from '@/components/button';
import {CharacterFace} from '@/components/character-face';
import {TextField} from '@/components/text-field';
import {ApiError, apiJson} from '@/lib/api';

/** What the form edits. Matches the API's hire/edit body. */
export type AgentFormValues = Omit<AgentInput, 'templateId'>;

interface AgentFormProps {
  mode: 'hire' | 'edit';
  initial: AgentFormValues;
  /** Providers the person has a key for; the only ones they can pick. */
  connectedProviders: ProviderId[];
  /** Which kinds of computer the server can run (E2B key, Chromium). */
  available: Record<ComputerKind, boolean>;
  agentId?: string;
  templateId?: string | null;
}

/** A row of pill buttons where exactly one is selected. */
function ChoiceRow<T extends string>({
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
      <View accessibilityRole="radiogroup" style={styles.choices}>
        {options.map(option => {
          const isSelected = option === value;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{checked: isSelected}}
              onPress={() => onChange(option)}
              style={[styles.choice, isSelected && styles.choiceSelected]}
            >
              <Text
                style={[
                  styles.choiceText,
                  isSelected && styles.choiceTextSelected,
                ]}
              >
                {describe(option)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

/**
 * The character creator on the phone: a live preview on top, then the
 * character grid and the agent's details.
 */
export function AgentForm({
  mode,
  initial,
  connectedProviders,
  available,
  agentId,
  templateId,
}: AgentFormProps) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors<AgentFormValues>>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState<'save' | 'fire'>();
  const [previewMood, setPreviewMood] = useState<Mood>('idle');
  const moodTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const character = characterOf(values.avatar);
  const displayName = values.name.trim() || character.name;

  function set<K extends keyof AgentFormValues>(
    field: K,
    value: AgentFormValues[K],
  ) {
    setValues(current => ({...current, [field]: value}));
  }

  function chooseCharacter(id: AgentFormValues['avatar']) {
    set('avatar', id);
    setPreviewMood('happy');
    clearTimeout(moodTimer.current);
    moodTimer.current = setTimeout(() => setPreviewMood('idle'), 1400);
  }

  async function save() {
    const result = validate(agentInputSchema, {...values, templateId});
    if (!result.success) {
      setErrors(result.errors);
      setFormError(result.firstError);
      return;
    }
    setErrors({});
    setFormError(undefined);
    setBusy('save');
    try {
      const {agent} = await apiJson<{agent: AgentSummary}>(
        mode === 'hire' ? '/api/agents' : `/api/agents/${agentId}`,
        {method: mode === 'hire' ? 'POST' : 'PATCH', body: result.data},
      );
      if (mode === 'hire') {
        router.replace(`/agents/${agent.id}`);
      } else {
        router.back();
      }
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : String(error));
      setBusy(undefined);
    }
  }

  function confirmFire() {
    Alert.alert(`Fire ${initial.name}?`, "This can't be undone.", [
      {text: 'Keep', style: 'cancel'},
      {text: 'Fire', style: 'destructive', onPress: () => void fire()},
    ]);
  }

  async function fire() {
    setBusy('fire');
    try {
      await apiJson(`/api/agents/${agentId}`, {method: 'DELETE'});
      router.dismissTo('/');
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : String(error));
      setBusy(undefined);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Live preview */}
        <View style={styles.preview}>
          <View style={[styles.stage, {backgroundColor: character.tint}]}>
            <CharacterFace
              character={character.id}
              mood={previewMood}
              size={140}
            />
          </View>
          <View style={styles.previewBody}>
            <Text style={styles.bubble}>
              Hi, I&apos;m <Text style={styles.strong}>{displayName}</Text>!{' '}
              {character.greeting}
            </Text>
            <Text style={styles.personality}>
              <Text style={styles.strong}>Personality: </Text>
              {character.personality}
            </Text>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Choose a character</Text>
          <View accessibilityRole="radiogroup" style={styles.cast}>
            {CAST.map(option => {
              const isSelected = values.avatar === option.id;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="radio"
                  accessibilityLabel={option.name}
                  accessibilityState={{checked: isSelected}}
                  onPress={() => chooseCharacter(option.id)}
                  style={[styles.castItem, isSelected && styles.castSelected]}
                >
                  <CharacterFace
                    character={option.id}
                    size={52}
                    animated={false}
                  />
                  <Text
                    style={[
                      styles.castName,
                      isSelected && styles.choiceTextSelected,
                    ]}
                  >
                    {option.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <TextField
          label="Name"
          value={values.name}
          onChangeText={value => set('name', value)}
          placeholder={character.name}
          error={errors.name}
        />
        <TextField
          label="Job"
          value={values.role}
          onChangeText={value => set('role', value)}
          placeholder="What does this agent do for you?"
          error={errors.role}
        />
        <TextField
          label="Instructions"
          value={values.instructions}
          onChangeText={value => set('instructions', value)}
          placeholder="How should it work? What should it always or never do?"
          multiline
          style={styles.multiline}
          error={errors.instructions}
        />

        <ChoiceRow
          label="Thinks with"
          options={connectedProviders}
          value={values.provider}
          onChange={provider =>
            setValues(current => ({
              ...current,
              provider,
              model: getProvider(provider).defaultModel,
            }))
          }
          describe={provider => getProvider(provider).name}
          error={errors.provider}
        />
        <ChoiceRow
          label="Model"
          options={getProvider(values.provider).models}
          value={values.model}
          onChange={model => set('model', model)}
          describe={model => model}
          error={errors.model}
        />

        <ChoiceRow
          label="Permissions"
          options={APPROVAL_MODES}
          value={values.approvalMode}
          onChange={mode => set('approvalMode', mode)}
          describe={mode => APPROVAL_MODE_INFO[mode].label}
          error={errors.approvalMode}
        />
        <Text style={styles.modeHint}>
          {APPROVAL_MODE_INFO[values.approvalMode].description}
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Computers</Text>
          {COMPUTER_KINDS.map(kind => {
            const isOn = values.computers.includes(kind);
            // Off on the server: can't be added, but can be taken away.
            const isOff = !available[kind] && !isOn;
            return (
              <Pressable
                key={kind}
                accessibilityRole="checkbox"
                accessibilityState={{checked: isOn, disabled: isOff}}
                disabled={isOff}
                onPress={() =>
                  set(
                    'computers',
                    isOn
                      ? values.computers.filter(other => other !== kind)
                      : COMPUTER_KINDS.filter(
                          other =>
                            other === kind || values.computers.includes(other),
                        ),
                  )
                }
                style={[
                  styles.computer,
                  isOn && styles.choiceSelected,
                  isOff && styles.computerOff,
                ]}
              >
                <Text style={styles.computerTitle}>
                  {isOn ? '☑︎ ' : '☐ '}
                  {COMPUTER_INFO[kind].label}
                </Text>
                <Text style={styles.modeHint}>
                  {available[kind]
                    ? COMPUTER_INFO[kind].description
                    : kind === 'cloud_sandbox'
                      ? SANDBOX_SETUP_HINT
                      : BROWSER_SETUP_HINT}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {formError && <Text style={styles.formError}>{formError}</Text>}

        <Button
          label={mode === 'hire' ? `Hire ${displayName}` : 'Save changes'}
          isLoading={busy === 'save'}
          disabled={busy !== undefined}
          onPress={() => void save()}
        />
        {mode === 'edit' && (
          <Button
            label={`Fire ${initial.name}`}
            variant="danger"
            isLoading={busy === 'fire'}
            disabled={busy !== undefined}
            onPress={confirmFire}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  content: {padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.xxxl},
  preview: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  stage: {height: 180, alignItems: 'center', justifyContent: 'center'},
  previewBody: {padding: spacing.lg, gap: spacing.md},
  bubble: {
    color: colors.text,
    fontSize: fontSize.sm,
    lineHeight: 20,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    padding: spacing.md,
    overflow: 'hidden',
  },
  strong: {color: colors.text, fontWeight: fontWeight.semibold},
  personality: {color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20},
  field: {gap: spacing.sm},
  label: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  cast: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  castItem: {
    width: '23%',
    flexGrow: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: radius.md,
  },
  castSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceRaised,
  },
  castName: {color: colors.textMuted, fontSize: fontSize.xs},
  multiline: {height: 110, paddingTop: spacing.md, textAlignVertical: 'top'},
  choices: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  computer: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  computerOff: {opacity: 0.5},
  computerTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  modeHint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: -spacing.sm,
  },
  choice: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  choiceSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceRaised,
  },
  choiceText: {color: colors.textMuted, fontSize: fontSize.sm},
  choiceTextSelected: {color: colors.text, fontWeight: fontWeight.semibold},
  error: {color: colors.danger, fontSize: fontSize.sm},
  formError: {
    color: colors.danger,
    fontSize: fontSize.sm,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSurface,
    padding: spacing.md,
    overflow: 'hidden',
  },
});
