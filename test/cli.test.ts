
import { execa } from 'execa';
import { describe, it, expect } from 'vitest';

describe('CLI Tests', () => {
  it('should run the validate command without errors', async () => {
    const result = await execa('node', ['bin/cli.js', 'validate'], { reject: false });
    expect(result.stdout).toContain('Providers:');
    // Command may exit with 1 if credentials not set up, but shouldn't crash
    expect([0, 1]).toContain(result.exitCode);
  });

  it('should show help for main CLI', async () => {
    const { stdout, exitCode } = await execa('node', ['bin/cli.js', '--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('gutty');
    expect(stdout).toContain('gemini-health-analyze');
  });

  it('should show help for gemini-health-analyze command', async () => {
    const { stdout, exitCode } = await execa('node', ['bin/cli.js', 'gemini-health-analyze', '--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Complete health analysis using Gemini 2.5 Flash');
    expect(stdout).toContain('--image');
    expect(stdout).toContain('--verticals');
  });

  it('should show help for nutrition indexing commands', async () => {
    const commands = ['nutrition-index', 'gi-index', 'fodmap-index'];
    
    for (const cmd of commands) {
      const { stdout, exitCode } = await execa('node', ['bin/cli.js', cmd, '--help']);
      expect(exitCode).toBe(0);
      expect(stdout.toLowerCase()).toContain(cmd.split('-')[0]);
    }
  });

  it('should error on missing required options', async () => {
    const result = await execa('node', ['bin/cli.js', 'gemini-health-analyze'], { reject: false });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('required option');
    expect(result.stderr).toContain('--image');
  });
});
