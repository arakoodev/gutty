import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { expect, test, vi } from 'vitest';

const execFileAsync = promisify(execFile);

// Mock dependencies used inside embed-recipes.ts
const tableAddMock = vi.fn();
const rows = [{ id: 'r1', image_paths: ['img1.jpg'] }];

vi.mock('../index/lancedb', () => ({
  openRecipesOrThrow: async () => ({ add: tableAddMock }),
  getAllRows: async () => rows,
}));

vi.mock('../providers/selector', () => ({
  withFallback: async (fn: any) => {
    const provider = { imageEmbed: async () => new Float32Array([1, 2]) };
    return await fn(provider);
  },
}));

vi.mock('../providers/availability', () => ({
  requireEmbeddingsProvider: () => {},
}));

import command from './embed-recipes';

test('embeds recipes and records progress', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gutty-'));
  const progressPath = path.join(tmpDir, 'progress.json');

  await command.parseAsync(['node', 'test', '--progress', progressPath], { from: 'node' });

  const prog = JSON.parse(await fs.readFile(progressPath, 'utf8'));
  expect(prog.doneIds).toHaveProperty('r1');

  expect(tableAddMock).toHaveBeenCalledTimes(1);
  const addedRows = tableAddMock.mock.calls[0][0];
  expect(addedRows[0].emb_clip_b32).toEqual([1, 2]);
});

test('CLI help runs without provider configuration', async () => {
  const { stdout } = await execFileAsync('node', ['bin/cli.js', 'embed-recipes', '--help'], {
    cwd: path.resolve(__dirname, '..', '..'),
  });
  expect(stdout).toMatch(/Usage:/);
});

