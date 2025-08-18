import { Command } from "commander";
import { groundedSam2 } from "../providers/segment";
import { 
  datasetGuidedSegmentation, 
  clipFilteredSegmentation, 
  hybridDatasetSegmentation 
} from "../providers/integrated-segment";
import { withRetry } from "../util/retry";
import { promises as fs } from "fs";
import path from "path";

export default new Command("seg-extract")
  .requiredOption("--image <path>")
  .option("--labels <list>", "Comma separated labels (for legacy mode)", "")
  .option("--out <dir>", "./tmp/seg", "Output directory for mask files")
  .option("--use-index", "Use research dataset index for guided segmentation", true)
  .option("--method <type>", "Segmentation method: legacy|clip-filter", "clip-filter")
  .option("--confidence <n>", "Confidence threshold", "0.75")
  .option("--max-results <n>", "Maximum number of segments", "20")
  .action(async (opts) => {
    await fs.mkdir(opts.out, { recursive: true });
    
    const confidenceThreshold = parseFloat(opts.confidence);
    const maxResults = parseInt(opts.maxResults);
    
    try {
      let segments: any[] = [];
      
      switch (opts.method) {
        case "legacy":
          // Original text-prompted segmentation
          console.log("Using legacy text-prompted segmentation...");
          const prompts = String(opts.labels || "").split(",").map((s:string)=>s.trim()).filter(Boolean);
          if (prompts.length === 0) {
            throw new Error("Legacy mode requires --labels. Try --method hybrid instead.");
          }
          const legacySegs = await withRetry(() => groundedSam2({ path: opts.image }, prompts));
          segments = legacySegs.map(s => ({ 
            label: s.label, 
            mask: s.mask, 
            confidence: 0.8,
            similarity: null,
            matchedDatasetImage: null
          }));
          break;
          
        case "clip-filter":
        default:
          // CLIP-filtered region proposals (default)
          console.log("Using Meta SAM + CLIP filtering with your research dataset...");
          segments = await clipFilteredSegmentation(
            { path: opts.image },
            confidenceThreshold,
            maxResults
          );
          break;
      }
      
      // Write mask files and metadata
      const metadata: any[] = [];
      let i = 0;
      
      for (const s of segments) {
        const filename = `${s.label.replace(/\s+/g,"_")}_${i}.png`;
        const filepath = path.join(opts.out, filename);
        
        await fs.writeFile(filepath, s.mask);
        
        metadata.push({
          file: filename,
          label: s.label,
          confidence: s.confidence,
          similarity: s.similarity,
          matchedDatasetImage: s.matchedDatasetImage,
          method: opts.method
        });
        
        i++;
      }
      
      // Write metadata file
      const metadataPath = path.join(opts.out, "segments_metadata.json");
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
      
      console.log(`Wrote ${i} masks to ${opts.out}`);
      console.log(`Dataset-guided segmentation found ${segments.length} ingredients with avg confidence ${
        (segments.reduce((sum, s) => sum + s.confidence, 0) / segments.length).toFixed(2)
      }`);
      
    } catch (err: any) {
      console.error(`Segmentation failed: ${err?.message || err}`);
    }
  });
