import { Command } from "commander";
import { promises as fs } from "fs";
import { mapToUSDA, computeTotals } from "../nutrition/usda_pipeline";

export default new Command("calories")
  .requiredOption("--recipe <json>")
  .option("--out <path>", "./analysis.json")
  .action(async (opts) => {
    const r = JSON.parse(await fs.readFile(opts.recipe,"utf8"));
    const items = await mapToUSDA(r.ingredients);
    const totals = computeTotals(items);
    const out = { title: r.title, servings: r.servings, items, totals, note:"Estimates via USDA FDC densities & nutrients." };
    await fs.mkdir(require("path").dirname(opts.out), { recursive: true });
    await fs.writeFile(opts.out, JSON.stringify(out,null,2));
    console.log(`Wrote ${opts.out}`);
  });
