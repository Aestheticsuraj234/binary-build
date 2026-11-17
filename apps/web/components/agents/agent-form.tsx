'use client';

import type {
  AgentInput,
  AgentSummary,
  FieldErrors,
  Mood,
  ProviderId,
} from '@binary/shared';
import {
  agentInputSchema,
  CAST,
  characterOf,
  getProvider,
  validate,
} from '@binary/shared';
import {cn} from 'cn';
import {ChevronDownIcon} from 'lucide-react';
import {useRouter} from 'next/navigation';
import type {FormEvent, ReactNode} from 'react';
import {useRef, useState} from 'react';

import {FireAgentButton} from '@/components/agents/fire-agent-button';
import {CharacterFace} from '@/components/characters/character-face';
import {Alert} from '@/components/ui/alert';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Spinner} from '@/components/ui/spinner';
import {Textarea} from '@/components/ui/textarea';
import {ApiError, callApi} from '@/lib/client-api';

/** What the form edits. Matches the API's hire/edit body. */
export type AgentFormValues = Omit<AgentInput, 'templateId'>;

interface AgentFormProps {
  mode: 'hire' | 'edit';
  initial: AgentFormValues;
  /** Providers the person has a key for; the only ones they can pick. */
  connectedProviders: ProviderId[];
  agentId?: string;
  templateId?: string | null;
}

const SELECT_CLASS =
  'h-11 w-full appearance-none rounded-md border border-input bg-card px-3 pr-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive';

/** A label, a control and room for an error underneath. */
function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
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

/**
 * The character creator: pick a character, name it, give it a job, and
 * choose what it thinks with. The preview follows every change.
 */
export function AgentForm({
  mode,
  initial,
  connectedProviders,
  agentId,
  templateId,
}: AgentFormProps) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors<AgentFormValues>>({});
  const [formError, setFormError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const [previewMood, setPreviewMood] = useState<Mood>('idle');
  const moodTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const character = characterOf(values.avatar);
  const displayName = values.name.trim() || character.name;
  const models = getProvider(values.provider).models;

  function set<K extends keyof AgentFormValues>(
    field: K,
    value: AgentFormValues[K],
  ) {
    setValues(current => ({...current, [field]: value}));
  }

  /** Switching character makes the new one cheer for a moment. */
  function chooseCharacter(id: AgentFormValues['avatar']) {
    set('avatar', id);
    setPreviewMood('happy');
    clearTimeout(moodTimer.current);
    moodTimer.current = setTimeout(() => setPreviewMood('idle'), 1400);
  }

  /** A new provider starts on its default model. */
  function chooseProvider(provider: ProviderId) {
    setValues(current => ({
      ...current,
      provider,
      model: getProvider(provider).defaultModel,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate(agentInputSchema, {...values, templateId});
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setFormError(undefined);
    setIsSaving(true);
    try {
      const {agent} = await callApi<{agent: AgentSummary}>(
        mode === 'hire' ? '/api/agents' : `/api/agents/${agentId}`,
        {method: mode === 'hire' ? 'POST' : 'PATCH', body: result.data},
      );
      router.push(`/agents/${agent.id}`);
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Something went wrong.',
      );
      setIsSaving(false);
    }
  }

  const describedBy = (field: keyof AgentFormValues) =>
    errors[field] ? `agent-${field}-error` : undefined;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:gap-12">
      {/* Live preview */}
      <div className="lg:sticky lg:top-8 lg:self-start">
        <div className="overflow-hidden rounded-xl border bg-card">
          <div
            className="flex h-56 items-center justify-center transition-colors duration-500 sm:h-64 motion-reduce:transition-none"
            style={{backgroundColor: character.tint}}
          >
            <CharacterFace
              character={character.id}
              mood={previewMood}
              size={180}
            />
          </div>
          <div className="p-5">
            <p className="rounded-xl border bg-background px-4 py-3 text-sm leading-relaxed">
              Hi, I&apos;m{' '}
              <strong className="font-semibold">{displayName}</strong>!{' '}
              {character.greeting}
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Personality:</span>{' '}
              {character.personality}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        {formError && (
          <Alert
            variant="destructive"
            className="border-destructive/40 bg-danger-surface"
          >
            {formError}
          </Alert>
        )}

        <fieldset>
          <legend className="mb-3 text-sm font-medium">
            Choose a character
          </legend>
          <div className="grid grid-cols-4 gap-2">
            {CAST.map(option => (
              <label
                key={option.id}
                className={cn(
                  'flex cursor-pointer flex-col items-center gap-1 rounded-lg border p-2 pb-2.5 text-xs transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
                  values.avatar === option.id
                    ? 'border-primary bg-secondary text-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-secondary/60',
                )}
              >
                <input
                  type="radio"
                  name="avatar"
                  value={option.id}
                  checked={values.avatar === option.id}
                  onChange={() => chooseCharacter(option.id)}
                  className="sr-only"
                />
                <CharacterFace
                  character={option.id}
                  size={56}
                  animated={false}
                />
                {option.name}
              </label>
            ))}
          </div>
        </fieldset>

        <Field id="agent-name" label="Name" error={errors.name}>
          <Input
            id="agent-name"
            value={values.name}
            onChange={event => set('name', event.target.value)}
            placeholder={character.name}
            maxLength={60}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={describedBy('name')}
            className="h-11 bg-card"
          />
        </Field>

        <Field id="agent-role" label="Job" error={errors.role}>
          <Input
            id="agent-role"
            value={values.role}
            onChange={event => set('role', event.target.value)}
            placeholder="What does this agent do for you?"
            aria-invalid={errors.role ? true : undefined}
            aria-describedby={describedBy('role')}
            className="h-11 bg-card"
          />
        </Field>

        <Field
          id="agent-instructions"
          label="Instructions"
          error={errors.instructions}
        >
          <Textarea
            id="agent-instructions"
            value={values.instructions}
            onChange={event => set('instructions', event.target.value)}
            placeholder="How should it work? What should it always or never do?"
            rows={4}
            aria-invalid={errors.instructions ? true : undefined}
            aria-describedby={describedBy('instructions')}
          />
        </Field>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Field
            id="agent-provider"
            label="Thinks with"
            error={errors.provider}
          >
            <div className="relative">
              <select
                id="agent-provider"
                value={values.provider}
                onChange={event =>
                  chooseProvider(event.target.value as ProviderId)
                }
                aria-invalid={errors.provider ? true : undefined}
                aria-describedby={describedBy('provider')}
                className={SELECT_CLASS}
              >
                {connectedProviders.map(provider => (
                  <option key={provider} value={provider}>
                    {getProvider(provider).name}
                  </option>
                ))}
              </select>
              <ChevronDownIcon
                aria-hidden
                className="pointer-events-none absolute top-3.5 right-3 size-4 text-muted-foreground"
              />
            </div>
          </Field>

          <Field id="agent-model" label="Model" error={errors.model}>
            <div className="relative">
              <select
                id="agent-model"
                value={values.model}
                onChange={event => set('model', event.target.value)}
                aria-invalid={errors.model ? true : undefined}
                aria-describedby={describedBy('model')}
                className={cn(SELECT_CLASS, 'font-mono')}
              >
                {models.map(model => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
              <ChevronDownIcon
                aria-hidden
                className="pointer-events-none absolute top-3.5 right-3 size-4 text-muted-foreground"
              />
            </div>
          </Field>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <Button
            type="submit"
            size="lg"
            disabled={isSaving}
            className="h-11 px-6"
          >
            {isSaving && <Spinner />}
            {mode === 'hire' ? `Hire ${displayName}` : 'Save changes'}
          </Button>
          {mode === 'edit' && agentId && (
            <FireAgentButton agentId={agentId} name={initial.name} />
          )}
        </div>
      </form>
    </div>
  );
}
