import lancedb from "@lancedb/lancedb";
import { CFG } from "../config";

export async function connectDB() { return await lancedb.connect(CFG.storage.lancedbDir); }

export async function upsertRecipes(rows:any[]) {
  const db = await connectDB();
  let t = await db.openTable(CFG.storage.recipesTable).catch(()=>null);
  if (!t) t = await db.createTable(CFG.storage.recipesTable, rows);
  else await t.add(rows);
  return t;
}

export async function openRecipesOrThrow() {
  const db = await connectDB();
  try {
    return await db.openTable(CFG.storage.recipesTable);
  } catch {
    throw new Error("recipes table not found. Did you run `npx gutty ingest-recipes --dir ./Gutty_Data`?");
  }
}

export async function getAllRows(table:any): Promise<any[]> {
  // Newer LanceDB exposes query().toArray(); some builds expose toArray() on the table
  if (typeof table.toArray === "function") {
    return await table.toArray();
  }
  if (typeof table.query === "function") {
    const q = table.query();
    if (typeof q.toArray === "function") return await q.toArray();
  }
  // Last resort: try search over a zero vector if schema allows; otherwise bail
  throw new Error("Cannot iterate rows from LanceDB table (no toArray/query support in this build).");
}

export async function createIndex(tableName:string, column:string) {
  const db = await connectDB();
  const t = await db.openTable(tableName);
  await t.createIndex({ column, indexType: "HNSW", metricType: "cosine" });
}

export async function annSearch(tableName:string, column:string, emb:Float32Array, limit:number, filter?:any) {
  const db = await connectDB(); const t = await db.openTable(tableName);
  let q = t.search(emb).limit(limit);
  if (filter?.vertical) q = q.where(`vertical = '${filter.vertical}'`);
  return await q.toArray();
}
