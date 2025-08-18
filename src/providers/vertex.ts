import { VertexAI } from "@google-cloud/vertexai";
import { GoogleAuth } from "google-auth-library";
import { CFG } from "../config";
import fs from "fs/promises";

let v: VertexAI | null = null;
let auth: GoogleAuth | null = null;

function getClient() {
  if (!v) {
    v = new VertexAI({ project: CFG.providers.vertex.projectId, location: CFG.providers.vertex.location });
  }
  return v;
}

function getAuth() {
  if (!auth) {
    auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
  }
  return auth;
}

async function fileToBase64(path: string) {
  const b = await fs.readFile(path);
  return b.toString("base64");
}

export const vertex = {
  imageEmbed: async ({ path, url }: { path?: string; url?: string }) => {
    const auth = getAuth();
    const authClient = await auth.getClient();
    const accessToken = await authClient.getAccessToken();
    
    const imageData = path ? await fileToBase64(path) : null;
    const apiUrl = `https://us-central1-aiplatform.googleapis.com/v1/projects/${CFG.providers.vertex.projectId}/locations/us-central1/publishers/google/models/multimodalembedding@001:predict`;
    
    const body = {
      instances: [{
        image: path 
          ? { bytesBase64Encoded: imageData }
          : { gcsUri: url }
      }]
    };
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Vertex AI API error ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    const embeddings = result.predictions?.[0]?.imageEmbedding;
    
    if (!embeddings) {
      throw new Error("No imageEmbedding in response from multimodalembedding@001");
    }
    
    return new Float32Array(embeddings);
  },
  imageEmbedBig: async ({ path, url }: { path?: string; url?: string }) => {
    return await vertex.imageEmbed({ path, url });
  },
  textEmbed: async ({ text }: { text: string }) => {
    const auth = getAuth();
    const authClient = await auth.getClient();
    const accessToken = await authClient.getAccessToken();
    
    const apiUrl = `https://us-central1-aiplatform.googleapis.com/v1/projects/${CFG.providers.vertex.projectId}/locations/us-central1/publishers/google/models/multimodalembedding@001:predict`;
    
    const body = {
      instances: [{
        text: text
      }]
    };
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Vertex AI text embedding error ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    const embeddings = result.predictions?.[0]?.textEmbedding;
    
    if (!embeddings) {
      throw new Error("No textEmbedding in response from multimodalembedding@001");
    }
    
    return new Float32Array(embeddings);
  },
  visionJSON: async ({ image, prompt, context }: { image: { path?: string; url?: string }; prompt: string; context?: any }) => {
    const model = getClient().getGenerativeModel({ model: CFG.providers.vertex.visionLLM });
    const img = image.path
      ? { inlineData: { mimeType: "image/jpeg", data: await fileToBase64(image.path) } }
      : { fileData: { fileUri: image.url! } };
    const sys = "Return JSON only. No prose.";
    const contents = [
      { role: "user", parts: [{ text: sys }] },
      { role: "user", parts: [img, { text: `${prompt}\nContext:\n${JSON.stringify(context).slice(0, 5000)}` }] }
    ];
    const resp: any = await model.generateContent({ contents });
    const text = resp?.response?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "{}";
    return JSON.parse(text);
  },
  textJSON: async (prompt: string) => {
    const model = getClient().getGenerativeModel({ model: CFG.providers.vertex.textLLM });
    const resp: any = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt + "\nReturn JSON only." }] }] });
    const text = resp?.response?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "{}";
    return JSON.parse(text);
  }
};
