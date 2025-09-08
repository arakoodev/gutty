import { Command } from "commander";
import { createIndex } from "../index/lancedb";
import { CFG } from "../config";

export default new Command("create-index")
  .description("Create vector index for segments table")
  .option("--table <name>", "Table name to create index for", "segments")
  .option("--column <name>", "Column name to index", "emb_clip_b32")
  .action(async (opts) => {
    console.log("🔧 Creating vector index...");
    console.log(`📊 Table: ${opts.table}`);
    console.log(`📋 Column: ${opts.column}`);
    
    try {
      await createIndex(opts.table, opts.column);
      console.log("✅ Vector index created successfully!");
    } catch (error: any) {
      console.error("❌ Index creation failed:");
      console.error(`Error: ${error.message}`);
      
      if (error.message.includes("List(Field")) {
        console.log("\n💡 Note: This error indicates the embedding column is stored as List<Float64>");
        console.log("   instead of a proper vector column. This is a known LanceDB issue.");
        console.log("   The data is still searchable using manual similarity search.");
      }
      
      process.exit(1);
    }
  });