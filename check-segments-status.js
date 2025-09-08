#!/usr/bin/env tsx

import { connectDB } from "./src/index/lancedb.ts";

async function checkSegmentsStatus() {
  console.log("=== CHECKING SEGMENTS INDEX STATUS ===");
  console.log();
  
  try {
    const db = await connectDB();
    
    // Check if segments table exists
    const tables = await db.tableNames();
    console.log(`📋 Available tables: ${tables.join(", ")}`);
    
    if (tables.includes("segments")) {
      const segmentsTable = await db.openTable("segments");
      const count = await segmentsTable.countRows();
      console.log(`📊 Total segments indexed: ${count}`);
      
      if (count > 0) {
        // Show sample records
        const sample = await segmentsTable.query().limit(5).toArray();
        console.log(`\n🔍 Sample records:`);
        sample.forEach((record, i) => {
          console.log(`${i + 1}. ${record.id}`);
          console.log(`   Source: ${record.source}`);
          console.log(`   Label: ${record.label}`);
          console.log(`   Path: ${record.image_path}`);
          console.log(`   Method: ${record.annotation_method || "unknown"}`);
          console.log();
        });
      }
    } else {
      console.log("❌ No segments table found - indexing hasn't been completed yet");
    }
    
  } catch (error) {
    console.error("❌ Failed to check segments status:", error.message);
  }
}

checkSegmentsStatus();