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
    const prompt = `You see a food photo plus N candidate recipes (title, ingredients, servings).
Return strict JSON:
{"chosenRecipeId":string,"confidence":0..1,"servings":number,"ingredients":[{"name":string,"qty":number,"unit":string,"notes?":string}]}
Rules: match visible items; if unsure between 'paneer' vs 'tofu', pick one and add notes. Keep amounts realistic for one serving.`;
    const out = await withFallback(async p => await p.visionJSON({ image:{path:opts.image}, prompt, context }));
    await fs.writeFile(opts.out, JSON.stringify(out, null, 2));
    console.log(`Wrote ${opts.out}`);
  });
