import { Command } from "commander";
import { rm } from "fs/promises";

async function safeRm(p:string){
  try { await rm(p, { recursive: true, force: true }); } catch {}
}

export default new Command("reset")
  .description("Delete ./lancedb and ./tmp for a clean restart")
  .action(async ()=>{
    await safeRm("./lancedb");
    await safeRm("./tmp");
    console.log("Cleaned: ./lancedb and ./tmp");
  });
