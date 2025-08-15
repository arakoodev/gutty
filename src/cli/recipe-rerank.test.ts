import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { expect, test, vi } from 'vitest';

const { embedBig } = vi.hoisted(() => ({
  embedBig: vi
    .fn()
    .mockResolvedValueOnce(new Float32Array([1, 0])) // query
    .mockResolvedValueOnce(new Float32Array([1, 0])) // cand1
    .mockResolvedValueOnce(new Float32Array([0, 1])), // cand2
}));
vi.mock('../providers/selector', () => ({ withFallback: async (fn: any) => fn({ imageEmbedBig: embedBig }) }));

import command from './recipe-rerank';

test('recipe-rerank rescoring', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gutty-'));
  const candPath = path.join(tmp, 'cand.json');
  const out = path.join(tmp, 'rank.json');
  const candidates = [{ id:'a', image_paths:['a.jpg'] }, { id:'b', image_paths:['b.jpg'] }];
  await fs.writeFile(candPath, JSON.stringify({ candidates }, null, 2));
  await command.parseAsync(['node','test','--image','img.jpg','--candidates',candPath,'--out',out], { from:'node' });
  const resText = await fs.readFile(out, 'utf8');
  const res = JSON.parse(resText);
  expect(Array.isArray(res.ranked)).toBe(true);
  expect(embedBig).toHaveBeenCalledTimes(3);
});

