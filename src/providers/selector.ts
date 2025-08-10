import { vertex } from "./vertex";
import { replicateApi } from "./replicate";
import { falApi } from "./fal";

export type Provider = {
  imageEmbed: (img:{path?:string,url?:string})=>Promise<Float32Array>;
  imageEmbedBig: (img:{path?:string,url?:string})=>Promise<Float32Array>;
  textEmbed: (t:string)=>Promise<Float32Array>;
  visionJSON: (a:{image:{path?:string,url?:string},prompt:string,context?:any})=>Promise<any>;
  textJSON: (prompt:string)=>Promise<any>;
};

export function getProvider(): Provider { return vertex; }

export async function withProvider<T>(fn:(p:Provider)=>Promise<T>) { return await fn(getProvider()); }

export async function withFallback<T>(fn:(p:Provider)=>Promise<T>): Promise<T> {
  const chain: Provider[] = [vertex, replicateApi as any, falApi as any];
  let lastErr:any;
  for (const p of chain) {
    try { return await fn(p); } catch (e:any) { lastErr = e; }
  }
  throw lastErr || new Error("All providers failed");
}
