import {ROOM_MODE_INFO} from '@binary/shared';
import {PlusIcon} from 'lucide-react';
import type {Metadata} from 'next';
import Link from 'next/link';
import {Suspense} from 'react';

import {CharacterFace} from '@/components/characters/character-face';
import {Page} from '@/components/page';
import {buttonVariants} from '@/components/ui/button';
import {Skeleton} from '@/components/ui/skeleton';
import {fetchRooms} from '@/lib/api';

export const metadata: Metadata = {title: 'Rooms · Binary'};

async function RoomList() {
  const rooms = await fetchRooms();
  if (rooms.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No rooms yet. Put two or more of your characters in a room and they work
        on one task together.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {rooms.map(room => {
        const lead = room.members.find(m => m.id === room.leadAgentId);
        return (
          <li key={room.id}>
            <Link
              href={`/rooms/${room.id}`}
              className="flex items-center gap-4 rounded-lg border bg-card p-4 transition-colors hover:border-input"
            >
              <div className="flex shrink-0 -space-x-2">
                {room.members.map(member => (
                  <CharacterFace
                    key={member.id}
                    character={member.avatar}
                    size={36}
                    animated={false}
                    className="rounded-full ring-2 ring-card"
                  />
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{room.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {room.title ??
                    room.members.map(member => member.name).join(', ')}
                </p>
              </div>
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                {ROOM_MODE_INFO[room.mode].label}
                {lead && ` · ${lead.name} leads`}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function RoomsPage() {
  return (
    <Page
      title="Rooms"
      description="Group chats with a small team of your characters. They answer in turn, build on each other and hand work over."
    >
      <Link
        href="/rooms/new"
        className={buttonVariants({size: 'lg', className: 'mb-8 h-11 px-5'})}
      >
        <PlusIcon aria-hidden />
        New room
      </Link>
      <Suspense fallback={<Skeleton className="h-48 rounded-xl" />}>
        <RoomList />
      </Suspense>
    </Page>
  );
}
