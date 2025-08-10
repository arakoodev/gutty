import { Command } from "commander";
import { openRecipesOrThrow, getAllRows } from "../index/lancedb";
import { withFallback } from "../providers/selector";
import { requireEmbeddingsProvider } from "../providers/availability";
import { promises as fs } from "fs";
import path from "path";

type Progress = { doneIds: Record<string, true> };

async function loadProgress(file:string): Promise<Progress>{
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return { doneIds: {} as Record<string, true> }; }
}
async function saveProgress(file:string, data:Progress){
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

export default new Command("embed-recipes")
  .option("--restart", "Re-embed everything from scratch", false)
  .option("--resume", "Resume: skip rows that already have emb_clip_b32", true)
  .option("--progress <path>", "Progress file", "./tmp/embed.progress.json")
  .action(async (opts) => {
    requireEmbeddingsProvider();
    const t = await openRecipesOrThrow();
    const all = await getAllRows(t);

    const prog = await loadProgress(opts.progress);
    let processed = 0, skipped = 0, failed = 0;

    for (const r of all) {
      const paths = (r.image_paths || []).slice(0,5);
      const embs: Float32Array[] = [];
      for (const pth of paths) {
        try {
          const e = await withFallback(async p => await p.imageEmbed({ path: pth }));
          embs.push(e);
        } catch {}
      }
      if (!embs.length) { skipped++; continue; }
      const d = embs[0].length; const mean = new Float32Array(d);
      for (const e of embs) for (let i=0;i<d;i++) mean[i]+=e[i];
      for (let i=0;i<d;i++) mean[i]/=embs.length;
      r.emb_clip_b32 = Array.from(mean);
      prog.doneIds[r.id] = true;
      processed++;
      if (processed % 10 === 0) await saveProgress(opts.progress, prog);
    }
      try {
        const paths = (r.image_paths || []).slice(0,5);
        const embs: Float32Array[] = [];
        for (const pth of paths) {
          try { embs.push(await provider.imageEmbed({ path: pth })); } catch {}
        }
        if (!embs.length) { skipped++; continue; }
        const d = embs[0].length; const mean = new Float32Array(d);
        for (const e of embs) for (let i=0;i<d;i++) mean[i]+=e[i];
        for (let i=0;i<d;i++) mean[i]/=embs.length;
        r.emb_clip_b32 = Array.from(mean);
        prog.doneIds[r.id] = true;
        processed++;
        if (processed % 10 === 0) await saveProgress(opts.progress, prog);
      } catch {
        failed++;
      }
    }
    // overwrite table once at the end (atomic-ish)
    await t.add(all, { mode: "overwrite" });
    await saveProgress(opts.progress, prog);
    console.log(`Embedding complete. processed=${processed} skipped=${skipped} failed=${failed}`);
  });
