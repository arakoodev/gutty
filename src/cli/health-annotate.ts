import { Command } from "commander";
import { connectDB } from "../index/lancedb";
import { withFallback } from "../providers/selector";
import { promises as fs } from "fs";

const PREG_HIGH_MERCURY = new Set(["shark","swordfish","king mackerel","tilefish","bigeye tuna","marlin","orange roughy"]);
const PREG_RISK_KEYWORDS = ["raw egg","raw eggs","unpasteurized","deli meat","cold cuts","pate","sprouts"];
const PCOS_FLAGS = ["sugary drink","sugar","refined flour","refined grains","trans fat"];
const ENDO_FLAGS = ["alcohol","processed meat"];
const IBS_HIGH_FODMAP = new Set(["onion","garlic","wheat","rye","barley","apple","pear","watermelon","mango","beans","lentils","chickpeas","cashews","pistachios"]);
const IBS_TRIGGER_KEYWORDS = ["high fat","fried food","spicy food","caffeine","alcohol","artificial sweetener","sorbitol","mannitol"];

export default new Command("health-annotate")
  .requiredOption("--recipe <json>","JSON with {ingredients:[{name,qty,unit}], servings} or output from recipe-rag")
  .requiredOption("--verticals <csv>","comma-separated: pregnancy,pcos,endometriosis,ibs")
  .option("--topk <n>","5")
  .option("--out <path>","./tmp/health_annotations.json")
  .action(async (opts)=>{
    const recipe = JSON.parse(await fs.readFile(opts.recipe,"utf8"));
    const ingredients = recipe.ingredients || recipe?.recipe?.ingredients || [];
    const verticals = opts.verticals.split(",").map((s:string)=>s.trim().toLowerCase());
    const db = await connectDB();
    const t = await db.openTable("health_docs");
    const ann:any = { notes: [], evidence: [] };

    for (const v of verticals){
      let queryTerms = ingredients.map((i:any)=>i.name.toLowerCase());
      if (v==="pregnancy"){
        for (const ing of queryTerms){
          if (PREG_HIGH_MERCURY.has(ing)) ann.notes.push({ vertical:v, ingredient:ing, flag:"high-mercury fish (limit/avoid)", ref:"FDA fish advice" });
        }
        queryTerms = queryTerms.concat(PREG_RISK_KEYWORDS);
      }
      if (v==="pcos"){
        queryTerms = queryTerms.concat(PCOS_FLAGS);
      }
      if (v==="endometriosis"){
        queryTerms = queryTerms.concat(ENDO_FLAGS);
      }
      if (v==="ibs"){
        for (const ing of queryTerms){
          if (IBS_HIGH_FODMAP.has(ing)) ann.notes.push({ vertical:v, ingredient:ing, flag:"high-FODMAP food (may trigger symptoms)", ref:"Monash FODMAP research" });
        }
        queryTerms = queryTerms.concat(IBS_TRIGGER_KEYWORDS);
      }
      const q = Array.from(new Set(queryTerms)).join(", ");
      try {
        const qemb = await withFallback(async p => await p.textEmbed(q));
        const hits = await t.search(qemb).where(`vertical = '${v}'`).limit(Number(opts.topk)).toArray();
        ann.evidence.push({ vertical: v, query: q, hits });
      } catch {}
    }
    await fs.writeFile(opts.out, JSON.stringify(ann, null, 2));
    console.log(`Wrote ${opts.out}`);
  });
