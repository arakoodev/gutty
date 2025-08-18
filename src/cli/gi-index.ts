import { Command } from "commander";
import { promises as fs } from "fs";
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { connectDB } from "../index/lancedb";
import { CFG } from "../config";
import path from "path";

interface GlycemicIndexEntry {
  food_name: string;
  gi_value: number;
  gl_value: number;
  reference_food: string;
  test_product: string;
  available_carb_g: number;
  subjects_count: number;
  source: string;
  category: string;
}

async function parseGIPdf(filePath: string): Promise<GlycemicIndexEntry[]> {
  console.log(`📊 Parsing GI PDF file: ${filePath}`);
  
  const buffer = await fs.readFile(filePath);
  const data = await pdf(buffer);
  
  const text = data.text;
  console.log(`📄 Extracted text from PDF (${text.length} characters)`);
  
  const giEntries: GlycemicIndexEntry[] = [];
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  let currentCategory = "Unknown";
  
  // Pattern: The data is structured as:
  // Food Number
  // Food Name
  // (Optional: Brand/Location info in parentheses)
  // Country Year GI±SEM GL Subjects, Count Carb Weight Reference, Duration Standard
  
  for (let i = 0; i < lines.length - 2; i++) {
    const line = lines[i];
    
    // Detect category headers
    if (line.match(/^[A-Z][A-Z\s]+$/) && !line.includes('SUPPLEMENTAL') && !line.includes('TABLE')) {
      currentCategory = line;
      continue;
    }
    
    // Look for data lines with the pattern: Country Year GI±SEM GL Normal, Count
    const dataMatch = line.match(/^(\w+)\s+(\d{4})\*?\s+(\d+)[±](\d+)\s+(\d+)\s+Normal,?\s+(\d+)/);
    
    if (dataMatch) {
      const [, country, year, giValue, giSem, glValue, subjects] = dataMatch;
      
      // Look backwards for the food name (usually 1-3 lines above)
      let foodName = "Unknown Food";
      for (let j = Math.max(0, i - 5); j < i; j++) {
        const prevLine = lines[j];
        
        // Skip numbers and single letters
        if (prevLine.match(/^\d+$/) || prevLine.match(/^[A-Z]$/) || prevLine.length < 3) {
          continue;
        }
        
        // Skip lines with parentheses (usually manufacturer info)
        if (prevLine.includes('(') && prevLine.includes(')')) {
          continue;
        }
        
        // Skip category headers
        if (prevLine.match(/^[A-Z][A-Z\s]+$/)) {
          continue;
        }
        
        // This looks like a food name
        foodName = prevLine;
        break;
      }
      
      // Clean up the food name
      foodName = foodName.replace(/^\d+\s*/, ''); // Remove leading numbers
      
      if (foodName && foodName !== "Unknown Food") {
        giEntries.push({
          food_name: foodName,
          gi_value: parseInt(giValue),
          gl_value: parseInt(glValue),
          reference_food: line.includes('Bread') ? 'White bread' : 'Glucose',
          test_product: foodName,
          available_carb_g: 25, // Default based on ISO standard
          subjects_count: parseInt(subjects),
          source: path.basename(filePath),
          category: currentCategory
        });
      }
    }
  }
  
  console.log(`✅ Parsed ${giEntries.length} GI entries from PDF`);
  return giEntries;
}

async function parseAllGIData(): Promise<GlycemicIndexEntry[]> {
  const giDir = "./datasets/nutrition";
  let allEntries: GlycemicIndexEntry[] = [];
  
  // Look for PDF files
  const files = await fs.readdir(giDir);
  const pdfFiles = files.filter(f => f.endsWith('.pdf'));
  
  console.log(`📚 Found ${pdfFiles.length} PDF files: ${pdfFiles.join(', ')}`);
  
  for (const pdfFile of pdfFiles) {
    const filePath = path.join(giDir, pdfFile);
    try {
      const entries = await parseGIPdf(filePath);
      allEntries.push(...entries);
    } catch (error) {
      console.warn(`⚠️  Failed to parse ${pdfFile}: ${error}`);
    }
  }
  
  return allEntries;
}

async function indexGIData(giEntries: GlycemicIndexEntry[]): Promise<void> {
  console.log("🗄️  Creating glycemic_index table...");
  
  const db = await connectDB();
  
  // Create GI table with sample data
  const sampleData = {
    food_name: "White bread",
    gi_value: 75,
    gl_value: 11,
    reference_food: "Glucose",
    test_product: "White bread",
    available_carb_g: 15,
    subjects_count: 10,
    source: "sample",
    category: "Bakery products"
  };
  
  let table;
  try {
    table = await db.openTable(CFG.storage.glycemicTable);
  } catch {
    // Table doesn't exist, create it
    table = await db.createTable(CFG.storage.glycemicTable, [sampleData]);
  }
  
  console.log("📊 Inserting GI data...");
  
  // Insert in batches for better performance
  const batchSize = 50;
  for (let i = 0; i < giEntries.length; i += batchSize) {
    const batch = giEntries.slice(i, i + batchSize);
    await table.add(batch);
    console.log(`   Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(giEntries.length / batchSize)}`);
  }
  
  console.log(`✅ Successfully indexed ${giEntries.length} GI entries`);
}

export default new Command("gi-index")
  .description("Parse and index glycemic index data from research PDFs")
  .action(async () => {
    console.log("📈 Glycemic Index Database Indexing");
    console.log("================================");
    
    try {
      // Parse all GI data from PDFs
      const giEntries = await parseAllGIData();
      
      if (giEntries.length === 0) {
        console.error("❌ No GI data found in PDF files");
        console.error("Make sure PDF files are in ./datasets/nutrition/");
        return;
      }
      
      // Index GI data
      await indexGIData(giEntries);
      
      console.log("🎉 Glycemic index database indexing completed!");
      
    } catch (error) {
      console.error(`❌ Error indexing GI data: ${error}`);
      throw error;
    }
  });