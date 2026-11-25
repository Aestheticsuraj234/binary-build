import {describe, expect, it} from 'vitest';

import {findMentions, ROOM_MESSAGES, roomInputSchema} from './rooms';
import {validate} from './validate';

const team = [
  {id: '1', name: 'Bo'},
  {id: '2', name: 'Bolt'},
  {id: '3', name: 'Nova'},
  {id: '4', name: 'Mr. Pixel'},
];

const ids = (text: string) => findMentions(text, team).map(m => m.id);

describe('findMentions', () => {
  it('finds mentions in the order they appear, once each', () => {
    expect(
      ids('@Nova research it, then @Bolt build it. Thanks @nova!'),
    ).toEqual(['3', '2']);
  });

  it('matches the longest name and whole words only', () => {
    expect(ids('@Bolt and @Bo')).toEqual(['2', '1']);
    expect(ids('@Bolty, are you there?')).toEqual([]);
    expect(ids('mail bo@bolt.com')).toEqual([]);
  });

  it('handles names with spaces and dots', () => {
    expect(ids('Over to (@Mr. Pixel).')).toEqual(['4']);
  });

  it('finds nobody without an @', () => {
    expect(ids('Nova and Bolt')).toEqual([]);
  });
});

describe('roomInputSchema', () => {
  const a = '00000000-0000-4000-8000-000000000001';
  const b = '00000000-0000-4000-8000-000000000002';
  const c = '00000000-0000-4000-8000-000000000003';

  it('takes 2 to 6 characters and a lead among them', () => {
    expect(
      roomInputSchema.safeParse({
        name: 'Launch',
        mode: 'auto',
        agentIds: [a, b],
        leadAgentId: b,
      }).success,
    ).toBe(true);
  });

  it('refuses one character, or a lead from outside', () => {
    expect(
      validate(roomInputSchema, {
        name: 'Solo',
        mode: 'mention',
        agentIds: [a],
        leadAgentId: a,
      }),
    ).toMatchObject({success: false, firstError: ROOM_MESSAGES.tooFew});
    expect(
      validate(roomInputSchema, {
        name: 'Launch',
        mode: 'mention',
        agentIds: [a, b],
        leadAgentId: c,
      }),
    ).toMatchObject({success: false, firstError: ROOM_MESSAGES.leadNotMember});
  });
});
