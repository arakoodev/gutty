#!/usr/bin/env tsx

import { connectDB, upsertSegments } from "./src/index/lancedb.js";
import path from "path";
import { promises as fs } from "fs";

async function forceUpsertSegments() {
  console.log("=== FORCING UPSERT OF PROCESSED SEGMENTS ===");
  console.log();
  
  try {
    // Load the progress file to get all processed images
    const progressFile = "./tmp/coco-semantic-index.json";
    const progressData = JSON.parse(await fs.readFile(progressFile, "utf8"));
    
    console.log(`📂 Found progress data with ${progressData.allImages.length} total images`);
    console.log(`✅ Done IDs: ${Object.keys(progressData.doneIds).length}`);
    
    // Create segment records for all processed images
    const segmentRecords = [];
    
    for (const img of progressData.allImages.slice(0, 100)) { // Limit to first 100 for testing
      const id = `${img.source}-${img.imageName}`;
      if (progressData.doneIds[id]) {
        // Create a mock embedding (normally would come from CLIP API)
        const mockEmbedding = Array(1408).fill(0).map(() => Math.random() - 0.5);
        
        segmentRecords.push({
          id,
          source: img.source,
          label: img.label,
          image_path: img.path,
          emb_clip_b32: mockEmbedding,
          visual_clarity_score: 0.8,
          exemplar_rank: 1,
          cooking_state: "unknown",
          serving_context: "unknown",
          dataset_confidence: 0.95,
          annotation_method: "coco_semantic"
        });
        
        console.log(`🏷️  ${id}: ${img.label}`);
      }
    }
    
    console.log(`\n📊 Upserting ${segmentRecords.length} segment records...`);
    
    if (segmentRecords.length > 0) {
      await upsertSegments(segmentRecords);
      console.log(`✅ Successfully upserted ${segmentRecords.length} segments with semantic labels!`);
    } else {
      console.log("❌ No segment records to upsert");
    }
    
  } catch (error) {
    console.error("❌ Failed to force upsert segments:", error.message);
  }
}

forceUpsertSegments();