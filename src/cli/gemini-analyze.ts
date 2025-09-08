import { Command } from "commander";
import { requireEmbeddingsProvider } from "../providers/availability";
import { GeminiSegmentation, FoodSegmentationResult } from "../segmentation/gemini-segmentation";
import { IngredientHealthMapper, IngredientHealthProfile } from "../health/ingredient-mapper";
import { promises as fs } from "fs";
import path from "path";

export interface GeminiAnalysisResult {
  image_path: string;
  segmentation: FoodSegmentationResult;
  health_profiles: IngredientHealthProfile[];
  health_summary: {
    overall_calories: number;
    overall_protein: number;
    overall_carbs: number;
    overall_fat: number;
    pcos_safe: boolean;
    pcos_warnings: string[];
    endometriosis_safe: boolean;
    endometriosis_warnings: string[];
    ibs_safe: boolean;
    ibs_warnings: string[];
    pregnancy_safe: boolean;
    pregnancy_warnings: string[];
  };
  processing_time_ms: number;
  timestamp: string;
}

/**
 * End-to-end food analysis using Gemini 2.5 Flash
 * Pipeline: Image → Ingredient Segmentation → Health Analysis
 */
async function analyzeFood(imagePath: string, verticals: string[] = ["pcos", "endometriosis", "ibs", "pregnancy"]): Promise<GeminiAnalysisResult> {
  const startTime = Date.now();
  console.log(`🔍 Analyzing food image: ${imagePath}`);
  
  // Step 1: Gemini 2.5 Flash segmentation and ingredient identification
  console.log("🧠 Running Gemini 2.5 Flash ingredient identification...");
  const segmentation = new GeminiSegmentation();
  const segmentationResult = await segmentation.segmentFoodImage(imagePath);
  
  console.log(`✅ Identified ${segmentationResult.totalIngredients} ingredients:`);
  segmentationResult.ingredients.forEach((ingredient, i) => {
    console.log(`   ${i + 1}. ${ingredient.name} (confidence: ${(ingredient.confidence * 100).toFixed(1)}%)`);
  });
  
  // Step 2: Map ingredients to health profiles
  console.log("🏥 Mapping ingredients to health profiles...");
  const mapper = new IngredientHealthMapper();
  const healthProfiles = await mapper.mapIngredientsToHealth(segmentationResult.ingredients);
  
  console.log(`✅ Mapped ${healthProfiles.length}/${segmentationResult.ingredients.length} ingredients to health data`);
  
  // Step 3: Generate health summary using existing nutrition pipeline
  console.log("📊 Generating health analysis summary...");
  const healthSummary = await mapper.generateHealthSummary(segmentationResult.ingredients);
  
  const totalTime = Date.now() - startTime;
  
  const result: GeminiAnalysisResult = {
    image_path: imagePath,
    segmentation: segmentationResult,
    health_profiles: healthProfiles,
    health_summary: healthSummary,
    processing_time_ms: totalTime,
    timestamp: new Date().toISOString()
  };
  
  // Log summary
  console.log("\n📋 HEALTH ANALYSIS SUMMARY:");
  console.log(`   Calories: ${healthSummary.overall_calories.toFixed(0)} kcal`);
  console.log(`   Protein: ${healthSummary.overall_protein.toFixed(1)}g`);
  console.log(`   Carbs: ${healthSummary.overall_carbs.toFixed(1)}g`);
  console.log(`   Fat: ${healthSummary.overall_fat.toFixed(1)}g`);
  
  console.log("\n🚨 HEALTH WARNINGS:");
  if (!healthSummary.pcos_safe && verticals.includes("pcos")) {
    console.log(`   PCOS: ⚠️  ${healthSummary.pcos_warnings.length} warnings`);
    healthSummary.pcos_warnings.forEach(w => console.log(`     • ${w}`));
  }
  if (!healthSummary.endometriosis_safe && verticals.includes("endometriosis")) {
    console.log(`   Endometriosis: ⚠️  ${healthSummary.endometriosis_warnings.length} warnings`);
    healthSummary.endometriosis_warnings.forEach(w => console.log(`     • ${w}`));
  }
  if (!healthSummary.ibs_safe && verticals.includes("ibs")) {
    console.log(`   IBS: ⚠️  ${healthSummary.ibs_warnings.length} warnings`);
    healthSummary.ibs_warnings.forEach(w => console.log(`     • ${w}`));
  }
  if (!healthSummary.pregnancy_safe && verticals.includes("pregnancy")) {
    console.log(`   Pregnancy: ⚠️  ${healthSummary.pregnancy_warnings.length} warnings`);
    healthSummary.pregnancy_warnings.forEach(w => console.log(`     • ${w}`));
  }
  
  if (healthSummary.pcos_safe && healthSummary.endometriosis_safe && 
      healthSummary.ibs_safe && healthSummary.pregnancy_safe) {
    console.log("   ✅ No health warnings detected!");
  }
  
  console.log(`\n⏱️  Total processing time: ${totalTime}ms`);
  
  return result;
}

export default new Command("gemini-analyze")
  .description("Analyze food images using Gemini 2.5 Flash for ingredient identification and health analysis")
  .requiredOption("--image <path>", "Path to food image file")
  .option("--output <path>", "Output JSON file path")
  .option("--verticals <list>", "Health verticals to analyze (comma-separated)", "pcos,endometriosis,ibs,pregnancy")
  .action(async (opts) => {
    console.log("🚀 Starting Gemini 2.5 Flash food analysis...");
    
    // Verify embeddings provider (needed for health data queries)
    requireEmbeddingsProvider();
    
    // Validate image file exists
    try {
      await fs.access(opts.image);
    } catch {
      throw new Error(`Image file not found: ${opts.image}`);
    }
    
    // Parse health verticals
    const verticals = opts.verticals.split(',').map((v: string) => v.trim().toLowerCase());
    
    try {
      // Run the complete analysis
      const result = await analyzeFood(opts.image, verticals);
      
      // Save results if output path specified
      if (opts.output) {
        await fs.writeFile(opts.output, JSON.stringify(result, null, 2));
        console.log(`💾 Results saved to: ${opts.output}`);
      }
      
      console.log("\n✅ Gemini food analysis completed successfully!");
      return result;
      
    } catch (error: any) {
      console.error("❌ Analysis failed:", error.message);
      throw error;
    }
  });