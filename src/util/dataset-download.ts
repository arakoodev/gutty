import { promises as fs } from "fs";
import path from "path";
import { execFile as execFileCallback } from "child_process";
import { promisify } from "util";
import { snapshotDownload } from "@huggingface/hub";
import { CFG } from "../config";

const execFile = promisify(execFileCallback);

export interface DatasetConfig {
  name: string;
  url: string;
  destination: string;
  extractCommand?: string;
  password?: string;
}

export const RESEARCH_DATASETS: DatasetConfig[] = [
  {
    name: "FoodSeg103",
    url: "https://huggingface.co/datasets/justinsiow/FoodSeg103",
    destination: CFG.datasets.foodseg103.dir
  },
  {
    name: "FoodInsSeg", 
    url: "https://drive.google.com/file/d/1Wa8_j4flJOMM6a2QGpiPga0r1GC__Rg2/view?usp=drive_link",
    destination: CFG.datasets.foodinsseg.dir
  },
  {
    name: "UECFood256",
    url: "https://huggingface.co/datasets/tiennv/uecfood256",
    destination: CFG.datasets.uecfood256.dir
  }
];

async function downloadWithWget(url: string, output: string): Promise<void> {
  console.log(`Downloading ${url} to ${output}...`);
  try {
    await execFile("wget", ["-O", output, url]);
  } catch (error) {
    throw new Error(`wget failed: ${error}`);
  }
}

async function downloadGoogleDrive(fileId: string, output: string): Promise<void> {
  // Extract file ID from Google Drive URL
  const match = fileId.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
  const id = match ? match[1] : fileId;
  
  console.log(`Downloading Google Drive file ${id} to ${output}...`);
  
  // Use wget with proper Google Drive download URL that bypasses confirmation
  const downloadUrl = `https://drive.google.com/uc?export=download&id=${id}&confirm=t`;
  await downloadWithWget(downloadUrl, output);
}

async function downloadHuggingFace(repoUrl: string, output: string): Promise<void> {
  console.log(`Downloading HuggingFace dataset from ${repoUrl}...`);
  
  const hfKey = process.env.HF_API_KEY;
  if (!hfKey) {
    throw new Error("HF_API_KEY environment variable required for HuggingFace downloads");
  }
  
  // Extract repo path from URL (e.g., EduardoPacheco/FoodSeg103)
  const repoMatch = repoUrl.match(/huggingface\.co\/datasets\/(.+?)(?:\/|$)/);
  if (!repoMatch) {
    throw new Error(`Invalid HuggingFace dataset URL: ${repoUrl}`);
  }
  
  const repoPath = repoMatch[1];
  
  try {
    // Use snapshotDownload to download the dataset
    await snapshotDownload({
      repo: {
        name: repoPath,
        type: "dataset",
      },
      localDir: output,
      accessToken: hfKey
    });
  } catch (error) {
    throw new Error(`HuggingFace download failed: ${error}`);
  }
}

async function extractZip(zipPath: string, extractDir: string, password?: string): Promise<void> {
  await fs.mkdir(extractDir, { recursive: true });
  console.log(`Extracting ${zipPath} to ${extractDir}...`);
  
  const args = ["x", zipPath, `-o${extractDir}`, "-y"];
  if (password) {
    args.push(`-p${password}`);
  }
  
  try {
    await execFile("7z", args);
  } catch {
    // Fallback to unzip
    const unzipArgs = ["-o", zipPath, "-d", extractDir];
    if (password) {
      unzipArgs.unshift("-P", password);
    }
    await execFile("unzip", unzipArgs);
  }
}

export async function downloadDataset(config: DatasetConfig): Promise<string> {
  const { name, url, destination, password } = config;
  
  // Check if dataset already exists
  try {
    await fs.access(destination);
    console.log(`Dataset ${name} already exists at ${destination}`);
    return destination;
  } catch {
    // Dataset doesn't exist, proceed with download
  }
  
  await fs.mkdir(path.dirname(destination), { recursive: true });
  
  const zipPath = `${destination}.zip`;
  
  try {
    if (url.includes("huggingface.co")) {
      // HuggingFace datasets don't need zip extraction
      await downloadHuggingFace(url, destination);
      console.log(`Successfully downloaded ${name} to ${destination}`);
      return destination;
    } else if (url.includes("drive.google.com")) {
      await downloadGoogleDrive(url, zipPath);
    } else {
      await downloadWithWget(url, zipPath);
    }
    
    // Extract the zip file (for non-HF downloads)
    await extractZip(zipPath, destination, password);
    
    // Clean up zip file
    await fs.unlink(zipPath);
    
    console.log(`Successfully downloaded and extracted ${name} to ${destination}`);
    return destination;
    
  } catch (error) {
    console.error(`Failed to download ${name}: ${error}`);
    // Clean up partial downloads
    try {
      await fs.unlink(zipPath);
    } catch {}
    throw error;
  }
}

export async function downloadAllResearchDatasets(): Promise<{[key: string]: string}> {
  const results: {[key: string]: string} = {};
  
  for (const config of RESEARCH_DATASETS) {
    try {
      results[config.name] = await downloadDataset(config);
    } catch (error) {
      console.error(`Failed to download ${config.name}, skipping...`);
    }
  }
  
  return results;
}

/**
 * Get standardized dataset paths - always returns the expected paths
 */
export function getDatasetPaths(): { foodseg103: string; foodinsseg: string } {
  return {
    foodseg103: CFG.datasets.foodseg103.dir,
    foodinsseg: CFG.datasets.foodinsseg.dir
  };
}

/**
 * Check if datasets exist at expected locations
 */
export async function checkDatasetExists(dataset: 'foodseg103' | 'foodinsseg' | 'uecfood256'): Promise<boolean> {
  try {
    if (dataset === 'foodseg103') {
      await fs.access(CFG.datasets.foodseg103.dataDir);
      return true;
    } else if (dataset === 'foodinsseg') {
      await fs.access(CFG.datasets.foodinsseg.imageDir);
      const files = await fs.readdir(CFG.datasets.foodinsseg.imageDir);
      return files.filter(f => f.endsWith('.jpg')).length > 100;
    } else {
      await fs.access(CFG.datasets.uecfood256.imageDir);
      const files = await fs.readdir(CFG.datasets.uecfood256.imageDir);
      return files.filter(f => f.match(/\.(jpg|jpeg|png)$/i)).length > 100;
    }
  } catch {
    return false;
  }
}

/**
 * Get actual image directories for indexing
 */
export function getImageDirectories(): { foodseg103?: string; foodinsseg?: string; uecfood256?: string } {
  return {
    foodseg103: CFG.datasets.foodseg103.dataDir, // parquet files
    foodinsseg: CFG.datasets.foodinsseg.imageDir, // jpg files
    uecfood256: CFG.datasets.uecfood256.imageDir // jpg/png files
  };
}