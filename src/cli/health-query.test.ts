import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { expect, test, vi } from 'vitest';

const { toArrayMock, limitMock, whereMock, searchMock } = vi.hoisted(() => ({
  toArrayMock: vi.fn().mockResolvedValue([{ id: 'h1' }]),
  limitMock: vi.fn().mockImplementation(() => ({ toArray: toArrayMock })),
  whereMock: vi.fn().mockImplementation(() => ({ limit: limitMock })),
  searchMock: vi.fn().mockImplementation(() => ({ where: whereMock })),
}));
vi.mock('../index/lancedb', () => ({
  connectDB: async () => ({ openTable: async () => ({ search: searchMock }) }),
}));
vi.mock('../providers/selector', () => ({
  withFallback: async (fn: any) => fn({ textEmbed: async () => new Float32Array([1]) }),
}));

import command from './health-query';

test('health-query writes hits', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gutty-'));
  const out = path.join(tmp, 'hits.json');
  await command.parseAsync(['node','test','--vertical','pregnancy','--query','q','--out',out], { from:'node' });
  expect(searchMock).toHaveBeenCalled();
  const res = JSON.parse(await fs.readFile(out,'utf8'));
  expect(res.hits[0].id).toBe('h1');
});

