import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { expect, test, vi } from 'vitest';

const { annSearchMock, imageEmbedMock, imageEmbedBigMock, visionJSONMock, mapMock, totalsMock } = vi.hoisted(() => ({
  annSearchMock: vi.fn().mockResolvedValue([
    { id: 'a', image_paths: ['a.jpg'], title: 'A', ingredients: [], servings: 1 },
    { id: 'b', image_paths: ['b.jpg'], title: 'B', ingredients: [], servings: 1 },
  ]),
  imageEmbedMock: vi.fn().mockResolvedValue(new Float32Array([1, 0])),
  imageEmbedBigMock: vi
    .fn()
    .mockResolvedValueOnce(new Float32Array([1, 0]))
    .mockResolvedValueOnce(new Float32Array([1, 0]))
    .mockResolvedValueOnce(new Float32Array([0, 1])),
  visionJSONMock: vi.fn().mockResolvedValue({
    chosenRecipeId: 'a',
    servings: 1,
    ingredients: [{ name: 'x', qty: 1, unit: 'g' }],
  }),
  mapMock: vi.fn().mockResolvedValue([{ name: 'x' }]),
  totalsMock: vi.fn().mockReturnValue({ kcal: 1, protein: 2, fat: 3, carbs: 4 }),
}));
vi.mock('../providers/selector', () => ({
  withFallback: async (fn: any) => fn({ imageEmbed: imageEmbedMock, imageEmbedBig: imageEmbedBigMock, visionJSON: visionJSONMock }),
}));
vi.mock('../index/lancedb', () => ({ annSearch: annSearchMock }));
vi.mock('../nutrition/usda_pipeline', () => ({ mapToUSDA: mapMock, computeTotals: totalsMock }));

import command from './recipe-analyze';

test('recipe-analyze full pipeline', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gutty-'));
  const out = path.join(tmp, 'analysis.json');
  await command.parseAsync(['node','test','--image','img.jpg','--out',out,'--topk','2'], { from:'node' });
  expect(annSearchMock).toHaveBeenCalled();
  expect(imageEmbedMock).toHaveBeenCalled();
  expect(imageEmbedBigMock).toHaveBeenCalled();
  expect(visionJSONMock).toHaveBeenCalled();
  const res = JSON.parse(await fs.readFile(out,'utf8'));
  expect(res.recipe.chosenRecipeId).toBe('a');
  expect(res.totals.kcal).toBe(1);
});

