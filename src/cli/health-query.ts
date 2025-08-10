import { Command } from "commander";
import { connectDB } from "../index/lancedb";
import { withFallback } from "../providers/selector";
import { promises as fs } from "fs";

export default new Command("health-query")
  .requiredOption("--vertical <name>","pcos|endometriosis|pregnancy")
  .requiredOption("--query <text>")
  .option("--topk <n>","5")
  .option("--out <path>","./tmp/health_hits.json")
  .action(async (opts)=>{
    const db = await connectDB();
    const t = await db.openTable("health_docs");
    const qemb = await withFallback(async p => await p.textEmbed(opts.query));
    const hits = await t.search(qemb).where(`vertical = '${opts.vertical.toLowerCase()}'`).limit(Number(opts.topk)).toArray();
    await fs.writeFile(opts.out, JSON.stringify({query: opts.query, hits}, null, 2));
    console.log(`Wrote ${opts.out}`);
  });
