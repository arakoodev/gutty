import { upsertRecipes } from "../index/lancedb";
import fs from "fs/promises";
import path from "path";

export async function ingestLocalCalData(dir:string) {
  const rows:any[] = [];
  const recipes = await fs.readdir(dir);
  for (const rid of recipes) {
    const rp = path.join(dir, rid);
    const stat = await fs.stat(rp).catch(()=>null);
    if (!stat || !stat.isDirectory()) continue;
    const files = await fs.readdir(rp);
    const images = files.filter(f=>/\.(jpg|jpeg|png|webp)$/i.test(f)).slice(0,5).map(f=>path.join(rp,f));
    if (!images.length) continue;
    const metaPath = files.find(f=>/meta\.json$/i.test(f));
    const meta = metaPath ? JSON.parse(await fs.readFile(path.join(rp, metaPath), "utf8")) : {};
    rows.push({ id: rid, title: meta.title || rid, label: meta.label || meta.title || rid, image_paths: images, ingredients: meta.ingredients || [], servings: meta.servings || 1 });
  }
  await upsertRecipes(rows);
  return rows.length;
}
