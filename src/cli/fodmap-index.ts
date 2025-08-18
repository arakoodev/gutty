import { Command } from "commander";
import { promises as fs } from "fs";
import { connectDB } from "../index/lancedb";
import { CFG } from "../config";
import path from "path";

interface FODMAPEntry {
  food_name: string;
  fodmap_level: string; // 'low', 'medium', 'high'
  category: string;
  max_serving: string;
  oligos: number; // 0 = safe, 1 = moderate, 2 = high
  fructose: number;
  polyols: number;
  lactose: number;
  source: string;
  notes: string;
}

async function parseGitHubFODMAP(filePath: string): Promise<FODMAPEntry[]> {
  console.log(`📊 Parsing GitHub FODMAP JSON: ${filePath}`);
  
  const content = await fs.readFile(filePath, 'utf-8');
  const data = JSON.parse(content);
  
  const fodmapEntries: FODMAPEntry[] = [];
  
  for (const item of data) {
    if (item.name && item.fodmap && item.category) {
      fodmapEntries.push({
        food_name: item.name,
        fodmap_level: item.fodmap.toLowerCase(),
        category: item.category,
        max_serving: "",
        oligos: item.details?.oligos || 0,
        fructose: item.details?.fructose || 0,
        polyols: item.details?.polyols || 0,
        lactose: item.details?.lactose || 0,
        source: "github_oseparovic",
        notes: ""
      });
    }
  }
  
  console.log(`✅ Parsed ${fodmapEntries.length} FODMAP entries from GitHub`);
  return fodmapEntries;
}

async function parseGoogleSheetsFODMAP(filePath: string): Promise<FODMAPEntry[]> {
  console.log(`📊 Parsing Google Sheets FODMAP CSV: ${filePath}`);
  
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  const fodmapEntries: FODMAPEntry[] = [];
  let currentCategory = "Unknown";
  
  for (const line of lines) {
    try {
      // Split CSV line manually to handle quotes
      const fields = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          fields.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      fields.push(current.trim());
      
      // Skip header rows and empty rows
      if (fields.length < 5 || !fields[1] || fields[1].includes('Oligos')) {
        continue;
      }
      
      // Check if this is a category header
      if (fields[1] && !fields[2] && !fields[3] && fields[1].length > 3) {
        currentCategory = fields[1];
        continue;
      }
      
      const foodName = fields[1];
      const serving = fields[3];
      
      // Map the traffic light system (g=green/low, y=yellow/medium, r=red/high)
      let fodmapLevel = 'unknown';
      if (fields[2] === 'g') fodmapLevel = 'low';
      else if (fields[2] === 'y') fodmapLevel = 'medium'; 
      else if (fields[2] === 'r') fodmapLevel = 'high';
      
      // Parse FODMAP components (x = present, - = absent)
      const oligos = fields[4] === 'x' ? 1 : 0;
      const fructose = fields[5] === 'x' ? 1 : 0;
      const polyols = fields[6] === 'x' ? 1 : 0;
      const lactose = fields[7] === 'x' ? 1 : 0;
      
      if (foodName && fodmapLevel !== 'unknown') {
        fodmapEntries.push({
          food_name: foodName,
          fodmap_level: fodmapLevel,
          category: currentCategory,
          max_serving: serving && serving !== '0  g' ? serving : "",
          oligos,
          fructose,
          polyols,
          lactose,
          source: "google_sheets_monash",
          notes: ""
        });
      }
    } catch (error) {
      console.warn(`⚠️  Skipped malformed CSV line: ${line.substring(0, 50)}...`);
    }
  }
  
  console.log(`✅ Parsed ${fodmapEntries.length} FODMAP entries from Google Sheets`);
  return fodmapEntries;
}

async function indexFODMAPData(fodmapEntries: FODMAPEntry[]): Promise<void> {
  console.log("🗄️  Creating FODMAP database table...");
  
  const db = await connectDB();
  
  // Normalize data to prevent Arrow serialization issues
  const normalizedEntries = fodmapEntries.map(entry => ({
    food_name: String(entry.food_name || ""),
    fodmap_level: String(entry.fodmap_level || "unknown"),
    category: String(entry.category || "Unknown"),
    max_serving: String(entry.max_serving || ""),
    oligos: Number(entry.oligos || 0),
    fructose: Number(entry.fructose || 0),
    polyols: Number(entry.polyols || 0),
    lactose: Number(entry.lactose || 0),
    source: String(entry.source || "unknown"),
    notes: String(entry.notes || "")
  }));
  
  // Create FODMAP table with sample data
  const sampleData = {
    food_name: "Sample Food",
    fodmap_level: "low",
    category: "Sample Category",
    max_serving: "100g",
    oligos: 0,
    fructose: 0,
    polyols: 0,
    lactose: 0,
    source: "sample",
    notes: ""
  };
  
  let table;
  try {
    table = await db.openTable(CFG.storage.fodmapTable);
    console.log("📋 Opened existing FODMAP table");
  } catch {
    // Table doesn't exist, create it
    console.log("📋 Creating new FODMAP table");
    table = await db.createTable(CFG.storage.fodmapTable, [sampleData]);
  }
  
  console.log("📊 Inserting FODMAP data...");
  
  // Use smaller batches to avoid Arrow memory issues
  const batchSize = 50;
  for (let i = 0; i < normalizedEntries.length; i += batchSize) {
    const batch = normalizedEntries.slice(i, i + batchSize);
    
    try {
      await table.add(batch);
      console.log(`   ✅ Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(normalizedEntries.length / batchSize)} (${batch.length} entries)`);
    } catch (error) {
      console.error(`   ❌ Failed to insert batch ${Math.floor(i / batchSize) + 1}: ${error}`);
      
      // Try inserting one by one to identify problematic entries
      console.log("   🔍 Attempting individual insertion...");
      for (const entry of batch) {
        try {
          await table.add([entry]);
          console.log(`      ✅ Inserted: ${entry.food_name}`);
        } catch (itemError) {
          console.error(`      ❌ Failed: ${entry.food_name} - ${itemError}`);
        }
      }
    }
  }
  
  console.log(`✅ Successfully indexed FODMAP data`);
}

export default new Command("fodmap-index")
  .description("Parse and index FODMAP data from multiple sources")
  .action(async () => {
    console.log("🥗 FODMAP Database Indexing");
    console.log("==========================");
    
    try {
      let allEntries: FODMAPEntry[] = [];
      
      // Parse GitHub JSON data
      const githubFile = "./datasets/fodmap/fodmap_github.json";
      try {
        await fs.access(githubFile);
        const githubEntries = await parseGitHubFODMAP(githubFile);
        allEntries.push(...githubEntries);
      } catch (error) {
        console.warn(`⚠️  Could not load GitHub FODMAP data: ${error}`);
      }
      
      // Parse Google Sheets CSV data
      const sheetsFile = "./datasets/fodmap/fodmap_sheets.csv";
      try {
        await fs.access(sheetsFile);
        const sheetsEntries = await parseGoogleSheetsFODMAP(sheetsFile);
        allEntries.push(...sheetsEntries);
      } catch (error) {
        console.warn(`⚠️  Could not load Google Sheets FODMAP data: ${error}`);
      }
      
      if (allEntries.length === 0) {
        console.error("❌ No FODMAP data found");
        console.error("Make sure data files are in ./datasets/fodmap/");
        return;
      }
      
      // Show data source summary
      const sourceCounts = allEntries.reduce((acc, entry) => {
        acc[entry.source] = (acc[entry.source] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      console.log(`📈 Data sources summary:`);
      Object.entries(sourceCounts).forEach(([source, count]) => {
        console.log(`   • ${source}: ${count} entries`);
      });
      
      // Show FODMAP level distribution
      const levelCounts = allEntries.reduce((acc, entry) => {
        acc[entry.fodmap_level] = (acc[entry.fodmap_level] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      console.log(`📊 FODMAP levels:`);
      Object.entries(levelCounts).forEach(([level, count]) => {
        console.log(`   • ${level}: ${count} foods`);
      });
      
      // Index all FODMAP data
      await indexFODMAPData(allEntries);
      
      console.log("🎉 FODMAP database indexing completed!");
      console.log("💡 Note: Duplicate entries may exist from different sources");
      console.log("   Use 'source' field to distinguish data origins");
      
    } catch (error) {
      console.error(`❌ Error indexing FODMAP data: ${error}`);
      throw error;
    }
  });