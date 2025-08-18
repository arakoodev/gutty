import { Command } from "commander";
import { promises as fs } from "fs";
import { withFallback } from "../providers/selector";

export default new Command("recipe-rag")
  .requiredOption("--image <path>")
  .requiredOption("--candidates <path>")
  .option("--out <path>","./tmp/recipe.json")
  .action(async (opts)=>{
    const ranked = JSON.parse(await fs.readFile(opts.candidates,"utf8")).ranked;
    const context = ranked.map((r:any)=> ({ id:r.id, title:r.title, ingredients:r.ingredients, servings:r.servings }));
    const prompt = `You are analyzing a food photo with candidate recipes. Your task is to identify what's ACTUALLY visible in the image and extract realistic ingredients.

CRITICAL ANALYSIS RULES:
1. VISUAL EVIDENCE ONLY: Only include ingredients you can see or reasonably infer from the image
2. ELIMINATE UNLIKELY ITEMS: If candidate recipes contain ingredients that don't match the visual evidence, exclude them
3. CUISINE CONTEXT: Consider the cooking style, presentation, and cultural context visible in the image  
4. SMART SUBSTITUTIONS: If recipes suggest meat but you see vegetables, substitute appropriately
5. REALISTIC PORTIONS: Adjust quantities to match what's actually shown

COMMON SENSE CHECKS:
- If you see a vegetable curry, don't include beef/chicken from candidate recipes
- If you see Indian/South Asian presentation, prioritize vegetarian ingredients
- If you see clear broth, don't assume beef broth - could be vegetable broth
- If you see green vegetables that look like bottle gourd/lauki, identify them correctly

Return strict JSON:
{"chosenRecipeId":string,"confidence":0..1,"servings":number,"ingredients":[{"name":string,"qty":number,"unit":string,"notes?":string}]}

Base your analysis on VISUAL EVIDENCE, not just recipe text. Be smart about eliminating ingredients that don't match what you actually see.`;
    const out = await withFallback(async p => await p.visionJSON({ image:{path:opts.image}, prompt, context }));
    await fs.writeFile(opts.out, JSON.stringify(out, null, 2));
    console.log(`Wrote ${opts.out}`);
  });
