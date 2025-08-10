import { Command } from "commander";
import fs from "fs";
import { providerSummary } from "../providers/availability";

export default new Command("validate").action(async ()=>{
  const env = providerSummary();
  console.log("Providers:");
  console.log(`  Vertex:    ${env.hasVertex ? "OK" : "MISSING (set VERTEX_PROJECT_ID + GOOGLE_APPLICATION_CREDENTIALS)"}`);
  console.log(`  Replicate: ${env.hasReplicate ? "OK" : "MISSING (set REPLICATE_API_TOKEN)"}`);
  console.log(`  Fal:       ${env.hasFal ? "OK" : "MISSING (optional, JSON only)"}`);
  console.log("");
  console.log("USDA:");
  console.log(`  FDC_API_KEY: ${process.env.FDC_API_KEY ? "OK" : "MISSING (needed for calories)"}`);

  console.log("");
  console.log("Filesystem:");
  console.log(`  ./Gutty_Data exists: ${fs.existsSync("./Gutty_Data")}`);
  console.log(`  ./lancedb exists:  ${fs.existsSync("./lancedb")}`);
  console.log(`  ./tmp exists:      ${fs.existsSync("./tmp")}`);
});
