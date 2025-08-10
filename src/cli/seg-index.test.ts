import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { expect, test, vi } from 'vitest';

const { upsertMock, createIndexMock, embedMock } = vi.hoisted(() => {
  return {
    upsertMock: vi.fn(),
    createIndexMock: vi.fn(),
    embedMock: vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue(new Float32Array([1,2])),
  };
});

vi.mock('../index/lancedb', () => ({
  upsertSegments: upsertMock,
  createIndex: createIndexMock,
}));
vi.mock('../providers/selector', () => ({
  withFallback: async (fn:any) => fn({ imageEmbed: embedMock })
}));
vi.mock('../providers/availability', () => ({
  requireEmbeddingsProvider: () => {},
}));

import command from './seg-index';

test('indexes segments with retries and progress', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gutty-'));
  const ds = path.join(tmp, 'label');
  await fs.mkdir(ds, { recursive: true });
  const img = path.join(ds, 'a.jpg');
  await fs.writeFile(img, '');
  const progress = path.join(tmp, 'prog.json');

  await command.parseAsync(['node', 'test', '--foodseg103', tmp, '--progress', progress], { from:'node' });

  expect(embedMock).toHaveBeenCalledTimes(2);
  expect(upsertMock).toHaveBeenCalledTimes(1);
  const prog = JSON.parse(await fs.readFile(progress, 'utf8'));
  expect(prog.doneIds).toHaveProperty('foodseg103-a.jpg');
  expect(createIndexMock).toHaveBeenCalled();
});
