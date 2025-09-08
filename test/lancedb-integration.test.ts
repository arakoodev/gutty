import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';

// Tests that verify real LanceDB operations with mocked Gemini
// This ensures the database layer works correctly in CI

describe('LanceDB Integration Tests', () => {
  let testDir: string;
  
  beforeAll(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gutty-lancedb-test-'));
    // Change to test directory to create databases there
    process.chdir(testDir);
  });

  afterAll(async () => {
    // Clean up test directory
    if (testDir) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  test('should create and query nutrition database', async () => {
    const { execa } = await import('execa');
    
    // Create sample nutrition data
    const nutritionData = [
      { food_name: 'Test Apple', energy_kcal: 52, protein_g: 0.3, carbohydrate_g: 14, fat_g: 0.2 },
      { food_name: 'Test Banana', energy_kcal: 89, protein_g: 1.1, carbohydrate_g: 23, fat_g: 0.3 }
    ];
    
    const nutritionCsvPath = path.join(testDir, 'test-nutrition.csv');
    const csvContent = [
      'food_name,energy_kcal,protein_g,carbohydrate_g,fat_g',
      'Test Apple,52,0.3,14,0.2',
      'Test Banana,89,1.1,23,0.3'
    ].join('\n');
    
    await fs.writeFile(nutritionCsvPath, csvContent);
    
    // Run nutrition-index command to create real LanceDB
    const result = await execa('node', [
      path.join(__dirname, '../bin/cli.js'), 
      'nutrition-index'
    ], { 
      cwd: testDir,
      env: { ...process.env, NODE_ENV: 'test' },
      reject: false 
    });
    
    // Verify database was created
    const lancedbPath = path.join(testDir, 'lancedb');
    const dbExists = await fs.access(lancedbPath).then(() => true).catch(() => false);
    expect(dbExists).toBe(true);
    
    // Test querying the database
    const { connectDB } = await import('../src/index/lancedb');
    const { CFG } = await import('../src/config');
    
    const db = await connectDB();
    const nutritionTable = await db.openTable(CFG.storage.nutritionTable);
    
    const results = await nutritionTable.query().limit(10).toArray();
    expect(results.length).toBeGreaterThan(0);
    
    // Verify data structure
    const firstResult = results[0];
    expect(firstResult).toHaveProperty('food_name');
    expect(firstResult).toHaveProperty('energy_kcal');
    expect(typeof firstResult.energy_kcal).toBe('number');
  });

  test('should create and query glycemic index database', async () => {
    const { execa } = await import('execa');
    
    // Create sample GI data
    const giCsvPath = path.join(testDir, 'test-gi.csv');
    const csvContent = [
      'food_name,gi_value,gl_value',
      'Test Apple,38,6',
      'Test Banana,51,13'
    ].join('\n');
    
    await fs.writeFile(giCsvPath, csvContent);
    
    // Run gi-index command
    const result = await execa('node', [
      path.join(__dirname, '../bin/cli.js'),
      'gi-index'
    ], { 
      cwd: testDir,
      env: { ...process.env, NODE_ENV: 'test' },
      reject: false 
    });
    
    // Test querying GI database
    const { connectDB } = await import('../src/index/lancedb');
    const { CFG } = await import('../src/config');
    
    const db = await connectDB();
    const giTable = await db.openTable(CFG.storage.glycemicTable);
    
    const results = await giTable.query().limit(10).toArray();
    expect(results.length).toBeGreaterThan(0);
    
    const firstResult = results[0];
    expect(firstResult).toHaveProperty('food_name');
    expect(firstResult).toHaveProperty('gi_value');
    expect(typeof firstResult.gi_value).toBe('number');
  });

  test('should create and query FODMAP database', async () => {
    const { execa } = await import('execa');
    
    // Create sample FODMAP data
    const fodmapCsvPath = path.join(testDir, 'test-fodmap.csv');
    const csvContent = [
      'food_name,fodmap_level,category,max_serving',
      'Test Apple,high,fruit,1 medium',
      'Test Banana,low,fruit,1 medium'
    ].join('\n');
    
    await fs.writeFile(fodmapCsvPath, csvContent);
    
    // Run fodmap-index command
    const result = await execa('node', [
      path.join(__dirname, '../bin/cli.js'),
      'fodmap-index'
    ], { 
      cwd: testDir,
      env: { ...process.env, NODE_ENV: 'test' },
      reject: false 
    });
    
    // Test querying FODMAP database
    const { connectDB } = await import('../src/index/lancedb');
    const { CFG } = await import('../src/config');
    
    const db = await connectDB();
    const fodmapTable = await db.openTable(CFG.storage.fodmapTable);
    
    const results = await fodmapTable.query().limit(10).toArray();
    expect(results.length).toBeGreaterThan(0);
    
    const firstResult = results[0];
    expect(firstResult).toHaveProperty('food_name');
    expect(firstResult).toHaveProperty('fodmap_level');
    expect(['low', 'medium', 'high']).toContain(firstResult.fodmap_level);
  });
});

describe('Nutrition Matcher with Real LanceDB', () => {
  let testDir: string;
  
  beforeAll(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gutty-nutrition-test-'));
    process.chdir(testDir);
    
    // Create test nutrition database
    const { execa } = await import('execa');
    
    // Create comprehensive test data
    const nutritionCsvPath = path.join(testDir, 'nutrition.csv');
    const nutritionData = [
      'food_name,energy_kcal,protein_g,carbohydrate_g,fat_g,nsp_aoac_fibre_g,total_sugars_g,sodium_mg',
      'Okra boiled,22,2.8,2.8,0.4,4.0,2.5,3',
      'Potato baked,136,4.0,31.7,0.2,2.5,1.6,8',
      'White bread,265,9.0,49.0,3.2,2.7,5.0,520'
    ].join('\n');
    await fs.writeFile(nutritionCsvPath, nutritionData);
    
    const giCsvPath = path.join(testDir, 'gi.csv');
    const giData = [
      'food_name,gi_value,gl_value',
      'Okra,54,8',
      'Potato baked,85,20',
      'White bread,75,11'
    ].join('\n');
    await fs.writeFile(giCsvPath, giData);
    
    const fodmapCsvPath = path.join(testDir, 'fodmap.csv');
    const fodmapData = [
      'food_name,fodmap_level,category,max_serving,oligos,fructose,polyols,lactose,source,notes',
      'Onion,high,vegetable,15g,3.2,0.1,0.0,0.0,Monash,High in fructans',
      'Rice,low,grain,1 cup,0.0,0.0,0.0,0.0,Monash,Safe for IBS'
    ].join('\n');
    await fs.writeFile(fodmapCsvPath, fodmapData);
    
    // Create databases
    await execa('node', [path.join(__dirname, '../bin/cli.js'), 'nutrition-index'], { cwd: testDir });
    await execa('node', [path.join(__dirname, '../bin/cli.js'), 'gi-index'], { cwd: testDir });
    await execa('node', [path.join(__dirname, '../bin/cli.js'), 'fodmap-index'], { cwd: testDir });
  });

  afterAll(async () => {
    if (testDir) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  test('should match ingredients to nutrition database with real LanceDB queries', async () => {
    const { analyzeIngredientsNutrition } = await import('../src/lib/nutrition-matcher');
    
    const ingredients = ['okra', 'potato'];
    const result = await analyzeIngredientsNutrition(ingredients);
    
    // Verify real database lookups worked
    expect(result.individual).toHaveLength(2);
    
    const okraMatch = result.individual.find((item: any) => item.food_name.toLowerCase().includes('okra'));
    expect(okraMatch).toBeDefined();
    expect(okraMatch.energy_kcal).toBe(22);
    expect(okraMatch.gi_value).toBe(54);
    
    const potatoMatch = result.individual.find((item: any) => item.food_name.toLowerCase().includes('potato'));
    expect(potatoMatch).toBeDefined();
    expect(potatoMatch.energy_kcal).toBe(136);
    expect(potatoMatch.gi_value).toBe(85);
    
    // Verify combined calculations
    expect(result.combined.energy_kcal).toBe((22 + 136) / 2);
    expect(result.combined.gi_value).toBe((54 + 85) / 2);
  });

  test('should detect high FODMAP ingredients with real database', async () => {
    const { analyzeIngredientsNutrition } = await import('../src/lib/nutrition-matcher');
    
    const ingredients = ['onion', 'rice'];
    const result = await analyzeIngredientsNutrition(ingredients);
    
    // Should detect onion as high FODMAP from real database
    expect(result.combined.is_high_fodmap).toBe(true);
    expect(result.combined.health_flags).toContain('high-fodmap');
  });

  test('should generate health flags based on real nutrition data', async () => {
    const { analyzeIngredientsNutrition } = await import('../src/lib/nutrition-matcher');
    
    const ingredients = ['white bread'];
    const result = await analyzeIngredientsNutrition(ingredients);
    
    expect(result.individual).toHaveLength(1);
    const breadResult = result.individual[0];
    
    // Should flag high GI (75)
    expect(breadResult.health_flags).toContain('high-gi');
    expect(breadResult.health_flags).toContain('pcos-caution');
    
    // Should flag high sodium (520mg)
    expect(breadResult.health_flags).toContain('high-sodium');
  });
});