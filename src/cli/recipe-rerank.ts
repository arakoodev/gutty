import { Command } from "commander";
import { withFallback } from "../providers/selector";
import { promises as fs } from "fs";

export default new Command("recipe-rerank")
  .requiredOption("--image <path>")
  .requiredOption("--candidates <path>")
  .option("--topn <n>","10")
  .option("--out <path>","./tmp/ranked.json")
  .action(async (opts)=>{
    let q: Float32Array = new Float32Array();
    await withFallback(async p => { q = await p.imageEmbedBig({path: opts.image}); return null as any; });
    const { candidates } = JSON.parse(await fs.readFile(opts.candidates,"utf8"));
    const rescored:any[] = [];
    for (const c of candidates) {
      const rep = c.image_paths?.[0];
      let e: Float32Array = new Float32Array();
      await withFallback(async p => { e = await p.imageEmbedBig({path: rep}); return null as any; });
      let dot=0,nq=0,ne=0;
      for(let i=0;i<e.length;i++){ dot+=q[i]*e[i]; nq+=q[i]*q[i]; ne+=e[i]*e[i]; }
      rescored.push({ ...c, rerankScore: dot/Math.sqrt(nq*ne) });
    }
    rescored.sort((a,b)=> b.rerankScore - a.rerankScore);
    await fs.writeFile(opts.out, JSON.stringify({ ranked: rescored.slice(0, Number(opts.topn)) }, null, 2));
    console.log(`Wrote ${opts.out}`);
  });
