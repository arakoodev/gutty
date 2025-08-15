import { expect, test, vi } from 'vitest';

const { createIndexMock } = vi.hoisted(() => ({
  createIndexMock: vi.fn(),
}));
vi.mock('../index/lancedb', () => ({ createIndex: createIndexMock }));

import command from './health-build-index';

test('health-build-index creates index', async () => {
  await command.parseAsync(['node','test'], { from:'node' });
  expect(createIndexMock).toHaveBeenCalledWith('health_docs','emb_sbert');
});

