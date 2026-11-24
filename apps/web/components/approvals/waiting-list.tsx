'use client';

import type {ApprovalSummary} from '@binary/shared';
import {readableToolName} from '@binary/shared';
import {MessageSquareIcon, Repeat2Icon} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useState} from 'react';

import {CharacterFace} from '@/components/characters/character-face';
import {DecisionButtons} from '@/components/chat/tool-call-card';
import {ToolInput} from '@/components/chat/tool-input';
import {formatRunDate} from '@/components/routines/run-status';
import {RiskBadge} from '@/components/tools/risk-badge';
import {decideRequest} from '@/lib/approvals';

/** What a decided request leaves behind until the page reloads. */
interface Outcome {
  text: string;
  threadId: string;
}

function ApprovalCard({
  approval,
  timeZone,
  onDecided,
}: {
  approval: ApprovalSummary;
  timeZone: string | null;
  onDecided: (outcome: Outcome) => void;
}) {
  const router = useRouter();
  const tool = readableToolName(approval.toolName);

  async function decide(decision: 'approve' | 'reject') {
    const result = await decideRequest(approval.id, decision);
    if (!result.ok) {
      if (result.alreadyDecided) {
        router.refresh();
      }
      return result.message;
    }
    const {decided} = result;
    onDecided({
      threadId: approval.threadId,
      text:
        decided.approval.status === 'rejected'
          ? `You rejected ${tool}.`
          : decided.approval.status === 'done'
            ? `You approved ${tool}. ${approval.agentName} replied in the chat.`
            : `You approved ${tool}, but it failed: ${decided.call.error ?? 'unknown error'}`,
    });
    return undefined;
  }

  return (
    <li className="flex flex-col gap-4 rounded-xl border border-warning/40 bg-card p-4">
      <div className="flex items-start gap-3">
        <CharacterFace character={approval.avatar} size={40} animated={false} />
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="font-semibold">{approval.agentName}</span>{' '}
            <span className="text-muted-foreground">wants to</span>{' '}
            <span className="font-medium">{tool}</span>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <RiskBadge risk={approval.risk} />
            {formatRunDate(approval.createdAt, timeZone)}
            {approval.routineName && (
              <span className="inline-flex items-center gap-1">
                <Repeat2Icon aria-hidden className="size-3" />
                {approval.routineName}
              </span>
            )}
          </p>
        </div>
        <Link
          href={`/chats/${approval.threadId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <MessageSquareIcon aria-hidden className="size-4" />
          Chat
        </Link>
      </div>
      <ToolInput name={approval.toolName} input={approval.input} />
      <DecisionButtons
        onDecide={decide}
        label="Approving runs exactly this, once."
      />
    </li>
  );
}

/** "Waiting for you": each request, decided right here. */
export function WaitingList({
  initial,
  timeZone,
}: {
  initial: ApprovalSummary[];
  timeZone: string | null;
}) {
  const [waiting, setWaiting] = useState(initial);
  const [done, setDone] = useState<Outcome[]>([]);

  return (
    <div className="flex flex-col gap-3">
      {done.map(outcome => (
        <p
          key={`${outcome.threadId}:${outcome.text}`}
          role="status"
          className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground"
        >
          {outcome.text}{' '}
          <Link
            href={`/chats/${outcome.threadId}`}
            className="text-foreground underline underline-offset-2"
          >
            Open the chat
          </Link>
        </p>
      ))}
      {waiting.length === 0 ? (
        <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
          Nothing needs your OK right now.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {waiting.map(approval => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              timeZone={timeZone}
              onDecided={outcome => {
                setWaiting(current =>
                  current.filter(other => other.id !== approval.id),
                );
                setDone(current => [outcome, ...current]);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
