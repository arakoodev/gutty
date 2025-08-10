import Replicate from "replicate";
import fs from "fs/promises";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN || "" });

function need(key:string){
  if (!key) throw new Error("REPLICATE_API_TOKEN missing in env");
}

async function fileOrUrl(input:{path?:string,url?:string}){
  if (input.url) return input.url as any;
  if (!input.path) throw new Error("Provide path or url");
  const buf = await fs.readFile(input.path);
  return buf as any; // SDK uploads buffers automatically
}

function pick<T=any>(obj:any, keys:string[]): T{
  for (const k of keys) if (obj && k in obj) return obj[k];
  return obj;
}

export const replicateApi = {
  imageEmbed: async ({path,url}:{path?:string,url?:string}) => {
    need(replicate.auth as string);
    const model = process.env.REPLICATE_IMG_EMBED_MODEL || "krthr/clip-embeddings";
    const out:any = await replicate.run(model, { input: { image: await fileOrUrl({path,url}) } });
    const arr:number[] = pick(out, ["image_embedding","embedding"]);
    if (!arr || !Array.isArray(arr)) throw new Error("Replicate embedding output not recognized");
    return new Float32Array(arr);
  },
  imageEmbedBig: async ({path,url}:{path?:string,url?:string}) => {
    return await replicateApi.imageEmbed({path,url});
  },
  textEmbed: async (text:string) => {
    need(replicate.auth as string);
    const model = process.env.REPLICATE_TEXT_EMBED_MODEL || "krthr/clip-embeddings";
    const out:any = await replicate.run(model, { input: { text } });
    const arr:number[] = pick(out, ["text_embedding","embedding"]);
    if (!arr || !Array.isArray(arr)) throw new Error("Replicate text embedding output not recognized");
    return new Float32Array(arr);
  },
  visionJSON: async ({image, prompt, context}:{image:{path?:string,url?:string},prompt:string,context?:any}) => {
    need(replicate.auth as string);
    const model = process.env.REPLICATE_VISION_MODEL || "lucataco/ollama-llama3.2-vision-11b";
    const sys = "Return JSON only. No prose.";
    const text = `${sys}\n${prompt}\nContext:\n${JSON.stringify(context).slice(0,5000)}`;
    const out:any = await replicate.run(model, { input: { prompt: text, image: await fileOrUrl(image) } });
    const s = Array.isArray(out) ? out.join("") : String(out);
    return JSON.parse(s);
  },
  textJSON: async (prompt:string) => {
    need(replicate.auth as string);
    const model = process.env.REPLICATE_TEXT_MODEL || "meta/meta-llama-3-70b-instruct";
    const out:any = await replicate.run(model, { input: { prompt: prompt + "\nReturn JSON only.", temperature: 0.2, max_tokens: 512 } });
    const s = Array.isArray(out) ? out.join("") : String(out);
    return JSON.parse(s);
  }
};
