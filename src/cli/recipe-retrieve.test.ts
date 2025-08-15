import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { expect, test, vi } from 'vitest';

const { annSearchMock } = vi.hoisted(() => ({
  annSearchMock: vi.fn().mockResolvedValue([{ id: 'r1' }]),
}));
vi.mock('../index/lancedb', () => ({ annSearch: annSearchMock }));
vi.mock('../providers/selector', () => ({
  withFallback: async (fn: any) => fn({ imageEmbed: async () => new Float32Array([1,2]) })
}));

import command from './recipe-retrieve';

test('recipe-retrieve writes candidates file', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gutty-'));
  const out = path.join(tmp, 'cand.json');
  await command.parseAsync(['node','test','--image','img.jpg','--out',out,'--topk','1'], { from:'node' });
  expect(annSearchMock).toHaveBeenCalled();
  const j = JSON.parse(await fs.readFile(out,'utf8'));
  expect(j.candidates[0].id).toBe('r1');
});

