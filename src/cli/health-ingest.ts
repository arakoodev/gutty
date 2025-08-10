import { Command } from "commander";
import { ingestHealthKB } from "../health/ingest";
export default new Command("health-ingest")
  .requiredOption("--dir <folder>","Health_KB root with subfolders pcos,endometriosis,pregnancy")
  .action(async (opts)=>{
    const n = await ingestHealthKB(opts.dir);
    console.log(`Ingested ${n} health docs.`);
  });
