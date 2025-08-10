import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { expect, test, vi } from 'vitest';

const { segMock } = vi.hoisted(() => {
  return {
    segMock: vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue([{ label: 'tomato', mask: Buffer.from('m') }]),
  };
});

vi.mock('../providers/segment', () => ({
  groundedSam2: segMock,
}));

import command from './seg-extract';

test('extracts masks with retry', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gutty-'));
  const img = path.join(tmp, 'img.jpg');
  await fs.writeFile(img, '');
  const out = path.join(tmp, 'out');

  await command.parseAsync(['node', 'test', '--image', img, '--labels', 'tomato', '--out', out], { from: 'node' });

  expect(segMock).toHaveBeenCalledTimes(2);
  const files = await fs.readdir(out);
  expect(files[0]).toMatch(/tomato_0\.png/);
});
