import {describe, expect, it} from 'vitest';

import type {Mood} from './characters';
import {
  CAST,
  CHARACTER_IDS,
  characterOf,
  drawCharacter,
  TEMPLATE_CHARACTERS,
} from './characters';

const MOODS: Mood[] = ['idle', 'thinking', 'talking', 'happy'];

describe('characters', () => {
  it('has a cast of eight, each with a personality and a greeting', () => {
    expect(CAST).toHaveLength(8);
    for (const character of CAST) {
      expect(character.personality.length).toBeGreaterThan(10);
      expect(character.greeting.length).toBeGreaterThan(5);
      expect(character.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(character.tint).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('casts a character for every seeded template', () => {
    expect(Object.values(TEMPLATE_CHARACTERS).sort()).toEqual([
      'bolt',
      'mimi',
      'nova',
      'sunny',
    ]);
  });

  it('falls back to Pebble for an unknown avatar', () => {
    expect(characterOf('nova').name).toBe('Nova');
    expect(characterOf('someone-else').name).toBe('Pebble');
    expect(characterOf(null).name).toBe('Pebble');
  });

  it.each(CHARACTER_IDS)('draws %s in every mood', id => {
    for (const mood of MOODS) {
      const drawing = drawCharacter(id, mood);
      expect(drawing.body.length).toBeGreaterThan(0);
      expect(drawing.eyes.length).toBeGreaterThan(0);
      expect(drawing.mouth.length).toBeGreaterThan(0);
    }
  });

  it('shows thought dots only while thinking', () => {
    expect(drawCharacter('nova', 'thinking').thought).toHaveLength(3);
    expect(drawCharacter('nova', 'talking').thought).toHaveLength(0);
  });

  it('changes the face between moods', () => {
    const idle = drawCharacter('sunny', 'idle');
    const happy = drawCharacter('sunny', 'happy');

    expect(happy.eyes).not.toEqual(idle.eyes);
    expect(happy.mouth).not.toEqual(idle.mouth);
  });
});
