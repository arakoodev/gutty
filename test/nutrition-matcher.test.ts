import { expect, test, vi, describe, beforeEach } from 'vitest';

// Mock LanceDB responses
const mockNutritionTable = {
  query: vi.fn().mockReturnValue({
    limit: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          food_name: 'Okra, boiled in unsalted water',
          energy_kcal: 16,
          protein_g: 1.8,
          carbohydrate_g: 1.9,
          fat_g: 0.2,
          nsp_aoac_fibre_g: 3.1,
          total_sugars_g: 1.4,
          sodium_mg: 5
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
        }
      ])
    })
  })
};

const mockGITable = {
  query: vi.fn().mockReturnValue({
    limit: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          food_name: 'Okra',
          gi_value: 54,
          gl_value: 8
        },
        {
          food_name: 'Potato, baked',
          gi_value: 85,
          gl_value: 20
        }
      ])
    })
  })
};

const mockFODMAPTable = {
  query: vi.fn().mockReturnValue({
    limit: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          food_name: 'Onion',
          fodmap_level: 'high',
          category: 'Oligos',
          max_serving: '15g',
          oligos: 3.2,
          fructose: 0.1,
          polyols: 0.0,
          lactose: 0.0,
          source: 'Monash',
          notes: 'High in fructans'
        },
        {
          food_name: 'Rice',
          fodmap_level: 'low',
          category: 'Grains',
          max_serving: '1 cup',
          oligos: 0.0,
          fructose: 0.0,
          polyols: 0.0,
          lactose: 0.0,
          source: 'Monash',
          notes: 'Safe for most IBS patients'
        }
      ])
    })
  })
};

// Mock LanceDB connection
vi.mock('../src/index/lancedb', () => ({
  connectDB: vi.fn().mockResolvedValue({
    openTable: vi.fn().mockImplementation((tableName) => {
      if (tableName.includes('nutrition')) return mockNutritionTable;
      if (tableName.includes('glycemic')) return mockGITable;
      if (tableName.includes('fodmap')) return mockFODMAPTable;
      throw new Error(`Unknown table: ${tableName}`);
    })
  }),
  getAllRows: vi.fn().mockResolvedValue([])
}));

// Mock config
vi.mock('../src/config', () => ({
  CFG: {
    storage: {
      nutritionTable: 'nutrition_data',
      glycemicTable: 'glycemic_index', 
      fodmapTable: 'fodmap_data'
    }
  }
}));

import { analyzeIngredientsNutrition } from '../src/lib/nutrition-matcher';

describe('NutritionMatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should match ingredients to nutrition database', async () => {
    const ingredients = ['okra', 'potato'];
    
    const result = await analyzeIngredientsNutrition(ingredients);
    
    expect(result.individual).toHaveLength(2);
    expect(result.individual[0].food_name).toBe('Okra, boiled in unsalted water');
    expect(result.individual[0].energy_kcal).toBe(16);
    expect(result.individual[0].gi_value).toBe(54);
    expect(result.individual[0].is_low_gi).toBe(true);
    
    expect(result.individual[1].food_name).toBe('Potato, baked in skin');
    expect(result.individual[1].gi_value).toBe(85);
    expect(result.individual[1].is_low_gi).toBe(false);
  });

  test('should calculate combined nutrition values', async () => {
    const ingredients = ['okra', 'potato'];
    
    const result = await analyzeIngredientsNutrition(ingredients);
    
    // Should average the individual nutrition values
    expect(result.combined.energy_kcal).toBe((16 + 136) / 2);
    expect(result.combined.protein_g).toBe((1.8 + 4.0) / 2);
    expect(result.combined.carbohydrate_g).toBe((1.9 + 31.7) / 2);
    expect(result.combined.gi_value).toBe((54 + 85) / 2);
    expect(result.combined.is_low_gi).toBe(false); // Average GI is 69.5, not low
  });

  test('should generate appropriate health flags', async () => {
    const ingredients = ['okra'];
    
    const result = await analyzeIngredientsNutrition(ingredients);
    
    const flags = result.individual[0].health_flags;
    expect(flags).toContain('low-gi');
    expect(flags).toContain('pcos-friendly');
    expect(flags).toContain('high-fiber'); // 3.1g fiber
    expect(flags).toContain('endometriosis-friendly');
  });

  test('should handle high GI ingredients', async () => {
    mockNutritionTable.query.mockReturnValueOnce({
      limit: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          {
            food_name: 'White bread',
            energy_kcal: 265,
            protein_g: 9.0,
            carbohydrate_g: 49.0,
            fat_g: 3.2,
            nsp_aoac_fibre_g: 2.7,
            total_sugars_g: 5.0,
            sodium_mg: 520
          }
        ])
      })
    });

    mockGITable.query.mockReturnValueOnce({
      limit: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          {
            food_name: 'White bread',
            gi_value: 75,
            gl_value: 11
          }
        ])
      })
    });

    const ingredients = ['white bread'];
    
    const result = await analyzeIngredientsNutrition(ingredients);
    
    const flags = result.individual[0].health_flags;
    expect(flags).toContain('high-gi');
    expect(flags).toContain('pcos-caution');
    expect(flags).toContain('high-sodium'); // 520mg sodium
  });

  test('should detect high FODMAP ingredients', async () => {
    const ingredients = ['onion'];
    
    const result = await analyzeIngredientsNutrition(ingredients);
    
    expect(result.combined.is_high_fodmap).toBe(true);
    expect(result.combined.health_flags).toContain('high-fodmap');
    expect(result.combined.health_flags).toContain('ibs-trigger');
  });

  test('should handle ingredients with no matches', async () => {
    mockNutritionTable.query.mockReturnValueOnce({
      limit: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([])
      })
    });

    const ingredients = ['unknown-ingredient'];
    
    const result = await analyzeIngredientsNutrition(ingredients);
    
    expect(result.individual).toHaveLength(0);
    expect(result.combined.health_flags).toContain('insufficient-data');
  });

  test('should handle database connection errors gracefully', async () => {
    // Mock database error
    const { connectDB } = await import('../src/index/lancedb');
    vi.mocked(connectDB).mockRejectedValueOnce(new Error('Database connection failed'));

    const ingredients = ['okra'];
    
    const result = await analyzeIngredientsNutrition(ingredients);
    
    // Should return default values on error
    expect(result.combined.health_flags).toContain('insufficient-data');
    expect(result.individual).toHaveLength(0);
  });

  test('should normalize food names for better matching', async () => {
    // Test that "Okra (fresh)" matches "Okra, boiled in unsalted water"
    const ingredients = ['Okra (fresh)'];
    
    const result = await analyzeIngredientsNutrition(ingredients);
    
    expect(result.individual).toHaveLength(1);
    expect(result.individual[0].food_name).toBe('Okra, boiled in unsalted water');
  });

  test('should calculate fiber content correctly for endometriosis analysis', async () => {
    const ingredients = ['okra']; // 3.1g fiber
    
    const result = await analyzeIngredientsNutrition(ingredients);
    
    expect(result.combined.fiber_g).toBe(3.1);
    const flags = result.individual[0].health_flags;
    expect(flags).toContain('high-fiber');
    expect(flags).toContain('endometriosis-friendly');
  });

  test('should handle mixed FODMAP ingredients', async () => {
    mockNutritionTable.query.mockReturnValueOnce({
      limit: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { food_name: 'Onion', energy_kcal: 40, protein_g: 1.1, carbohydrate_g: 9.3, fat_g: 0.1, nsp_aoac_fibre_g: 1.7, total_sugars_g: 4.2, sodium_mg: 4 },
          { food_name: 'Rice', energy_kcal: 130, protein_g: 2.7, carbohydrate_g: 28, fat_g: 0.3, nsp_aoac_fibre_g: 0.4, total_sugars_g: 0.1, sodium_mg: 1 }
        ])
      })
    });

    const ingredients = ['onion', 'rice']; // Mixed: high FODMAP + low FODMAP
    
    const result = await analyzeIngredientsNutrition(ingredients);
    
    // Should be flagged as high FODMAP due to onion
    expect(result.combined.is_high_fodmap).toBe(true);
    expect(result.combined.health_flags).toContain('high-fodmap');
  });
});