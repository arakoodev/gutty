import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { expect, test, vi } from 'vitest';

const execFileAsync = promisify(execFile);

vi.mock('../providers/availability', () => ({
  providerSummary: () => ({ hasVertex: true, hasReplicate: false, hasFal: true })
}));

import fs from 'fs';
vi.spyOn(fs, 'existsSync').mockImplementation((p: fs.PathLike) => p === './Gutty_Data');

import command from './validate';

test('validate reports provider and filesystem status', async () => {
  const logs: string[] = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((msg: any) => { logs.push(String(msg)); });

  const prevKey = process.env.FDC_API_KEY;
  process.env.FDC_API_KEY = 'test';

  await command.parseAsync(['node', 'test'], { from: 'node' });

  const output = logs.join('\n');
  expect(output).toContain('Vertex:    OK');
  expect(output).toContain('Replicate: MISSING');
  expect(output).toContain('Fal:       OK');
  expect(output).toContain('FDC_API_KEY: OK');
  expect(output).toContain('./Gutty_Data exists: true');
  expect(output).toContain('./lancedb exists:  false');

  process.env.FDC_API_KEY = prevKey;
  logSpy.mockRestore();
});

test('npx gutty validate --help shows usage', async () => {
  const { stdout } = await execFileAsync('npx', ['--yes', '--no-install', 'gutty', 'validate', '--help'], {
    cwd: path.resolve(__dirname, '..', '..'),
    env: { ...process.env }
  });
  expect(stdout).toMatch(/Usage:/);
});

