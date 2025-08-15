import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { expect, test, vi } from 'vitest';

const { visionMock } = vi.hoisted(() => ({
  visionMock: vi.fn().mockResolvedValue({ chosenRecipeId: 'a', servings: 1, ingredients: [] }),
}));
vi.mock('../providers/selector', () => ({ withFallback: async (fn: any) => fn({ visionJSON: visionMock }) }));

import command from './recipe-rag';

test('recipe-rag writes consolidated recipe', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gutty-'));
  const rankedPath = path.join(tmp, 'rank.json');
  const out = path.join(tmp, 'recipe.json');
  const ranked = [{ id:'a', title:'t', ingredients:[], servings:1 }];
  await fs.writeFile(rankedPath, JSON.stringify({ ranked }, null, 2));
  await command.parseAsync(['node','test','--image','img.jpg','--candidates',rankedPath,'--out',out], { from:'node' });
  const res = JSON.parse(await fs.readFile(out,'utf8'));
  expect(res.chosenRecipeId).toBe('a');
  expect(visionMock).toHaveBeenCalled();
});

