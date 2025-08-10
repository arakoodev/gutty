import { Command } from "commander";
import { ingestLocalCalData } from "../recipes/ingest";
export default new Command("ingest-recipes")
  .requiredOption("--dir <folder>")
  .action(async (opts)=>{
    const n = await ingestLocalCalData(opts.dir);
    console.log(`Ingested ${n} recipes.`);
  });
