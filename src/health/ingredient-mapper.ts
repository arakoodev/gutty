import { connectDB } from "../index/lancedb";
import { CFG } from "../config";

export interface IngredientNutrition {
  ingredient: string;
  calories_per_100g: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
}

export interface HealthFlags {
  pcos_friendly: boolean;
  pcos_warnings: string[];
  endometriosis_friendly: boolean;
  endometriosis_warnings: string[];
  ibs_friendly: boolean;
  ibs_warnings: string[];
  pregnancy_safe: boolean;
  pregnancy_warnings: string[];
}

export interface IngredientHealthProfile {
  ingredient: string;
  nutrition: IngredientNutrition;
  health_flags: HealthFlags;
  confidence: number;
}

/**
 * Maps identified ingredients to nutritional data and health recommendations
 * Uses existing nutrition and health knowledge databases
 */
export class IngredientHealthMapper {
  
  /**
   * Map a list of ingredients to their nutritional profiles and health flags
   * Uses the same nutrition-matcher that the original pipeline used
   */
  async mapIngredientsToHealth(ingredients: { name: string; confidence: number }[]): Promise<IngredientHealthProfile[]> {
    console.log("🔍 Using existing nutrition-matcher for ingredient mapping...");
    
    try {
      // Use the same nutrition mapping logic as the original pipeline
      const { analyzeIngredientsNutrition } = await import("../lib/nutrition-matcher");
      const ingredientNames = ingredients.map(ing => ing.name);
      const nutritionAnalysis = await analyzeIngredientsNutrition(ingredientNames);
      
      console.log(`✅ Mapped ${nutritionAnalysis.individual.length}/${ingredientNames.length} ingredients to COFID data`);
      
      // Convert to our expected format
      const profiles: IngredientHealthProfile[] = [];
      
      for (let i = 0; i < ingredients.length; i++) {
        const ingredient = ingredients[i];
        const nutritionData = nutritionAnalysis.individual[i];
        
        if (nutritionData && nutritionData.cofid_match) {
          const profile: IngredientHealthProfile = {
            ingredient: ingredient.name,
            nutrition: {
              ingredient: ingredient.name,
              calories_per_100g: nutritionData.energy_kcal || 0,
              protein_g: nutritionData.protein_g || 0,
              carbs_g: nutritionData.carbohydrate_g || 0,
              fat_g: nutritionData.fat_g || 0,
              fiber_g: nutritionData.fiber_g || 0,
              sugar_g: nutritionData.total_sugars_g || 0
            },
            health_flags: {
              pcos_friendly: nutritionData.is_low_gi !== false && !nutritionData.health_flags?.includes("high-sugar"),
              pcos_warnings: nutritionData.gi_value > 70 ? [`High glycemic index: ${nutritionData.gi_value}`] : [],
              endometriosis_friendly: !nutritionData.health_flags?.includes("inflammatory"),
              endometriosis_warnings: nutritionData.health_flags?.includes("inflammatory") ? ["May be inflammatory"] : [],
              ibs_friendly: !nutritionData.is_high_fodmap,
              ibs_warnings: nutritionData.is_high_fodmap ? ["High FODMAP - may trigger IBS symptoms"] : [],
              pregnancy_safe: !nutritionData.health_flags?.includes("pregnancy-risk"),
              pregnancy_warnings: nutritionData.health_flags?.includes("pregnancy-risk") ? ["May pose pregnancy risks"] : []
            },
            confidence: ingredient.confidence
          };
          
          profiles.push(profile);
        }
      }
      
      return profiles;
      
    } catch (error) {
      console.error("Failed to use nutrition-matcher:", error);
      return [];
    }
  }

  /**
   * Get comprehensive health profile for a single ingredient
   */
  private async getIngredientProfile(ingredientName: string): Promise<IngredientHealthProfile | null> {
    try {
      const db = await connectDB();
      
      // Query nutrition database
      const nutritionData = await this.queryNutritionData(ingredientName);
      
      // Query health flags from various tables
      const healthFlags = await this.queryHealthFlags(ingredientName);
      
      if (!nutritionData) {
        // Try fuzzy matching for common ingredient variations
        const fuzzyResult = await this.fuzzyMatchIngredient(ingredientName);
        if (fuzzyResult) {
          return fuzzyResult;
        }
        return null;
      }
      
      return {
        ingredient: ingredientName,
        nutrition: nutritionData,
        health_flags: healthFlags,
        confidence: 1.0
      };
      
    } catch (error) {
      console.error(`Error getting profile for ${ingredientName}:`, error);
      return null;
    }
  }

  /**
   * Query nutritional data from our nutrition facts table
   */
  private async queryNutritionData(ingredient: string): Promise<IngredientNutrition | null> {
    try {
      const db = await connectDB();
      const nutritionTable = await db.openTable(CFG.storage.nutritionTable);
      
      // Use SQL-style query for nutrition data
      const results = await nutritionTable
        .search(ingredient.toLowerCase())
        .select(["food_name", "calories_per_100g", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g"])
        .limit(5)
        .toArray()
        .catch(async () => {
          // Fallback to simple scan if search fails
          try {
            const allRows = await nutritionTable.toArray();
            return allRows.filter(row => 
              row.food_name && row.food_name.toLowerCase().includes(ingredient.toLowerCase())
            ).slice(0, 5);
          } catch {
            return [];
          }
        });
      
      if (results.length > 0) {
        const item = results[0];
        return {
          ingredient: item.food_name || ingredient,
          calories_per_100g: item.calories_per_100g || 0,
          protein_g: item.protein_g || 0,
          carbs_g: item.carbs_g || 0,
          fat_g: item.fat_g || 0,
          fiber_g: item.fiber_g || 0,
          sugar_g: item.sugar_g || 0
        };
      }
      
      return null;
    } catch (error) {
      console.warn(`Nutrition query failed for ${ingredient}:`, error);
      return null;
    }
  }

  /**
   * Query health flags from multiple health knowledge tables
   */
  private async queryHealthFlags(ingredient: string): Promise<HealthFlags> {
    const flags: HealthFlags = {
      pcos_friendly: true,
      pcos_warnings: [],
      endometriosis_friendly: true,
      endometriosis_warnings: [],
      ibs_friendly: true,
      ibs_warnings: [],
      pregnancy_safe: true,
      pregnancy_warnings: []
    };

    try {
      const db = await connectDB();
      
      // Query FODMAP data for IBS
      try {
        const fodmapTable = await db.openTable(CFG.storage.fodmapTable);
        const fodmapResults = await fodmapTable
          .toArray()
          .then(rows => rows.filter(row => 
            row.food_name && row.food_name.toLowerCase().includes(ingredient.toLowerCase())
          ).slice(0, 5))
          .catch(() => []);
          
        for (const item of fodmapResults) {
          if (item.fodmap_level === "high") {
            flags.ibs_friendly = false;
            flags.ibs_warnings.push(`High FODMAP: ${item.fodmap_type || 'general'}`);
          }
        }
      } catch (fodmapError) {
        // FODMAP table might not exist, continue
      }

      // Query glycemic index for PCOS
      try {
        const glycemicTable = await db.openTable(CFG.storage.glycemicTable);
        const glycemicResults = await glycemicTable
          .toArray()
          .then(rows => rows.filter(row => 
            row.food_name && row.food_name.toLowerCase().includes(ingredient.toLowerCase())
          ).slice(0, 5))
          .catch(() => []);
          
        for (const item of glycemicResults) {
          if (item.gi_value && item.gi_value > 70) {
            flags.pcos_friendly = false;
            flags.pcos_warnings.push(`High glycemic index: ${item.gi_value}`);
          }
        }
      } catch (glycemicError) {
        // Glycemic table might not exist, continue
      }

      // Query health docs for specific warnings
      try {
        const healthTable = await db.openTable("health_docs");
        const healthResults = await healthTable
          .toArray()
          .then(rows => rows.filter(row => 
            row.content && row.content.toLowerCase().includes(ingredient.toLowerCase())
          ).slice(0, 10))
          .catch(() => []);
          
        for (const doc of healthResults) {
          // Parse health warnings from knowledge base
          if (doc.content && doc.vertical) {
            const content = doc.content.toLowerCase();
            const warnings = this.extractWarnings(content, ingredient);
            
            switch (doc.vertical) {
              case "pcos":
                if (warnings.length > 0) {
                  flags.pcos_friendly = false;
                  flags.pcos_warnings.push(...warnings);
                }
                break;
              case "endometriosis":
                if (warnings.length > 0) {
                  flags.endometriosis_friendly = false;
                  flags.endometriosis_warnings.push(...warnings);
                }
                break;
              case "pregnancy":
                if (warnings.length > 0) {
                  flags.pregnancy_safe = false;
                  flags.pregnancy_warnings.push(...warnings);
                }
                break;
            }
          }
        }
      } catch (healthError) {
        // Health docs table might not exist, continue
      }

    } catch (error) {
      console.warn(`Health flags query failed for ${ingredient}:`, error);
    }

    return flags;
  }

  /**
   * Extract specific warnings from health knowledge content
   */
  private extractWarnings(content: string, ingredient: string): string[] {
    const warnings: string[] = [];
    const lowerIngredient = ingredient.toLowerCase();
    
    // Common warning patterns
    const warningPatterns = [
      `avoid ${lowerIngredient}`,
      `${lowerIngredient} should be avoided`,
      `${lowerIngredient} may cause`,
      `${lowerIngredient} can trigger`,
      `limit ${lowerIngredient}`,
      `reduce ${lowerIngredient}`,
      `high in sugar`,
      `inflammatory`,
      `may worsen symptoms`
    ];
    
    for (const pattern of warningPatterns) {
      if (content.includes(pattern)) {
        warnings.push(`May worsen symptoms (${pattern})`);
      }
    }
    
    return warnings;
  }

  /**
   * Fuzzy match ingredient names for common variations
   */
  private async fuzzyMatchIngredient(ingredient: string): Promise<IngredientHealthProfile | null> {
    // Common ingredient mappings
    const commonMappings: {[key: string]: string} = {
      "chicken breast": "chicken",
      "chicken duck": "chicken", 
      "red bell pepper": "bell pepper",
      "green bell pepper": "bell pepper",
      "french beans": "green beans",
      "cilantro mint": "cilantro",
      "cheese butter": "cheese"
    };
    
    const mapped = commonMappings[ingredient.toLowerCase()];
    if (mapped) {
      return await this.getIngredientProfile(mapped);
    }
    
    return null;
  }

  /**
   * Generate summary health report for all ingredients
   */
  async generateHealthSummary(ingredients: { name: string; confidence: number }[]): Promise<{
    overall_calories: number;
    overall_protein: number;
    overall_carbs: number;
    overall_fat: number;
    overall_fiber: number;
    overall_sugar: number;
    overall_sodium: number;
    gi_value?: number;
    gl_value?: number;
    is_low_gi?: boolean;
    pcos_safe: boolean;
    pcos_warnings: string[];
    endometriosis_safe: boolean;
    endometriosis_warnings: string[];
    ibs_safe: boolean;
    ibs_warnings: string[];
    pregnancy_safe: boolean;
    pregnancy_warnings: string[];
    health_flags: string[];
  }> {
    try {
      // Use the same comprehensive nutrition analysis as the original pipeline
      const { analyzeIngredientsNutrition } = await import("../lib/nutrition-matcher");
      const ingredientNames = ingredients.map(ing => ing.name);
      const nutritionAnalysis = await analyzeIngredientsNutrition(ingredientNames);
      
      // Get combined totals
      const combined = nutritionAnalysis.combined;
      
      return {
        overall_calories: Math.round(combined.energy_kcal || 0),
        overall_protein: Math.round((combined.protein_g || 0) * 10) / 10,
        overall_carbs: Math.round((combined.carbohydrate_g || 0) * 10) / 10,
        overall_fat: Math.round((combined.fat_g || 0) * 10) / 10,
        overall_fiber: Math.round((combined.fiber_g || 0) * 10) / 10,
        overall_sugar: Math.round((combined.total_sugars_g || 0) * 10) / 10,
        overall_sodium: Math.round(combined.sodium_mg || 0),
        gi_value: combined.gi_value ? Math.round(combined.gi_value) : undefined,
        gl_value: combined.gl_value ? Math.round(combined.gl_value * 10) / 10 : undefined,
        is_low_gi: combined.is_low_gi,
        pcos_safe: combined.is_low_gi !== false && !combined.health_flags.includes("high-sugar"),
        pcos_warnings: combined.gi_value > 70 ? [`High glycemic index: ${combined.gi_value}`] : [],
        endometriosis_safe: !combined.health_flags.includes("inflammatory"),
        endometriosis_warnings: combined.health_flags.includes("inflammatory") ? ["Contains inflammatory ingredients"] : [],
        ibs_safe: !combined.is_high_fodmap,
        ibs_warnings: combined.is_high_fodmap ? ["Contains high FODMAP ingredients"] : [],
        pregnancy_safe: !combined.health_flags.includes("pregnancy-risk"),
        pregnancy_warnings: combined.health_flags.includes("pregnancy-risk") ? ["Contains pregnancy risk ingredients"] : [],
        health_flags: combined.health_flags || []
      };
      
    } catch (error) {
      console.error("Failed to generate health summary:", error);
      return {
        overall_calories: 0,
        overall_protein: 0,
        overall_carbs: 0,
        overall_fat: 0,
        overall_fiber: 0,
        overall_sugar: 0,
        overall_sodium: 0,
        pcos_safe: true,
        pcos_warnings: [],
        endometriosis_safe: true,
        endometriosis_warnings: [],
        ibs_safe: true,
        ibs_warnings: [],
        pregnancy_safe: true,
        pregnancy_warnings: [],
        health_flags: []
      };
    }
  }
}