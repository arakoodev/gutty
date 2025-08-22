import { Command } from "commander";
import { withFallback } from "../providers/selector";
import { requireEmbeddingsProvider } from "../providers/availability";
import { upsertSegments, createIndex } from "../index/lancedb";
import { createOptimizedSegmentIndex } from "../index/optimized-segments";
import { CFG } from "../config";
import { promises as fs } from "fs";
import path from "path";
import { withRetry, withExponentialBackoff, embeddingRateLimiter } from "../util/retry";
import { downloadAllResearchDatasets, getImageDirectories, checkDatasetExists } from "../util/dataset-download";

async function walk(dir:string): Promise<string[]> {
  const out:string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else if (/\.(jpg|jpeg|png)$/i.test(e.name)) out.push(p);
  }
  return out;
}

async function legacyIndexing(datasets: {dir:string, source:string}[], progressPath: string): Promise<number> {
  type Progress = { doneIds: Record<string, true> };
  async function loadProgress(file:string): Promise<Progress>{
    try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return { doneIds:{} }; }
  }
  async function saveProgress(file:string, data:Progress){
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(data, null, 2));
  }

  const prog = await loadProgress(progressPath);
  let processed = 0;

  for (const ds of datasets) {
    const files = await walk(ds.dir);
    for (const f of files) {
      const id = `${ds.source}-${path.basename(f)}`;
      if (prog.doneIds[id]) continue;
      const label = path.basename(path.dirname(f));
      try {
        // Apply rate limiting for batch operations
        await embeddingRateLimiter.waitIfNeeded();
        
        console.log(`📸 Processing ${path.basename(f)} (${processed + 1}/?)`);
        
        // Get CLIP embedding with exponential backoff  
        const emb = await withExponentialBackoff(() => 
          withFallback(p => p.imageEmbed({ path: f })),
          5, // maxAttempts
          2000, // baseDelayMs (2 seconds) 
          60000 // maxDelayMs (1 minute)
        );
        
        // Upload to database with retry
        await withRetry(() => upsertSegments([{ 
          id, 
          source: ds.source, 
          label, 
          image_path: f, 
          emb_clip_b32: Array.from(emb) 
        }]));
        
        prog.doneIds[id] = true;
        processed++;
        console.log(`✅ Successfully indexed ${id} (${processed} total)`);
        
        if (processed % 10 === 0) await saveProgress(progressPath, prog);
      } catch (err:any) {
        console.warn(`❌ Failed to index ${f}: ${err?.message || err}`);
      }
    }
  }
  await saveProgress(progressPath, prog);
  await createIndex(CFG.storage.segmentsTable, "emb_clip_b32");
  return processed;
}

export default new Command("seg-index")
  .option("--foodseg103 <dir>", "Path to FoodSeg103 crops (override default)")
  .option("--foodinsseg <dir>", "Path to FoodInsSeg crops (override default)")  
  .option("--uecfood256 <dir>", "Path to UECFood256 crops (override default)")  
  .option("--uecfood100 <dir>", "Path to UECFood100 crops (override default)")  
  .option("--progress <path>", "Progress file", "./tmp/seg-index.progress.json")
  .option("--no-download", "Skip automatic dataset download")
  .option("--optimized", "Use optimized indexing for CLIP filtering", true)
  .option("--no-optimized", "Use legacy indexing instead of optimized")
  .action(async (opts) => {
    console.log("🔧 Starting seg-index action...");
    requireEmbeddingsProvider();
    console.log("✅ Embeddings provider check passed");
    
    let datasets: {dir:string, source:string}[] = [];
    console.log("📋 Initializing datasets array...");
    
    // Check if datasets need downloading
    if (opts.download !== false) {
      console.log("🌐 Checking and downloading research datasets...");
      await downloadAllResearchDatasets();
      console.log("✅ Download check complete");
    } else {
      console.log("⏭️ Skipping dataset download (--no-download)");
    }
    
    // Always try standard paths first, unless user overrides
    console.log("📁 Getting image directories...");
    const imageDirs = getImageDirectories();
    console.log("Image directories:", imageDirs);
    
    const foodinssegDir = opts.foodinsseg || imageDirs.foodinsseg;
    console.log(`🔍 Using FoodInsSeg dir: ${foodinssegDir}`);
    const foodseg103Dir = opts.foodseg103 || imageDirs.foodseg103;
    const uecfood256Dir = opts.uecfood256 || imageDirs.uecfood256;
    const uecfood100Dir = opts.uecfood100 || imageDirs.uecfood100;
    
    // Check FoodInsSeg
    if (foodinssegDir) {
      console.log("🔍 Checking FoodInsSeg dataset existence...");
      const exists = await checkDatasetExists('foodinsseg');
      console.log(`Dataset exists check result: ${exists}`);
      if (exists) {
        datasets.push({ dir: foodinssegDir, source: "foodinsseg" });
        console.log(`✓ FoodInsSeg found: ${foodinssegDir}`);
      } else {
        console.warn(`✗ FoodInsSeg not found at expected path: ${foodinssegDir}`);
      }
    } else {
      console.log("⚠️ No FoodInsSeg directory specified");
    }
    
    // Check FoodSeg103
    if (foodseg103Dir) {
      const exists = await checkDatasetExists('foodseg103');
      if (exists) {
        datasets.push({ dir: foodseg103Dir, source: "foodseg103" });
        console.log(`✓ FoodSeg103 found: ${foodseg103Dir}`);
      } else {
        console.warn(`✗ FoodSeg103 not found at expected path: ${foodseg103Dir}`);
      }
    }
    
    // Check UECFood256
    if (uecfood256Dir) {
      const exists = await checkDatasetExists('uecfood256');
      if (exists) {
        datasets.push({ dir: uecfood256Dir, source: "uecfood256" });
        console.log(`✓ UECFood256 found: ${uecfood256Dir}`);
      } else {
        console.warn(`✗ UECFood256 not found at expected path: ${uecfood256Dir}`);
      }
    }
    
    // Check UECFood100
    if (uecfood100Dir) {
      const exists = await checkDatasetExists('uecfood100');
      if (exists) {
        datasets.push({ dir: uecfood100Dir, source: "uecfood100" });
        console.log(`✓ UECFood100 found: ${uecfood100Dir}`);
      } else {
        console.warn(`✗ UECFood100 not found at expected path: ${uecfood100Dir}`);
      }
    }
    
    if (datasets.length === 0) {
      console.error("No datasets found! Expected structure:");
      console.error(`  FoodInsSeg images: ${imageDirs.foodinsseg}`);
      console.error(`  FoodSeg103 data:   ${imageDirs.foodseg103}`);
      throw new Error("No datasets available for indexing");
    }

    console.log(`📊 Found ${datasets.length} datasets to index`);
    console.log("Datasets:", datasets.map(d => `${d.source}: ${d.dir}`));
    let processed: number;
    
    if (opts.optimized) {
      console.log("🚀 Creating optimized index for CLIP filtering...");
      console.log(`Progress file: ${opts.progress}`);
      console.log("🔄 Calling createOptimizedSegmentIndex...");
      processed = await createOptimizedSegmentIndex(datasets, opts.progress);
      console.log(`✅ Optimized indexing completed: ${processed} segments`);
    } else {
      console.log("🐌 Using legacy indexing approach...");
      processed = await legacyIndexing(datasets, opts.progress);
    }
    
    if (!processed) { 
      console.log("No images indexed"); 
      return; 
    }
    
    console.log(`Successfully indexed ${processed} segments`);
  });
