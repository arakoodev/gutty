import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { expect, test, vi } from 'vitest';

const { annSearchMock, embedMock } = vi.hoisted(() => {
  return {
    annSearchMock: vi.fn().mockResolvedValue([{id:'x'}]),
    embedMock: vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue(new Float32Array([1,2])),
  };
});

vi.mock('../index/lancedb', () => ({
  annSearch: annSearchMock,
}));
vi.mock('../providers/selector', () => ({
  withFallback: async (fn:any) => fn({ imageEmbed: embedMock })
}));
vi.mock('../providers/availability', () => ({
  requireEmbeddingsProvider: () => {},
}));

import command from './seg-retrieve';

test('retrieves segment matches with progress and retries', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gutty-'));
  const img = path.join(tmp, 'mask.png');
  await fs.writeFile(img, '');
  const out = path.join(tmp, 'out.json');

  await command.parseAsync(['node','test','--masks', tmp, '--out', out, '--progress', out], { from:'node' });

  expect(embedMock).toHaveBeenCalledTimes(2);
  expect(annSearchMock).toHaveBeenCalledTimes(1);
  const res = JSON.parse(await fs.readFile(out, 'utf8'));
  expect(res).toHaveProperty(img);
});
