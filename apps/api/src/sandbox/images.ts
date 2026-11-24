import type {Database} from '@binary/db';
import {ToolImageRepository} from '@binary/db';
import type {ToolImage} from '@binary/shared';

import type {MadeImage} from './provider';

/** The key a tool's output uses for images meant only for the person. */
export const IMAGES_KEY = '__images';
/** What the model is told instead of the images (default: a chart note). */
export const IMAGES_NOTE_KEY = '__imagesNote';
/** Set when the model must see the images too (a desktop's screen). */
export const IMAGES_FOR_MODEL_KEY = '__imagesForModel';

/** A tool output with images the person should see, kept apart. */
export interface WithImages {
  [IMAGES_KEY]?: MadeImage[];
  [IMAGES_NOTE_KEY]?: string;
  [IMAGES_FOR_MODEL_KEY]?: boolean;
}

/** Whether the model should see this output's images. */
function imagesForModel(output: unknown): boolean {
  return (
    typeof output === 'object' &&
    output !== null &&
    (output as WithImages)[IMAGES_FOR_MODEL_KEY] === true
  );
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
    [IMAGES_FOR_MODEL_KEY]: _forModel,
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

/** The tool result the model reads: JSON, plus the images it should see. */
export function toModelContent(output: unknown):
  | {type: 'json'; value: unknown}
  | {
      type: 'content';
      value: Array<
        | {type: 'text'; text: string}
        | {type: 'image-data'; data: string; mediaType: string}
      >;
    } {
  const view = forModel(output) ?? null;
  if (!imagesForModel(output)) {
    return {type: 'json', value: view};
  }
  return {
    type: 'content',
    value: [
      {type: 'text', text: JSON.stringify(view)},
      ...imagesOf(output).map(image => ({
        type: 'image-data' as const,
        data: image.data,
        mediaType: image.mime,
      })),
    ],
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
): Promise<{
  output: unknown;
  images: ToolImage[];
  /** The images the model must see too (a desktop's screen), if any. */
  modelImages: MadeImage[];
}> {
  const images = imagesOf(output);
  if (images.length === 0) {
    return {output, images: [], modelImages: []};
  }
  const saved = await new ToolImageRepository(db).saveAll(owner, images);
  return {
    output: forModel(output),
    images: saved,
    modelImages: imagesForModel(output) ? images : [],
  };
}
