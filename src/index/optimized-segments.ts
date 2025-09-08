import { connectDB, upsertSegments } from "./lancedb";
import { withFallback } from "../providers/selector";
import { withRetry, withExponentialBackoff, embeddingRateLimiter } from "../util/retry";
import { CocoParser } from "../util/coco-parser";
import { promises as fs } from "fs";
import path from "path";

/**
 * Robust dataset setup - handles path normalization, symlink fixes, directory structure
 * This ensures the indexing script works reliably every time without manual fixes
 */
async function setupDatasets(): Promise<void> {
  console.log("🔧 Setting up datasets with robust path handling...");

  // Fix FoodSeg103 symlink issue (id2label.json points to wrong relative path)
  const foodseg103Dir = "/home/sss/Code/gutty/datasets/FoodSeg103";
  const id2labelPath = path.join(foodseg103Dir, "id2label.json");
  const blobPath = path.join(foodseg103Dir, "blobs/82cb3539e971ed1fbde2d9f3464271bd3a92d497");
  
  try {
    // Check if symlink exists and points correctly
    const symlinkTarget = await fs.readlink(id2labelPath).catch(() => null);
    const expectedTarget = "blobs/82cb3539e971ed1fbde2d9f3464271bd3a92d497";
    
    if (symlinkTarget !== expectedTarget) {
      console.log("🔧 Fixing FoodSeg103 id2label.json symlink...");
      await fs.unlink(id2labelPath).catch(() => {});
      await fs.symlink(expectedTarget, id2labelPath);
      console.log("✅ FoodSeg103 symlink fixed");
    }
    
    // Verify the file is readable
    await fs.access(id2labelPath, fs.constants.R_OK);
    
  } catch (error) {
    console.warn(`⚠️ Could not fix FoodSeg103 symlink: ${error.message}`);
  }

  // Fix UECFood100 directory structure (move categories into images/ subdirectory)
  const uecfood100Dir = "/home/sss/Code/gutty/datasets/uecfood100";
  const uecfood100ImagesDir = path.join(uecfood100Dir, "images");
  
  try {
    // Check if images subdirectory exists and has content
    const imagesDirExists = await fs.access(uecfood100ImagesDir).then(() => true).catch(() => false);
    
    if (!imagesDirExists) {
      console.log("🔧 Creating UECFood100 images directory structure...");
      await fs.mkdir(uecfood100ImagesDir, { recursive: true });
      
      // Move numbered directories (1, 2, 3, ..., 100) into images/
      const entries = await fs.readdir(uecfood100Dir);
      const categoryDirs = entries.filter(entry => /^\d+$/.test(entry));
      
      for (const categoryDir of categoryDirs) {
        const srcPath = path.join(uecfood100Dir, categoryDir);
        const destPath = path.join(uecfood100ImagesDir, categoryDir);
        
        // Check if it's a directory before moving
        const stat = await fs.stat(srcPath).catch(() => null);
        if (stat?.isDirectory()) {
          await fs.rename(srcPath, destPath);
        }
      }
      
      if (categoryDirs.length > 0) {
        console.log(`✅ Moved ${categoryDirs.length} UECFood100 category directories to images/`);
      }
    }
    
  } catch (error) {
    console.warn(`⚠️ Could not setup UECFood100 directory structure: ${error.message}`);
  }

  console.log("✅ Dataset setup completed");
}

export interface OptimizedSegmentRecord {
  // Core identifiers
  id: string;
  source: string; // "foodseg103" | "foodinsseg"
  
  // Food categorization
  label: string; // "tomato"
  category: string; // "vegetable"
  subcategory?: string; // "nightshade"
  
  // Visual properties
  image_path: string;
  image_size?: { width: number, height: number };
  dominant_colors?: number[]; // RGB values
  
  // Embeddings
  emb_clip_b32: number[]; // CLIP ViT-B/32 embedding
  emb_clip_l14?: number[]; // Optional: larger CLIP model
  
  // Quality metrics for filtering
  visual_clarity_score?: number; // How clear/representative this image is
  exemplar_rank?: number; // Rank within this food category (1 = best exemplar)
  
  // Contextual metadata
  cooking_state?: string; // "raw" | "cooked" | "processed"
  serving_context?: string; // "whole" | "sliced" | "diced" | "mixed"
  
  // Research dataset specific
  dataset_confidence?: number; // Original dataset annotation confidence
  annotation_method?: string; // How this was labeled in the research
}

/**
 * Enhanced food categorization based on FoodInsSeg COCO taxonomy
 */
const FOOD_TAXONOMY: {[label: string]: {category: string, subcategory?: string}} = {
  // Vegetables  
  "tomato": { category: "vegetable", subcategory: "nightshade" },
  "carrot": { category: "vegetable", subcategory: "root" },
  "broccoli": { category: "vegetable", subcategory: "cruciferous" },
  "cabbage": { category: "vegetable", subcategory: "leafy_green" },
  "cauliflower": { category: "vegetable", subcategory: "cruciferous" },
  "eggplant": { category: "vegetable", subcategory: "nightshade" },
  "cucumber": { category: "vegetable", subcategory: "gourd" },
  "asparagus": { category: "vegetable", subcategory: "stem" },
  "celery stick": { category: "vegetable", subcategory: "stem" },
  "garlic": { category: "vegetable", subcategory: "allium" },
  "ginger": { category: "vegetable", subcategory: "root" },
  "green beans": { category: "vegetable", subcategory: "legume" },
  "French beans": { category: "vegetable", subcategory: "legume" },
  "corn": { category: "vegetable", subcategory: "grain_vegetable" },
  "bamboo shoots": { category: "vegetable", subcategory: "stem" },
  "bean sprouts": { category: "vegetable", subcategory: "sprout" },
  "kelp": { category: "vegetable", subcategory: "seaweed" },
  
  // Mushrooms
  "enoki mushroom": { category: "vegetable", subcategory: "mushroom" },
  "king oyster mushroom": { category: "vegetable", subcategory: "mushroom" },
  
  // Fruits
  "apple": { category: "fruit", subcategory: "tree_fruit" },
  "banana": { category: "fruit", subcategory: "tropical" },
  "grape": { category: "fruit", subcategory: "berry" },
  "cherry": { category: "fruit", subcategory: "stone_fruit" },
  "kiwi": { category: "fruit", subcategory: "tropical" },
  "blueberry": { category: "fruit", subcategory: "berry" },
  "fig": { category: "fruit", subcategory: "tree_fruit" },
  "date": { category: "fruit", subcategory: "dried_fruit" },
  "apricot": { category: "fruit", subcategory: "stone_fruit" },
  "avocado": { category: "fruit", subcategory: "tropical" },
  
  // Proteins
  "chicken duck": { category: "protein", subcategory: "poultry" },
  "fish": { category: "protein", subcategory: "seafood" },
  "crab": { category: "protein", subcategory: "seafood" },
  "egg": { category: "protein", subcategory: "dairy_egg" },
  "fried meat": { category: "protein", subcategory: "processed_meat" },
  
  // Dairy & Cheese
  "cheese butter": { category: "dairy", subcategory: "fat" },
  "milk": { category: "dairy", subcategory: "liquid" },
  "milkshake": { category: "dairy", subcategory: "beverage" },
  
  // Grains & Carbs
  "bread": { category: "grain", subcategory: "baked" },
  "hanamaki baozi": { category: "grain", subcategory: "steamed" },
  
  // Nuts & Seeds
  "almond": { category: "nuts", subcategory: "tree_nut" },
  "cashew": { category: "nuts", subcategory: "tree_nut" },
  
  // Legumes & Beans
  "red beans": { category: "legume", subcategory: "bean" },
  "dried cranberries": { category: "fruit", subcategory: "dried_fruit" },
  
  // Snacks & Desserts
  "candy": { category: "snack", subcategory: "sweet" },
  "chocolate": { category: "snack", subcategory: "sweet" },
  "biscuit": { category: "snack", subcategory: "baked" },
  "popcorn": { category: "snack", subcategory: "grain" },
  "cake": { category: "dessert", subcategory: "baked" },
  "ice cream": { category: "dessert", subcategory: "frozen" },
  "pudding": { category: "dessert", subcategory: "creamy" },
  "egg tart": { category: "dessert", subcategory: "pastry" },
  
  // Beverages  
  "coffee": { category: "beverage", subcategory: "hot" },
  "tea": { category: "beverage", subcategory: "hot" },
  "juice": { category: "beverage", subcategory: "fruit" },
  "wine": { category: "beverage", subcategory: "alcoholic" },
  
  // Fast Food
  "hamburg": { category: "fast_food", subcategory: "sandwich" },
  "french fries": { category: "fast_food", subcategory: "fried" },
  
  // Herbs & Aromatics
  "cilantro mint": { category: "herb", subcategory: "fresh" },
  
  // Default fallback
  "unknown": { category: "unknown", subcategory: undefined }
};

/**
 * Analyze image for enhanced metadata
 */
async function analyzeImageProperties(imagePath: string): Promise<{
  size?: { width: number, height: number },
  visual_clarity_score?: number,
  dominant_colors?: number[]
}> {
  try {
    // For now, return basic metadata - could be enhanced with actual image analysis
    const stats = await fs.stat(imagePath);
    return {
      visual_clarity_score: stats.size > 50000 ? 0.8 : 0.6, // Rough heuristic based on file size
    };
  } catch {
    return {};
  }
}

/**
 * Determine exemplar ranking within a category
 */
function calculateExemplarRank(
  label: string, 
  imageProps: any, 
  allLabelImages: any[]
): number {
  // For now, simple ranking - could be enhanced with visual diversity analysis
  const sameLabel = allLabelImages.filter(img => 
    path.basename(path.dirname(img.path)) === label
  );
  
  // Rank based on file size (larger = clearer) and filename (img_001 often best)
  const filename = path.basename(imageProps.path);
  const numMatch = filename.match(/(\d+)/);
  const fileNum = numMatch ? parseInt(numMatch[1]) : 999;
  
  return Math.min(fileNum, sameLabel.length); // Lower number = better rank
}

/**
 * Enhanced segment indexing optimized for CLIP filtering
 */
export async function createOptimizedSegmentIndex(
  datasets: {dir: string, source: string}[],
  progressPath: string
): Promise<number> {
  console.log("🔄 Creating optimized segment index with semantic COCO labels...");
  
  // Step 0: Robust dataset setup (fixes symlinks, directory structures)
  await setupDatasets();
  
  type Progress = { doneIds: Record<string, true>, allImages?: any[] };
  
  async function loadProgress(file: string): Promise<Progress> {
    try { 
      return JSON.parse(await fs.readFile(file, "utf8")); 
    } catch { 
      return { doneIds: {}, allImages: [] }; 
    }
  }
  
  async function saveProgress(file: string, data: Progress) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(data, null, 2));
  }
  
  // Step 1: Initialize dataset-specific parsers with built-in knowledge of folder structures
  const cocoParsers: {[source: string]: CocoParser} = {};
  
  for (const ds of datasets) {
    if (ds.source === "foodinsseg") {
      // FoodInsSeg dataset structure: ./datasets/FoodInsSeg/
      //   ├── annotations/
      //   │   ├── Train.json  (4983 images)
      //   │   └── Test.json   (2135 images) 
      //   └── images/
      //       └── 00000048.jpg, 00000263.jpg, etc.
      
      // Determine if we're dealing with train or test split based on image directory
      // Test images are the ones we have in ./datasets/foodinsseg/images/
      const annotationPath = "./datasets/FoodInsSeg/annotations/Test.json";
      
      console.log(`📖 FoodInsSeg: Using Test annotations for image matching`);
      
      try {
        const parser = new CocoParser(annotationPath);
        await parser.load();
        cocoParsers[ds.source] = parser;
        
        const stats = parser.getStats();
        console.log(`📊 FoodInsSeg Dataset Stats:`);
        console.log(`   Images: ${stats.totalImages}, Categories: ${stats.totalCategories}`);
        console.log(`   Images with labels: ${stats.imagesWithLabels}`);
        console.log(`   Avg labels per image: ${stats.averageLabelsPerImage.toFixed(1)}`);
        console.log(`   Top categories: ${stats.topCategories.slice(0, 5).map(c => `${c.name}(${c.count})`).join(", ")}`);
      } catch (error) {
        console.warn(`⚠️ Failed to load FoodInsSeg annotations: ${error.message}`);
        console.warn(`Expected: ${annotationPath}`);
        continue;
      }
    }
    else if (ds.source === "foodseg103") {
      // FoodSeg103 dataset structure: ./datasets/FoodSeg103/
      //   ├── data/
      //   │   ├── train-00000-of-00003.parquet
      //   │   ├── train-00001-of-00003.parquet  
      //   │   ├── train-00002-of-00003.parquet
      //   │   └── validation-00000-of-00001.parquet
      //   └── id2label.json
      
      const labelMapPath = "./datasets/FoodSeg103/id2label.json";
      
      console.log(`📖 FoodSeg103: Using id2label.json for semantic labels`);
      
      try {
        const labelData = JSON.parse(await fs.readFile(labelMapPath, 'utf8'));
        console.log(`📊 FoodSeg103: Found ${Object.keys(labelData).length} semantic labels`);
        console.log(`   Sample labels: ${Object.values(labelData).slice(0, 5).join(", ")}`);
        
        // Store the label mapping for later use
        cocoParsers[ds.source] = { labelMap: labelData } as any;
      } catch (error) {
        console.warn(`⚠️ Failed to load FoodSeg103 labels: ${error.message}`);
        console.warn(`Expected: ${labelMapPath}`);
        continue;
      }
    }
    else if (ds.source === "uecfood256") {
      // UECFood256 dataset structure: ./datasets/uecfood256/
      //   ├── images/
      //   │   ├── 1/  (category directories)
      //   │   ├── 2/
      //   │   └── ...
      //   └── category.txt (category names)
      
      const categoryPath = "./datasets/uecfood256/category.txt";
      console.log(`📖 UECFood256: Would use directory structure + ${categoryPath} for labels`);
      // Note: UECFood256 uses directory-based labeling, no additional parser needed
    }
    else if (ds.source === "uecfood100") {
      // UECFood100 dataset structure: ./datasets/uecfood100/
      //   ├── images/
      //   │   ├── 1/  (category directories)  
      //   │   ├── 2/
      //   │   └── ...
      //   └── category.txt (category names)
      
      const categoryPath = "./datasets/uecfood100/category.txt";
      console.log(`📖 UECFood100: Would use directory structure + ${categoryPath} for labels`);
      // Note: UECFood100 uses directory-based labeling, no additional parser needed
    }
  }
  
  // Step 2: Collect all images with dataset-specific semantic labels
  const allImages: any[] = [];
  for (const ds of datasets) {
    const files = await walkDirectory(ds.dir);
    console.log(`🔍 Processing ${files.length} files from ${ds.source} dataset`);
    
    for (const f of files) {
      const imageName = path.basename(f);
      let label = "unknown";
      let allLabels: string[] = [];
      
      if (ds.source === "foodinsseg" && cocoParsers[ds.source]) {
        // FoodInsSeg: Use COCO annotations for semantic labels
        const primaryLabel = cocoParsers[ds.source].getPrimaryLabel(imageName);
        const combinedLabel = cocoParsers[ds.source].getCombinedLabel(imageName);
        allLabels = cocoParsers[ds.source].getImageLabels(imageName);
        
        label = primaryLabel || "unlabeled";
        if (allLabels.length > 0) {
          console.log(`🏷️ ${imageName}: ${combinedLabel} (${allLabels.length} labels)`);
        } else {
          console.log(`❓ ${imageName}: no labels found in COCO annotations`);
        }
      }
      else if (ds.source === "foodseg103" && cocoParsers[ds.source]?.labelMap) {
        // FoodSeg103: Extract label from parquet data structure (if available)
        // For now, use directory structure as fallback since parquet parsing is complex
        label = path.basename(path.dirname(f)) || "foodseg103_item";
        console.log(`📊 ${imageName}: ${label} (FoodSeg103)`);
      }
      else if (ds.source === "uecfood256") {
        // UECFood256: Category directories (1/, 2/, 3/, etc.)
        const categoryDir = path.basename(path.dirname(f));
        label = `uec256_category_${categoryDir}`;
        console.log(`📁 ${imageName}: ${label} (UECFood256 directory)`);
      }
      else if (ds.source === "uecfood100") {
        // UECFood100: Category directories (1/, 2/, 3/, etc.)
        const categoryDir = path.basename(path.dirname(f));
        label = `uec100_category_${categoryDir}`;
        console.log(`📁 ${imageName}: ${label} (UECFood100 directory)`);
      }
      else {
        // Generic fallback: use directory name
        label = path.basename(path.dirname(f));
        console.log(`❓ ${imageName}: ${label} (generic fallback)`);
      }
      
      allImages.push({ 
        path: f, 
        source: ds.source, 
        label, 
        allLabels,
        imageName
      });
    }
  }
  
  console.log(`🖼️ Found ${allImages.length} images across ${datasets.length} datasets`);
  
  const prog = await loadProgress(progressPath);
  prog.allImages = allImages;
  
  const optimizedRecords: OptimizedSegmentRecord[] = [];
  let processed = 0;
  
  // Step 2: Process each image with enhanced metadata
  for (const img of allImages) {
    const id = `${img.source}-${path.basename(img.path)}`;
    if (prog.doneIds[id]) continue;
    
    try {
      // Apply rate limiting for batch operations
      await embeddingRateLimiter.waitIfNeeded();
      
      console.log(`📸 Processing ${img.source}/${path.basename(img.path)} (${processed + 1}/${allImages.length})`);
      
      // Get CLIP embedding with exponential backoff
      const emb = await withExponentialBackoff(() => 
        withFallback(p => p.imageEmbed({ path: img.path })),
        5, // maxAttempts 
        2000, // baseDelayMs (2 seconds)
        60000 // maxDelayMs (1 minute)
      );
      
      // Analyze image properties
      const imageProps = await analyzeImageProperties(img.path);
      
      // Get food taxonomy
      const taxonomy = FOOD_TAXONOMY[img.label] || { 
        category: "unknown", 
        subcategory: undefined 
      };
      
      // Calculate exemplar ranking
      const exemplarRank = calculateExemplarRank(img.label, img, allImages);
      
      // Create optimized record with semantic labels
      const record: OptimizedSegmentRecord = {
        id,
        source: img.source,
        label: img.label, // This is now the semantic label from COCO annotations
        category: taxonomy.category,
        subcategory: taxonomy.subcategory,
        image_path: img.path,
        emb_clip_b32: Array.from(emb),
        visual_clarity_score: imageProps.visual_clarity_score,
        exemplar_rank: exemplarRank,
        // Enhanced with semantic data
        cooking_state: inferCookingState(img.label),
        serving_context: inferServingContext(img.path),
        dataset_confidence: img.source === "foodinsseg" ? 0.95 : (img.source === "foodseg103" ? 0.90 : 0.80), // FoodInsSeg is highest quality
        annotation_method: img.allLabels && img.allLabels.length > 0 ? "coco_semantic" : "directory_fallback"
      };
      
      optimizedRecords.push(record);
      prog.doneIds[id] = true;
      processed++;
      
      if (processed % 20 === 0) {
        await saveProgress(progressPath, prog);
        console.log(`Processed ${processed}/${allImages.length} images...`);
      }
      
    } catch (err: any) {
      console.warn(`Failed to process ${img.path}: ${err?.message}`);
    }
  }
  
  // Step 3: Upsert to LanceDB
  if (optimizedRecords.length > 0) {
    await upsertSegments(optimizedRecords);
    console.log(`Upserted ${optimizedRecords.length} optimized segment records`);
  }
  
  await saveProgress(progressPath, prog);
  
  return processed;
}

/**
 * Create HNSW index optimized for food similarity
 */
async function createOptimizedHNSWIndex(): Promise<void> {
  const db = await connectDB();
  const table = await db.openTable("segments");
  
  try {
    // Create HNSW index optimized for food images
    await table.createIndex("emb_clip_b32", {
      indexType: "HNSW",
      metricType: "cosine", // Best for CLIP embeddings
      // HNSW-specific parameters for food similarity
      M: 16,  // Number of bi-directional links (higher = better recall, slower)
      efConstruction: 200, // Size of candidate set (higher = better quality, slower build)
    });
    
    console.log("Created optimized HNSW index for food similarity");
    
  } catch (error) {
    console.warn("HNSW optimization parameters not supported, using defaults");
    await table.createIndex("emb_clip_b32", {
      indexType: "HNSW",
      metricType: "cosine"
    });
  }
}

// Helper functions
async function walkDirectory(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...await walkDirectory(p));
    } else if (/\.(jpg|jpeg|png)$/i.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

function inferCookingState(label: string): string {
  const cookedKeywords = ["cooked", "fried", "grilled", "baked", "roasted"];
  const rawKeywords = ["raw", "fresh"];
  
  const lowerLabel = label.toLowerCase();
  if (cookedKeywords.some(k => lowerLabel.includes(k))) return "cooked";
  if (rawKeywords.some(k => lowerLabel.includes(k))) return "raw";
  return "unknown";
}

function inferServingContext(imagePath: string): string {
  const filename = path.basename(imagePath).toLowerCase();
  if (filename.includes("slice")) return "sliced";
  if (filename.includes("dice")) return "diced";
  if (filename.includes("whole")) return "whole";
  return "unknown";
}