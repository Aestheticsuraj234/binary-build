import type {ApprovalDecided} from '@binary/shared';

import {ApiError, apiJson} from '@/lib/api';

/**
 * Approves or rejects a request. Waits for the tool and the character's
 * follow-up. Resolves to what changed, or an error message to show.
 */
export async function decideRequest(
  id: string,
  decision: 'approve' | 'reject',
): Promise<
  | {ok: true; decided: ApprovalDecided}
  | {ok: false; message: string; alreadyDecided: boolean}
> {
  try {
    return {
      ok: true,
      decided: await apiJson<ApprovalDecided>(
        `/api/approvals/${id}/${decision}`,
        {method: 'POST'},
      ),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      alreadyDecided: error instanceof ApiError && error.status === 409,
    };
  }
}
