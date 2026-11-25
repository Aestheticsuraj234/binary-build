import type {Metadata} from 'next';
import {Suspense} from 'react';

import {PageHeading} from '@/components/agents/page-heading';
import {RoomForm} from '@/components/rooms/room-form';
import {Skeleton} from '@/components/ui/skeleton';
import {fetchAgents} from '@/lib/api';

export const metadata: Metadata = {title: 'New room · Binary'};

async function NewRoom() {
  return <RoomForm crew={await fetchAgents()} />;
}

export default function NewRoomPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-8 sm:py-14">
      <PageHeading
        title="New room"
        description="Pick 2 to 6 characters, how they answer, and a lead."
        backHref="/rooms"
        backLabel="Rooms"
      />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <NewRoom />
      </Suspense>
    </div>
  );
}
