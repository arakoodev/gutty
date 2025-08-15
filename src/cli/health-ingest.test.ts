import { expect, test, vi } from 'vitest';

const { ingestMock } = vi.hoisted(() => ({
  ingestMock: vi.fn().mockResolvedValue(3),
}));
vi.mock('../health/ingest', () => ({ ingestHealthKB: ingestMock }));

import command from './health-ingest';

test('health-ingest loads health docs', async () => {
  await command.parseAsync(['node','test','--dir','/kb'], { from:'node' });
  expect(ingestMock).toHaveBeenCalledWith('/kb');
});

