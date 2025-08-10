import { Command } from "commander";
import { connectDB } from "../index/lancedb";
import { withFallback } from "../providers/selector";

export default new Command("health-embed").action(async ()=>{
  const db = await connectDB();
  const t = await db.openTable("health_docs");
  const all = await (typeof (t as any).toArray === "function" ? (t as any).toArray() : (t as any).query().toArray());
  for (const d of all){
    try {
      const e = await withFallback(async p => await p.textEmbed(d.text));
      d.emb_sbert = Array.from(e);
    } catch {}
  }
  await t.add(all, { mode:"overwrite" });
  console.log(`Embedded ${all.length} health docs.`);
});
