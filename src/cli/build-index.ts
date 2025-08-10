import { Command } from "commander";
import { createIndex } from "../index/lancedb";
export default new Command("build-index").action(async ()=>{
  await createIndex("recipes","emb_clip_b32");
  console.log("HNSW index created.");
});
