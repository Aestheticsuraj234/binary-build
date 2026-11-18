import {describe, expect, it} from 'vitest';

import {AGENT_MESSAGES, agentInputSchema} from './agent-schemas';
import {validate} from './validate';

const nova = {
  name: '  Ada ',
  role: 'Finds, reads and summarizes sources on any topic.',
  instructions: 'Answer with a short summary and a list of sources.',
  avatar: 'nova',
  provider: 'anthropic',
  model: 'claude-sonnet-5-5',
};

describe('agentInputSchema', () => {
  it('accepts a full agent and trims text', () => {
    const result = validate(agentInputSchema, nova);

    expect(result.success && result.data.name).toBe('Ada');
  });

  it('allows empty instructions', () => {
    expect(
      validate(agentInputSchema, {...nova, instructions: ''}).success,
    ).toBe(true);
  });

  it.each([
    ['name', '', AGENT_MESSAGES.nameRequired],
    ['name', 'x'.repeat(41), AGENT_MESSAGES.nameTooLong],
    ['role', ' ', AGENT_MESSAGES.roleRequired],
    ['avatar', 'gandalf', 'Pick a character.'],
    ['provider', 'acme', AGENT_MESSAGES.providerRequired],
  ])('rejects a bad %s', (field, value, message) => {
    const result = validate(agentInputSchema, {...nova, [field]: value});

    expect(!result.success && result.errors[field as keyof typeof nova]).toBe(
      message,
    );
  });

  it("rejects a model the provider doesn't offer", () => {
    const result = validate(agentInputSchema, {...nova, model: 'gpt-5.5'});

    expect(!result.success && result.errors.model).toBe(
      AGENT_MESSAGES.modelInvalid,
    );
  });
});
