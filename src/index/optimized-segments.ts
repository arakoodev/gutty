import { connectDB, upsertSegments } from "./lancedb";
import { withFallback } from "../providers/selector";
import { withRetry, withExponentialBackoff, embeddingRateLimiter } from "../util/retry";
import { promises as fs } from "fs";
import path from "path";

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
 * Enhanced food categorization based on FoodSeg103 taxonomy
 */
const FOOD_TAXONOMY: {[label: string]: {category: string, subcategory?: string}} = {
  // Vegetables
  "tomato": { category: "vegetable", subcategory: "nightshade" },
  "cherry_tomato": { category: "vegetable", subcategory: "nightshade" },
  "carrot": { category: "vegetable", subcategory: "root" },
  "lettuce": { category: "vegetable", subcategory: "leafy_green" },
  "onion": { category: "vegetable", subcategory: "allium" },
  "bell_pepper": { category: "vegetable", subcategory: "nightshade" },
  
  // Proteins
  "chicken": { category: "protein", subcategory: "poultry" },
  "beef": { category: "protein", subcategory: "meat" },
  "fish": { category: "protein", subcategory: "seafood" },
  "tofu": { category: "protein", subcategory: "plant_based" },
  "egg": { category: "protein", subcategory: "dairy_egg" },
  
  // Grains & Carbs
  "bread": { category: "grain", subcategory: "baked" },
  "rice": { category: "grain", subcategory: "grain" },
  "pasta": { category: "grain", subcategory: "pasta" },
  "noodles": { category: "grain", subcategory: "noodle" },
  
  // Add more categories as needed...
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
  console.log("Creating optimized segment index for CLIP filtering...");
  
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
  
  // Step 1: Collect all images for global analysis
  const allImages: any[] = [];
  for (const ds of datasets) {
    const files = await walkDirectory(ds.dir);
    for (const f of files) {
      const label = path.basename(path.dirname(f));
      allImages.push({ path: f, source: ds.source, label });
    }
  }
  
  console.log(`Found ${allImages.length} images across ${datasets.length} datasets`);
  
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
      
      // Create optimized record
      const record: OptimizedSegmentRecord = {
        id,
        source: img.source,
        label: img.label,
        category: taxonomy.category,
        subcategory: taxonomy.subcategory,
        image_path: img.path,
        emb_clip_b32: Array.from(emb),
        visual_clarity_score: imageProps.visual_clarity_score,
        exemplar_rank: exemplarRank,
        // Could add more analysis here
        cooking_state: inferCookingState(img.label),
        serving_context: inferServingContext(img.path),
        dataset_confidence: img.source === "foodseg103" ? 0.95 : 0.90, // Research dataset quality
        annotation_method: "research_dataset"
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
  
  // Step 4: Create optimized HNSW index
  await createOptimizedHNSWIndex();
  
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