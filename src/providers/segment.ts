import Replicate from "replicate";
import fs from "fs/promises";
import { withRetry } from "../util/retry";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN || "" });

function need(key:string){
  if (!key) throw new Error("REPLICATE_API_TOKEN missing in env");
}

async function fileOrUrl(input:{path?:string,url?:string}){
  if (input.url) return input.url as any;
  if (!input.path) throw new Error("Provide path or url");
  const buf = await fs.readFile(input.path);
  return buf as any;
}

export type Segment = { label: string; mask: Buffer };

export async function groundedSam2(image:{path?:string,url?:string}, prompts:string[]): Promise<Segment[]> {
  need(replicate.auth as string);
  const model = process.env.REPLICATE_SEG_MODEL || "nateraw/grounded-sam-2";
  const out:any = await withRetry(async () =>
    await replicate.run(model, { input: { image: await fileOrUrl(image), prompts: prompts.join(",") } })
  );
  const segs: Segment[] = [];
  let i = 0;
  for (const s of out as any[]) {
    const label = s.label || s.class || `segment${i}`;
    const b64: string = s.mask || s.mask_png || "";
    if (!b64) continue;
    const base = b64.startsWith("data:") ? b64.split(",")[1] : b64;
    const buf = Buffer.from(base, "base64");
    segs.push({ label, mask: buf });
    i++;
  }
  return segs;
}
