import { Command } from "commander";
import { promises as fs } from "fs";
import { createWriteStream } from "fs";
import { withFallback } from "../providers/selector";
import { annSearch, connectDB } from "../index/lancedb";
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
      
      const candidates = await annSearch("recipes","emb_clip_b32", q, Number(opts.topk));
      console.log(`   Found ${candidates.length} recipe candidates`);
      
      let q2: Float32Array = new Float32Array();
      await withFallback(async p => { q2 = await p.imageEmbedBig({ path: imagePath }); return null as any; });
      
      const rescored = await Promise.all(candidates.map(async (c:any)=>{
        let e: Float32Array = new Float32Array();
        await withFallback(async p => { e = await p.imageEmbedBig({ path: c.image_paths[0] }); return null as any; });
        let dot=0,nq=0,ne=0; for (let i=0;i<e.length;i++){ dot+=q2[i]*e[i]; nq+=q2[i]*q2[i]; ne+=e[i]*e[i]; }
        return { ...c, rerankScore: dot/Math.sqrt(nq*ne) };
      }));
      rescored.sort((a,b)=> b.rerankScore - a.rerankScore);
      
      const context = rescored.slice(0,10).map((r:any)=> ({ id:r.id, title:r.title, ingredients:r.ingredients, servings:r.servings }));
      const prompt = `Return JSON only: {"chosenRecipeId":string,"servings":number,"ingredients":[{"name":string,"qty":number,"unit":string}]}`;
      const chosen = await withFallback(async p => await p.visionJSON({ image:{path:imagePath}, prompt, context }));
      
      console.log(`   ✓ Identified recipe: ${chosen.chosenRecipeId || "Unknown"}`);
      console.log(`   ✓ Ingredients: ${chosen.ingredients.length} items`);
      
      // Step 2: Nutrition Mapping
      console.log("2️⃣ Mapping to USDA nutrition data...");
      const items = await mapToUSDA(chosen.ingredients);
      const totals = computeTotals(items);
      console.log(`   ✓ Mapped ${items.length} nutritional items`);
      
      // Step 3: Health Analysis
      console.log("3️⃣ Analyzing health considerations...");
      const ingredients = chosen.ingredients || [];
      const verticals = opts.verticals.split(",").map((s:string)=>s.trim().toLowerCase());
      const db = await connectDB();
      const t = await db.openTable("health_docs");
      const ann:any = { notes: [], evidence: [] };

      for (const v of verticals){
        let queryTerms = ingredients.map((i:any)=>i.name.toLowerCase());
        
        if (v==="pcos" || v==="pcod"){
          // Check for PCOS-specific triggers
          for (const ing of ingredients) {
            const ingName = ing.name.toLowerCase();
            if (PCOS_FLAGS.some(flag => ingName.includes(flag))) {
              ann.notes.push({ 
                vertical: "pcos", 
                ingredient: ing.name, 
                flag: "may worsen insulin resistance", 
                ref: "PCOS dietary guidelines" 
              });
            }
          }
          queryTerms = queryTerms.concat(PCOS_FLAGS);
        }
        
        if (v==="endometriosis"){
          // Check for endometriosis triggers
          for (const ing of ingredients) {
            const ingName = ing.name.toLowerCase();
            if (ENDO_FLAGS.some(flag => ingName.includes(flag))) {
              ann.notes.push({ 
                vertical: "endometriosis", 
                ingredient: ing.name, 
                flag: "may increase inflammation", 
                ref: "Endometriosis dietary research" 
              });
            }
          }
          queryTerms = queryTerms.concat(ENDO_FLAGS);
        }
        
        if (v==="ibs"){
          // Check for high-FODMAP foods
          for (const ing of ingredients) {
            const ingName = ing.name.toLowerCase();
            if (IBS_HIGH_FODMAP.has(ingName)) {
              ann.notes.push({ 
                vertical: "ibs", 
                ingredient: ing.name, 
                flag: "high-FODMAP food (may trigger symptoms)", 
                ref: "Monash FODMAP research" 
              });
            }
          }
          queryTerms = queryTerms.concat(IBS_TRIGGER_KEYWORDS);
        }
        
        // Search health knowledge base
        const q = Array.from(new Set(queryTerms)).join(", ");
        try {
          const qemb = await withFallback(async p => await p.textEmbed({ text: q }));
          const hits = await t.search(Array.from(qemb)).where(`vertical = '${v}'`).limit(5).toArray();
          ann.evidence.push({ vertical: v, query: q, hits });
        } catch (error) {
          console.warn(`   ⚠️  Could not search health knowledge for ${v}`);
        }
      }
      
      console.log(`   ✓ Found ${ann.notes.length} health considerations`);

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
            ingredients_preview: r.ingredients.slice(0,3).join(", ") + (r.ingredients.length > 3 ? "..." : "")
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
          description: "Recipe ingredients mapped to USDA FoodData Central nutritional database",
          ingredient_mapping: items.map(item => ({
            ingredient: item.ingredient,
            usda_match: item.description,
            nutrition_per_serving: {
              calories: item.calories,
              protein_g: item.protein_g,
              carbs_g: item.carbs_g,
              fat_g: item.fat_g
            }
          })),
          totals_calculated: totals
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