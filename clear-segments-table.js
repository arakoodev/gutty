#!/usr/bin/env tsx

import { connectDB } from "./src/index/lancedb.js";

async function clearSegmentsTable() {
  console.log("=== CLEARING SEGMENTS TABLE FOR REINDEXING ===");
  console.log();
  
  try {
    const db = await connectDB();
    
    // Try to drop the segments table completely
    try {
      await db.dropTable("segments");
      console.log("✅ Successfully dropped existing segments table");
    } catch (err) {
      console.log("ℹ️ No existing segments table found (this is fine)");
    }
    
    console.log();
    console.log("🔄 Ready for fresh indexing with semantic COCO labels!");
    console.log();
    
  } catch (error) {
    console.error("❌ Failed to clear segments table:", error.message);
  }
}

clearSegmentsTable();