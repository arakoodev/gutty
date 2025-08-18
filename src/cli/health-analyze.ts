import { Command } from "commander";
import { promises as fs } from "fs";
import { withFallback } from "../providers/selector";
import { annSearch, connectDB } from "../index/lancedb";
import { mapToUSDA, computeTotals } from "../nutrition/usda_pipeline";
import path from "path";

const PREG_HIGH_MERCURY = new Set(["shark","swordfish","king mackerel","tilefish","bigeye tuna","marlin","orange roughy"]);
const PREG_RISK_KEYWORDS = ["raw egg","raw eggs","unpasteurized","deli meat","cold cuts","pate","sprouts"];
const PCOS_FLAGS = ["sugary drink","sugar","refined flour","refined grains","trans fat"];
const ENDO_FLAGS = ["alcohol","processed meat"];
const IBS_HIGH_FODMAP = new Set(["onion","garlic","wheat","rye","barley","apple","pear","watermelon","mango","beans","lentils","chickpeas","cashews","pistachios"]);
const IBS_TRIGGER_KEYWORDS = ["high fat","fried food","spicy food","caffeine","alcohol","artificial sweetener","sorbitol","mannitol"];

export default new Command("health-analyze")
  .description("Analyze food image for PCOS, PCOD, and IBS health considerations")
  .requiredOption("--image <path>", "Path to food image")
  .option("--verticals <csv>", "Health verticals to analyze (pcos,endometriosis,ibs)", "pcos,endometriosis,ibs")
  .option("--topk <n>", "Number of recipe candidates", "50")
  .option("--out <path>", "Output JSON file", "./health-analysis.json")
  .action(async (opts) => {
    console.log("🍽️  Analyzing food image for health considerations...");
    console.log(`📸 Image: ${opts.image}`);
    console.log(`🏥 Health verticals: ${opts.verticals}`);
    console.log();

    try {
      // Step 1: Recipe Analysis (Image → Recipe → Nutrition)
      console.log("1️⃣ Analyzing recipe from image...");
      
      let q: Float32Array = new Float32Array();
      await withFallback(async p => { q = await p.imageEmbed({ path: opts.image }); return null as any; });
      
      const candidates = await annSearch("recipes","emb_clip_b32", q, Number(opts.topk));
      console.log(`   Found ${candidates.length} recipe candidates`);
      
      let q2: Float32Array = new Float32Array();
      await withFallback(async p => { q2 = await p.imageEmbedBig({ path: opts.image }); return null as any; });
      
      const rescored = await Promise.all(candidates.map(async (c:any)=>{
        let e: Float32Array = new Float32Array();
        await withFallback(async p => { e = await p.imageEmbedBig({ path: c.image_paths[0] }); return null as any; });
        let dot=0,nq=0,ne=0; for (let i=0;i<e.length;i++){ dot+=q2[i]*e[i]; nq+=q2[i]*q2[i]; ne+=e[i]*e[i]; }
        return { ...c, rerankScore: dot/Math.sqrt(nq*ne) };
      }));
      rescored.sort((a,b)=> b.rerankScore - a.rerankScore);
      
      const context = rescored.slice(0,10).map((r:any)=> ({ id:r.id, title:r.title, ingredients:r.ingredients, servings:r.servings }));
      const prompt = `Return JSON only: {"chosenRecipeId":string,"servings":number,"ingredients":[{"name":string,"qty":number,"unit":string}]}`;
      const chosen = await withFallback(async p => await p.visionJSON({ image:{path:opts.image}, prompt, context }));
      
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
        analysis_date: new Date().toISOString(),
        image: opts.image,
        recipe: chosen,
        nutrition: { items, totals },
        health: ann,
        summary: {
          recipe_id: chosen.chosenRecipeId,
          servings: chosen.servings,
          ingredients_count: ingredients.length,
          health_flags: ann.notes.length,
          verticals_analyzed: verticals
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