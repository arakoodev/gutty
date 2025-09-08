import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { expect, test, vi, describe, beforeAll } from 'vitest';

// Mock Gemini API responses - no actual API calls
const mockGeminiIngredients = [
  { name: 'Okra', confidence: 0.9, description: 'Green cooked vegetable pieces' },
  { name: 'Potato', confidence: 0.85, description: 'Light colored cooked chunks' },  
  { name: 'Curry Sauce', confidence: 0.9, description: 'Orange-red liquid base' }
];

// Mock nutrition database responses
const mockNutritionData = {
  individual: [
    {
      ingredient: 'Okra',
      cofid_match: 'Okra, boiled in unsalted water',
      gi_value: 54,
      gl_value: 8,
      energy_kcal: 16,
      protein_g: 1.8,
      carbohydrate_g: 1.9,
      fat_g: 0.2,
      fiber_g: 3.1,
      total_sugars_g: 1.4,
      sodium_mg: 5,
      health_flags: ['low-gi', 'pcos-friendly', 'low-fodmap', 'ibs-friendly']
    },
    {
      ingredient: 'Potato',
      cofid_match: 'Potato, baked',
      gi_value: 85,
      gl_value: 20,
      energy_kcal: 93,
      protein_g: 2.1,
      carbohydrate_g: 21.2,
      fat_g: 0.1,
      fiber_g: 2.2,
      total_sugars_g: 0.9,
      sodium_mg: 6,
      health_flags: ['high-gi', 'pcos-caution']
    }
  ],
  combined: {
    energy_kcal: 54.5,
    protein_g: 1.95,
    carbohydrate_g: 11.55,
    fat_g: 0.15,
    fiber_g: 2.65,
    total_sugars_g: 1.15,
    sodium_mg: 5.5,
    gi_value: 69.5,
    is_low_gi: false,
    is_high_fodmap: false,
    health_flags: ['low-fodmap', 'ibs-friendly']
  }
};

// Mock Gemini completely - no API calls
vi.mock('../src/segmentation/gemini-segmentation', () => ({
  GeminiSegmentation: vi.fn().mockImplementation(() => ({
    segmentFoodImage: vi.fn().mockResolvedValue({
      ingredients: mockGeminiIngredients,
      totalIngredients: mockGeminiIngredients.length,
      processingTime: 15000
    })
  }))
}));

vi.mock('../src/lib/nutrition-matcher', () => ({
  analyzeIngredientsNutrition: vi.fn().mockResolvedValue(mockNutritionData)
}));

// Mock file system for image reading
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: vi.fn().mockImplementation((path) => {
        if (path.includes('test-image')) {
          return Buffer.from('fake-image-data');
        }
        return actual.promises.readFile(path);
      }),
      writeFile: actual.promises.writeFile,
      mkdtemp: actual.promises.mkdtemp
    }
  };
});

import command from '../src/cli/gemini-health-analyze';

describe('Gemini Health Analysis Pipeline', () => {
  let tmpDir: string;
  
  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gutty-test-'));
  });

  test('should perform complete health analysis with Gemini pipeline', async () => {
    const testImagePath = path.join(tmpDir, 'test-image.jpg');
    const outputPath = path.join(tmpDir, 'analysis.json');
    
    // Create fake image file
    await fs.writeFile(testImagePath, Buffer.from('fake-image-data'));
    
    // Run the command
    await command.parseAsync([
      'node', 'test', 
      '--image', testImagePath,
      '--verticals', 'pcos,ibs,endometriosis',
      '--out', outputPath
    ], { from: 'node' });
    
    // Read and validate output
    const result = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    
    // Validate structure matches expected format
    expect(result).toHaveProperty('metadata');
    expect(result).toHaveProperty('step1_ingredient_identification');
    expect(result).toHaveProperty('step2_nutrition_mapping');
    expect(result).toHaveProperty('step3_health_analysis');
    expect(result).toHaveProperty('final_results');
    
    // Validate metadata
    expect(result.metadata.input_image).toBe(testImagePath);
    expect(result.metadata.verticals_analyzed).toEqual(['pcos', 'ibs', 'endometriosis']);
    expect(result.metadata.processing_pipeline).toContain('Gemini 2.5 Flash');
    
    // Validate Step 1: Ingredient identification
    expect(result.step1_ingredient_identification.method).toBe('gemini-2.5-flash');
    expect(result.step1_ingredient_identification.ingredients_found).toBe(3);
    expect(result.step1_ingredient_identification.identified_ingredients).toHaveLength(3);
    expect(result.step1_ingredient_identification.identified_ingredients[0]).toHaveProperty('name');
    expect(result.step1_ingredient_identification.identified_ingredients[0]).toHaveProperty('confidence');
    expect(result.step1_ingredient_identification.identified_ingredients[0]).toHaveProperty('description');
    
    // Validate Step 2: Nutrition mapping
    expect(result.step2_nutrition_mapping.ingredient_mapping).toHaveLength(2);
    expect(result.step2_nutrition_mapping.totals_calculated).toHaveProperty('calories');
    expect(result.step2_nutrition_mapping.totals_calculated).toHaveProperty('gi_value');
    expect(result.step2_nutrition_mapping.database_coverage).toHaveProperty('coverage_percentage');
    
    // Validate Step 3: Health analysis
    expect(result.step3_health_analysis.analysis_by_vertical).toHaveProperty('pcos');
    expect(result.step3_health_analysis.analysis_by_vertical).toHaveProperty('ibs');
    expect(result.step3_health_analysis.analysis_by_vertical).toHaveProperty('endometriosis');
    
    // Validate final results
    expect(result.final_results.ingredient_identification.method).toBe('gemini-2.5-flash');
    expect(result.final_results.summary.processing_success).toBe(true);
  });

  test('should handle PCOS glycemic index analysis correctly', async () => {
    const testImagePath = path.join(tmpDir, 'pcos-test.jpg');
    const outputPath = path.join(tmpDir, 'pcos-analysis.json');
    
    await fs.writeFile(testImagePath, Buffer.from('fake-image-data'));
    
    await command.parseAsync([
      'node', 'test',
      '--image', testImagePath,
      '--verticals', 'pcos',
      '--out', outputPath
    ], { from: 'node' });
    
    const result = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    
    // Should analyze GI impact for PCOS
    const pcosAnalysis = result.step3_health_analysis.analysis_by_vertical.pcos;
    expect(pcosAnalysis).toHaveProperty('triggers_found');
    
    // With mock GI of 69.5 (medium GI), should not trigger high GI warning
    const triggers = pcosAnalysis.triggers_found;
    const highGiWarnings = triggers.filter((t: any) => t.type === 'glycemic_index' && t.severity === 'caution');
    expect(highGiWarnings).toHaveLength(0);
  });

  test('should handle IBS FODMAP analysis correctly', async () => {
    const testImagePath = path.join(tmpDir, 'ibs-test.jpg');
    const outputPath = path.join(tmpDir, 'ibs-analysis.json');
    
    await fs.writeFile(testImagePath, Buffer.from('fake-image-data'));
    
    await command.parseAsync([
      'node', 'test',
      '--image', testImagePath,
      '--verticals', 'ibs',
      '--out', outputPath
    ], { from: 'node' });
    
    const result = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    
    // Should analyze FODMAP content for IBS
    const ibsAnalysis = result.step3_health_analysis.analysis_by_vertical.ibs;
    expect(ibsAnalysis.triggers_found).toBeDefined();
    
    // With mock low FODMAP data, should show positive recommendation
    const triggers = ibsAnalysis.triggers_found;
    expect(triggers.some((t: any) => t.type === 'fodmap_content')).toBe(true);
  });

  test('should handle endometriosis fiber analysis correctly', async () => {
    const testImagePath = path.join(tmpDir, 'endo-test.jpg');
    const outputPath = path.join(tmpDir, 'endo-analysis.json');
    
    await fs.writeFile(testImagePath, Buffer.from('fake-image-data'));
    
    await command.parseAsync([
      'node', 'test',
      '--image', testImagePath,
      '--verticals', 'endometriosis',
      '--out', outputPath
    ], { from: 'node' });
    
    const result = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    
    // Should analyze fiber content for endometriosis
    const endoAnalysis = result.step3_health_analysis.analysis_by_vertical.endometriosis;
    expect(endoAnalysis.triggers_found).toBeDefined();
    
    // With mock fiber of 2.65g (< 5g), should not trigger high fiber recommendation
    const triggers = endoAnalysis.triggers_found;
    const fiberRecommendations = triggers.filter((t: any) => t.type === 'fiber_content');
    expect(fiberRecommendations).toHaveLength(0);
  });

  test('should handle missing nutrition data gracefully', async () => {
    // Mock nutrition matcher to return no matches
    const { analyzeIngredientsNutrition } = await import('../src/lib/nutrition-matcher');
    vi.mocked(analyzeIngredientsNutrition).mockResolvedValueOnce({
      individual: [],
      combined: {
        food_name: 'Unknown recipe',
        energy_kcal: 0,
        carbohydrate_g: 0,
        total_sugars_g: 0,
        protein_g: 0,
        fat_g: 0,
        fiber_g: 0,
        sodium_mg: 0,
        health_flags: ['insufficient-data']
      }
    });
    
    const testImagePath = path.join(tmpDir, 'no-nutrition-test.jpg');
    const outputPath = path.join(tmpDir, 'no-nutrition-analysis.json');
    
    await fs.writeFile(testImagePath, Buffer.from('fake-image-data'));
    
    await command.parseAsync([
      'node', 'test',
      '--image', testImagePath,
      '--verticals', 'pcos',
      '--out', outputPath
    ], { from: 'node' });
    
    const result = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    
    // Should still complete analysis with no nutrition matches
    expect(result.step2_nutrition_mapping.database_coverage.coverage_percentage).toBe(0);
    expect(result.final_results.summary.processing_success).toBe(true);
  });

  test('should use default output path when not specified', async () => {
    const testImagePath = path.join(tmpDir, 'default-output-test.jpg');
    await fs.writeFile(testImagePath, Buffer.from('fake-image-data'));
    
    // Change to tmpDir to control where default file is created
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    
    try {
      await command.parseAsync([
        'node', 'test',
        '--image', testImagePath,
        '--verticals', 'pcos'
      ], { from: 'node' });
      
      // Should create default output file
      const defaultOutput = path.join(tmpDir, 'gemini-health-analysis.json');
      const result = JSON.parse(await fs.readFile(defaultOutput, 'utf8'));
      expect(result.final_results.summary.processing_success).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });
});