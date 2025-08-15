import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { expect, test, vi } from 'vitest';

const { searchMock } = vi.hoisted(() => ({
  searchMock: vi.fn().mockImplementation(() => ({
    where: () => ({ limit: () => ({ toArray: async () => [{ id: 'doc' }] }) }),
  })),
}));
vi.mock('../index/lancedb', () => ({ connectDB: async () => ({ openTable: async () => ({ search: searchMock }) }) }));
vi.mock('../providers/selector', () => ({ withFallback: async (fn: any) => fn({ textEmbed: async () => new Float32Array([1]) }) }));

import command from './health-annotate';

test('health-annotate adds notes and evidence', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gutty-'));
  const recipe = { ingredients:[{name:'shark',qty:1,unit:'fillet'},{name:'sugar',qty:1,unit:'tsp'}] };
  const recipePath = path.join(tmp, 'r.json');
  const out = path.join(tmp, 'ann.json');
  await fs.writeFile(recipePath, JSON.stringify(recipe));
  await command.parseAsync(['node','test','--recipe',recipePath,'--verticals','pregnancy,pcos','--out',out], { from:'node' });
  const res = JSON.parse(await fs.readFile(out,'utf8'));
  expect(res.notes[0].ingredient).toBe('shark');
  expect(res.evidence.length).toBe(2);
});

