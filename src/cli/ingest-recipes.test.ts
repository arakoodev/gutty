import { expect, test, vi } from 'vitest';

const { ingestMock } = vi.hoisted(() => ({
  ingestMock: vi.fn().mockResolvedValue(2),
}));
vi.mock('../recipes/ingest', () => ({ ingestLocalCalData: ingestMock }));

import command from './ingest-recipes';

test('ingest-recipes invokes ingestLocalCalData', async () => {
  await command.parseAsync(['node', 'test', '--dir', '/data'], { from: 'node' });
  expect(ingestMock).toHaveBeenCalledWith('/data');
});

