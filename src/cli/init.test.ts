import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { expect, test } from 'vitest';
import command from './init';

test('init creates workspace folders', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gutty-'));
  const prev = process.cwd();
  process.chdir(tmp);
  await command.parseAsync(['node', 'test'], { from: 'node' });
  const dirs = await fs.readdir(tmp);
  expect(dirs).toContain('lancedb');
  expect(dirs).toContain('tmp');
  process.chdir(prev);
});

