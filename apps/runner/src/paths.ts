import {realpath, stat} from 'node:fs/promises';
import {homedir} from 'node:os';
import path from 'node:path';

/** A path the Runner won't touch, with a reason safe to show. */
export class PathRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathRefusedError';
  }
}

/** "~/code" → "/Users/you/code"; relative paths start at `base`. */
export function expandPath(input: string, base: string): string {
  const expanded =
    input === '~' || input.startsWith('~/')
      ? path.join(homedir(), input.slice(1))
      : input;
  return path.resolve(base, expanded);
}

/** True if `child` is `parent` or inside it. Both must be real paths. */
function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

/**
 * The folders you share, and the only places the Runner reads, writes or
 * runs commands. This check happens here, on your computer, whatever the
 * server asks: every path is resolved to its real location (following
 * symlinks and `..`) and refused unless it's inside a shared folder.
 */
export class SharedFolders {
  private constructor(readonly folders: string[]) {}

  /** Checks each folder exists and is a directory, by its real path. */
  static async open(inputs: string[], base: string): Promise<SharedFolders> {
    if (inputs.length === 0) {
      throw new Error('Share at least one folder: --folder ~/code/my-project');
    }
    const folders: string[] = [];
    for (const input of inputs) {
      const full = expandPath(input, base);
      let real: string;
      try {
        real = await realpath(full);
      } catch {
        throw new Error(`${full} doesn't exist.`);
      }
      if (!(await stat(real)).isDirectory()) {
        throw new Error(`${full} isn't a folder.`);
      }
      if (real === path.parse(real).root || real === homedir()) {
        throw new Error(
          `Share a project folder, not ${real === homedir() ? 'your whole home folder' : 'the whole disk'}.`,
        );
      }
      folders.push(real);
    }
    return new SharedFolders([...new Set(folders)]);
  }

  /** Where relative paths start: the first shared folder. */
  get home(): string {
    return this.folders[0]!;
  }

  /**
   * The real path of `input` if it's inside a shared folder, or throws.
   * A path that doesn't exist yet (a new file) is checked through its
   * nearest existing parent, so a symlinked folder can't lead outside.
   */
  async resolve(input: string): Promise<string> {
    const full = expandPath(input, this.home);
    let real: string;
    try {
      real = await realpath(full);
    } catch {
      // Not there yet: check the nearest folder that is.
      let parent = path.dirname(full);
      const rest = [path.basename(full)];
      while (true) {
        try {
          real = path.join(await realpath(parent), ...rest);
          break;
        } catch {
          const up = path.dirname(parent);
          if (up === parent) {
            throw new PathRefusedError(`${full} can't be reached.`);
          }
          rest.unshift(path.basename(parent));
          parent = up;
        }
      }
    }
    if (!this.folders.some(folder => isInside(real, folder))) {
      throw new PathRefusedError(
        `${input} is outside the folders you shared, so this computer refused it.`,
      );
    }
    return real;
  }
}
