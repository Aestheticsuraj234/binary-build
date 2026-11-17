import type {Mood, Shape} from '@binary/shared';
import {CANVAS_SIZE, characterOf, drawCharacter} from '@binary/shared';
import {cn} from 'cn';

interface CharacterFaceProps {
  /** A character id, such as an agent's `avatar`. */
  character: string;
  mood?: Mood;
  /** Width and height in pixels. */
  size?: number;
  /** Turn off for small, repeated faces such as lists. */
  animated?: boolean;
  className?: string;
}

const MOOD_LABELS: Record<Mood, string> = {
  idle: '',
  thinking: ', thinking',
  talking: ', talking',
  happy: ', happy',
};

/** Draws one shape from the shared character drawing as SVG. */
function renderShape(shape: Shape, key: number) {
  const style = {
    fill: shape.fill ?? 'none',
    stroke: shape.stroke,
    strokeWidth: shape.strokeWidth,
    opacity: shape.opacity,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (shape.type) {
    case 'circle':
      return (
        <circle key={key} cx={shape.cx} cy={shape.cy} r={shape.r} {...style} />
      );
    case 'ellipse':
      return (
        <ellipse
          key={key}
          cx={shape.cx}
          cy={shape.cy}
          rx={shape.rx}
          ry={shape.ry}
          {...style}
        />
      );
    case 'rect':
      return (
        <rect
          key={key}
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          rx={shape.rx}
          {...style}
        />
      );
    case 'path':
      return <path key={key} d={shape.d} {...style} />;
  }
}

/**
 * One of the cast, drawn in SVG. The CSS in globals.css animates each mood
 * (a float, a blink, a moving mouth, a bounce) and stops when the device
 * asks for reduced motion.
 */
export function CharacterFace({
  character,
  mood = 'idle',
  size = 96,
  animated = true,
  className,
}: CharacterFaceProps) {
  const info = characterOf(character);
  const drawing = drawCharacter(info.id, mood);

  return (
    <svg
      viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
      width={size}
      height={size}
      role="img"
      aria-label={`${info.name}${MOOD_LABELS[mood]}`}
      data-mood={mood}
      className={cn('character', animated && 'character-animated', className)}
    >
      <ellipse
        className="character-shadow"
        cx={60}
        cy={112}
        rx={26}
        ry={4}
        fill="#000000"
        opacity={0.35}
      />
      <g className="character-body">
        {drawing.body.map(renderShape)}
        <g className="character-eyes">{drawing.eyes.map(renderShape)}</g>
        <g className="character-mouth">{drawing.mouth.map(renderShape)}</g>
      </g>
      <g className="character-thought">{drawing.thought.map(renderShape)}</g>
    </svg>
  );
}
