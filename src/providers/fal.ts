import { fal } from "@fal-ai/client";
import fs from "fs/promises";

if (process.env.FAL_KEY) {
  fal.config({ credentials: process.env.FAL_KEY });
}

async function uploadFile(path:string){
  const buf = await fs.readFile(path);
  const file = new File([buf], path.split(/[\\/]/).pop() || "file.bin");
  const url = await fal.storage.upload(file);
  return url;
}

export const falApi = {
  imageEmbed: async () => { throw new Error("FAL image embeddings not configured. Use Vertex or Replicate."); },
  imageEmbedBig: async () => { throw new Error("FAL image embeddings not configured. Use Vertex or Replicate."); },
  textEmbed: async () => { throw new Error("FAL text embeddings not configured. Use Vertex or Replicate."); },
  visionJSON: async ({image, prompt, context}:{image:{path?:string,url?:string},prompt:string,context?:any}) => {
    const endpoint = process.env.FAL_VISION_ENDPOINT || "fal-ai/any-llm";
    const image_url = image.url || (image.path ? await uploadFile(image.path) : undefined);
    const sys = "Return JSON only. No prose.";
    const input:any = { prompt: `${sys}\n${prompt}\nContext:\n${JSON.stringify(context).slice(0,5000)}` };
    if (image_url) input.image_url = image_url;
    const res:any = await fal.subscribe(endpoint, { input, logs: false });
    const s = typeof res?.data?.output === "string" ? res.data.output : (res?.data?.text || JSON.stringify(res?.data));
    return JSON.parse(s);
  },
  textJSON: async (prompt:string) => {
    const endpoint = process.env.FAL_TEXT_ENDPOINT || "fal-ai/any-llm";
    const res:any = await fal.subscribe(endpoint, { input: { prompt: prompt + "\nReturn JSON only."}, logs: false });
    const s = typeof res?.data?.output === "string" ? res.data.output : (res?.data?.text || JSON.stringify(res?.data));
    return JSON.parse(s);
  }
};
