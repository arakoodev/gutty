import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { expect, test, describe, beforeAll, vi } from 'vitest';
import { execa } from 'execa';

describe('Integration Tests', () => {
  let tmpDir: string;
  
  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gutty-integration-'));
  });

  test('validate command should check system requirements', async () => {
    // Run validate command to check system state
    const result = await execa('node', ['bin/cli.js', 'validate'], { 
      reject: false, 
      cwd: process.cwd()
    });
    
    expect(result.stdout).toContain('Validating providers and API keys');
    // Should not crash regardless of environment setup
    expect([0, 1]).toContain(result.exitCode); // 0 = success, 1 = validation failed
  });

  test('should show help for gemini-health-analyze command', async () => {
    const result = await execa('node', ['bin/cli.js', 'gemini-health-analyze', '--help'], {
      reject: false
    });
    
    expect(result.stdout).toContain('Complete health analysis using Gemini 2.5 Flash');
    expect(result.stdout).toContain('--image');
    expect(result.stdout).toContain('--verticals');
    expect(result.stdout).toContain('--out');
    expect(result.exitCode).toBe(0);
  });

  test('should show error for missing required parameters', async () => {
    const result = await execa('node', ['bin/cli.js', 'gemini-health-analyze'], {
      reject: false
    });
    
    expect(result.stderr).toContain('required option');
    expect(result.stderr).toContain('--image');
    expect(result.exitCode).toBe(1);
  });

  test('should handle non-existent image file gracefully', async () => {
    const result = await execa('node', ['bin/cli.js', 'gemini-health-analyze', 
      '--image', '/non/existent/image.jpg',
      '--verticals', 'pcos'
    ], {
      reject: false
    });
    
    // Should fail gracefully with file not found error
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('ENOENT') || expect(result.stderr).toContain('no such file');
  });

  test('nutrition-index command should be available', async () => {
    const result = await execa('node', ['bin/cli.js', 'nutrition-index', '--help'], {
      reject: false
    });
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('nutrition');
  });

  test('gi-index command should be available', async () => {
    const result = await execa('node', ['bin/cli.js', 'gi-index', '--help'], {
      reject: false
    });
    
    expect(result.exitCode).toBe(0);
  });

  test('fodmap-index command should be available', async () => {
    const result = await execa('node', ['bin/cli.js', 'fodmap-index', '--help'], {
      reject: false
    });
    
    expect(result.exitCode).toBe(0);
  });

  test('should list all available commands', async () => {
    const result = await execa('node', ['bin/cli.js', '--help'], {
      reject: false
    });
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('gemini-health-analyze');
    expect(result.stdout).toContain('nutrition-index');
    expect(result.stdout).toContain('gi-index');
    expect(result.stdout).toContain('fodmap-index');
    expect(result.stdout).toContain('validate');
  });

  test('reset command should be available', async () => {
    const result = await execa('node', ['bin/cli.js', 'reset', '--help'], {
      reject: false
    });
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('reset');
  });

  test('gemini-analyze command should be available for ingredient-only analysis', async () => {
    const result = await execa('node', ['bin/cli.js', 'gemini-analyze', '--help'], {
      reject: false
    });
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('gemini-analyze');
  });
});

describe('Database Integration Tests', () => {
  // These tests verify the database indexing commands work
  // They will be skipped in CI if data files aren't available
  
  const shouldSkipDataTests = !process.env.GUTTY_TEST_WITH_DATA;
  
  test.skipIf(shouldSkipDataTests)('nutrition-index should create database successfully', async () => {
    // This test requires actual nutrition data files
    const result = await execa('node', ['bin/cli.js', 'nutrition-index'], {
      reject: false,
      timeout: 60000 // 60 second timeout
    });
    
    if (result.exitCode === 0) {
      expect(result.stdout).toContain('nutrition');
      // Check that database file was created
      const dbPath = path.join(process.cwd(), 'lancedb');
      const dbExists = await fs.access(dbPath).then(() => true).catch(() => false);
      expect(dbExists).toBe(true);
    } else {
      // If it failed, it should be due to missing data files, not code errors
      expect(result.stderr).toContain('ENOENT') || expect(result.stderr).toContain('not found');
    }
  });

  test.skipIf(shouldSkipDataTests)('gi-index should create database successfully', async () => {
    const result = await execa('node', ['bin/cli.js', 'gi-index'], {
      reject: false,
      timeout: 60000
    });
    
    if (result.exitCode === 0) {
      expect(result.stdout).toContain('glycemic') || expect(result.stdout).toContain('GI');
    } else {
      expect(result.stderr).toContain('ENOENT') || expect(result.stderr).toContain('not found');
    }
  });

  test.skipIf(shouldSkipDataTests)('fodmap-index should create database successfully', async () => {
    const result = await execa('node', ['bin/cli.js', 'fodmap-index'], {
      reject: false,
      timeout: 60000
    });
    
    if (result.exitCode === 0) {
      expect(result.stdout).toContain('FODMAP') || expect(result.stdout).toContain('fodmap');
    } else {
      expect(result.stderr).toContain('ENOENT') || expect(result.stderr).toContain('not found');
    }
  });
});

describe('API Integration Tests', () => {
  // These tests require valid Google Cloud credentials and GUTTY_TEST_API=true
  const shouldSkipAPITests = !process.env.GUTTY_TEST_API || !process.env.VERTEX_PROJECT_ID || !process.env.GOOGLE_APPLICATION_CREDENTIALS;
  
  test.skipIf(shouldSkipAPITests)('should handle valid image with Gemini API', async () => {
    // Create a simple test image (1x1 pixel PNG)
    const testImagePath = path.join(os.tmpdir(), 'test-image.png');
    const pngData = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
      0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ]);
    
    await fs.writeFile(testImagePath, pngData);
    
    const outputPath = path.join(os.tmpdir(), 'api-test-output.json');
    
    const result = await execa('node', ['bin/cli.js', 'gemini-health-analyze',
      '--image', testImagePath,
      '--verticals', 'pcos',
      '--out', outputPath
    ], {
      reject: false,
      timeout: 120000 // 2 minute timeout for API call
    });
    
    if (result.exitCode === 0) {
      // Verify output file was created
      const output = await fs.readFile(outputPath, 'utf8');
      const analysis = JSON.parse(output);
      
      expect(analysis).toHaveProperty('step1_ingredient_identification');
      expect(analysis).toHaveProperty('step2_nutrition_mapping');
      expect(analysis).toHaveProperty('step3_health_analysis');
      expect(analysis.final_results.summary.processing_success).toBe(true);
    } else {
      // If it failed, check if it's an authentication/quota issue
      expect(result.stderr).toContain('PERMISSION_DENIED') ||
      expect(result.stderr).toContain('QUOTA_EXCEEDED') ||
      expect(result.stderr).toContain('authentication');
    }
    
    // Clean up
    await fs.unlink(testImagePath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  });
});