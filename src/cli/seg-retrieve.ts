import { Command } from "commander";
import { withFallback } from "../providers/selector";
import { requireEmbeddingsProvider } from "../providers/availability";
import { annSearch } from "../index/lancedb";
import { CFG } from "../config";
import { promises as fs } from "fs";
import path from "path";
import { withRetry } from "../util/retry";

async function walk(dir:string): Promise<string[]> {
  const out:string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else if (/\.(jpg|jpeg|png)$/i.test(e.name)) out.push(p);
  }
  return out;
}

export default new Command("seg-retrieve")
  .requiredOption("--masks <dir>")
  .option("--topk <n>", "10")
  .option("--out <path>", "./tmp/seg_matches.json")
  .option("--progress <path>", "./tmp/seg-retrieve.progress.json")
  .action(async (opts) => {
    requireEmbeddingsProvider();
    const files = await walk(opts.masks);
    const progressPath = opts.progress || opts.out;
    let res:any;
    try { res = JSON.parse(await fs.readFile(progressPath, "utf8")); } catch { res = {}; }
    let processed = 0;
    for (const f of files) {
      if (res[f]) continue;
      try {
        const emb = await withRetry(() => withFallback(p => p.imageEmbed({ path: f })));
        const hits = await withRetry(() => annSearch(CFG.storage.segmentsTable, "emb_clip_b32", emb, Number(opts.topk)));
        res[f] = hits;
        processed++;
        if (processed % 10 === 0) await fs.writeFile(progressPath, JSON.stringify(res, null, 2));
      } catch (err:any) {
        console.warn(`Failed to retrieve for ${f}: ${err?.message || err}`);
      }
    }
    await fs.writeFile(progressPath, JSON.stringify(res, null, 2));
    if (opts.out !== progressPath) await fs.writeFile(opts.out, JSON.stringify(res, null, 2));
    console.log(`Wrote ${opts.out}`);
  });
