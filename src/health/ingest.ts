import fs from "fs/promises";
import path from "path";
import { connectDB } from "../index/lancedb";

export async function ingestHealthKB(dir:string){
  const rows:any[] = [];
  const verticals = await fs.readdir(dir).catch(()=>[]);
  for (const v of verticals){
    const vp = path.join(dir, v);
    const stat = await fs.stat(vp).catch(()=>null);
    if (!stat || !stat.isDirectory()) continue;
    const files = await fs.readdir(vp);
    for (const f of files){
      if (!/\.md$/i.test(f)) continue;
      const full = path.join(vp, f);
      const txt = await fs.readFile(full, "utf8");
      // crude metadata: first line as title; URL if present in a Markdown link [ref](url)
      const title = (txt.split(/\r?\n/)[0] || "").replace(/^#\s*/,"") || f.replace(/\.md$/,"");
      const urlMatch = txt.match(/\((https?:[^\)]+)\)/);
      rows.push({ id: `${v}-${f}`, vertical: v.toLowerCase(), title, text: txt, source_url: urlMatch ? urlMatch[1] : "" });
    }
  }
  const db = await connectDB();
  let t = await db.openTable("health_docs").catch(()=>null);
  if (!t) t = await db.createTable("health_docs", rows);
  else await t.add(rows);
  return rows.length;
}
