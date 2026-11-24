import {describe, expect, it} from 'vitest';

import {agentInputSchema} from './agent-schemas';
import {computersSchema} from './computers';
import {validate} from './validate';

describe('computersSchema', () => {
  it('keeps each kind once, in a fixed order', () => {
    expect(
      computersSchema.parse(['browser', 'cloud_sandbox', 'browser']),
    ).toEqual(['cloud_sandbox', 'browser']);
  });

  it('refuses kinds it does not know', () => {
    expect(computersSchema.safeParse(['desktop']).success).toBe(false);
  });

  it('gives new characters no computer', () => {
    const result = validate(agentInputSchema, {
      name: 'Nova',
      role: 'Researches.',
      instructions: '',
      avatar: 'nova',
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
    });
    expect(result.success && result.data.computers).toEqual([]);
  });
});
