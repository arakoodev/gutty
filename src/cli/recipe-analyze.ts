import { Command } from "commander";
import { promises as fs } from "fs";
import { withFallback } from "../providers/selector";
import { annSearch } from "../index/lancedb";
import { mapToUSDA, computeTotals } from "../nutrition/usda_pipeline";

export default new Command("recipe-analyze")
  .requiredOption("--image <path>")
  .option("--topk <n>", "50")
  .option("--out <path>", "./analysis.json")
  .action(async (opts) => {
    let q: Float32Array = new Float32Array();
    await withFallback(async p => { q = await p.imageEmbed({ path: opts.image }); return null as any; });
    const candidates = await annSearch("recipes","emb_clip_b32", q, Number(opts.topk));
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
    const items = await mapToUSDA(chosen.ingredients);
    const totals = computeTotals(items);
    await fs.mkdir(require("path").dirname(opts.out), { recursive: true });
    await fs.writeFile(opts.out, JSON.stringify({ recipe: chosen, items, totals }, null, 2));
    console.log(`Wrote ${opts.out}`);
  });
