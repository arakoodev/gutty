import fetch from "node-fetch";
import { CFG } from "../config";

const ML: Record<string, number> = {
  "milliliter": 1, "ml": 1,
  "liter": 1000, "l": 1000,
  "teaspoon": 4.92892159375, "tsp": 4.92892159375,
  "tablespoon": 14.78676478125, "tbsp": 14.78676478125,
  "fluid ounce": 29.5735295625, "fl oz": 29.5735295625,
  "cup": 236.5882365,
  "pint": 473.176473,
  "quart": 946.352946
};

function normUnit(u?: string) {
  if (!u) return "";
  const s = u.toLowerCase().trim();
  if (s.includes("teaspoon")) return "teaspoon";
  if (s.includes("tsp")) return "tsp";
  if (s.includes("tablespoon")) return "tablespoon";
  if (s.includes("tbsp")) return "tbsp";
  if (s.includes("fluid ounce")) return "fluid ounce";
  if (s === "fl oz") return "fl oz";
  if (s.includes("cup")) return "cup";
  if (s.includes("pint")) return "pint";
  if (s.includes("quart")) return "quart";
  if (s.includes("milliliter") || s === "ml") return "ml";
  if (s.includes("liter") || s === "l") return "l";
  return s;
}

export type DensityResult = {
  byVolume: Record<string, number>;
  byPiece: Record<string, number>;
};

export async function fetchFdcDetails(fdcId: number) {
  const url = `https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${CFG.fdc.apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FDC ${fdcId} ${res.status}`);
  return await res.json();
}

export function computeDensities(food: any): DensityResult {
  const out: DensityResult = { byVolume: {}, byPiece: {} };
  const portions = food?.foodPortions ?? [];
  const volSamples: Record<string, number[]> = {};

  for (const p of portions) {
    const desc = (p.portionDescription || p.modifier || "").toLowerCase();
    const mu = normUnit(p?.measureUnit?.name || p?.measureUnit?.abbreviation || desc);
    const amount = Number(p?.amount || 1);
    const g = Number(p?.gramWeight || 0);
    if (!g || !amount) continue;
    if (ML[mu]) {
      const ml = ML[mu] * amount;
      const dens = g / ml;
      (volSamples[mu] = volSamples[mu] || []).push(dens);
    } else {
      if (desc && /piece|slice|unit|patty|stick|waffle|pancake|cookie|bar|biscuit/.test(desc)) {
        out.byPiece[desc] = g / amount;
      }
    }
  }
  for (const [u, arr] of Object.entries(volSamples)) {
    if (arr.length) {
      const s = arr.sort((a,b)=>a-b);
      out.byVolume[u] = s[Math.floor(s.length/2)];
    }
  }
  return out;
}

export function toGramsUsingDensity(qty: number, unit: string, dens: DensityResult, fallbackPer100g?: number) {
  const u = normUnit(unit);
  if (ML[u] && dens.byVolume[u]) return qty * ML[u] * dens.byVolume[u];
  const preferred = ["cup","tablespoon","tbsp","teaspoon","tsp","ml","l","fluid ounce","fl oz","pint","quart"];
  for (const k of preferred) {
    if (dens.byVolume[k] && ML[u]) {
      return qty * ML[u] * dens.byVolume[k];
    }
  }
  const pieceKey = Object.keys(dens.byPiece).find(k => unit.toLowerCase().includes(k.split(" ")[1] || "piece"));
  if (pieceKey) return qty * dens.byPiece[pieceKey];
  if (u.includes("g")) return qty;
  if (u.includes("kg")) return qty * 1000;
  if (fallbackPer100g) return qty * fallbackPer100g;
  return qty;
}
