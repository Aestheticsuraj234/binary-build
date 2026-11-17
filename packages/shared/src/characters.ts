import {z} from 'zod';

/**
 * The cast: every agent is played by one of these original characters. An
 * agent stores its character's id in its `avatar` column. The apps draw the
 * character, and the API adds its personality to the agent's system prompt,
 * so a character changes how an agent talks, not only how it looks.
 */
export const CHARACTER_IDS = [
  'nova',
  'bolt',
  'mimi',
  'sunny',
  'ember',
  'moss',
  'pebble',
  'juno',
] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

export const characterSchema = z.enum(CHARACTER_IDS, {
  error: 'Pick a character.',
});

/** How a character feels right now. The conversation stage switches these. */
export type Mood = 'idle' | 'thinking' | 'talking' | 'happy';

export interface CharacterInfo {
  id: CharacterId;
  name: string;
  /** One line the model reads as "Your personality: …". */
  personality: string;
  /** What the character says before the first message. */
  greeting: string;
  /** Body colour. */
  color: string;
  /** A dark tint of `color`, used behind the character on cards and stages. */
  tint: string;
  /** Ideas for a first message, shown in an empty chat. */
  starters: readonly string[];
}

const GENERAL_STARTERS = [
  'What can you help me with?',
  'Give me a plan for my afternoon.',
  'Explain something new to me in two minutes.',
];

export const CHARACTERS: Record<CharacterId, CharacterInfo> = {
  nova: {
    id: 'nova',
    name: 'Nova',
    personality: 'Curious, precise and always backs claims with sources.',
    greeting: 'Hoo! Give me a topic and I will dig up the good sources.',
    color: '#5ec8d8',
    tint: '#16292d',
    starters: [
      'Find three good sources on pgvector.',
      'Summarize the latest on solid-state batteries.',
      'Compare Postgres and SQLite for a side project.',
    ],
  },
  bolt: {
    id: 'bolt',
    name: 'Bolt',
    personality:
      'Calm, methodical and a little nerdy. Prefers small, safe changes.',
    greeting: 'Beep. Show me the code and I will find the bug.',
    color: '#8b9cff',
    tint: '#1c1f33',
    starters: [
      'Review this function for bugs.',
      'Explain the Strategy pattern with a TypeScript example.',
      'Write a test plan for a sign-up form.',
    ],
  },
  mimi: {
    id: 'mimi',
    name: 'Mimi',
    personality:
      'Organized, warm and polite. Never sends anything without asking.',
    greeting: 'Your inbox is safe with me. Nothing goes out without your okay.',
    color: '#ff8fb1',
    tint: '#2d1a22',
    starters: [
      'Draft a polite reply declining a meeting.',
      'Sort these emails by urgency.',
      'Write a friendly follow-up to a client.',
    ],
  },
  sunny: {
    id: 'sunny',
    name: 'Sunny',
    personality: 'Upbeat and encouraging. Keeps plans short and realistic.',
    greeting: 'Good to see you! Want to plan the day together?',
    color: '#ffd15c',
    tint: '#2b2516',
    starters: [
      'Plan my day around three meetings.',
      'Break my week goal into daily tasks.',
      'Remind me what matters most today.',
    ],
  },
  ember: {
    id: 'ember',
    name: 'Ember',
    personality: 'Bold and energetic. Gets straight to the point.',
    greeting: "Let's get things moving. What's first?",
    color: '#ff8a4c',
    tint: '#2d1c14',
    starters: GENERAL_STARTERS,
  },
  moss: {
    id: 'moss',
    name: 'Moss',
    personality: 'Patient and gentle. Explains things step by step.',
    greeting: 'Take your time. We can go one step at a time.',
    color: '#7bd88f',
    tint: '#172a1d',
    starters: GENERAL_STARTERS,
  },
  pebble: {
    id: 'pebble',
    name: 'Pebble',
    personality: 'Quiet, thoughtful and a bit dry-witted.',
    greeting: 'Hm. Ask me something interesting.',
    color: '#b9bdd6',
    tint: '#20212b',
    starters: GENERAL_STARTERS,
  },
  juno: {
    id: 'juno',
    name: 'Juno',
    personality: 'Dreamy and creative. Full of unexpected ideas.',
    greeting: 'Ooh, a fresh page. What shall we imagine?',
    color: '#b48cff',
    tint: '#231a33',
    starters: GENERAL_STARTERS,
  },
};

/** The cast in display order. */
export const CAST: readonly CharacterInfo[] = CHARACTER_IDS.map(
  id => CHARACTERS[id],
);

/** Who plays each seeded template, so a template feels like a person. */
export const TEMPLATE_CHARACTERS: Record<string, CharacterId> = {
  'research-assistant': 'nova',
  'coding-agent': 'bolt',
  'inbox-manager': 'mimi',
  'personal-assistant': 'sunny',
};

/** The character for a stored `avatar` value. Pebble stands in for unknowns. */
export function characterOf(avatar: string | null | undefined): CharacterInfo {
  const parsed = characterSchema.safeParse(avatar);
  return CHARACTERS[parsed.success ? parsed.data : 'pebble'];
}

// ---------------------------------------------------------------------------
// Drawing. Each character is a list of simple shapes on a 120 × 120 canvas.
// The web app turns them into <svg> elements and the phone app into
// react-native-svg ones, so both draw exactly the same faces.
// ---------------------------------------------------------------------------

interface ShapeStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

export interface CircleShape extends ShapeStyle {
  type: 'circle';
  cx: number;
  cy: number;
  r: number;
}

export interface EllipseShape extends ShapeStyle {
  type: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface RectShape extends ShapeStyle {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  rx?: number;
}

export interface PathShape extends ShapeStyle {
  type: 'path';
  d: string;
}

export type Shape = CircleShape | EllipseShape | RectShape | PathShape;

/**
 * A drawing split into layers, so each app can animate a layer on its own:
 * the eyes blink, the mouth moves while talking, the thought dots float.
 */
export interface CharacterDrawing {
  body: Shape[];
  eyes: Shape[];
  mouth: Shape[];
  /** Thought dots, only while thinking. */
  thought: Shape[];
}

/** Size of the square canvas every drawing uses. */
export const CANVAS_SIZE = 120;

const INK = '#1b1b24';
const WHITE = '#ffffff';
const CHEEK = '#ff7a9a';
const LIME = '#d1fe17';

/** Where a character's face sits, and how its eyes look. */
interface FaceLayout {
  eyeY: number;
  eyeGap: number;
  mouthY: number;
  /** Robot eyes are glowing pills instead of round eyes. */
  screenEyes?: boolean;
  /** Pebble's resting eyes are half closed. */
  sleepyEyes?: boolean;
  mouthColor?: string;
  cheeks?: boolean;
}

const BODY: Record<CharacterId, Shape[]> = {
  nova: [
    {type: 'path', d: 'M30 44 L34 18 L50 34 Z', fill: '#3a9fb0'},
    {type: 'path', d: 'M90 44 L86 18 L70 34 Z', fill: '#3a9fb0'},
    {type: 'circle', cx: 60, cy: 64, r: 36, fill: '#5ec8d8'},
    {type: 'ellipse', cx: 60, cy: 86, rx: 20, ry: 14, fill: '#a7e6ee'},
    {type: 'circle', cx: 47, cy: 60, r: 11, stroke: INK, strokeWidth: 3},
    {type: 'circle', cx: 73, cy: 60, r: 11, stroke: INK, strokeWidth: 3},
    {type: 'path', d: 'M58 60 L62 60', stroke: INK, strokeWidth: 3},
    {type: 'path', d: 'M56 70 L64 70 L60 76 Z', fill: '#f5a142'},
  ],
  bolt: [
    {type: 'path', d: 'M60 30 L60 16', stroke: '#6b7bdf', strokeWidth: 3},
    {type: 'circle', cx: 60, cy: 13, r: 5, fill: LIME},
    {type: 'rect', x: 18, y: 54, width: 8, height: 18, rx: 3, fill: '#6b7bdf'},
    {type: 'rect', x: 94, y: 54, width: 8, height: 18, rx: 3, fill: '#6b7bdf'},
    {
      type: 'rect',
      x: 24,
      y: 30,
      width: 72,
      height: 66,
      rx: 20,
      fill: '#8b9cff',
    },
    {
      type: 'rect',
      x: 34,
      y: 42,
      width: 52,
      height: 42,
      rx: 12,
      fill: '#1c2140',
    },
  ],
  mimi: [
    {type: 'path', d: 'M28 50 L30 18 L54 36 Z', fill: '#ff8fb1'},
    {type: 'path', d: 'M92 50 L90 18 L66 36 Z', fill: '#ff8fb1'},
    {type: 'path', d: 'M33 42 L34 26 L46 35 Z', fill: '#ffc2d4'},
    {type: 'path', d: 'M87 42 L86 26 L74 35 Z', fill: '#ffc2d4'},
    {type: 'circle', cx: 60, cy: 64, r: 36, fill: '#ff8fb1'},
    {
      type: 'path',
      d: 'M26 62 A34 34 0 0 1 94 62',
      stroke: '#3b2a33',
      strokeWidth: 4,
    },
    {type: 'rect', x: 20, y: 56, width: 9, height: 16, rx: 4, fill: '#3b2a33'},
    {
      type: 'path',
      d: 'M25 72 Q28 88 42 88',
      stroke: '#3b2a33',
      strokeWidth: 3,
    },
    {type: 'circle', cx: 43, cy: 88, r: 3, fill: '#3b2a33'},
  ],
  sunny: [
    ...[0, 45, 90, 135, 180, 225, 270, 315].map((angle): Shape => {
      const rad = (angle * Math.PI) / 180;
      const x1 = 60 + Math.cos(rad) * 40;
      const y1 = 64 + Math.sin(rad) * 40;
      const x2 = 60 + Math.cos(rad) * 52;
      const y2 = 64 + Math.sin(rad) * 52;
      return {
        type: 'path',
        d: `M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`,
        stroke: '#f2b632',
        strokeWidth: 5,
      };
    }),
    {type: 'circle', cx: 60, cy: 64, r: 33, fill: '#ffd15c'},
  ],
  ember: [
    {type: 'path', d: 'M26 52 L30 16 L54 38 Z', fill: '#ff8a4c'},
    {type: 'path', d: 'M94 52 L90 16 L66 38 Z', fill: '#ff8a4c'},
    {type: 'path', d: 'M30 26 L30 16 L38 23 Z', fill: '#3b2018'},
    {type: 'path', d: 'M90 26 L90 16 L82 23 Z', fill: '#3b2018'},
    {type: 'circle', cx: 60, cy: 64, r: 36, fill: '#ff8a4c'},
    {type: 'ellipse', cx: 60, cy: 82, rx: 24, ry: 17, fill: '#fff1e6'},
    {type: 'ellipse', cx: 60, cy: 72, rx: 5, ry: 3.5, fill: INK},
  ],
  moss: [
    {type: 'circle', cx: 42, cy: 42, r: 14, fill: '#7bd88f'},
    {type: 'circle', cx: 78, cy: 42, r: 14, fill: '#7bd88f'},
    {type: 'ellipse', cx: 60, cy: 70, rx: 42, ry: 32, fill: '#7bd88f'},
    {type: 'ellipse', cx: 60, cy: 88, rx: 26, ry: 10, fill: '#a5e8b2'},
  ],
  pebble: [
    {
      type: 'path',
      d: 'M24 78 C18 56 30 32 54 30 C72 26 96 36 98 58 C102 80 88 98 60 98 C38 98 28 92 24 78 Z',
      fill: '#b9bdd6',
    },
    {type: 'ellipse', cx: 46, cy: 44, rx: 9, ry: 5, fill: '#d4d7e8'},
    {type: 'circle', cx: 84, cy: 82, r: 3, fill: '#9a9fbd'},
    {type: 'circle', cx: 34, cy: 86, r: 2, fill: '#9a9fbd'},
  ],
  juno: [
    {
      type: 'path',
      d: 'M26 66 C26 40 42 28 60 28 C78 28 94 40 94 66 L94 96 C88 90 82 102 76 96 C70 90 66 102 60 96 C54 90 50 102 44 96 C38 90 32 102 26 96 Z',
      fill: '#b48cff',
    },
    {
      type: 'path',
      d: 'M96 26 L98 32 L104 34 L98 36 L96 42 L94 36 L88 34 L94 32 Z',
      fill: LIME,
    },
  ],
};

const FACE: Record<CharacterId, FaceLayout> = {
  nova: {eyeY: 60, eyeGap: 13, mouthY: 82, cheeks: true},
  bolt: {
    eyeY: 58,
    eyeGap: 11,
    mouthY: 72,
    screenEyes: true,
    mouthColor: LIME,
  },
  mimi: {eyeY: 60, eyeGap: 12, mouthY: 74, cheeks: true},
  sunny: {eyeY: 60, eyeGap: 12, mouthY: 74, cheeks: true},
  ember: {eyeY: 58, eyeGap: 13, mouthY: 81},
  moss: {eyeY: 41, eyeGap: 18, mouthY: 72, cheeks: true},
  pebble: {eyeY: 62, eyeGap: 12, mouthY: 78, sleepyEyes: true},
  juno: {eyeY: 58, eyeGap: 12, mouthY: 74, cheeks: true},
};

/** The eyes for a mood. Thinking looks up and to the side. */
function drawEyes(face: FaceLayout, mood: Mood): Shape[] {
  const xs = [60 - face.eyeGap, 60 + face.eyeGap];
  const y = face.eyeY;

  if (mood === 'happy') {
    // Closed, smiling eyes: ^ ^
    const color = face.screenEyes ? LIME : INK;
    return xs.map(x => ({
      type: 'path',
      d: `M${x - 6} ${y + 2} Q${x} ${y - 6} ${x + 6} ${y + 2}`,
      stroke: color,
      strokeWidth: 3,
    }));
  }

  if (face.screenEyes) {
    const dy = mood === 'thinking' ? -4 : 0;
    return xs.map(x => ({
      type: 'rect',
      x: x - 4,
      y: y - 7 + dy,
      width: 8,
      height: 14,
      rx: 4,
      fill: LIME,
    }));
  }

  const look = mood === 'thinking' ? {dx: 2, dy: -3} : {dx: 0, dy: 0};
  const shapes: Shape[] = [];
  for (const x of xs) {
    shapes.push({type: 'circle', cx: x, cy: y, r: 7, fill: WHITE});
    shapes.push({
      type: 'circle',
      cx: x + look.dx,
      cy: y + look.dy,
      r: 3.8,
      fill: INK,
    });
    shapes.push({
      type: 'circle',
      cx: x + look.dx + 1.3,
      cy: y + look.dy - 1.3,
      r: 1.2,
      fill: WHITE,
    });
    if (face.sleepyEyes && mood === 'idle') {
      // A heavy eyelid over the top half.
      shapes.push({
        type: 'path',
        d: `M${x - 7.5} ${y} A7.5 7.5 0 0 1 ${x + 7.5} ${y} Z`,
        fill: '#a3a8c4',
      });
    }
  }
  return shapes;
}

/** The mouth for a mood, plus rosy cheeks for characters that have them. */
function drawMouth(face: FaceLayout, mood: Mood): Shape[] {
  const color = face.mouthColor ?? INK;
  const y = face.mouthY;
  const shapes: Shape[] = [];

  if (face.cheeks) {
    const cheekY = face.eyeY + 12;
    const cheekGap = face.eyeGap + 9;
    for (const x of [60 - cheekGap, 60 + cheekGap]) {
      shapes.push({
        type: 'ellipse',
        cx: x,
        cy: cheekY,
        rx: 5,
        ry: 3,
        fill: CHEEK,
        opacity: 0.45,
      });
    }
  }

  if (mood === 'talking') {
    shapes.push({
      type: 'ellipse',
      cx: 60,
      cy: y + 1,
      rx: 6,
      ry: 5,
      fill: color,
    });
  } else if (mood === 'happy') {
    shapes.push({
      type: 'path',
      d: `M${60 - 9} ${y - 2} Q60 ${y + 12} ${60 + 9} ${y - 2} Z`,
      fill: color,
    });
  } else if (mood === 'thinking') {
    shapes.push({
      type: 'path',
      d: `M${60 - 4} ${y + 1} L${60 + 5} ${y - 1}`,
      stroke: color,
      strokeWidth: 3,
    });
  } else {
    shapes.push({
      type: 'path',
      d: `M${60 - 7} ${y - 1} Q60 ${y + 6} ${60 + 7} ${y - 1}`,
      stroke: color,
      strokeWidth: 3,
    });
  }
  return shapes;
}

const THOUGHT_DOTS: Shape[] = [
  {type: 'circle', cx: 96, cy: 30, r: 3, fill: WHITE, opacity: 0.8},
  {type: 'circle', cx: 104, cy: 20, r: 4, fill: WHITE, opacity: 0.8},
  {type: 'circle', cx: 113, cy: 9, r: 5, fill: WHITE, opacity: 0.8},
];

/** Every shape needed to draw `character` in `mood`. */
export function drawCharacter(
  character: CharacterId,
  mood: Mood,
): CharacterDrawing {
  const face = FACE[character];
  return {
    body: BODY[character],
    eyes: drawEyes(face, mood),
    mouth: drawMouth(face, mood),
    thought: mood === 'thinking' ? THOUGHT_DOTS : [],
  };
}
