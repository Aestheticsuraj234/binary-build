import {describe, expect, it} from 'vitest';

import {agentInputSchema} from './agent-schemas';
import {APPROVAL_MODES, decideTool, readableToolName} from './approvals';
import {validate} from './validate';

describe('the approval policy', () => {
  it('matches the table, mode by mode', () => {
    const table = Object.fromEntries(
      APPROVAL_MODES.map(mode => [
        mode,
        [
          decideTool(mode, 'read'),
          decideTool(mode, 'write'),
          decideTool(mode, 'computer'),
        ],
      ]),
    );
    expect(table).toEqual({
      plan_only: ['never', 'never', 'never'],
      ask_first: ['ask', 'ask', 'ask'],
      auto_reads: ['run', 'ask', 'ask'],
      accept_edits: ['run', 'run', 'ask'],
    });
  });

  it('never runs a computer tool without asking', () => {
    for (const mode of APPROVAL_MODES) {
      expect(decideTool(mode, 'computer')).not.toBe('run');
    }
  });
});

describe('approval mode on agents', () => {
  const agent = {
    name: 'Mimi',
    role: 'Sorts email.',
    instructions: '',
    avatar: 'mimi',
    provider: 'anthropic',
    model: 'claude-sonnet-5-5',
  };

  it('defaults to Auto-approve reads', () => {
    const result = validate(agentInputSchema, agent);
    expect(result.success && result.data.approvalMode).toBe('auto_reads');
  });

  it('accepts every mode and refuses others', () => {
    for (const approvalMode of APPROVAL_MODES) {
      expect(validate(agentInputSchema, {...agent, approvalMode}).success).toBe(
        true,
      );
    }
    expect(
      validate(agentInputSchema, {...agent, approvalMode: 'yolo'}).success,
    ).toBe(false);
  });
});

describe('readableToolName', () => {
  it('turns a tool name into words', () => {
    expect(readableToolName('shop_refund_order')).toBe('shop refund order');
  });
});
