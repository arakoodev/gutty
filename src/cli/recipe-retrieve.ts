import { Command } from "commander";
import { annSearch } from "../index/lancedb";
import { withFallback } from "../providers/selector";
import { promises as fs } from "fs";

export default new Command("recipe-retrieve")
  .requiredOption("--image <path>")
  .option("--topk <n>","50")
  .option("--out <path>","./tmp/candidates.json")
  .action(async (opts)=>{
    let qEmb: Float32Array = new Float32Array();
    await withFallback(async p => { qEmb = await p.imageEmbed({path: opts.image}); return null as any; });
    const hits = await annSearch("recipes","emb_clip_b32", qEmb, Number(opts.topk));
    await fs.writeFile(opts.out, JSON.stringify({candidates:hits}, null, 2));
    console.log(`Wrote ${opts.out}`);
  });
