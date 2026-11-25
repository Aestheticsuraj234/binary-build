import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {Suspense} from 'react';

import {PageHeading} from '@/components/agents/page-heading';
import {RoomForm} from '@/components/rooms/room-form';
import {Skeleton} from '@/components/ui/skeleton';
import {fetchAgents, fetchRoom} from '@/lib/api';

export const metadata: Metadata = {title: 'Edit room · Binary'};

async function EditRoom({
  params,
}: {
  params: PageProps<'/rooms/[id]/edit'>['params'];
}) {
  const {id} = await params;
  const [detail, crew] = await Promise.all([fetchRoom(id), fetchAgents()]);
  if (!detail) {
    notFound();
  }
  return (
    <>
      <PageHeading
        title={`Edit ${detail.room.name}`}
        description="Changes apply to the next message."
        backHref={`/rooms/${detail.room.id}`}
        backLabel={detail.room.name}
      />
      <RoomForm crew={crew} room={detail.room} />
    </>
  );
}

export default function EditRoomPage({params}: PageProps<'/rooms/[id]/edit'>) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-8 sm:py-14">
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <EditRoom params={params} />
      </Suspense>
    </div>
  );
}
