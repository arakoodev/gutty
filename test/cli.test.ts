
import { execa } from 'execa';
import { describe, it, expect } from 'vitest';

describe('CLI Tests', () => {
  it('should run the validate command without errors', async () => {
    const { stdout, stderr } = await execa('node', ['bin/cli.js', 'validate']);
    expect(stderr).toBe('');
    expect(stdout).toContain('Validating providers and API keys...');
  });
});
