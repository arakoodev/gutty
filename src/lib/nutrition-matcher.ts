import { connectDB } from "../index/lancedb";
import { CFG } from "../config";

interface NutritionData {
  food_name: string;
  energy_kcal: number;
  carbohydrate_g: number;
  total_sugars_g: number;
  protein_g: number;
  fat_g: number;
  nsp_aoac_fibre_g: number;
  sodium_mg: number;
}

interface GlycemicData {
  food_name: string;
  gi_value: number;
  gl_value: number;
  category: string;
}

interface CombinedNutritionData {
  food_name: string;
  energy_kcal: number;
  carbohydrate_g: number;
  total_sugars_g: number;
  protein_g: number;
  fat_g: number;
  fiber_g: number;
  sodium_mg: number;
  gi_value?: number;
  gl_value?: number;
  gi_category?: string;
  is_low_gi?: boolean;
  is_high_fodmap?: boolean;
  health_flags: string[];
}

// Common food name normalizations for matching
function normalizeFood(name: string): string {
  return name
    .toLowerCase()
    .replace(/,.*$/, '') // Remove everything after comma
    .replace(/\(.*?\)/g, '') // Remove parentheses content
    .replace(/[^\w\s]/g, ' ') // Replace special characters with spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

// Calculate similarity between two food names
function calculateSimilarity(name1: string, name2: string): number {
  const norm1 = normalizeFood(name1);
  const norm2 = normalizeFood(name2);
  
  // Exact match
  if (norm1 === norm2) return 1.0;
  
  // Word overlap scoring
  const words1 = norm1.split(' ');
  const words2 = norm2.split(' ');
  
  let commonWords = 0;
  for (const word1 of words1) {
    if (words2.includes(word1) && word1.length > 2) {
      commonWords++;
    }
  }
  
  const totalWords = Math.max(words1.length, words2.length);
  if (totalWords === 0) return 0;
  
  const baseScore = commonWords / totalWords;
  
  // Boost score if one name contains the other
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    return Math.max(baseScore, 0.7);
  }
  
  return baseScore;
}

interface FODMAPData {
  food_name: string;
  fodmap_level: string;
  category: string;
  max_serving: string;
  oligos: number;
  fructose: number;
  polyols: number;
  lactose: number;
  source: string;
  notes: string;
}

// Check if food is likely high in FODMAPs using database
async function isHighFODMAP(foodName: string): Promise<boolean> {
  try {
    const db = await connectDB();
    const table = await db.openTable(CFG.storage.fodmapTable);
    
    // Get all FODMAP entries to search through
    const allEntries = await table.query().limit(500).toArray() as FODMAPData[];
    
    const normalized = normalizeFood(foodName);
    
    // Find matching FODMAP foods
    const matches = allEntries
      .filter(entry => {
        const entryNormalized = normalizeFood(entry.food_name);
        return calculateSimilarity(normalized, entryNormalized) > 0.7 || 
               normalized.includes(entryNormalized) || 
               entryNormalized.includes(normalized);
      })
      .sort((a, b) => {
        const simA = calculateSimilarity(normalized, normalizeFood(a.food_name));
        const simB = calculateSimilarity(normalized, normalizeFood(b.food_name));
        return simB - simA;
      });
    
    if (matches.length > 0) {
      const bestMatch = matches[0];
      return bestMatch.fodmap_level === 'high' || bestMatch.fodmap_level === 'medium';
    }
    
    return false;
  } catch (error) {
    console.warn(`Warning: Could not check FODMAP status for ${foodName}: ${error}`);
    // Fallback to hardcoded check for critical high-FODMAP foods
    const normalized = normalizeFood(foodName);
    const criticalHighFodmap = ['onion', 'garlic', 'wheat', 'beans', 'apple', 'milk'];
    return criticalHighFodmap.some(fodmap => normalized.includes(fodmap));
  }
}

// Generate health flags based on nutrition data
function generateHealthFlags(nutrition: CombinedNutritionData): string[] {
  const flags: string[] = [];
  
  // PCOS/Insulin resistance flags
  if (nutrition.gi_value && nutrition.gi_value >= 70) {
    flags.push('high-gi');
    flags.push('pcos-caution');
  } else if (nutrition.gi_value && nutrition.gi_value <= 55) {
    flags.push('low-gi');
    flags.push('pcos-friendly');
  }
  
  if (nutrition.total_sugars_g > 15) {
    flags.push('high-sugar');
    flags.push('pcos-caution');
  }
  
  if (nutrition.fiber_g >= 5) {
    flags.push('high-fiber');
    flags.push('pcos-friendly');
    flags.push('endometriosis-friendly');
  }
  
  // IBS flags
  if (nutrition.is_high_fodmap) {
    flags.push('high-fodmap');
    flags.push('ibs-caution');
  } else {
    flags.push('low-fodmap');
    flags.push('ibs-friendly');
  }
  
  // High sodium (problematic for many conditions)
  if (nutrition.sodium_mg > 600) { // >600mg per serving
    flags.push('high-sodium');
  }
  
  // Anti-inflammatory (good for endometriosis)
  if (nutrition.fat_g > 0 && nutrition.fiber_g > 3) {
    flags.push('anti-inflammatory-potential');
    flags.push('endometriosis-friendly');
  }
  
  return flags;
}

export async function lookupNutritionWithGI(foodName: string): Promise<CombinedNutritionData | null> {
  try {
    const db = await connectDB();
    
    // Try to find nutrition data
    let nutritionTable, giTable;
    try {
      nutritionTable = await db.openTable(CFG.storage.nutritionTable);
    } catch (error) {
      console.log(`⚠️  Nutrition table not found: ${error}`);
      return null;
    }
    
    try {
      giTable = await db.openTable(CFG.storage.glycemicTable);
    } catch (error) {
      console.log(`⚠️  GI table not found: ${error}`);
      giTable = null;
    }
    
    // Get all nutrition data (fallback to full scan)
    let nutritionResults: any[] = [];
    try {
      // Try using query first
      nutritionResults = await nutritionTable.query().limit(3000).toArray();
    } catch (error) {
      console.log("   Vector search failed, trying table scan...");
      try {
        // Fallback to getting all rows
        const { getAllRows } = await import("../index/lancedb");
        nutritionResults = await getAllRows(nutritionTable);
        nutritionResults = nutritionResults.slice(0, 3000); // Limit for performance
      } catch (error2) {
        console.log(`⚠️  Could not access nutrition data: ${error2}`);
        return null;
      }
    }
    
    // Find best nutrition match
    let bestNutritionMatch: any = null;
    let bestNutritionScore = 0;
    
    for (const result of nutritionResults) {
      const similarity = calculateSimilarity(foodName, result.food_name);
      if (similarity > bestNutritionScore && similarity > 0.3) {
        bestNutritionScore = similarity;
        bestNutritionMatch = result;
      }
    }
    
    if (!bestNutritionMatch) {
      console.log(`⚠️  No nutrition match found for: ${foodName}`);
      return null;
    }
    
    // Try to find GI data
    let giResults: any[] = [];
    let bestGIMatch: any = null;
    let bestGIScore = 0;
    
    if (giTable) {
      try {
        giResults = await giTable.query().limit(2000).toArray();
      } catch (error) {
        console.log("   GI vector search failed, trying table scan...");
        try {
          const { getAllRows } = await import("../index/lancedb");
          giResults = await getAllRows(giTable);
          giResults = giResults.slice(0, 2000);
        } catch (error2) {
          console.log(`⚠️  Could not access GI data: ${error2}`);
          giResults = [];
        }
      }
      
      for (const result of giResults) {
        const similarity = calculateSimilarity(foodName, result.food_name);
        if (similarity > bestGIScore && similarity > 0.3) {
          bestGIScore = similarity;
          bestGIMatch = result;
        }
      }
    }
    
    // Combine the data
    const combinedData: CombinedNutritionData = {
      food_name: bestNutritionMatch.food_name,
      energy_kcal: bestNutritionMatch.energy_kcal || 0,
      carbohydrate_g: bestNutritionMatch.carbohydrate_g || 0,
      total_sugars_g: bestNutritionMatch.total_sugars_g || 0,
      protein_g: bestNutritionMatch.protein_g || 0,
      fat_g: bestNutritionMatch.fat_g || 0,
      fiber_g: bestNutritionMatch.nsp_aoac_fibre_g || 0,
      sodium_mg: bestNutritionMatch.sodium_mg || 0,
      gi_value: bestGIMatch?.gi_value,
      gl_value: bestGIMatch?.gl_value,
      gi_category: bestGIMatch?.category,
      is_low_gi: bestGIMatch?.gi_value ? bestGIMatch.gi_value <= 55 : undefined,
      is_high_fodmap: await isHighFODMAP(bestNutritionMatch.food_name),
      health_flags: []
    };
    
    // Generate health flags
    combinedData.health_flags = generateHealthFlags(combinedData);
    
    console.log(`✅ Found nutrition match: ${bestNutritionMatch.food_name} (score: ${bestNutritionScore.toFixed(2)})`);
    if (bestGIMatch) {
      console.log(`✅ Found GI match: ${bestGIMatch.food_name} (GI: ${bestGIMatch.gi_value}, score: ${bestGIScore.toFixed(2)})`);
    }
    
    return combinedData;
    
  } catch (error) {
    console.error(`❌ Error looking up nutrition data: ${error}`);
    return null;
  }
}

export async function analyzeIngredientsNutrition(ingredients: string[]): Promise<{
  combined: CombinedNutritionData;
  individual: CombinedNutritionData[];
}> {
  const individual: CombinedNutritionData[] = [];
  
  // Look up each ingredient
  for (const ingredient of ingredients) {
    const nutrition = await lookupNutritionWithGI(ingredient);
    if (nutrition) {
      individual.push(nutrition);
    }
  }
  
  if (individual.length === 0) {
    // Return default values if no ingredients found
    const defaultData: CombinedNutritionData = {
      food_name: "Unknown recipe",
      energy_kcal: 0,
      carbohydrate_g: 0,
      total_sugars_g: 0,
      protein_g: 0,
      fat_g: 0,
      fiber_g: 0,
      sodium_mg: 0,
      health_flags: ['insufficient-data']
    };
    
    return {
      combined: defaultData,
      individual: []
    };
  }
  
  // Combine nutrition data (simple averaging approach)
  const combined: CombinedNutritionData = {
    food_name: `Recipe with ${individual.length} ingredients`,
    energy_kcal: individual.reduce((sum, item) => sum + item.energy_kcal, 0) / individual.length,
    carbohydrate_g: individual.reduce((sum, item) => sum + item.carbohydrate_g, 0) / individual.length,
    total_sugars_g: individual.reduce((sum, item) => sum + item.total_sugars_g, 0) / individual.length,
    protein_g: individual.reduce((sum, item) => sum + item.protein_g, 0) / individual.length,
    fat_g: individual.reduce((sum, item) => sum + item.fat_g, 0) / individual.length,
    fiber_g: individual.reduce((sum, item) => sum + item.fiber_g, 0) / individual.length,
    sodium_mg: individual.reduce((sum, item) => sum + item.sodium_mg, 0) / individual.length,
    is_high_fodmap: individual.some(item => item.is_high_fodmap),
    health_flags: []
  };
  
  // Calculate average GI if available
  const giValues = individual.filter(item => item.gi_value).map(item => item.gi_value!);
  if (giValues.length > 0) {
    combined.gi_value = giValues.reduce((sum, gi) => sum + gi, 0) / giValues.length;
    combined.is_low_gi = combined.gi_value <= 55;
  }
  
  // Combine all health flags
  const allFlags = new Set<string>();
  individual.forEach(item => {
    item.health_flags.forEach(flag => allFlags.add(flag));
  });
  combined.health_flags = Array.from(allFlags);
  
  // Add combined-specific flags
  combined.health_flags = generateHealthFlags(combined);
  
  return {
    combined,
    individual
  };
}