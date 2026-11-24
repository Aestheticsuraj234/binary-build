import type {ApprovalDecided} from '@binary/shared';
import {API_ERROR_CODES} from '@binary/shared';

import {announceApprovalsChanged} from './approval-events';
import {announceChatsChanged} from './chat-events';
import {ApiError, callApi} from './client-api';

/**
 * Approves or rejects a request. Waits for the tool and the character's
 * follow-up. Resolves to what changed, or to an error message to show.
 */
export async function decideRequest(
  id: string,
  decision: 'approve' | 'reject',
): Promise<
  | {ok: true; decided: ApprovalDecided}
  | {ok: false; message: string; alreadyDecided: boolean}
> {
  try {
    const decided = await callApi<ApprovalDecided>(
      `/api/approvals/${id}/${decision}`,
      {method: 'POST'},
    );
    return {ok: true, decided};
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof ApiError ? error.message : 'Something went wrong.',
      alreadyDecided:
        error instanceof ApiError &&
        error.code === API_ERROR_CODES.alreadyDecided,
    };
  } finally {
    announceApprovalsChanged();
    announceChatsChanged();
  }
}
