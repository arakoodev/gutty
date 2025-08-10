import { Command } from "commander";
import { withFallback } from "../providers/selector";
import { requireEmbeddingsProvider } from "../providers/availability";
import { upsertSegments, createIndex } from "../index/lancedb";
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

export default new Command("seg-index")
  .option("--foodseg103 <dir>")
  .option("--foodinsseg <dir>")
  .option("--progress <path>", "Progress file", "./tmp/seg-index.progress.json")
  .action(async (opts) => {
    requireEmbeddingsProvider();
    const datasets: {dir:string, source:string}[] = [];
    if (opts.foodseg103) datasets.push({ dir: opts.foodseg103, source: "foodseg103" });
    if (opts.foodinsseg) datasets.push({ dir: opts.foodinsseg, source: "foodinsseg" });
    type Progress = { doneIds: Record<string, true> };
    async function loadProgress(file:string): Promise<Progress>{
      try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return { doneIds:{} }; }
    }
    async function saveProgress(file:string, data:Progress){
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify(data, null, 2));
    }

    const prog = await loadProgress(opts.progress);
    let processed = 0;

    for (const ds of datasets) {
      const files = await walk(ds.dir);
      for (const f of files) {
        const id = `${ds.source}-${path.basename(f)}`;
        if (prog.doneIds[id]) continue;
        const label = path.basename(path.dirname(f));
        try {
          const emb = await withRetry(() => withFallback(p => p.imageEmbed({ path: f })));
          await withRetry(() => upsertSegments([{ id, source: ds.source, label, image_path: f, emb_clip_b32: Array.from(emb) }]));
          prog.doneIds[id] = true;
          processed++;
          if (processed % 10 === 0) await saveProgress(opts.progress, prog);
        } catch (err:any) {
          console.warn(`Failed to index ${f}: ${err?.message || err}`);
        }
      }
    }
    await saveProgress(opts.progress, prog);
    if (!processed) { console.log("No images indexed"); return; }
    await createIndex(CFG.storage.segmentsTable, "emb_clip_b32");
    console.log(`Indexed ${processed} segments`);
  });
