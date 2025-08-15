import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { expect, test } from 'vitest';
import command from './reset';

test('reset removes lancedb and tmp folders', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gutty-'));
  await fs.mkdir(path.join(tmp, 'lancedb'));
  await fs.mkdir(path.join(tmp, 'tmp'));
  const prev = process.cwd();
  process.chdir(tmp);
  await command.parseAsync(['node','test'], { from:'node' });
  const entries = await fs.readdir(tmp);
  expect(entries).not.toContain('lancedb');
  expect(entries).not.toContain('tmp');
  process.chdir(prev);
});

