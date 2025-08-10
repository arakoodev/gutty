import { withRetry } from './retry';
import { expect, test } from 'vitest';

test('retries until success', async () => {
  let attempts = 0;
  const result = await withRetry(async () => {
    attempts++;
    if (attempts < 3) throw new Error('fail');
    return 'ok';
  }, 5, 0);
  expect(result).toBe('ok');
  expect(attempts).toBe(3);
});
