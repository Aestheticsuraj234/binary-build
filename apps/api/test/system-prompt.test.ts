import {describe, expect, it} from 'vitest';

import {buildSystemPrompt} from '../src/agents/system-prompt';

const ada = {
  name: 'Ada',
  role: 'Finds, reads and summarizes sources on any topic.',
  instructions: 'Answer with a short summary and a list of sources.',
  avatar: 'nova',
};

describe('buildSystemPrompt', () => {
  it('includes the name, job, personality and instructions', () => {
    const prompt = buildSystemPrompt(ada);

    expect(prompt).toContain('You are Ada');
    expect(prompt).toContain(`Your job: ${ada.role}`);
    expect(prompt).toContain(
      'Your personality: Curious, precise and always backs claims with sources.',
    );
    expect(prompt).toContain(ada.instructions);
  });

  it('leaves out the instructions section when there are none', () => {
    expect(buildSystemPrompt({...ada, instructions: ''})).not.toContain(
      'Instructions from',
    );
  });

  it("uses the character's personality, so switching character changes it", () => {
    expect(buildSystemPrompt({...ada, avatar: 'ember'})).toContain(
      'Bold and energetic.',
    );
  });

  it('falls back to Pebble for an unknown character', () => {
    expect(buildSystemPrompt({...ada, avatar: null})).toContain(
      'Quiet, thoughtful and a bit dry-witted.',
    );
  });
});
