'use client';

import type {
  AgentSummary,
  RoomInput,
  RoomMode,
  RoomSummary,
} from '@binary/shared';
import {
  ROOM_MAX_MEMBERS,
  ROOM_MODE_INFO,
  ROOM_MODES,
  ROOM_NAME_MAX_LENGTH,
  roomInputSchema,
  validate,
} from '@binary/shared';
import {cn} from 'cn';
import {CheckIcon, CrownIcon, Trash2Icon} from 'lucide-react';
import {useRouter} from 'next/navigation';
import type {FormEvent} from 'react';
import {useState} from 'react';

import {CharacterFace} from '@/components/characters/character-face';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Spinner} from '@/components/ui/spinner';
import {ApiError, callApi} from '@/lib/client-api';

/**
 * Create or edit a room: a name, 2 to 6 characters, how it answers and a
 * lead. Editing also offers Delete; the characters stay either way.
 */
export function RoomForm({
  crew,
  room,
}: {
  crew: AgentSummary[];
  /** The room being edited, or undefined for a new one. */
  room?: RoomSummary;
}) {
  const router = useRouter();
  const [name, setName] = useState(room?.name ?? '');
  const [mode, setMode] = useState<RoomMode>(room?.mode ?? 'mention');
  const [agentIds, setAgentIds] = useState<string[]>(
    room?.members.filter(m => !m.isFired).map(m => m.id) ?? [],
  );
  const [leadAgentId, setLeadAgentId] = useState(room?.leadAgentId ?? '');
  const [error, setError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // The lead is the first one picked, until you choose another.
  const lead = agentIds.includes(leadAgentId) ? leadAgentId : agentIds[0];

  function toggle(id: string) {
    setError(undefined);
    setAgentIds(current =>
      current.includes(id)
        ? current.filter(other => other !== id)
        : current.length < ROOM_MAX_MEMBERS
          ? [...current, id]
          : current,
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const checked = validate(roomInputSchema, {
      name,
      mode,
      agentIds,
      leadAgentId: lead ?? '',
    });
    if (!checked.success) {
      setError(checked.firstError);
      return;
    }
    setError(undefined);
    setIsSaving(true);
    try {
      const input: RoomInput = checked.data;
      const {room: saved} = await callApi<{room: RoomSummary}>(
        room ? `/api/rooms/${room.id}` : '/api/rooms',
        {method: room ? 'PATCH' : 'POST', body: input},
      );
      router.push(`/rooms/${saved.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
      setIsSaving(false);
    }
  }

  async function remove() {
    if (
      !room ||
      !window.confirm(
        `Delete ${room.name}? Its conversation goes; its characters stay.`,
      )
    ) {
      return;
    }
    setIsDeleting(true);
    try {
      await callApi(`/api/rooms/${room.id}`, {method: 'DELETE'});
      router.push('/rooms');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
      setIsDeleting(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-8">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="room-name" className="text-sm font-medium">
          Name
        </label>
        <Input
          id="room-name"
          value={name}
          maxLength={ROOM_NAME_MAX_LENGTH}
          placeholder="Launch team"
          onChange={event => setName(event.target.value)}
          className="h-11"
        />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">
          Characters{' '}
          <span className="font-normal text-muted-foreground">
            ({agentIds.length} of 2–{ROOM_MAX_MEMBERS}). Tap the crown to pick
            the lead.
          </span>
        </legend>
        {crew.length < 2 ? (
          <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
            A room needs at least two characters. Hire another one first.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {crew.map(agent => {
              const picked = agentIds.includes(agent.id);
              const isLead = picked && agent.id === lead;
              return (
                <li
                  key={agent.id}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border bg-card p-3',
                    picked && 'border-foreground/40',
                  )}
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={picked}
                    onClick={() => toggle(agent.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded border',
                        picked &&
                          'border-primary bg-primary text-primary-foreground',
                      )}
                    >
                      {picked && <CheckIcon className="size-3.5" />}
                    </span>
                    <CharacterFace
                      character={agent.avatar}
                      size={36}
                      animated={false}
                      className="shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {agent.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {agent.role}
                      </span>
                    </span>
                  </button>
                  {picked && (
                    <button
                      type="button"
                      aria-pressed={isLead}
                      aria-label={
                        isLead
                          ? `${agent.name} leads`
                          : `Make ${agent.name} the lead`
                      }
                      onClick={() => setLeadAgentId(agent.id)}
                      className={cn(
                        'flex size-8 items-center justify-center rounded-md transition-colors',
                        isLead
                          ? 'text-primary'
                          : 'text-muted-foreground hover:bg-secondary',
                      )}
                    >
                      <CrownIcon aria-hidden className="size-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Who answers</legend>
        <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
          {ROOM_MODES.map(option => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={mode === option}
              onClick={() => setMode(option)}
              className={cn(
                'rounded-lg border bg-card p-4 text-left transition-colors',
                mode === option
                  ? 'border-foreground/40 bg-secondary'
                  : 'hover:bg-secondary/60',
              )}
            >
              <span className="block text-sm font-medium">
                {ROOM_MODE_INFO[option].label}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {ROOM_MODE_INFO[option].description}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          size="lg"
          className="h-11 px-5"
          disabled={isSaving || crew.length < 2}
        >
          {isSaving && <Spinner />}
          {room ? 'Save changes' : 'Create room'}
        </Button>
        {room && (
          <Button
            type="button"
            variant="ghost"
            className="ml-auto"
            disabled={isDeleting}
            onClick={() => void remove()}
          >
            {isDeleting ? <Spinner /> : <Trash2Icon aria-hidden />}
            Delete room
          </Button>
        )}
      </div>
    </form>
  );
}
