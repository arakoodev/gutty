import fetch from "node-fetch";
import { CFG } from "../config";
import { fetchFdcDetails, computeDensities, toGramsUsingDensity } from "./density";

type Item = { name:string; qty:number; unit:string };

async function searchFdc(q:string){
  const params = new URLSearchParams({
    query: q, pageSize: "1",
    dataType: ["SR Legacy","Foundation","Branded"].join(","),
    api_key: CFG.fdc.apiKey
  });
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FDC search failed: ${res.status}`);
  const j:any = await res.json();
  return j?.foods?.[0];
}

function macrosFromFoodsNutrients(arr:any[]){
  const pick = (n:string)=> (arr.find((x:any)=>x.nutrientName?.toLowerCase().includes(n))?.value)||0;
  return { kcal: pick("energy"), protein: pick("protein"), fat: pick("fat"), carbs: pick("carbohydrate") };
}
function scale(m:{kcal:number,protein:number,fat:number,carbs:number}, f:number){
  return { kcal: m.kcal*f, protein:m.protein*f, fat:m.fat*f, carbs:m.carbs*f };
}

export async function mapToUSDA(items: Item[]) {
  const out:any[] = [];
  for (const it of items) {
    const hit = await searchFdc(it.name);
    if (!hit) continue;
    const details = await fetchFdcDetails(hit.fdcId);
    const dens = computeDensities(details);
    const per100 = macrosFromFoodsNutrients(details.foodNutrients || hit.foodNutrients || []);
    const grams = toGramsUsingDensity(it.qty, it.unit, dens);
    out.push({ name: it.name, grams, ...scale(per100, grams/100), fdcId: hit.fdcId, density: dens });
  }
  return out;
}

export function computeTotals(list:any[]){
  return list.reduce((a:any,b:any)=>({
    kcal:a.kcal+b.kcal, protein:a.protein+b.protein, fat:a.fat+b.fat, carbs:a.carbs+b.carbs
  }), {kcal:0,protein:0,fat:0,carbs:0});
}
