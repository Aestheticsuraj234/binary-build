import type {Mood, Shape} from '@binary/shared';
import {CANVAS_SIZE, characterOf, drawCharacter} from '@binary/shared';
import {useEffect, useState} from 'react';
import type {StyleProp, ViewStyle} from 'react-native';
import {Animated, Easing} from 'react-native';
import Svg, {Circle, Ellipse, G, Path, Rect} from 'react-native-svg';

import {useReducedMotion} from '@/hooks/use-reduced-motion';

interface CharacterFaceProps {
  /** A character id, such as an agent's `avatar`. */
  character: string;
  mood?: Mood;
  size?: number;
  /** Turn off for small, repeated faces such as lists. */
  animated?: boolean;
  style?: StyleProp<ViewStyle>;
}

const MOOD_LABELS: Record<Mood, string> = {
  idle: '',
  thinking: ', thinking',
  talking: ', talking',
  happy: ', happy',
};

/** Draws one shape from the shared character drawing. */
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
        <Circle key={key} cx={shape.cx} cy={shape.cy} r={shape.r} {...style} />
      );
    case 'ellipse':
      return (
        <Ellipse
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
        <Rect
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
      return <Path key={key} d={shape.d} {...style} />;
  }
}

/** How the whole character moves in each mood. */
function moveFor(mood: Mood, value: Animated.Value) {
  const loop = (toValue: number, duration: number) =>
    Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
  switch (mood) {
    case 'happy':
      return loop(1, 260);
    case 'talking':
      return loop(1, 500);
    case 'thinking':
      return loop(1, 1200);
    default:
      return loop(1, 1600);
  }
}

/**
 * One of the cast, drawn with react-native-svg from the same shapes the web
 * app uses. Each mood has its own movement, and the mouth moves while
 * talking. Everything holds still when the phone asks for reduced motion.
 */
export function CharacterFace({
  character,
  mood = 'idle',
  size = 96,
  animated = true,
  style,
}: CharacterFaceProps) {
  const info = characterOf(character);
  const isReducedMotion = useReducedMotion();
  const shouldMove = animated && !isReducedMotion;
  const [motion] = useState(() => new Animated.Value(0));
  // While talking, the mouth flips between open and closed.
  const [isMouthOpen, setIsMouthOpen] = useState(true);

  useEffect(() => {
    if (!shouldMove) {
      motion.setValue(0);
      return;
    }
    const animation = moveFor(mood, motion);
    animation.start();
    return () => animation.stop();
  }, [mood, shouldMove, motion]);

  useEffect(() => {
    if (!shouldMove || mood !== 'talking') {
      return;
    }
    const timer = setInterval(() => setIsMouthOpen(open => !open), 170);
    return () => clearInterval(timer);
  }, [mood, shouldMove]);

  const faceMood: Mood =
    mood === 'talking' && shouldMove && !isMouthOpen ? 'idle' : mood;
  const drawing = drawCharacter(info.id, faceMood);

  const transform =
    mood === 'thinking'
      ? [
          {
            rotate: motion.interpolate({
              inputRange: [0, 1],
              outputRange: ['-3deg', '3deg'],
            }),
          },
        ]
      : [
          {
            translateY: motion.interpolate({
              inputRange: [0, 1],
              outputRange: [0, mood === 'happy' ? -size * 0.06 : -size * 0.025],
            }),
          },
        ];

  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${info.name}${MOOD_LABELS[mood]}`}
      style={[{width: size, height: size, transform}, style]}
    >
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
      >
        <Ellipse
          cx={60}
          cy={112}
          rx={26}
          ry={4}
          fill="#000000"
          opacity={0.35}
        />
        <G>
          {drawing.body.map(renderShape)}
          {drawing.eyes.map(renderShape)}
          {drawing.mouth.map(renderShape)}
        </G>
        <G>{drawing.thought.map(renderShape)}</G>
      </Svg>
    </Animated.View>
  );
}
