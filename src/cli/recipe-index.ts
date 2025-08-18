import { Command } from "commander";
import { promises as fs } from "fs";
import { withFallback } from "../providers/selector";
import { requireEmbeddingsProvider } from "../providers/availability";
import { connectDB, upsertRecipes, createIndex } from "../index/lancedb";
import { CFG } from "../config";
import path from "path";
import { withRetry } from "../util/retry";
import { downloadAllResearchDatasets } from "../util/dataset-download";

interface RecipeEntry {
  id: number | string;
  title: string;
  ingredients: string[];
  directions?: string[];
  instructions?: string[];
  url?: string;
  link?: string;
  images?: string[];
  partition?: string;
  source?: number;
}

async function parseRecipeFile(filePath: string): Promise<RecipeEntry[]> {
  console.log(`Parsing recipe file: ${filePath}`);
  
  // Handle different file formats
  if (filePath.endsWith('.parquet')) {
    console.warn('Parquet file parsing not yet implemented');
    return [];
  }
  
  if (filePath.endsWith('.csv')) {
    // Parse CSV format (RecipeNLG)
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    const recipes: RecipeEntry[] = [];
    
    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      try {
        // Simple CSV parsing - split by comma but handle quoted fields
        const line = lines[i];
        const fields = [];
        let current = '';
        let inQuotes = false;
        
        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          if (char === '"' && (j === 0 || line[j-1] !== '\\')) {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            fields.push(current.trim().replace(/^"(.*)"$/, '$1'));
            current = '';
          } else {
            current += char;
          }
        }
        fields.push(current.trim().replace(/^"(.*)"$/, '$1')); // Add last field
        
        if (fields.length >= 3 && fields[0] && fields[1] && fields[2]) {
          const title = fields[0];
          const ingredients = fields[1].split('<extra_id_99>').map(ing => ing.trim()).filter(ing => ing);
          const directions = fields[2].split('<extra_id_99>').map(dir => dir.trim()).filter(dir => dir);
          
          recipes.push({
            id: String(i),
            title,
            ingredients,
            instructions: directions,
            directions,
            url: ""
          });
        }
      } catch (error) {
        console.warn(`Failed to parse CSV line ${i}: ${error}`);
      }
    }
    
    return recipes;
  }
  
  // Handle JSONL format
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  const recipes: RecipeEntry[] = [];
  for (const line of lines) {
    try {
      const recipe = JSON.parse(line) as RecipeEntry;
      if (recipe.title && recipe.ingredients && recipe.ingredients.length > 0) {
        // Normalize instructions/directions field
        const instructions = recipe.directions || recipe.instructions || [];
        recipes.push({
          ...recipe,
          instructions,
          url: recipe.link || recipe.url
        });
      }
    } catch (error) {
      console.warn(`Failed to parse recipe line: ${error}`);
    }
  }
  
  return recipes;
}

async function indexRecipes(recipes: RecipeEntry[], progressPath: string): Promise<number> {
  type Progress = { doneIds: Record<string, true> };
  
  async function loadProgress(file: string): Promise<Progress> {
    try { 
      return JSON.parse(await fs.readFile(file, "utf8")); 
    } catch { 
      return { doneIds: {} }; 
    }
  }
  
  async function saveProgress(file: string, data: Progress) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(data, null, 2));
  }

  const prog = await loadProgress(progressPath);
  let processed = 0;

  for (const recipe of recipes) {
    if (prog.doneIds[String(recipe.id)]) continue;

    try {
      // Generate CLIP embedding for recipe text (title + ingredients)
      const recipeText = `${recipe.title}. Ingredients: ${recipe.ingredients.join(', ')}`;
      const embedding = await withRetry(() => withFallback(p => p.textEmbed({ text: recipeText })));
      
      // Find associated image paths (if available)
      const imagePaths: string[] = [];
      if (recipe.images && recipe.images.length > 0) {
        for (const imgName of recipe.images.slice(0, 3)) { // Max 3 images per recipe
          const imgPath = path.join(CFG.datasets.recipe1m.imageDir, imgName);
          try {
            await fs.access(imgPath);
            imagePaths.push(imgPath);
          } catch {
            // Image not found, skip
          }
        }
      }

      // Upsert recipe to database
      await withRetry(() => upsertRecipes([{
        id: String(recipe.id),
        title: recipe.title,
        ingredients: recipe.ingredients,
        instructions: recipe.instructions || [],
        image_paths: imagePaths.length > 0 ? imagePaths : ["placeholder.jpg"], // Avoid empty arrays for Arrow schema
        servings: 4, // Default servings
        emb_clip_b32: Array.from(embedding),
        url: recipe.url || "",
        partition: recipe.partition || 'unknown'
      }]));

      prog.doneIds[String(recipe.id)] = true;
      processed++;
      
      if (processed % 100 === 0) {
        await saveProgress(progressPath, prog);
        console.log(`   Processed ${processed} recipes...`);
      }
      
    } catch (err: any) {
      console.warn(`Failed to index recipe ${recipe.id}: ${err?.message || err}`);
    }
  }

  await saveProgress(progressPath, prog);
  
  // Create vector index only if we have processed recipes
  if (processed > 0) {
    console.log("Creating HNSW index for recipe vectors...");
    try {
      await createIndex(CFG.storage.recipesTable, "emb_clip_b32");
      console.log("✓ Vector index created successfully");
    } catch (error) {
      console.warn(`⚠️  Failed to create vector index: ${error}`);
      console.warn("   Vector search may be slower without index");
    }
  }
  
  return processed;
}

export default new Command("recipe-index")
  .description("Download and index Recipe1M+ dataset for recipe matching")
  .option("--source <name>", "Recipe source (recipe1m)", "recipe1m")
  .option("--progress <path>", "Progress file", "./tmp/recipe-index.progress.json")
  .option("--no-download", "Skip automatic dataset download")
  .option("--limit <n>", "Limit number of recipes to process (for testing)", "10000")
  .action(async (opts) => {
    requireEmbeddingsProvider();
    
    console.log("🍳 Recipe Database Indexing");
    console.log("===========================");
    
    // Download datasets if needed
    if (opts.download !== false) {
      console.log("Checking and downloading recipe datasets...");
      await downloadAllResearchDatasets();
    }
    
    if (opts.source === "recipe1m") {
      // RecipeNLG dataset format - check for CSV, JSONL and Parquet files
      const possibleFiles = [
        path.join(CFG.datasets.recipe1m.dataDir, "test.csv"),
        path.join(CFG.datasets.recipe1m.dataDir, "train.csv"),
        path.join(CFG.datasets.recipe1m.dataDir, "validation.csv"),
        path.join(CFG.datasets.recipe1m.dataDir, "train.jsonl"),
        path.join(CFG.datasets.recipe1m.dataDir, "train.json"),
        path.join(CFG.datasets.recipe1m.dataDir, "dataset.jsonl"),
        path.join(CFG.datasets.recipe1m.dataDir, "recipes.jsonl"),
        path.join(CFG.datasets.recipe1m.dir, "train.jsonl"),
        path.join(CFG.datasets.recipe1m.dir, "train.json")
      ];
      
      const dataFiles: string[] = [];
      
      // Find existing recipe files
      for (const possibleFile of possibleFiles) {
        try {
          await fs.access(possibleFile);
          dataFiles.push(possibleFile);
          console.log(`✓ Found recipe file: ${possibleFile}`);
        } catch {
          // File doesn't exist, skip
        }
      }
      
      let allRecipes: RecipeEntry[] = [];
      
      for (const file of dataFiles) {
        try {
          const recipes = await parseRecipeFile(file);
          allRecipes.push(...recipes);
          console.log(`✓ Loaded ${recipes.length} recipes from ${path.basename(file)}`);
        } catch (error) {
          console.warn(`✗ Could not load ${file}: ${error}`);
        }
      }
      
      if (allRecipes.length === 0) {
        console.error("No recipe files found! Expected RecipeNLG dataset files in:");
        console.error(`  ${CFG.datasets.recipe1m.dataDir}/ or ${CFG.datasets.recipe1m.dir}/`);
        console.error("  Supported formats: train.jsonl, train.json, dataset.jsonl, recipes.jsonl");
        console.error("  Download the RecipeNLG dataset from: https://huggingface.co/datasets/mbien/recipe_nlg");
        throw new Error("No recipe data available");
      }
      
      // Limit recipes for testing if specified
      const limit = parseInt(opts.limit);
      if (limit > 0 && allRecipes.length > limit) {
        allRecipes = allRecipes.slice(0, limit);
        console.log(`📋 Limited to ${limit} recipes for processing`);
      }
      
      console.log(`📊 Processing ${allRecipes.length} recipes...`);
      
      const processed = await indexRecipes(allRecipes, opts.progress);
      
      if (processed === 0) {
        console.log("No new recipes indexed");
        return;
      }
      
      console.log(`🎉 Successfully indexed ${processed} recipes!`);
      console.log(`📄 Progress saved to: ${opts.progress}`);
      
    } else {
      throw new Error(`Unsupported recipe source: ${opts.source}`);
    }
  });