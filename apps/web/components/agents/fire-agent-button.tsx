'use client';

import {useRouter} from 'next/navigation';
import {useState} from 'react';

import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {ApiError, callApi} from '@/lib/client-api';

/** Fires an agent, after asking once to be sure. */
export function FireAgentButton({
  agentId,
  name,
}: {
  agentId: string;
  name: string;
}) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isFiring, setIsFiring] = useState(false);
  const [error, setError] = useState<string>();

  async function fire() {
    setIsFiring(true);
    try {
      await callApi(`/api/agents/${agentId}`, {method: 'DELETE'});
      router.push('/');
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Something went wrong.',
      );
      setIsFiring(false);
    }
  }

  if (!isConfirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="h-11 text-destructive hover:bg-danger-surface hover:text-destructive"
        onClick={() => setIsConfirming(true)}
      >
        Fire {name}
      </Button>
    );
  }

  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">
        {error ?? `Fire ${name}? This can't be undone.`}
      </span>
      <Button
        type="button"
        variant="destructive"
        onClick={fire}
        disabled={isFiring}
      >
        {isFiring && <Spinner />}
        Fire
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setIsConfirming(false)}
        disabled={isFiring}
      >
        Keep
      </Button>
    </div>
  );
}
