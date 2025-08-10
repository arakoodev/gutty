import { Command } from "commander";
import { promises as fs } from "fs";
export default new Command("init").action(async () => {
  await fs.mkdir("./lancedb", { recursive: true });
  await fs.mkdir("./tmp", { recursive: true });
  console.log("Workspace initialized. Add your .env and dataset next.");
});
