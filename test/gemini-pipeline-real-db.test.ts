import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';

// Test the complete Gemini pipeline with:
// - Mocked Gemini API (no private keys)  
// - Real LanceDB operations (database save/load)

describe('Gemini Pipeline with Real LanceDB', () => {
  let testDir: string;
  let originalCwd: string;
  
  beforeAll(async () => {
    originalCwd = process.cwd();
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gutty-pipeline-test-'));
    process.chdir(testDir);
    
    // Create test databases with comprehensive data
    const nutritionCsvPath = path.join(testDir, 'nutrition.csv');
    const nutritionData = [
      'food_name,energy_kcal,protein_g,carbohydrate_g,fat_g,nsp_aoac_fibre_g,total_sugars_g,sodium_mg',
      'Okra boiled in unsalted water,22,2.8,2.8,0.4,4.0,2.5,3',
      'Potato baked in skin,136,4.0,31.7,0.2,2.5,1.6,8',
      'Curry almond homemade,328,5.7,3.3,33.4,0.0,1.1,51',
      'White bread,265,9.0,49.0,3.2,2.7,5.0,520'
    ].join('\n');
    await fs.writeFile(nutritionCsvPath, nutritionData);
    
    const giCsvPath = path.join(testDir, 'gi.csv');
    const giData = [
      'food_name,gi_value,gl_value',
      'Okra,54,8',
      'Potato baked,85,20', 
      'Curry,54,8',
      'White bread,75,11'
    ].join('\n');
    await fs.writeFile(giCsvPath, giData);
    
    const fodmapCsvPath = path.join(testDir, 'fodmap.csv');
    const fodmapData = [
      'food_name,fodmap_level,category,max_serving,oligos,fructose,polyols,lactose,source,notes',
      'Onion,high,vegetable,15g,3.2,0.1,0.0,0.0,Monash,High in fructans',
      'Garlic,high,vegetable,1 clove,2.0,0.1,0.0,0.0,Monash,High in fructans',
      'Rice,low,grain,1 cup,0.0,0.0,0.0,0.0,Monash,Safe for IBS',
      'Okra,low,vegetable,unlimited,0.0,0.0,0.0,0.0,Monash,IBS friendly'
    ].join('\n');
    await fs.writeFile(fodmapCsvPath, fodmapData);
    
    // Initialize databases
    const { execa } = await import('execa');
    await execa('node', [path.join(__dirname, '../bin/cli.js'), 'nutrition-index'], { 
      cwd: testDir,
      env: { ...process.env, NODE_ENV: 'test' }
    });
    await execa('node', [path.join(__dirname, '../bin/cli.js'), 'gi-index'], { 
      cwd: testDir,
      env: { ...process.env, NODE_ENV: 'test' }
    });
    await execa('node', [path.join(__dirname, '../bin/cli.js'), 'fodmap-index'], { 
      cwd: testDir,
      env: { ...process.env, NODE_ENV: 'test' }
    });
  });

  afterAll(async () => {
    process.chdir(originalCwd);
    if (testDir) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  test('should complete full pipeline with mocked Gemini and real LanceDB', async () => {
    // Mock Gemini segmentation to return test ingredients
    const mockIngredients = [
      { name: 'Okra', confidence: 0.9, description: 'Green cooked vegetable pieces' },
      { name: 'Potato', confidence: 0.85, description: 'Light colored chunks' },
      { name: 'Curry Sauce', confidence: 0.8, description: 'Orange-red liquid base' }
    ];

    // Mock the Gemini segmentation class
    vi.doMock('../src/segmentation/gemini-segmentation', () => ({
      GeminiSegmentation: vi.fn().mockImplementation(() => ({
        segmentFoodImage: vi.fn().mockResolvedValue({
          ingredients: mockIngredients,
          totalIngredients: mockIngredients.length,
          processingTime: 15000
        })
      }))
    }));

    // Import after mocking
    const { GeminiSegmentation } = await import('../src/segmentation/gemini-segmentation');
    const { analyzeIngredientsNutrition } = await import('../src/lib/nutrition-matcher');

    // Test step 1: Gemini ingredient identification (mocked)
    const segmentation = new GeminiSegmentation();
    const ingredientResult = await segmentation.segmentFoodImage('/fake/image.jpg');
    
    expect(ingredientResult.ingredients).toHaveLength(3);
    expect(ingredientResult.totalIngredients).toBe(3);
    expect(ingredientResult.ingredients[0].name).toBe('Okra');

    // Test step 2: Real LanceDB nutrition lookup
    const ingredientNames = ingredientResult.ingredients.map(ing => ing.name);
    const nutritionResult = await analyzeIngredientsNutrition(ingredientNames);
    
    // Verify real database lookups worked
    expect(nutritionResult.individual.length).toBeGreaterThan(0);
    
    // Check okra match from real database
    const okraMatch = nutritionResult.individual.find((item: any) => 
      item.food_name.toLowerCase().includes('okra')
    );
    expect(okraMatch).toBeDefined();
    expect(okraMatch.energy_kcal).toBe(22); // From test CSV
    expect(okraMatch.gi_value).toBe(54); // From test CSV
    
    // Verify health flags generated from real data
    expect(okraMatch.health_flags).toContain('low-gi');
    expect(okraMatch.health_flags).toContain('pcos-friendly');
    expect(okraMatch.health_flags).toContain('high-fiber'); // 4.0g fiber
    
    // Test combined calculations
    expect(nutritionResult.combined).toHaveProperty('energy_kcal');
    expect(nutritionResult.combined).toHaveProperty('gi_value');
    expect(nutritionResult.combined).toHaveProperty('is_low_gi');
  });

  test('should handle high FODMAP detection with real database', async () => {
    // Mock Gemini to return high-FODMAP ingredients
    const mockIngredients = [
      { name: 'Onion', confidence: 0.95, description: 'Diced white onion' },
      { name: 'Rice', confidence: 0.9, description: 'White rice' }
    ];

    vi.doMock('../src/segmentation/gemini-segmentation', () => ({
      GeminiSegmentation: vi.fn().mockImplementation(() => ({
        segmentFoodImage: vi.fn().mockResolvedValue({
          ingredients: mockIngredients,
          totalIngredients: mockIngredients.length,
          processingTime: 12000
        })
      }))
    }));

    const { analyzeIngredientsNutrition } = await import('../src/lib/nutrition-matcher');
    
    const ingredientNames = mockIngredients.map(ing => ing.name);
    const result = await analyzeIngredientsNutrition(ingredientNames);
    
    // Should detect high FODMAP from real database lookup
    expect(result.combined.is_high_fodmap).toBe(true);
    expect(result.combined.health_flags).toContain('high-fodmap');
    expect(result.combined.health_flags).toContain('ibs-trigger');
  });

  test('should complete CLI command with real database operations', async () => {
    // Create test image file
    const testImagePath = path.join(testDir, 'test-food.jpg');
    await fs.writeFile(testImagePath, Buffer.from('fake-image-data'));
    
    const outputPath = path.join(testDir, 'test-analysis.json');
    
    // Mock the Gemini module at CLI level
    vi.doMock('../src/segmentation/gemini-segmentation', () => ({
      GeminiSegmentation: vi.fn().mockImplementation(() => ({
        segmentFoodImage: vi.fn().mockResolvedValue({
          ingredients: [
            { name: 'Okra', confidence: 0.9, description: 'Green vegetable' },
            { name: 'Potato', confidence: 0.8, description: 'Starchy tuber' }
          ],
          totalIngredients: 2,
          processingTime: 18000
        })
      }))
    }));

    // Import the CLI command after mocking
    const command = await import('../src/cli/gemini-health-analyze');
    
    // Run the CLI command
    await command.default.parseAsync([
      'node', 'test',
      '--image', testImagePath,
      '--verticals', 'pcos,ibs',
      '--out', outputPath
    ], { from: 'node' });
    
    // Verify output file was created
    const outputExists = await fs.access(outputPath).then(() => true).catch(() => false);
    expect(outputExists).toBe(true);
    
    // Read and verify the JSON structure
    const analysis = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    
    // Verify complete pipeline structure
    expect(analysis).toHaveProperty('step1_ingredient_identification');
    expect(analysis).toHaveProperty('step2_nutrition_mapping');
    expect(analysis).toHaveProperty('step3_health_analysis');
    expect(analysis).toHaveProperty('final_results');
    
    // Verify mocked Gemini results
    expect(analysis.step1_ingredient_identification.method).toBe('gemini-2.5-flash');
    expect(analysis.step1_ingredient_identification.ingredients_found).toBe(2);
    
    // Verify real database results in step 2
    expect(analysis.step2_nutrition_mapping.ingredient_mapping).toBeDefined();
    expect(analysis.step2_nutrition_mapping.totals_calculated).toHaveProperty('calories');
    expect(analysis.step2_nutrition_mapping.database_coverage).toHaveProperty('coverage_percentage');
    
    // Verify health analysis used real nutrition data  
    expect(analysis.step3_health_analysis.analysis_by_vertical).toHaveProperty('pcos');
    expect(analysis.step3_health_analysis.analysis_by_vertical).toHaveProperty('ibs');
    
    expect(analysis.final_results.summary.processing_success).toBe(true);
  });

  test('should verify database tables exist and contain test data', async () => {
    const { connectDB } = await import('../src/index/lancedb');
    const { CFG } = await import('../src/config');
    
    const db = await connectDB();
    
    // Test nutrition table
    const nutritionTable = await db.openTable(CFG.storage.nutritionTable);
    const nutritionResults = await nutritionTable.query().limit(5).toArray();
    expect(nutritionResults.length).toBeGreaterThan(0);
    expect(nutritionResults[0]).toHaveProperty('food_name');
    expect(nutritionResults[0]).toHaveProperty('energy_kcal');
    
    // Test GI table
    const giTable = await db.openTable(CFG.storage.glycemicTable);
    const giResults = await giTable.query().limit(5).toArray();
    expect(giResults.length).toBeGreaterThan(0);
    expect(giResults[0]).toHaveProperty('gi_value');
    
    // Test FODMAP table
    const fodmapTable = await db.openTable(CFG.storage.fodmapTable);
    const fodmapResults = await fodmapTable.query().limit(5).toArray();
    expect(fodmapResults.length).toBeGreaterThan(0);
    expect(fodmapResults[0]).toHaveProperty('fodmap_level');
  });
});