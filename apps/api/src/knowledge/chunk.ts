/** About how long a passage is, in characters. */
export const CHUNK_SIZE = 1000;
/** How much of the end of one passage starts the next, so no idea is cut. */
export const CHUNK_OVERLAP = 150;

/** Splits text that's too long on its own: by sentence, then by word. */
function splitLong(text: string, size: number): string[] {
  if (text.length <= size) {
    return [text];
  }
  const sentences = text.match(/[^.!?\n]+(?:[.!?]+|\n|$)\s*/g) ?? [text];
  const pieces: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (sentence.length > size) {
      if (current) {
        pieces.push(current.trim());
        current = '';
      }
      // One enormous "sentence" (a table, a minified blob): cut at spaces.
      for (let start = 0; start < sentence.length;) {
        let end = Math.min(start + size, sentence.length);
        const space = sentence.lastIndexOf(' ', end);
        if (end < sentence.length && space > start + size / 2) {
          end = space;
        }
        pieces.push(sentence.slice(start, end).trim());
        start = end;
      }
    } else if (current.length + sentence.length > size) {
      pieces.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) {
    pieces.push(current.trim());
  }
  return pieces.filter(Boolean);
}

/** The last `overlap` characters of `text`, starting on a word. */
function tailOf(text: string, overlap: number): string {
  if (overlap <= 0) {
    return '';
  }
  if (text.length <= overlap) {
    return text;
  }
  const tail = text.slice(-overlap);
  const space = tail.indexOf(' ');
  return space === -1 ? tail : tail.slice(space + 1);
}

/**
 * Cuts a document into passages of about `size` characters that a model can
 * read on their own. It keeps paragraphs together where it can, starts a
 * new passage at each Markdown heading, and repeats the end of each passage
 * at the start of the next.
 */
export function chunkText(
  text: string,
  {size = CHUNK_SIZE, overlap = CHUNK_OVERLAP} = {},
): string[] {
  const paragraphs = text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
    .flatMap(p => splitLong(p, size));

  const chunks: string[] = [];
  let current = '';
  // True while `current` holds only text carried over from the last one.
  let onlyOverlap = false;
  const finish = () => {
    if (current && !onlyOverlap) {
      chunks.push(current);
      current = tailOf(current, overlap);
      onlyOverlap = true;
    }
  };

  for (const paragraph of paragraphs) {
    const isHeading = /^#{1,6}\s/.test(paragraph);
    if (isHeading && current && !onlyOverlap) {
      finish();
      // A new section starts clean, without the last one's ending.
      current = '';
    } else if (current && current.length + paragraph.length + 2 > size) {
      finish();
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;
    onlyOverlap = false;
  }
  finish();
  return chunks;
}
