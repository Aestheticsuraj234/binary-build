import type {Database} from '@binary/db';
import {ToolImageRepository} from '@binary/db';
import type {ToolImage} from '@binary/shared';

import type {MadeImage} from './provider';

/** The key a tool's output uses for images meant only for the person. */
export const IMAGES_KEY = '__images';
/** What the model is told instead of the images (default: a chart note). */
export const IMAGES_NOTE_KEY = '__imagesNote';

/** A tool output with images the person should see, kept apart. */
export interface WithImages {
  [IMAGES_KEY]?: MadeImage[];
  [IMAGES_NOTE_KEY]?: string;
}

function imagesOf(output: unknown): MadeImage[] {
  if (typeof output !== 'object' || output === null) {
    return [];
  }
  const images = (output as WithImages)[IMAGES_KEY];
  return Array.isArray(images) ? images : [];
}

/**
 * What the model reads from a tool's output: everything but the images,
 * plus a line saying a chart was shown to the person. The model never
 * gets the pixels.
 */
export function forModel(output: unknown): unknown {
  const images = imagesOf(output);
  if (images.length === 0) {
    return output;
  }
  const {
    [IMAGES_KEY]: _images,
    [IMAGES_NOTE_KEY]: note,
    ...rest
  } = output as WithImages & Record<string, unknown>;
  if (note) {
    return {...rest, images: note};
  }
  return {
    ...rest,
    charts:
      images.length === 1
        ? 'Made 1 chart. The person can see it in the chat; you cannot.'
        : `Made ${images.length} charts. The person can see them in the chat; you cannot.`,
  };
}

/**
 * Saves a tool output's images for the person and returns the model's
 * view of the output, plus references to the saved images.
 */
export async function keepImages(
  db: Database,
  owner: {userId: string; threadId: string},
  output: unknown,
): Promise<{output: unknown; images: ToolImage[]}> {
  const images = imagesOf(output);
  if (images.length === 0) {
    return {output, images: []};
  }
  const saved = await new ToolImageRepository(db).saveAll(owner, images);
  return {output: forModel(output), images: saved};
}
