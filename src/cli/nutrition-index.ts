import { Command } from "commander";
import { promises as fs } from "fs";
import XLSX from 'xlsx';
import { connectDB } from "../index/lancedb";
import { CFG } from "../config";
import path from "path";

interface CofidNutrition {
  food_code: string;
  food_name: string;
  description: string;
  main_data_references: string;
  energy_kcal: number;
  energy_kj: number;
  water_g: number;
  total_nitrogen_g: number;
  protein_g: number;
  fat_g: number;
  saturated_fatty_acids_g: number;
  monounsaturated_fatty_acids_g: number;
  polyunsaturated_fatty_acids_g: number;
  carbohydrate_g: number;
  total_sugars_g: number;
  glucose_g: number;
  fructose_g: number;
  sucrose_g: number;
  maltose_g: number;
  lactose_g: number;
  starch_g: number;
  nsp_aoac_fibre_g: number;
  cholesterol_mg: number;
  sodium_mg: number;
  potassium_mg: number;
  calcium_mg: number;
  magnesium_mg: number;
  phosphorus_mg: number;
  iron_mg: number;
  copper_mg: number;
  zinc_mg: number;
  chloride_mg: number;
  manganese_mg: number;
  selenium_ug: number;
  iodine_ug: number;
  vitamin_a_retinol_equivalent_ug: number;
  vitamin_d_ug: number;
  vitamin_e_mg: number;
  vitamin_k1_ug: number;
  thiamin_mg: number;
  riboflavin_mg: number;
  niacin_mg: number;
  tryptophan_60_mg: number;
  vitamin_b6_mg: number;
  vitamin_b12_ug: number;
  folate_ug: number;
  pantothenate_mg: number;
  biotin_ug: number;
  vitamin_c_mg: number;
}

interface GlycemicIndexEntry {
  food_name: string;
  gi_value: number;
  gl_value: number;
  reference_food: string;
  test_product: string;
  available_carb_g: number;
  subjects_count: number;
}

async function parseCofidExcel(filePath: string): Promise<CofidNutrition[]> {
  console.log(`📊 Parsing COFID Excel file: ${filePath}`);
  
  const workbook = XLSX.readFile(filePath);
  const sheetNames = workbook.SheetNames;
  console.log(`📋 Available sheets: ${sheetNames.join(', ')}`);
  
  // Parse multiple sheets to get complete nutrition data
  const proximatesSheet = workbook.Sheets['1.3 Proximates'];
  const inorganicsSheet = workbook.Sheets['1.4 Inorganics'];
  const vitaminsSheet = workbook.Sheets['1.5 Vitamins'];
  
  if (!proximatesSheet) {
    throw new Error('Could not find 1.3 Proximates sheet in COFID file');
  }
  
  console.log(`🎯 Parsing proximates, inorganics, and vitamins sheets`);
  
  // Convert sheets to JSON
  const proximatesData = XLSX.utils.sheet_to_json(proximatesSheet);
  const inorganicsData = inorganicsSheet ? XLSX.utils.sheet_to_json(inorganicsSheet) : [];
  const vitaminsData = vitaminsSheet ? XLSX.utils.sheet_to_json(vitaminsSheet) : [];
  
  // Create lookup maps for joining data by Food Code
  const inorganicsMap = new Map();
  inorganicsData.forEach((row: any) => {
    const foodCode = row[' '] || row['Food Code']; // Different header in inorganics sheet
    if (foodCode) {
      inorganicsMap.set(foodCode, row);
    }
  });
  
  const vitaminsMap = new Map();
  vitaminsData.forEach((row: any) => {
    const foodCode = row[' '] || row['Food Code'];
    if (foodCode) {
      vitaminsMap.set(foodCode, row);
    }
  });
  
  console.log(`📝 Found ${proximatesData.length} proximates rows, ${inorganicsData.length} inorganics rows, ${vitaminsData.length} vitamin rows`);
  
  const nutritionData: CofidNutrition[] = [];
  
  for (const row of proximatesData) {
    try {
      const foodCode = String(row['Food Code'] || '');
      
      // Skip header rows or empty entries
      if (!foodCode || foodCode === 'undefined' || !row['Food Name']) {
        continue;
      }
      
      // Get corresponding data from other sheets
      const inorganics = inorganicsMap.get(foodCode) || {};
      const vitamins = vitaminsMap.get(foodCode) || {};
      
      // COFID Excel column mapping - using actual COFID 2021 header names
      const entry: CofidNutrition = {
        food_code: foodCode,
        food_name: String(row['Food Name'] || ''),
        description: String(row['Description'] || ''),
        main_data_references: String(row['Main data references'] || ''),
        energy_kcal: parseFloat(String(row['Energy (kcal) (kcal)'] || 0)) || 0,
        energy_kj: parseFloat(String(row['Energy (kJ) (kJ)'] || 0)) || 0,
        water_g: parseFloat(String(row['Water (g)'] || 0)) || 0,
        total_nitrogen_g: parseFloat(String(row['Total nitrogen (g)'] || 0)) || 0,
        protein_g: parseFloat(String(row['Protein (g)'] || 0)) || 0,
        fat_g: parseFloat(String(row['Fat (g)'] || 0)) || 0,
        saturated_fatty_acids_g: parseFloat(String(row['Sat FA excl Br /100g food (g)'] || 0)) || 0,
        monounsaturated_fatty_acids_g: parseFloat(String(row['Mono FA /100g food (g)'] || 0)) || 0,
        polyunsaturated_fatty_acids_g: parseFloat(String(row['Poly FA /100g food (g)'] || 0)) || 0,
        carbohydrate_g: parseFloat(String(row['Carbohydrate (g)'] || 0)) || 0,
        total_sugars_g: parseFloat(String(row['Total sugars (g)'] || 0)) || 0,
        glucose_g: parseFloat(String(row['Glucose (g)'] || 0)) || 0,
        fructose_g: parseFloat(String(row['Fructose (g)'] || 0)) || 0,
        sucrose_g: parseFloat(String(row['Sucrose (g)'] || 0)) || 0,
        maltose_g: parseFloat(String(row['Maltose (g)'] || 0)) || 0,
        lactose_g: parseFloat(String(row['Lactose (g)'] || 0)) || 0,
        starch_g: parseFloat(String(row['Starch (g)'] || 0)) || 0,
        nsp_aoac_fibre_g: parseFloat(String(row['AOAC fibre (g)'] || 0)) || 0,
        cholesterol_mg: parseFloat(String(row['Cholesterol (mg)'] || 0)) || 0,
        // Minerals from inorganics sheet
        sodium_mg: parseFloat(String(inorganics['Sodium (mg)'] || 0)) || 0,
        potassium_mg: parseFloat(String(inorganics['Potassium (mg)'] || 0)) || 0,
        calcium_mg: parseFloat(String(inorganics['Calcium (mg)'] || 0)) || 0,
        magnesium_mg: parseFloat(String(inorganics['Magnesium (mg)'] || 0)) || 0,
        phosphorus_mg: parseFloat(String(inorganics['Phosphorus (mg)'] || 0)) || 0,
        iron_mg: parseFloat(String(inorganics['Iron (mg)'] || 0)) || 0,
        copper_mg: parseFloat(String(inorganics['Copper (mg)'] || 0)) || 0,
        zinc_mg: parseFloat(String(inorganics['Zinc (mg)'] || 0)) || 0,
        chloride_mg: parseFloat(String(inorganics['Chloride (mg)'] || 0)) || 0,
        manganese_mg: parseFloat(String(inorganics['Manganese (mg)'] || 0)) || 0,
        selenium_ug: parseFloat(String(inorganics['Selenium (µg)'] || 0)) || 0,
        iodine_ug: parseFloat(String(inorganics['Iodine (µg)'] || 0)) || 0,
        // Vitamins from vitamins sheet
        vitamin_a_retinol_equivalent_ug: parseFloat(String(vitamins['Retinol Equivalent (µg)'] || 0)) || 0,
        vitamin_d_ug: parseFloat(String(vitamins['Vitamin D (µg)'] || 0)) || 0,
        vitamin_e_mg: parseFloat(String(vitamins['Vitamin E (mg)'] || 0)) || 0,
        vitamin_k1_ug: parseFloat(String(vitamins['Vitamin K1 (µg)'] || 0)) || 0,
        thiamin_mg: parseFloat(String(vitamins['Thiamin (mg)'] || 0)) || 0,
        riboflavin_mg: parseFloat(String(vitamins['Riboflavin (mg)'] || 0)) || 0,
        niacin_mg: parseFloat(String(vitamins['Niacin Equivalent (mg)'] || 0)) || 0,
        tryptophan_60_mg: parseFloat(String(vitamins['Tryptophan/60 (mg)'] || 0)) || 0,
        vitamin_b6_mg: parseFloat(String(vitamins['Vitamin B6 (mg)'] || 0)) || 0,
        vitamin_b12_ug: parseFloat(String(vitamins['Vitamin B12 (µg)'] || 0)) || 0,
        folate_ug: parseFloat(String(vitamins['Folate (µg)'] || 0)) || 0,
        pantothenate_mg: parseFloat(String(vitamins['Pantothenic acid (mg)'] || 0)) || 0,
        biotin_ug: parseFloat(String(vitamins['Biotin (µg)'] || 0)) || 0,
        vitamin_c_mg: parseFloat(String(vitamins['Vitamin C (mg)'] || 0)) || 0,
      };
      
      // Only include entries with valid food names
      if (entry.food_name && entry.food_name.trim().length > 0) {
        nutritionData.push(entry);
      }
    } catch (error) {
      console.warn(`⚠️  Failed to parse nutrition row: ${error}`);
    }
  }
  
  console.log(`✅ Successfully parsed ${nutritionData.length} nutrition entries`);
  return nutritionData;
}

async function indexNutritionData(nutritionData: CofidNutrition[]): Promise<void> {
  console.log("🗄️  Creating nutrition_facts table...");
  
  const db = await connectDB();
  
  // Create nutrition facts table with sample data
  const sampleData = {
    food_code: "SAMPLE001",
    food_name: "Sample Food",
    description: "Sample food description",
    main_data_references: "Reference",
    energy_kcal: 100,
    energy_kj: 420,
    water_g: 80,
    total_nitrogen_g: 2,
    protein_g: 12,
    fat_g: 3,
    saturated_fatty_acids_g: 1,
    monounsaturated_fatty_acids_g: 1,
    polyunsaturated_fatty_acids_g: 0.5,
    carbohydrate_g: 15,
    total_sugars_g: 5,
    glucose_g: 2,
    fructose_g: 2,
    sucrose_g: 1,
    maltose_g: 0,
    lactose_g: 0,
    starch_g: 10,
    nsp_aoac_fibre_g: 3,
    cholesterol_mg: 0,
    sodium_mg: 300,
    potassium_mg: 400,
    calcium_mg: 120,
    magnesium_mg: 25,
    phosphorus_mg: 100,
    iron_mg: 2,
    copper_mg: 0.1,
    zinc_mg: 1,
    chloride_mg: 450,
    manganese_mg: 0.3,
    selenium_ug: 10,
    iodine_ug: 15,
    vitamin_a_retinol_equivalent_ug: 100,
    vitamin_d_ug: 0,
    vitamin_e_mg: 1,
    vitamin_k1_ug: 5,
    thiamin_mg: 0.1,
    riboflavin_mg: 0.1,
    niacin_mg: 2,
    tryptophan_60_mg: 1,
    vitamin_b6_mg: 0.1,
    vitamin_b12_ug: 0.5,
    folate_ug: 20,
    pantothenate_mg: 0.3,
    biotin_ug: 5,
    vitamin_c_mg: 10,
  };
  
  let table;
  try {
    table = await db.openTable(CFG.storage.nutritionTable);
  } catch {
    // Table doesn't exist, create it
    table = await db.createTable(CFG.storage.nutritionTable, [sampleData]);
  }
  
  console.log("📊 Inserting nutrition data...");
  
  // Insert in batches for better performance
  const batchSize = 100;
  for (let i = 0; i < nutritionData.length; i += batchSize) {
    const batch = nutritionData.slice(i, i + batchSize);
    await table.add(batch);
    console.log(`   Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(nutritionData.length / batchSize)}`);
  }
  
  console.log(`✅ Successfully indexed ${nutritionData.length} nutrition entries`);
}

export default new Command("nutrition-index")
  .description("Parse and index COFID nutrition database")
  .option("--file <path>", "Path to COFID Excel file", "./datasets/nutrition/cofid_2021.xlsx")
  .action(async (opts) => {
    console.log("🥗 COFID Nutrition Database Indexing");
    console.log("==================================");
    
    try {
      // Check if file exists
      await fs.access(opts.file);
      console.log(`📋 Processing: ${opts.file}`);
      
      // Parse Excel data
      const nutritionData = await parseCofidExcel(opts.file);
      
      if (nutritionData.length === 0) {
        console.error("❌ No nutrition data found in Excel file");
        return;
      }
      
      // Index nutrition data
      await indexNutritionData(nutritionData);
      
      console.log("🎉 Nutrition database indexing completed!");
      
    } catch (error) {
      console.error(`❌ Error indexing nutrition data: ${error}`);
      throw error;
    }
  });