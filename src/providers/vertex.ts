import { VertexAI } from "@google-cloud/vertexai";
import { CFG } from "../config";
import fs from "fs/promises";

const v = new VertexAI({ project: CFG.providers.vertex.projectId, location: CFG.providers.vertex.location });
async function fileToBase64(path:string){ const b = await fs.readFile(path); return b.toString("base64"); }

export const vertex = {
  imageEmbed: async ({path,url}:{path?:string,url?:string}) => {
    const model = v.getGenerativeModel({ model: CFG.providers.vertex.imgEmbed });
    const img = path ? { inlineData: { mimeType: "image/jpeg", data: await fileToBase64(path) } }
                     : { fileData: { fileUri: url! } };
    const res:any = await model.embedContent({ content: { parts: [img] }});
    return new Float32Array(res.embedding.values);
  },
  imageEmbedBig: async ({path,url}:{path?:string,url?:string}) => {
    return await vertex.imageEmbed({path,url});
  },
  textEmbed: async (text:string) => {
    const model = v.getGenerativeModel({ model: CFG.providers.vertex.txtEmbed });
    const res:any = await model.embedContent({ content: { parts: [{ text }] }});
    return new Float32Array(res.embedding.values);
  },
  visionJSON: async ({image, prompt, context}:{image:{path?:string,url?:string},prompt:string,context?:any}) => {
    const model = v.getGenerativeModel({ model: CFG.providers.vertex.visionLLM });
    const img = image.path ? { inlineData: { mimeType: "image/jpeg", data: await fileToBase64(image.path) } }
                           : { fileData: { fileUri: image.url! } };
    const sys = "Return JSON only. No prose.";
    const contents = [
      { role:"user", parts:[{text: sys}] },
      { role:"user", parts:[img, {text: `${prompt}\nContext:\n${JSON.stringify(context).slice(0,5000)}`}] }
    ];
    const resp:any = await model.generateContent({ contents });
    const text = resp?.response?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text).join("") || "{}";
    return JSON.parse(text);
  },
  textJSON: async (prompt:string) => {
    const model = v.getGenerativeModel({ model: CFG.providers.vertex.textLLM });
    const resp:any = await model.generateContent({ contents: [{ role:"user", parts:[{text: prompt + "\nReturn JSON only."}] }] });
    const text = resp?.response?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text).join("") || "{}";
    return JSON.parse(text);
  }
};
