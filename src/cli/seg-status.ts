import { Command } from "commander";
import { connectDB } from "../index/lancedb";
import { getImageDirectories } from "../util/dataset-download";
import { promises as fs } from "fs";
import path from "path";

async function walkDirectory(dir: string): Promise<string[]> {
  const out: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        out.push(...await walkDirectory(p));
      } else if (/\.(jpg|jpeg|png)$/i.test(e.name)) {
        out.push(p);
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
  }
  return out;
}

export default new Command("seg-status")
  .description("Check indexing status and progress")
  .option("--progress <path>", "Progress file to check", "./tmp/seg-index.progress.json")
  .action(async (opts) => {
    try {
      console.log("🔍 Indexing Status Report");
      console.log("========================");
      
      // Check LanceDB segments count
      try {
        const db = await connectDB();
        const table = await db.openTable('segments');
        const count = await table.countRows();
        
        // Get breakdown by source
        const all = await table.query().toArray();
        const bySource: Record<string, number> = {};
        all.forEach((r: any) => {
          bySource[r.source] = (bySource[r.source] || 0) + 1;
        });
        
        console.log(`📊 Total segments indexed: ${count}`);
        console.log("Breakdown by dataset:");
        Object.entries(bySource).forEach(([source, segmentCount]) => {
          console.log(`  • ${source}: ${segmentCount} segments`);
        });
      } catch (error) {
        console.log("📊 Total segments indexed: 0 (segments table not found)");
      }
      
      console.log("");
      
      // Check available images
      const imageDirs = getImageDirectories();
      
      if (imageDirs.foodinsseg) {
        const foodinssegImages = await walkDirectory(imageDirs.foodinsseg);
        console.log(`📁 FoodInsSeg images available: ${foodinssegImages.length}`);
      }
      
      if (imageDirs.foodseg103) {
        try {
          const parquetFiles = await fs.readdir(imageDirs.foodseg103);
          const parquetCount = parquetFiles.filter(f => f.endsWith('.parquet')).length;
          console.log(`📁 FoodSeg103 parquet files available: ${parquetCount}`);
        } catch {
          console.log(`📁 FoodSeg103 data directory not found: ${imageDirs.foodseg103}`);
        }
      }
      
      console.log("");
      
      // Check progress file
      try {
        const progressData = JSON.parse(await fs.readFile(opts.progress, "utf8"));
        const doneCount = Object.keys(progressData.doneIds || {}).length;
        const allImagesCount = progressData.allImages?.length || 0;
        
        console.log(`📈 Progress file: ${opts.progress}`);
        console.log(`   • Images processed: ${doneCount}`);
        if (allImagesCount > 0) {
          const percentage = ((doneCount / allImagesCount) * 100).toFixed(1);
          console.log(`   • Total images found: ${allImagesCount}`);
          console.log(`   • Progress: ${percentage}%`);
          
          const remaining = allImagesCount - doneCount;
          if (remaining > 0) {
            console.log(`   • Remaining: ${remaining} images`);
          }
        }
      } catch {
        console.log(`📈 No progress file found at: ${opts.progress}`);
      }
      
      console.log("");
      
      // Indexing rate estimate
      try {
        const db = await connectDB();
        const table = await db.openTable('segments');
        const recent = await table.query().limit(5).toArray();
        
        if (recent.length > 0) {
          console.log("🕐 Recent segments:");
          recent.forEach((r: any, i: number) => {
            console.log(`   ${i + 1}. ${r.id} (${r.source})`);
          });
        }
      } catch {
        // Table not available
      }
      
      console.log("");
      console.log("💡 Commands:");
      console.log("   • Run indexing: npx tsx src/cli/seg-index.ts");
      console.log("   • Check status:  npx tsx src/cli/seg-status.ts");
      console.log("   • Test CLIP:     [run CLIP filtering test]");
      
    } catch (error) {
      console.error("❌ Error checking status:", error);
      process.exit(1);
    }
  });