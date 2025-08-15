import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { expect, test, vi } from 'vitest';

const { mapMock, totalMock } = vi.hoisted(() => ({
  mapMock: vi.fn().mockResolvedValue([{ name: 'x' }]),
  totalMock: vi.fn().mockReturnValue({ kcal: 1, protein: 2, fat: 3, carbs: 4 }),
}));
vi.mock('../nutrition/usda_pipeline', () => ({ mapToUSDA: mapMock, computeTotals: totalMock }));

import command from './calories';

test('calories computes totals and writes file', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gutty-'));
  const recipe = { title:'r', servings:1, ingredients:[{name:'x',qty:1,unit:'g'}] };
  const recipePath = path.join(tmp, 'r.json');
  const out = path.join(tmp, 'out.json');
  await fs.writeFile(recipePath, JSON.stringify(recipe));
  await command.parseAsync(['node','test','--recipe',recipePath,'--out',out], { from:'node' });
  expect(mapMock).toHaveBeenCalled();
  const res = JSON.parse(await fs.readFile(out,'utf8'));
  expect(res.totals.kcal).toBe(1);
});

