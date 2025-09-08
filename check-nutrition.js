#!/usr/bin/env tsx

import { connectDB } from "./src/index/lancedb.ts";
import { CFG } from "./src/config.ts";

async function checkNutritionData() {
  console.log("=== CHECKING NUTRITION DATABASE ===");
  console.log();

  try {
    const db = await connectDB();
    
    // Check nutrition_facts table
    try {
      console.log("📊 Nutrition Facts Table:");
      const nutritionTable = await db.openTable(CFG.storage.nutritionTable);
      // Try different approaches to read the table
      let nutritionRows = [];
      try {
        // First try: simple limit query
        nutritionRows = await nutritionTable.limit(10).toArray();
      } catch (e1) {
        try {
          // Second try: search with empty string
          nutritionRows = await nutritionTable.search("food").limit(10).toArray();
        } catch (e2) {
          console.log("   Search failed, trying alternative methods...");
        }
      }
      console.log(`   Total rows: ${nutritionRows.length}`);
      
      if (nutritionRows.length > 0) {
        console.log("   Sample columns:", Object.keys(nutritionRows[0]));
        console.log("   Sample rows:");
        nutritionRows.slice(0, 3).forEach((row, i) => {
          console.log(`   ${i + 1}. ${row.food_name || row.name || 'Unknown'} - ${row.calories_per_100g || row.calories || '?'} cal`);
        });
      }
    } catch (error) {
      console.log("   ❌ Error reading nutrition table:", error.message);
    }

    // Check FODMAP table
    try {
      console.log("\n🥗 FODMAP Table:");
      const fodmapTable = await db.openTable(CFG.storage.fodmapTable);
      const fodmapRows = await fodmapTable.search("").limit(100).toArray();
      console.log(`   Total rows: ${fodmapRows.length}`);
      
      if (fodmapRows.length > 0) {
        console.log("   Sample columns:", Object.keys(fodmapRows[0]));
        console.log("   Sample rows:");
        fodmapRows.slice(0, 3).forEach((row, i) => {
          console.log(`   ${i + 1}. ${row.food_name || row.name || 'Unknown'} - ${row.fodmap_level || 'Unknown'} FODMAP`);
        });
      }
    } catch (error) {
      console.log("   ❌ Error reading FODMAP table:", error.message);
    }

    // Check glycemic index table
    try {
      console.log("\n📈 Glycemic Index Table:");
      const glycemicTable = await db.openTable(CFG.storage.glycemicTable);
      const glycemicRows = await glycemicTable.search("").limit(100).toArray();
      console.log(`   Total rows: ${glycemicRows.length}`);
      
      if (glycemicRows.length > 0) {
        console.log("   Sample columns:", Object.keys(glycemicRows[0]));
        console.log("   Sample rows:");
        glycemicRows.slice(0, 3).forEach((row, i) => {
          console.log(`   ${i + 1}. ${row.food_name || row.name || 'Unknown'} - GI: ${row.gi_value || row.glycemic_index || '?'}`);
        });
      }
    } catch (error) {
      console.log("   ❌ Error reading glycemic table:", error.message);
    }

  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
  }
}

checkNutritionData();