#!/usr/bin/env tsx

import { connectDB } from "./src/index/lancedb.js";

async function checkFoodSeg103Data() {
  console.log("=== CHECKING FOODSEG103 SEMANTIC LABELS ===");
  console.log();
  
  try {
    const db = await connectDB();
    const segmentsTable = await db.openTable("segments");
    
    // Get all segments and filter for foodseg103
    const allSegments = await segmentsTable.query().limit(2500).toArray();
    const foodseg103Segments = allSegments.filter(s => s.source === "foodseg103");
    
    console.log(`📊 Total segments: ${allSegments.length}`);
    console.log(`📊 FoodSeg103 segments: ${foodseg103Segments.length}`);
    console.log();
    
    if (foodseg103Segments.length === 0) {
      console.log("❌ No FoodSeg103 segments found! Only FoodInsSeg data is indexed.");
      console.log();
      console.log("🔍 ISSUE IDENTIFIED:");
      console.log("The system indexed 2,220 FoodInsSeg images (unlabeled food photos)");
      console.log("but did NOT index FoodSeg103 data (which has semantic food labels).");
      console.log();
      console.log("💡 SOLUTION:");
      console.log("Need to run segmentation indexing on FoodSeg103 dataset to get");
      console.log("semantic food labels like 'tomato', 'rice', 'curry', etc.");
    } else {
      console.log("✅ Found FoodSeg103 segments with semantic labels:");
      foodseg103Segments.slice(0, 10).forEach((segment, i) => {
        console.log(`${i + 1}. ID: ${segment.id}`);
        console.log(`   Label: ${segment.label}`);
        console.log(`   Path: ${segment.image_path}`);
        console.log();
      });
    }
    
    // Check what labels we actually have
    const labelCounts = {};
    allSegments.forEach(s => {
      if (s.label && s.label !== "foodinsseg" && s.label !== "images") {
        labelCounts[s.label] = (labelCounts[s.label] || 0) + 1;
      }
    });
    
    console.log("=== CURRENT SEMANTIC LABELS ===");
    const sortedLabels = Object.entries(labelCounts)
      .sort((a, b) => b[1] - a[1]);
      
    if (sortedLabels.length === 0) {
      console.log("❌ NO meaningful semantic food labels found!");
      console.log("All segments have generic labels like 'foodinsseg' or 'images'");
    } else {
      console.log("Available food labels:");
      sortedLabels.forEach(([label, count]) => {
        console.log(`   ${label}: ${count} images`);
      });
    }
    
  } catch (error) {
    console.error("❌ Failed to check FoodSeg103:", error.message);
  }
}

checkFoodSeg103Data();