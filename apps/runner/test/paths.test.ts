import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import {homedir, tmpdir} from 'node:os';
import path from 'node:path';

import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import {PathRefusedError, SharedFolders} from '../src/paths';

let root: string;
let project: string;
let secrets: string;
let folders: SharedFolders;

beforeAll(async () => {
  root = await realpath(await mkdtemp(path.join(tmpdir(), 'runner-paths-')));
  project = path.join(root, 'project');
  secrets = path.join(root, 'secrets');
  await mkdir(path.join(project, 'src'), {recursive: true});
  await mkdir(secrets);
  await mkdir(path.join(root, 'project-evil'));
  await writeFile(path.join(project, 'notes.md'), 'Ship the Runner');
  await writeFile(path.join(secrets, 'key.txt'), 'secret');
  // A link inside the project that points outside it.
  await symlink(secrets, path.join(project, 'escape'));
  folders = await SharedFolders.open([project], root);
});

afterAll(async () => {
  await rm(root, {recursive: true, force: true});
});

describe('shared folders', () => {
  it('allows paths inside, relative or absolute', async () => {
    expect(await folders.resolve('notes.md')).toBe(
      path.join(project, 'notes.md'),
    );
    expect(await folders.resolve('.')).toBe(project);
    expect(await folders.resolve(path.join(project, 'src'))).toBe(
      path.join(project, 'src'),
    );
  });

  it('allows a new file inside (it is checked through its folder)', async () => {
    expect(await folders.resolve('src/new/file.ts')).toBe(
      path.join(project, 'src/new/file.ts'),
    );
  });

  it.each([
    ['going up with ..', '../secrets/key.txt'],
    ['an absolute path outside', '/etc/passwd'],
    ['a symlink that leads outside', 'escape/key.txt'],
    ['a new file through that symlink', 'escape/new.txt'],
    ['a folder whose name only starts the same', '../project-evil'],
    ['your home folder', '~'],
  ])('refuses %s', async (_what, input) => {
    await expect(folders.resolve(input)).rejects.toBeInstanceOf(
      PathRefusedError,
    );
  });

  it('says why, in words', async () => {
    await expect(folders.resolve('/etc/passwd')).rejects.toThrow(
      '/etc/passwd is outside the folders you shared, so this computer refused it.',
    );
  });

  it("won't share the whole home folder or disk", async () => {
    await expect(SharedFolders.open([homedir()], root)).rejects.toThrow(
      'not your whole home folder',
    );
    await expect(SharedFolders.open(['/'], root)).rejects.toThrow(
      'the whole disk',
    );
    await expect(SharedFolders.open([], root)).rejects.toThrow(
      'Share at least one folder',
    );
  });
});
