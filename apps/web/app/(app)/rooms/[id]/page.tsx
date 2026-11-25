import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {Suspense} from 'react';

import {RoomView} from '@/components/rooms/room-view';
import {Skeleton} from '@/components/ui/skeleton';
import {fetchRoom} from '@/lib/api';

export const metadata: Metadata = {title: 'Room · Binary'};

async function Room({params}: {params: PageProps<'/rooms/[id]'>['params']}) {
  const {id} = await params;
  const detail = await fetchRoom(id);
  if (!detail) {
    notFound();
  }
  return (
    <RoomView
      room={detail.room}
      initialMessages={detail.messages}
      initialComputers={detail.computers}
    />
  );
}

export default function RoomPage({params}: PageProps<'/rooms/[id]'>) {
  return (
    <Suspense fallback={<Skeleton className="m-4 h-[80dvh] rounded-xl" />}>
      <Room params={params} />
    </Suspense>
  );
}
