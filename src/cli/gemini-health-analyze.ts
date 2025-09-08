import { Command } from "commander";
import { promises as fs } from "fs";
import { GeminiSegmentation } from "../segmentation/gemini-segmentation";

export default new Command("gemini-health-analyze")
  .description("Complete health analysis using Gemini 2.5 Flash - produces same format as original pipeline")
  .requiredOption("--image <path>", "Path to food image or URL")
  .option("--verticals <csv>", "Health verticals to analyze", "pcos,endometriosis,ibs")
  .option("--out <path>", "Output JSON file", "./gemini-health-analysis.json")
  .action(async (opts) => {
    console.log("🍽️  Analyzing food image with Gemini 2.5 Flash pipeline...");
    console.log(`📸 Image: ${opts.image}`);
    console.log(`🏥 Health verticals: ${opts.verticals}`);
    console.log();

    const verticals = opts.verticals.split(",").map((s: string) => s.trim().toLowerCase());
    
    try {
      // Step 1: Gemini 2.5 Flash Ingredient Identification (replaces recipe matching)
      console.log("1️⃣ Identifying ingredients with Gemini 2.5 Flash...");
      
      const segmentation = new GeminiSegmentation();
      const segmentationResult = await segmentation.segmentFoodImage(opts.image);
      
      console.log(`   ✓ Identified ${segmentationResult.totalIngredients} ingredients`);
      segmentationResult.ingredients.forEach((ing, i) => {
        console.log(`      ${i + 1}. ${ing.name} (${(ing.confidence * 100).toFixed(0)}% confidence)`);
      });

      // Step 2: Nutrition Mapping with COFID + GI data
      console.log("2️⃣ Mapping to COFID nutrition & glycemic index data...");
      
      const ingredientNames = segmentationResult.ingredients.map(ing => ing.name);
      
      const { analyzeIngredientsNutrition } = await import("../lib/nutrition-matcher");
      const nutritionAnalysis = await analyzeIngredientsNutrition(ingredientNames);
      
      console.log(`   ✓ COFID nutrition data: ${nutritionAnalysis.individual.length}/${ingredientNames.length} ingredients matched`);

      // Step 3: Enhanced Health Analysis with Nutrition Data
      console.log("3️⃣ Analyzing health considerations with nutrition data...");
      
      // Build ingredient mapping in original format
      const ingredientMapping = nutritionAnalysis.individual.map((item: any) => ({
        ingredient: item.ingredient || "Unknown",
        cofid_match: item.cofid_match || item.ingredient,
        glycemic_index: item.gi_value || null,
        glycemic_load: item.gl_value || null,
        nutrition_per_100g: {
          calories: Math.round(item.energy_kcal || 0),
          protein_g: Math.round((item.protein_g || 0) * 10) / 10,
          carbs_g: Math.round((item.carbohydrate_g || 0) * 10) / 10,
          fat_g: Math.round((item.fat_g || 0) * 10) / 10,
          fiber_g: Math.round((item.fiber_g || 0) * 10) / 10,
          sugars_g: Math.round((item.total_sugars_g || 0) * 10) / 10,
          sodium_mg: Math.round(item.sodium_mg || 0)
        },
        health_flags: item.health_flags || []
      }));

      // Calculate totals
      const combined = nutritionAnalysis.combined;
      const totalsCalculated = {
        calories: Math.round(combined.energy_kcal || 0),
        protein: Math.round((combined.protein_g || 0) * 10) / 10,
        carbs: Math.round((combined.carbohydrate_g || 0) * 10) / 10,
        fat: Math.round((combined.fat_g || 0) * 10) / 10,
        fiber: Math.round((combined.fiber_g || 0) * 10) / 10,
        sugars: Math.round((combined.total_sugars_g || 0) * 10) / 10,
        sodium: Math.round(combined.sodium_mg || 0),
        gi_value: combined.gi_value ? Math.round(combined.gi_value) : null,
        is_low_gi: combined.is_low_gi || false,
        is_high_fodmap: combined.is_high_fodmap || false,
        health_flags: combined.health_flags || []
      };

      console.log(`   ✓ Total nutrition: ${totalsCalculated.calories} kcal, ${totalsCalculated.carbs}g carbs, ${totalsCalculated.fiber}g fiber`);
      if (totalsCalculated.gi_value) {
        console.log(`   ✓ Glycemic index: ${totalsCalculated.gi_value} (${totalsCalculated.is_low_gi ? 'Low' : totalsCalculated.gi_value >= 70 ? 'High' : 'Medium'} GI)`);
      }

      // Generate health analysis notes
      const healthNotes: any[] = [];

      for (const vertical of verticals) {
        if (vertical === "pcos") {
          if (totalsCalculated.gi_value && totalsCalculated.gi_value >= 70) {
            healthNotes.push({
              vertical: "pcos",
              type: "glycemic_index",
              message: `High glycemic index (${totalsCalculated.gi_value}) may worsen insulin resistance`,
              severity: "caution",
              recommendation: "Consider low-GI alternatives",
              ref: "PCOS insulin sensitivity research"
            });
          } else if (totalsCalculated.is_low_gi) {
            healthNotes.push({
              vertical: "pcos",
              type: "glycemic_index",
              message: `Low glycemic index (${totalsCalculated.gi_value}) supports insulin sensitivity`,
              severity: "positive",
              recommendation: "Good choice for PCOS management",
              ref: "PCOS dietary guidelines"
            });
          }
          
          if (totalsCalculated.fiber >= 5) {
            healthNotes.push({
              vertical: "pcos",
              type: "fiber_content",
              message: `High fiber content (${totalsCalculated.fiber}g) supports insulin regulation`,
              severity: "positive",
              recommendation: "Excellent for PCOS management",
              ref: "Dietary fiber and insulin sensitivity"
            });
          }
        }
        
        if (vertical === "endometriosis") {
          if (totalsCalculated.fiber >= 5) {
            healthNotes.push({
              vertical: "endometriosis",
              type: "fiber_content",
              message: `High fiber content (${totalsCalculated.fiber}g) may reduce inflammation`,
              severity: "positive",
              recommendation: "Beneficial for endometriosis management",
              ref: "Anti-inflammatory diet for endometriosis"
            });
          }
        }
        
        if (vertical === "ibs") {
          if (!totalsCalculated.is_high_fodmap) {
            healthNotes.push({
              vertical: "ibs",
              type: "fodmap_content",
              message: "Low-FODMAP ingredients are generally well-tolerated",
              severity: "positive",
              recommendation: "Good choice for IBS management",
              ref: "Low-FODMAP diet guidelines"
            });
          } else {
            healthNotes.push({
              vertical: "ibs",
              type: "fodmap_content",
              message: "Contains high-FODMAP ingredients that may trigger symptoms",
              severity: "caution",
              recommendation: "Monitor portion size or consider alternatives",
              ref: "High-FODMAP trigger foods"
            });
          }
        }
      }

      // Create the final JSON in the original format
      const result = {
        metadata: {
          analysis_date: new Date().toISOString(),
          input_image: opts.image,
          download_path: opts.image,
          verticals_analyzed: verticals,
          processing_pipeline: "Image → Gemini 2.5 Flash Ingredient ID → Nutrition Mapping → Health Analysis"
        },
        step1_ingredient_identification: {
          description: "Image analyzed using Gemini 2.5 Flash to directly identify individual ingredients",
          method: "gemini-2.5-flash",
          ingredients_found: segmentationResult.totalIngredients,
          identified_ingredients: segmentationResult.ingredients.map(ing => ({
            name: ing.name,
            confidence: ing.confidence,
            description: ing.description
          })),
          processing_time_ms: segmentationResult.processingTime,
          confidence_indicators: [
            `Identified ${segmentationResult.totalIngredients} ingredients`,
            `Average confidence: ${(segmentationResult.ingredients.reduce((sum, ing) => sum + ing.confidence, 0) / segmentationResult.totalIngredients * 100).toFixed(1)}%`,
            "Direct ingredient identification (no recipe matching required)"
          ]
        },
        step2_nutrition_mapping: {
          description: "Ingredients mapped to COFID nutrition database and glycemic index data",
          ingredient_mapping: ingredientMapping,
          totals_calculated: totalsCalculated,
          database_coverage: {
            ingredients_found: nutritionAnalysis.individual.filter((item: any) => item.cofid_match).length,
            total_ingredients: ingredientNames.length,
            coverage_percentage: Math.round((nutritionAnalysis.individual.filter((item: any) => item.cofid_match).length / ingredientNames.length) * 100)
          },
          glycemic_assessment: {
            average_gi: totalsCalculated.gi_value,
            gi_category: totalsCalculated.gi_value ? 
              (totalsCalculated.gi_value <= 55 ? "Low (≤55)" : 
               totalsCalculated.gi_value <= 70 ? "Medium (56-70)" : "High (>70)") : "Unknown"
          }
        },
        step3_health_analysis: {
          description: "Ingredients analyzed against health condition databases and research",
          analysis_by_vertical: verticals.reduce((acc: any, vertical) => {
            acc[vertical] = {
              triggers_found: healthNotes.filter(note => note.vertical === vertical),
              knowledge_base_search: null
            };
            return acc;
          }, {})
        },
        final_results: {
          ingredient_identification: {
            method: "gemini-2.5-flash",
            confidence: segmentationResult.ingredients.reduce((sum, ing) => sum + ing.confidence, 0) / segmentationResult.totalIngredients,
            total_ingredients: segmentationResult.totalIngredients,
            ingredients: segmentationResult.ingredients.map(ing => ({
              name: ing.name,
              confidence: ing.confidence,
              description: ing.description
            }))
          },
          nutrition_totals: totalsCalculated,
          health_considerations: {
            notes: healthNotes,
            evidence: [],
            nutrition_flags: totalsCalculated.health_flags
          },
          summary: {
            method: "gemini-2.5-flash",
            ingredients_count: segmentationResult.totalIngredients,
            nutrition_matches: nutritionAnalysis.individual.filter((item: any) => item.cofid_match).length,
            health_flags: healthNotes.length,
            processing_success: true
          }
        }
      };

      // Save to file
      await fs.writeFile(opts.out, JSON.stringify(result, null, 2));
      console.log(`💾 Complete analysis saved to: ${opts.out}`);
      
      return result;

    } catch (error: any) {
      console.error("❌ Analysis failed:", error.message);
      throw error;
    }
  });