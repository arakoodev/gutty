import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';

// Test real LanceDB operations without mocking the database layer
// This ensures LanceDB save/load works correctly in CI

describe('Real LanceDB Operations', () => {
  let testDir: string;
  let originalCwd: string;
  
  beforeAll(async () => {
    originalCwd = process.cwd();
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gutty-real-db-test-'));
    process.chdir(testDir);
  });

  afterAll(async () => {
    process.chdir(originalCwd);
    if (testDir) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  test('should create LanceDB table and save/load nutrition data', async () => {
    const { connectDB } = await import('../src/index/lancedb');
    
    // Create a test database connection
    const db = await connectDB();
    
    // Create test nutrition data
    const testNutritionData = [
      {
        food_name: 'Test Apple',
        energy_kcal: 52,
        protein_g: 0.3,
        carbohydrate_g: 14.0,
        fat_g: 0.2,
        nsp_aoac_fibre_g: 2.4,
        total_sugars_g: 10.4,
        sodium_mg: 1
      },
      {
        food_name: 'Test Banana',
        energy_kcal: 89,
        protein_g: 1.1,
        carbohydrate_g: 23.0,
        fat_g: 0.3,
        nsp_aoac_fibre_g: 2.6,
        total_sugars_g: 12.2,
        sodium_mg: 1
      }
    ];

    // Create table and insert data
    const nutritionTable = await db.createTable('test_nutrition', testNutritionData);
    
    // Verify data was saved
    const results = await nutritionTable.query().limit(10).toArray();
    expect(results).toHaveLength(2);
    expect(results[0].food_name).toBe('Test Apple');
    expect(results[0].energy_kcal).toBe(52);
    expect(results[1].food_name).toBe('Test Banana');
    
    // Test querying specific data
    const appleResults = await nutritionTable.query()
      .where("food_name = 'Test Apple'")
      .toArray();
    expect(appleResults).toHaveLength(1);
    expect(appleResults[0].energy_kcal).toBe(52);
  });

  test('should create and query glycemic index table', async () => {
    const { connectDB } = await import('../src/index/lancedb');
    const db = await connectDB();
    
    const testGIData = [
      { food_name: 'Test Apple', gi_value: 38, gl_value: 6 },
      { food_name: 'Test Potato', gi_value: 85, gl_value: 20 }
    ];

    const giTable = await db.createTable('test_gi', testGIData);
    
    const results = await giTable.query().limit(10).toArray();
    expect(results).toHaveLength(2);
    
    const appleGI = results.find(r => r.food_name === 'Test Apple');
    expect(appleGI.gi_value).toBe(38);
    expect(appleGI.gl_value).toBe(6);
  });

  test('should create and query FODMAP table', async () => {
    const { connectDB } = await import('../src/index/lancedb');
    const db = await connectDB();
    
    const testFODMAPData = [
      {
        food_name: 'Test Onion',
        fodmap_level: 'high',
        category: 'vegetable',
        max_serving: '15g',
        oligos: 3.2,
        fructose: 0.1,
        polyols: 0.0,
        lactose: 0.0,
        source: 'Monash',
        notes: 'High in fructans'
      },
      {
        food_name: 'Test Rice',
        fodmap_level: 'low',
        category: 'grain',
        max_serving: '1 cup',
        oligos: 0.0,
        fructose: 0.0,
        polyols: 0.0,
        lactose: 0.0,
        source: 'Monash',
        notes: 'Safe for IBS'
      }
    ];

    const fodmapTable = await db.createTable('test_fodmap', testFODMAPData);
    
    const results = await fodmapTable.query().limit(10).toArray();
    expect(results).toHaveLength(2);
    
    const onionResult = results.find(r => r.food_name === 'Test Onion');
    expect(onionResult.fodmap_level).toBe('high');
    expect(onionResult.oligos).toBe(3.2);
    
    const riceResult = results.find(r => r.food_name === 'Test Rice');
    expect(riceResult.fodmap_level).toBe('low');
  });

  test('should handle database queries with similarity matching', async () => {
    const { connectDB } = await import('../src/index/lancedb');
    const db = await connectDB();
    
    const testData = [
      { food_name: 'Okra, boiled in unsalted water', energy_kcal: 22 },
      { food_name: 'Okra, raw', energy_kcal: 33 },
      { food_name: 'Potato, baked in skin', energy_kcal: 136 },
      { food_name: 'Sweet potato, baked', energy_kcal: 103 }
    ];

    const table = await db.createTable('test_similarity', testData);
    
    // Get all results to simulate similarity search
    const allResults = await table.query().limit(10).toArray();
    expect(allResults).toHaveLength(4);
    
    // Test finding best match for 'okra' (should prefer exact match)
    const okraMatches = allResults.filter(item => 
      item.food_name.toLowerCase().includes('okra')
    );
    expect(okraMatches).toHaveLength(2);
    
    // Test finding best match for 'potato'
    const potatoMatches = allResults.filter(item =>
      item.food_name.toLowerCase().includes('potato')
    );
    expect(potatoMatches).toHaveLength(2);
  });
});

describe('Nutrition Matcher with Real Database Operations', () => {
  let testDir: string;
  let originalCwd: string;
  
  beforeAll(async () => {
    originalCwd = process.cwd();
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gutty-nutrition-real-test-'));
    process.chdir(testDir);
    
    // Create real test databases
    const { connectDB } = await import('../src/index/lancedb');
    const db = await connectDB();
    
    // Create comprehensive nutrition table
    const nutritionData = [
      {
        food_name: 'Okra, boiled in unsalted water',
        energy_kcal: 22,
        protein_g: 2.8,
        carbohydrate_g: 2.8,
        fat_g: 0.4,
        nsp_aoac_fibre_g: 4.0,
        total_sugars_g: 2.5,
        sodium_mg: 3
      },
      {
        food_name: 'Potato, baked in skin',
        energy_kcal: 136,
        protein_g: 4.0,
        carbohydrate_g: 31.7,
        fat_g: 0.2,
        nsp_aoac_fibre_g: 2.5,
        total_sugars_g: 1.6,
        sodium_mg: 8
      },
      {
        food_name: 'White bread',
        energy_kcal: 265,
        protein_g: 9.0,
        carbohydrate_g: 49.0,
        fat_g: 3.2,
        nsp_aoac_fibre_g: 2.7,
        total_sugars_g: 5.0,
        sodium_mg: 520
      },
      {
        food_name: 'Onion, raw',
        energy_kcal: 40,
        protein_g: 1.1,
        carbohydrate_g: 9.3,
        fat_g: 0.1,
        nsp_aoac_fibre_g: 1.7,
        total_sugars_g: 4.2,
        sodium_mg: 4
      }
    ];
    await db.createTable('nutrition_facts', nutritionData);
    
    // Create GI table
    const giData = [
      { food_name: 'Okra', gi_value: 54, gl_value: 8 },
      { food_name: 'Potato, baked', gi_value: 85, gl_value: 20 },
      { food_name: 'White bread', gi_value: 75, gl_value: 11 },
      { food_name: 'Onion', gi_value: 10, gl_value: 1 }
    ];
    await db.createTable('glycemic_index', giData);
    
    // Create FODMAP table
    const fodmapData = [
      {
        food_name: 'Onion',
        fodmap_level: 'high',
        category: 'vegetable',
        max_serving: '15g',
        oligos: 3.2,
        fructose: 0.1,
        polyols: 0.0,
        lactose: 0.0,
        source: 'Monash',
        notes: 'High in fructans'
      },
      {
        food_name: 'Okra',
        fodmap_level: 'low',
        category: 'vegetable',
        max_serving: 'unlimited',
        oligos: 0.0,
        fructose: 0.0,
        polyols: 0.0,
        lactose: 0.0,
        source: 'Monash',
        notes: 'IBS friendly'
      }
    ];
    await db.createTable('fodmap_data', fodmapData);
  });

  afterAll(async () => {
    process.chdir(originalCwd);
    if (testDir) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  test('should match ingredients using real LanceDB queries', async () => {
    const { analyzeIngredientsNutrition } = await import('../src/lib/nutrition-matcher');
    
    // Test with ingredients that should match our test data
    const ingredients = ['okra', 'potato'];
    const result = await analyzeIngredientsNutrition(ingredients);
    
    // Verify we got results from real database lookups
    expect(result.individual.length).toBeGreaterThan(0);
    
    // Check that we found the okra match
    const okraMatch = result.individual.find((item: any) => 
      item.food_name && item.food_name.toLowerCase().includes('okra')
    );
    expect(okraMatch).toBeDefined();
    expect(okraMatch.energy_kcal).toBe(22);
    expect(okraMatch.gi_value).toBe(54);
    expect(okraMatch.health_flags).toContain('low-gi');
    // Okra has 4.0g fiber, but threshold is >= 5g for high-fiber
    expect(okraMatch.health_flags).not.toContain('high-fiber');
    
    // Verify combined calculations work
    expect(result.combined.energy_kcal).toBeGreaterThan(0);
    expect(result.combined.gi_value).toBeGreaterThan(0);
    expect(result.combined.is_low_gi).toBeDefined();
  });

  test('should detect high GI foods with real data', async () => {
    const { analyzeIngredientsNutrition } = await import('../src/lib/nutrition-matcher');
    
    const ingredients = ['white bread'];
    const result = await analyzeIngredientsNutrition(ingredients);
    
    expect(result.individual).toHaveLength(1);
    const breadResult = result.individual[0];
    
    // Should flag high GI (75) from real database
    expect(breadResult.gi_value).toBe(75);
    expect(breadResult.health_flags).toContain('high-gi');
    expect(breadResult.health_flags).toContain('pcos-caution');
    
    // White bread has 520mg sodium, but threshold is > 600mg
    expect(breadResult.health_flags).not.toContain('high-sodium');
  });

  test('should detect FODMAP levels from real database', async () => {
    const { analyzeIngredientsNutrition } = await import('../src/lib/nutrition-matcher');
    
    // Test with mix of high and low FODMAP
    const ingredients = ['onion', 'okra'];
    const result = await analyzeIngredientsNutrition(ingredients);
    
    // Should detect high FODMAP due to onion
    expect(result.combined.is_high_fodmap).toBe(true);
    expect(result.combined.health_flags).toContain('high-fodmap');
    expect(result.combined.health_flags).toContain('ibs-caution');
  });
});