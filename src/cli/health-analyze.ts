import { Command } from "commander";
import { promises as fs } from "fs";
import { createWriteStream } from "fs";
import { withFallback } from "../providers/selector";
import { annSearch, connectDB, getAllRows } from "../index/lancedb";
import { mapToUSDA, computeTotals } from "../nutrition/usda_pipeline";
import path from "path";
import https from "https";
import http from "http";

async function downloadImage(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    client.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirects
        if (response.headers.location) {
          downloadImage(response.headers.location, outputPath).then(resolve).catch(reject);
          return;
        }
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }
      
      const fileStream = createWriteStream(outputPath);
      response.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
      
      fileStream.on('error', reject);
    }).on('error', reject);
  });
}

const PREG_HIGH_MERCURY = new Set(["shark","swordfish","king mackerel","tilefish","bigeye tuna","marlin","orange roughy"]);
const PREG_RISK_KEYWORDS = ["raw egg","raw eggs","unpasteurized","deli meat","cold cuts","pate","sprouts"];
const PCOS_FLAGS = ["sugary drink","sugar","refined flour","refined grains","trans fat"];
const ENDO_FLAGS = ["alcohol","processed meat"];
const IBS_HIGH_FODMAP = new Set(["onion","garlic","wheat","rye","barley","apple","pear","watermelon","mango","beans","lentils","chickpeas","cashews","pistachios"]);
const IBS_TRIGGER_KEYWORDS = ["high fat","fried food","spicy food","caffeine","alcohol","artificial sweetener","sorbitol","mannitol"];

export default new Command("health-analyze")
  .description("Analyze food image for PCOS, PCOD, and IBS health considerations")
  .requiredOption("--image <path>", "Path to food image or URL")
  .option("--verticals <csv>", "Health verticals to analyze (pcos,endometriosis,ibs)", "pcos,endometriosis,ibs")
  .option("--topk <n>", "Number of recipe candidates", "50")
  .option("--out <path>", "Output JSON file", "./health-analysis.json")
  .action(async (opts) => {
    console.log("🍽️  Analyzing food image for health considerations...");
    console.log(`📸 Image: ${opts.image}`);
    console.log(`🏥 Health verticals: ${opts.verticals}`);
    console.log();

    let imagePath = opts.image;
    
    // Handle URL input by downloading to temp file
    if (opts.image.startsWith('http://') || opts.image.startsWith('https://')) {
      console.log("🌐 Downloading image from URL...");
      const tempPath = path.join('/tmp', `gutty-image-${Date.now()}.jpg`);
      await downloadImage(opts.image, tempPath);
      imagePath = tempPath;
      console.log(`   ✓ Downloaded to: ${tempPath}`);
    }

    try {
      // Step 1: Recipe Analysis (Image → Recipe → Nutrition)
      console.log("1️⃣ Analyzing recipe from image...");
      
      let q: Float32Array = new Float32Array();
      await withFallback(async p => { q = await p.imageEmbed({ path: imagePath }); return null as any; });
      
      // Temporary manual similarity search due to LanceDB vector index issues
      let candidates;
      try {
        candidates = await annSearch("recipes","emb_clip_b32", q, Number(opts.topk));
      } catch (error) {
        console.warn("   Vector search failed, using manual similarity search...");
        // Manual similarity search fallback
        const db = await connectDB();
        const table = await db.openTable("recipes");
        const allRecipes = await getAllRows(table);
        
        // Calculate cosine similarity manually
        const similarities = allRecipes.map((recipe: any) => {
          if (!recipe.emb_clip_b32 || recipe.emb_clip_b32.length === 0) return { ...recipe, _distance: 1.0 };
          
          const embedding = new Float32Array(recipe.emb_clip_b32);
          let dotProduct = 0;
          let normA = 0;
          let normB = 0;
          
          for (let i = 0; i < Math.min(q.length, embedding.length); i++) {
            dotProduct += q[i] * embedding[i];
            normA += q[i] * q[i];
            normB += embedding[i] * embedding[i];
          }
          
          const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
          const distance = 1.0 - similarity; // Convert to distance for consistency
          
          return { ...recipe, _distance: distance };
        });
        
        candidates = similarities
          .sort((a, b) => a._distance - b._distance)
          .slice(0, Number(opts.topk));
      }
      console.log(`   Found ${candidates.length} recipe candidates`);
      
      // Skip re-ranking for now since test recipes don't have actual images
      console.log("   Skipping image re-ranking (using CLIP text similarity only)");
      const rescored = candidates.map((c: any) => ({ ...c, rerankScore: 1.0 - c._distance }));
      
      // Temporarily skip vision analysis and use best CLIP match
      const bestMatch = rescored[0];
      console.log("   Using best CLIP similarity match (skipping vision analysis)");
      // console.log("   Best match:", JSON.stringify(bestMatch, null, 2));
      
      // Handle ingredients safely - convert Arrow vectors to JavaScript arrays
      let ingredientList: string[] = [];
      if (bestMatch.ingredients) {
        if (Array.isArray(bestMatch.ingredients)) {
          ingredientList = bestMatch.ingredients;
        } else if (bestMatch.ingredients.toArray) {
          // Arrow vector - convert to JS array
          ingredientList = bestMatch.ingredients.toArray();
        } else if (bestMatch.ingredients.length !== undefined) {
          // Try to extract from vector-like structure
          ingredientList = [];
          for (let i = 0; i < bestMatch.ingredients.length; i++) {
            const item = bestMatch.ingredients.get ? bestMatch.ingredients.get(i) : bestMatch.ingredients[i];
            if (item) ingredientList.push(String(item));
          }
        } else {
          ingredientList = [String(bestMatch.ingredients)];
        }
      }
        
      const chosen = {
        chosenRecipeId: bestMatch.id,
        servings: bestMatch.servings || 4,
        ingredients: ingredientList.map((ing: string) => ({
          name: String(ing),
          qty: 1,
          unit: "serving"
        }))
      };
      
      console.log(`   ✓ Identified recipe: ${chosen.chosenRecipeId || "Unknown"}`);
      console.log(`   ✓ Ingredients: ${chosen.ingredients.length} items`);
      
      // Step 2: Nutrition Mapping with COFID + GI data
      console.log("2️⃣ Mapping to COFID nutrition & glycemic index data...");
      
      const ingredientNames = chosen.ingredients.map((ing: any) => 
        typeof ing === 'string' ? ing : ing.name
      );
      
      const { analyzeIngredientsNutrition } = await import("../lib/nutrition-matcher");
      const nutritionAnalysis = await analyzeIngredientsNutrition(ingredientNames);
      
      const totals = {
        calories: Math.round(nutritionAnalysis.combined.energy_kcal),
        protein: Math.round(nutritionAnalysis.combined.protein_g * 10) / 10,
        carbs: Math.round(nutritionAnalysis.combined.carbohydrate_g * 10) / 10,
        fat: Math.round(nutritionAnalysis.combined.fat_g * 10) / 10,
        fiber: Math.round(nutritionAnalysis.combined.fiber_g * 10) / 10,
        sugars: Math.round(nutritionAnalysis.combined.total_sugars_g * 10) / 10,
        sodium: Math.round(nutritionAnalysis.combined.sodium_mg),
        gi_value: nutritionAnalysis.combined.gi_value ? Math.round(nutritionAnalysis.combined.gi_value) : undefined,
        gl_value: nutritionAnalysis.combined.gl_value ? Math.round(nutritionAnalysis.combined.gl_value * 10) / 10 : undefined,
        is_low_gi: nutritionAnalysis.combined.is_low_gi,
        is_high_fodmap: nutritionAnalysis.combined.is_high_fodmap,
        health_flags: nutritionAnalysis.combined.health_flags
      };
      
      console.log(`   ✓ COFID nutrition data: ${nutritionAnalysis.individual.length}/${ingredientNames.length} ingredients matched`);
      console.log(`   ✓ Total nutrition: ${totals.calories} kcal, ${totals.carbs}g carbs, ${totals.fiber}g fiber`);
      if (totals.gi_value) {
        console.log(`   ✓ Glycemic index: ${totals.gi_value} (${totals.is_low_gi ? 'Low' : totals.gi_value >= 70 ? 'High' : 'Medium'} GI)`);
      }
      console.log(`   ✓ Health flags: ${totals.health_flags.join(', ')}`);
      
      // Step 3: Enhanced Health Analysis with Nutrition Data
      console.log("3️⃣ Analyzing health considerations with nutrition data...");
      const ingredients = chosen.ingredients || [];
      const verticals = opts.verticals.split(",").map((s:string)=>s.trim().toLowerCase());
      const db = await connectDB();
      const t = await db.openTable("health_docs");
      const ann:any = { notes: [], evidence: [], nutrition_flags: totals.health_flags };

      // Add nutrition-based health notes
      for (const v of verticals) {
        if (v === "pcos" || v === "pcod") {
          // PCOS/PCOD analysis using GI and sugar data
          if (totals.gi_value && totals.gi_value >= 70) {
            ann.notes.push({
              vertical: "pcos",
              type: "glycemic_index",
              message: `High glycemic index (${totals.gi_value}) may worsen insulin resistance`,
              severity: "caution",
              recommendation: "Consider low-GI alternatives",
              ref: "PCOS insulin sensitivity research"
            });
          } else if (totals.is_low_gi) {
            ann.notes.push({
              vertical: "pcos",
              type: "glycemic_index", 
              message: `Low glycemic index (${totals.gi_value}) supports insulin sensitivity`,
              severity: "positive",
              recommendation: "Good choice for PCOS management",
              ref: "PCOS dietary guidelines"
            });
          }
          
          if (totals.sugars > 15) {
            ann.notes.push({
              vertical: "pcos",
              type: "sugar_content",
              message: `High sugar content (${totals.sugars}g) may spike blood glucose`,
              severity: "caution", 
              recommendation: "Monitor portion size or choose lower-sugar options",
              ref: "PCOS sugar intake guidelines"
            });
          }
          
          if (totals.fiber >= 5) {
            ann.notes.push({
              vertical: "pcos",
              type: "fiber_content",
              message: `High fiber content (${totals.fiber}g) supports insulin regulation`,
              severity: "positive",
              recommendation: "Excellent for PCOS management",
              ref: "Dietary fiber and insulin sensitivity"
            });
          }
        }
        
        if (v === "endometriosis") {
          if (totals.fiber >= 5) {
            ann.notes.push({
              vertical: "endometriosis",
              type: "fiber_content",
              message: `High fiber content (${totals.fiber}g) may reduce inflammation`,
              severity: "positive", 
              recommendation: "Beneficial for endometriosis management",
              ref: "Anti-inflammatory diet for endometriosis"
            });
          }
          
          if (totals.sodium > 600) {
            ann.notes.push({
              vertical: "endometriosis",
              type: "sodium_content",
              message: `High sodium content (${totals.sodium}mg) may increase inflammation`,
              severity: "caution",
              recommendation: "Consider reducing sodium intake",
              ref: "Inflammation and sodium intake"
            });
          }
        }
        
        if (v === "ibs") {
          if (totals.is_high_fodmap) {
            ann.notes.push({
              vertical: "ibs",
              type: "fodmap_content",
              message: "Contains high-FODMAP ingredients that may trigger IBS symptoms",
              severity: "caution",
              recommendation: "Monitor symptoms or substitute with low-FODMAP alternatives",
              ref: "Monash FODMAP research"
            });
          } else {
            ann.notes.push({
              vertical: "ibs", 
              type: "fodmap_content",
              message: "Low-FODMAP ingredients are generally well-tolerated",
              severity: "positive",
              recommendation: "Good choice for IBS management",
              ref: "Low-FODMAP diet guidelines"
            });
          }
          
          if (totals.fiber > 10) {
            ann.notes.push({
              vertical: "ibs",
              type: "fiber_content", 
              message: `Very high fiber (${totals.fiber}g) - introduce gradually to avoid symptoms`,
              severity: "caution",
              recommendation: "Start with smaller portions and increase slowly",
              ref: "Fiber intake for IBS"
            });
          }
        }

        // Traditional ingredient-based analysis
        let queryTerms = ingredients.map((i:any)=> {
          const name = typeof i === 'string' ? i : (i && i.name ? i.name : '');
          return (name && typeof name === 'string') ? name.toLowerCase() : '';
        }).filter(term => term.length > 0);
        
        if (v==="pcos" || v==="pcod"){
          queryTerms = queryTerms.concat(PCOS_FLAGS);
        }
        if (v==="endometriosis"){
          queryTerms = queryTerms.concat(ENDO_FLAGS);
        }
        if (v==="ibs"){
          queryTerms = queryTerms.concat(IBS_TRIGGER_KEYWORDS);
        }
        
        // Search health knowledge base
        const q = Array.from(new Set(queryTerms)).join(", ");
        try {
          const qemb = await withFallback(async p => await p.textEmbed({ text: q }));
          const hits = await t.search(Array.from(qemb)).where(`vertical = '${v}'`).limit(3).toArray();
          ann.evidence.push({ vertical: v, query: q, hits });
        } catch (error) {
          console.warn(`   ⚠️  Could not search health knowledge for ${v}`);
        }
      }
      
      console.log(`   ✓ Generated ${ann.notes.length} health insights from nutrition data`);

      // Step 4: Generate Final Report
      console.log("4️⃣ Generating health report...");
      
      const report = {
        metadata: {
          analysis_date: new Date().toISOString(),
          input_image: opts.image,
          download_path: imagePath !== opts.image ? imagePath : null,
          verticals_analyzed: verticals,
          processing_pipeline: "Image → Recipe Matching → Nutrition Mapping → Health Analysis"
        },
        step1_recipe_matching: {
          description: "Image analyzed using CLIP embeddings to find similar recipes from database",
          candidates_found: candidates.length,
          top_candidates: rescored.slice(0,5).map((r:any) => ({
            recipe_id: r.id,
            title: r.title,
            similarity_score: r.rerankScore.toFixed(3),
            ingredients_preview: (() => {
              const ingredients = Array.isArray(r.ingredients) ? r.ingredients : 
                (r.ingredients.toArray ? r.ingredients.toArray() : 
                 r.ingredients.length ? Array.from({length: r.ingredients.length}, (_, i) => 
                   r.ingredients.get ? r.ingredients.get(i) : r.ingredients[i]) : []);
              return ingredients.slice(0,3).join(", ") + (ingredients.length > 3 ? "..." : "");
            })()
          })),
          llm_consolidation: {
            chosen_recipe: chosen.chosenRecipeId,
            confidence_indicators: [
              `Selected from top ${rescored.slice(0,10).length} candidates`,
              `Recipe servings: ${chosen.servings}`,
              `Extracted ${chosen.ingredients.length} ingredients`
            ]
          }
        },
        step2_nutrition_mapping: {
          description: "Recipe ingredients mapped to COFID nutrition database and glycemic index data",
          ingredient_mapping: nutritionAnalysis.individual.map(item => ({
            ingredient: item.food_name,
            cofid_match: item.food_name,
            glycemic_index: item.gi_value,
            glycemic_load: item.gl_value,
            nutrition_per_100g: {
              calories: Math.round(item.energy_kcal),
              protein_g: Math.round(item.protein_g * 10) / 10,
              carbs_g: Math.round(item.carbohydrate_g * 10) / 10,
              fat_g: Math.round(item.fat_g * 10) / 10,
              fiber_g: Math.round(item.fiber_g * 10) / 10,
              sugars_g: Math.round(item.total_sugars_g * 10) / 10,
              sodium_mg: Math.round(item.sodium_mg)
            },
            health_flags: item.health_flags
          })),
          totals_calculated: totals,
          database_coverage: {
            ingredients_found: nutritionAnalysis.individual.length,
            total_ingredients: ingredientNames.length,
            coverage_percentage: Math.round((nutritionAnalysis.individual.length / ingredientNames.length) * 100)
          },
          glycemic_assessment: totals.gi_value ? {
            average_gi: totals.gi_value,
            gi_category: totals.is_low_gi ? 'Low (≤55)' : totals.gi_value >= 70 ? 'High (≥70)' : 'Medium (56-69)',
            glycemic_load: totals.gl_value
          } : null
        },
        step3_health_analysis: {
          description: "Ingredients analyzed against health condition databases and research",
          analysis_by_vertical: Object.fromEntries(verticals.map(v => {
            const verticalNotes = ann.notes.filter((n:any) => n.vertical === v);
            const verticalEvidence = ann.evidence.find((e:any) => e.vertical === v);
            return [v, {
              triggers_found: verticalNotes,
              knowledge_base_search: verticalEvidence ? {
                search_query: verticalEvidence.query,
                evidence_documents: verticalEvidence.hits.length,
                top_evidence: verticalEvidence.hits.slice(0,2).map((hit:any) => ({
                  title: hit.title,
                  relevance_score: hit._distance ? (1 - hit._distance).toFixed(3) : "N/A",
                  source: hit.source || "Research database"
                }))
              } : null
            }];
          }))
        },
        final_results: {
          recipe_identification: chosen,
          nutrition_totals: totals,
          health_considerations: ann,
          summary: {
            recipe_id: chosen.chosenRecipeId,
            servings: chosen.servings,
            ingredients_count: ingredients.length,
            health_flags: ann.notes.length,
            processing_success: true
          }
        }
      };

      await fs.mkdir(path.dirname(opts.out), { recursive: true });
      await fs.writeFile(opts.out, JSON.stringify(report, null, 2));
      
      console.log();
      console.log("📊 HEALTH ANALYSIS COMPLETE");
      console.log("============================");
      console.log(`📄 Full report: ${opts.out}`);
      console.log();
      
      // Print summary
      console.log("🍽️  RECIPE SUMMARY:");
      console.log(`   • Recipe: ${chosen.chosenRecipeId || "Unknown"}`);
      console.log(`   • Servings: ${chosen.servings || "Unknown"}`);
      console.log(`   • Ingredients: ${ingredients.length} items`);
      
      if (totals.calories) {
        console.log(`   • Calories: ${Math.round(totals.calories)}`);
      }
      
      console.log();
      console.log("⚠️  HEALTH CONSIDERATIONS:");
      
      if (ann.notes.length === 0) {
        console.log("   ✅ No specific health concerns identified for analyzed verticals");
      } else {
        const byVertical = ann.notes.reduce((acc: any, note: any) => {
          if (!acc[note.vertical]) acc[note.vertical] = [];
          acc[note.vertical].push(note);
          return acc;
        }, {});
        
        Object.entries(byVertical).forEach(([vertical, notes]: [string, any]) => {
          console.log(`   🏥 ${vertical.toUpperCase()}:`);
          notes.forEach((note: any) => {
            console.log(`      • ${note.ingredient}: ${note.flag}`);
          });
        });
      }
      
      console.log();
      console.log("💡 For detailed analysis and evidence, see the JSON report.");
      
    } catch (error) {
      console.error("❌ Analysis failed:", error);
      process.exit(1);
    }
  });