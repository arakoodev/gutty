import { Command } from "commander";
import { createIndex } from "../index/lancedb";
export default new Command("health-build-index").action(async ()=>{
  await createIndex("health_docs","emb_sbert");
  console.log("HNSW index for health_docs created.");
});
