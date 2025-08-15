import { expect, test, vi } from 'vitest';

const { docs, addMock } = vi.hoisted(() => ({
  docs: [{ id: 'd1', text: 'hello' }],
  addMock: vi.fn(),
}));
vi.mock('../index/lancedb', () => ({
  connectDB: async () => ({
    openTable: async () => ({ toArray: async () => docs, add: addMock }),
  }),
}));
vi.mock('../providers/selector', () => ({
  withFallback: async (fn: any) => fn({ textEmbed: async () => new Float32Array([0.1, 0.2]) }),
}));

import command from './health-embed';

test('health-embed writes embeddings', async () => {
  await command.parseAsync(['node', 'test'], { from: 'node' });
  expect(addMock).toHaveBeenCalledWith(docs, { mode: 'overwrite' });
  expect(docs[0].emb_sbert).toHaveLength(2);
  expect(docs[0].emb_sbert[0]).toBeCloseTo(0.1);
  expect(docs[0].emb_sbert[1]).toBeCloseTo(0.2);
});

