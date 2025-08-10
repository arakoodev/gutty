import { Command } from "commander";
import { groundedSam2 } from "../providers/segment";
import { withRetry } from "../util/retry";
import { promises as fs } from "fs";
import path from "path";

export default new Command("seg-extract")
  .requiredOption("--image <path>")
  .option("--labels <list>", "Comma separated labels", "")
  .option("--out <dir>", "./tmp/seg")
  .action(async (opts) => {
    const prompts = String(opts.labels || "").split(",").map((s:string)=>s.trim()).filter(Boolean);
    try {
      const segs = await withRetry(() => groundedSam2({ path: opts.image }, prompts));
      await fs.mkdir(opts.out, { recursive: true });
      let i = 0;
      for (const s of segs) {
        const file = path.join(opts.out, `${s.label.replace(/\s+/g,"_")}_${i}.png`);
        await fs.writeFile(file, s.mask);
        i++;
      }
      console.log(`Wrote ${i} masks to ${opts.out}`);
    } catch (err:any) {
      console.error(`Segmentation failed: ${err?.message || err}`);
    }
  });
