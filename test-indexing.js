#!/usr/bin/env tsx

import { createOptimizedSegmentIndex } from "./src/index/optimized-segments.ts";

async function testIndexing() {
  console.log("=== TESTING DIRECT INDEXING ===");
  
  const datasets = [
    { dir: "./datasets/foodinsseg/images", source: "foodinsseg" },
    { dir: "./datasets/foodseg103/data", source: "foodseg103" }, 
    { dir: "./datasets/uecfood100/images", source: "uecfood100" }
  ];
  
  console.log("Datasets to index:", datasets);
  
  try {
    const result = await createOptimizedSegmentIndex(datasets, "./tmp/test-direct-index.json");
    console.log(`✅ Indexing completed: ${result} segments`);
  } catch (error) {
    console.error("❌ Indexing failed:", error.message);
    console.error(error.stack);
  }
}

testIndexing();